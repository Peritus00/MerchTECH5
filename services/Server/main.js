const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// --- CONFIGURATION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Nodemailer transporter for Brevo
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  auth: {
    user: '8e773a002@smtp-brevo.com',
    pass: process.env.BREVO_SMTP_KEY,
  },
});

// --- MIDDLEWARE ---
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const isAdmin = async (req, res, next) => {
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length > 0 && result.rows[0].is_admin) {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: Admins only' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- ROUTES ---

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});

app.get('/api/admin/all-users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, username, is_admin, subscription_tier, created_at, updated_at, is_suspended FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ userId: user.id, email: user.email, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ user, token });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password || !username) return res.status(400).json({ error: 'Email, password, and username are required' });
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existingUser.rows.length > 0) return res.status(409).json({ error: 'Email or username already exists' });
    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, is_admin`,
      [email, username, hashedPassword]
    );
    const newUser = result.rows[0];
    const token = jwt.sign({ userId: newUser.id, email: newUser.email, isAdmin: newUser.is_admin }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ user: newUser, token });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/send-verification', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = userResult.rows[0];
    if (user.is_email_verified) return res.status(400).json({ error: 'Email is already verified' });

    const verificationToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    await pool.query('UPDATE users SET verification_token = $1 WHERE id = $2', [verificationToken, user.id]);

    const verificationUrl = `http://localhost:8081/auth/verify?token=${verificationToken}`;

    await transporter.sendMail({
      from: '"MerchTech QR" <help@merchtech.net>',
      to: email,
      subject: 'Verify Your MerchTech Account',
      html: `<p>Please click the link below to verify your email address:</p><a href="${verificationUrl}">Verify Email</a>`,
    });

    res.status(200).json({ message: 'Verification email sent successfully.' });

  } catch (error) {
    console.error('🔴 SEND VERIFICATION ERROR:', error);
    res.status(500).json({ error: 'Failed to send verification email.' });
  }
});

app.get('/api/auth/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await pool.query(
      `UPDATE users SET is_email_verified = true, verification_token = null WHERE id = $1 AND is_email_verified = false RETURNING id`,
      [decoded.userId]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'Token is invalid or user is already verified.' });
    }

    res.redirect(`http://localhost:8081/auth/verification-success`);

  } catch (error) {
    console.error('🔴 VERIFY EMAIL ERROR:', error);
    res.status(400).json({ error: 'Invalid or expired verification token.' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const deleteResult = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error(`Error deleting user ${id}:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ---------- PRODUCT ROUTES ----------

// Get products – supports ?mine=true to return only caller's items
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const mine = req.query.mine === 'true';
    let result;
    if (mine) {
      result = await pool.query('SELECT * FROM products WHERE user_id = $1 AND is_deleted = false', [req.user.userId]);
    } else {
      result = await pool.query('SELECT * FROM products WHERE is_deleted = false');
    }
    res.json({ products: result.rows });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public all-products route (no auth)
app.get('/api/products/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE is_deleted = false');
    res.json({ products: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product (owner or admin)
app.patch('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    // Fetch product to verify rights
    const prodRes = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const product = prodRes.rows[0];
    if (!req.user.isAdmin && product.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { name, inStock, prices, isSuspended } = req.body;
    await pool.query(
      `UPDATE products SET name = COALESCE($1, name), in_stock = COALESCE($2, in_stock),
        is_suspended = COALESCE($3, is_suspended), updated_at = NOW() WHERE id = $4`,
      [name, inStock, isSuspended, id]
    );

    // Note: prices update would normally involve stripe API; omitted for brevity.

    const updated = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    res.json({ product: updated.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------- SALES ROUTES ----------

const toCsv = (rows) => {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h)=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','));
  }
  return lines.join('\n');
};

// Seller scoped
app.get('/api/sales/user', authenticateToken, async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM sales WHERE user_id=$1 ORDER BY purchased_at DESC',[req.user.userId]);
    res.json({sales: result.rows});
  }catch(err){console.error(err);res.status(500).json({error:'Internal'});}
});

app.get('/api/sales/user/csv', authenticateToken, async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM sales WHERE user_id=$1 ORDER BY purchased_at DESC',[req.user.userId]);
    const csv = toCsv(result.rows);
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="my-sales.csv"');
    res.send(csv);
  }catch(err){console.error(err);res.status(500).json({error:'Internal'});}
});

// Admin
app.get('/api/sales/all', authenticateToken, isAdmin, async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM sales ORDER BY purchased_at DESC');
    res.json({sales: result.rows});
  }catch(err){console.error(err);res.status(500).json({error:'Internal'});}
});

app.get('/api/sales/all/csv', authenticateToken, isAdmin, async (req,res)=>{
  try{
    const result = await pool.query('SELECT * FROM sales ORDER BY purchased_at DESC');
    const csv = toCsv(result.rows);
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="all-sales.csv"');
    res.send(csv);
  }catch(err){console.error(err);res.status(500).json({error:'Internal'});}
});

// --- ERROR HANDLING & SERVER STARTUP ---
app.use((req, res, next) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error('🔴 Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error' })
});

const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('🔧 Initializing database schema...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_email_verified BOOLEAN DEFAULT false
      );
    `);

    console.log('🔧 Verifying table columns exist...');
    const columns = [
      { name: 'verification_token', type: 'VARCHAR(255)' },
      { name: 'is_admin', type: 'BOOLEAN DEFAULT false' },
      { name: 'is_suspended', type: 'BOOLEAN DEFAULT false' },
      { name: 'subscription_tier', type: "VARCHAR(50) DEFAULT 'free'" },
      { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()' }
    ];

    for (const column of columns) {
      console.log(`   -> Checking for column: ${column.name}`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column.name} ${column.type};`);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        images TEXT[],
        category VARCHAR(100),
        in_stock BOOLEAN DEFAULT true,
        is_suspended BOOLEAN DEFAULT false,
        is_deleted BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        buyer_email VARCHAR(255),
        quantity INTEGER NOT NULL DEFAULT 1,
        total_cents INTEGER NOT NULL,
        purchased_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('✅ Database schema initialized successfully.');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
};

const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Full server with email logic running on port ${PORT}`));
  } catch (error) {
    console.error('❌ Failed to start server.');
    process.exit(1);
  }
};

startServer();
