const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
// Load .env from project root regardless of where the script is run from
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 5001;

// Use a single uploads directory at the project root so that static
// file URLs work consistently in all deployment / execution contexts.
// __dirname here is   services/Server  so we go two levels up.
const uploadsDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadsDir)) {
  // Create recursively in case the ancestor path does not exist yet.
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`✅ Created uploads directory: ${uploadsDir}`);
} else {
  console.log(`📂 Uploads directory already exists: ${uploadsDir}`);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// --- CONFIGURATION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
// Initialize Stripe only if the secret key is available
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('⚠️ STRIPE_SECRET_KEY not found - Stripe functionality will be disabled');
}

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
app.use('/uploads', express.static(uploadsDir));

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

// Simple test route
app.get('/simple-test', (req, res) => {
  res.send('Simple test route works!');
});

app.get('/api/admin/all-users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, email, username, is_admin, subscription_tier, created_at, updated_at, is_suspended,
             max_products, max_audio_files, max_playlists, max_qr_codes, max_slideshows, 
             max_videos, max_activation_codes
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT id, email, username, created_at FROM users WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    // Case-insensitive email lookup using LOWER()
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
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
    // Case-insensitive email check
    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR username = $2', [email, username]);
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

    const userResult = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = userResult.rows[0];
    if (user.is_email_verified) return res.status(400).json({ error: 'Email is already verified' });

    const verificationToken = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    await pool.query('UPDATE users SET verification_token = $1 WHERE id = $2', [verificationToken, user.id]);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8081';
    const verificationUrl = `${frontendUrl}/auth/verify?token=${verificationToken}`;

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

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8081';
    res.redirect(`${frontendUrl}/auth/verification-success`);

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

app.patch('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const {
        subscriptionTier,
        isAdmin: adminStatus,
        isSuspended,
        maxProducts,
        maxAudioFiles,
        maxPlaylists,
        maxQrCodes,
        maxSlideshows,
        maxVideos,
        maxActivationCodes
    } = req.body;

    try {
        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (subscriptionTier !== undefined) {
            updates.push(`subscription_tier = $${paramCount++}`);
            values.push(subscriptionTier);
        }
        if (adminStatus !== undefined) {
            updates.push(`is_admin = $${paramCount++}`);
            values.push(adminStatus);
        }
        if (isSuspended !== undefined) {
            updates.push(`is_suspended = $${paramCount++}`);
            values.push(isSuspended);
        }
        if (maxProducts !== undefined) {
            updates.push(`max_products = $${paramCount++}`);
            values.push(maxProducts === 0 ? null : maxProducts);
        }
        if (maxAudioFiles !== undefined) {
            updates.push(`max_audio_files = $${paramCount++}`);
            values.push(maxAudioFiles === 0 ? null : maxAudioFiles);
        }
        if (maxPlaylists !== undefined) {
            updates.push(`max_playlists = $${paramCount++}`);
            values.push(maxPlaylists === 0 ? null : maxPlaylists);
        }
        if (maxQrCodes !== undefined) {
            updates.push(`max_qr_codes = $${paramCount++}`);
            values.push(maxQrCodes === 0 ? null : maxQrCodes);
        }
        if (maxSlideshows !== undefined) {
            updates.push(`max_slideshows = $${paramCount++}`);
            values.push(maxSlideshows === 0 ? null : maxSlideshows);
        }
        if (maxVideos !== undefined) {
            updates.push(`max_videos = $${paramCount++}`);
            values.push(maxVideos === 0 ? null : maxVideos);
        }
        if (maxActivationCodes !== undefined) {
            updates.push(`max_activation_codes = $${paramCount++}`);
            values.push(maxActivationCodes === 0 ? null : maxActivationCodes);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(id);

        const query = `
            UPDATE users 
            SET ${updates.join(', ')} 
            WHERE id = $${paramCount} 
            RETURNING id, email, username, subscription_tier, is_admin, is_suspended, 
                     max_products, max_audio_files, max_playlists, max_qr_codes, 
                     max_slideshows, max_videos, max_activation_codes, created_at, updated_at
        `;

        const result = await pool.query(query, values);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        console.log(`✅ Admin updated user ${id} permissions:`, req.body);
        res.json({ user: result.rows[0], message: 'User permissions updated successfully' });
    } catch (error) {
        console.error(`Error updating user ${id} permissions:`, error);
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
    const productsWithPrices = result.rows.map(p => {
      let pricesArr = p.prices;
      if (!pricesArr || !pricesArr.length) {
        const amount = p.price || (p.metadata && (p.metadata.price || p.metadata.unit_amount)) || 0;
        pricesArr = [{ id: 'default', unit_amount: amount, currency: 'usd' }];
      }
      return { ...p, prices: pricesArr };
    });
    res.json({ products: productsWithPrices });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public all-products route (no auth)
app.get('/api/products/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE is_deleted = false');
    const productsWithPrices = result.rows.map(p => {
      let pricesArr = p.prices;
      if (!pricesArr || !pricesArr.length) {
        const amount = p.price || (p.metadata && (p.metadata.price || p.metadata.unit_amount)) || 0;
        pricesArr = [{ id: 'default', unit_amount: amount, currency: 'usd' }];
      }
      return { ...p, prices: pricesArr };
    });
    res.json({ products: productsWithPrices });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product (owner or admin)
app.patch('/api/products/:id', authenticateToken, async (req, res) => {
  console.log('🟠 SERVER: PATCH /api/products/:id called');
  console.log('🟠 Product ID:', req.params.id);
  console.log('🟠 Request body:', JSON.stringify(req.body, null, 2));
  console.log('🟠 User:', req.user);
  
  try {
    const { id } = req.params;
    // Fetch product to verify rights
    const prodRes = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    console.log('🟠 Product lookup result:', prodRes.rows.length, 'rows');
    
    if (prodRes.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const product = prodRes.rows[0];
    if (!req.user.isAdmin && product.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { name, description, inStock, metadata, isSuspended, images, price, prices, category } = req.body;
    console.log('🟠 Extracted fields:', { name, description, inStock, metadata, isSuspended, images, price, prices, category });

    // Merge new metadata with existing
    const newMetadata = { ...product.metadata, ...metadata };
    console.log('🟠 Merged metadata:', newMetadata);

    // Properly format JSON fields for PostgreSQL
    const formattedMetadata = newMetadata ? JSON.stringify(newMetadata) : null;
    const formattedPrices = prices ? JSON.stringify(prices) : null;
    console.log('🟠 Formatted metadata:', formattedMetadata);
    console.log('🟠 Formatted prices:', formattedPrices);

    console.log('🟠 Executing UPDATE query...');
    await pool.query(
      `UPDATE products SET 
        name = COALESCE($1, name), 
        description = COALESCE($2, description),
        in_stock = COALESCE($3, in_stock),
        metadata = COALESCE($4, metadata),
        is_suspended = COALESCE($5, is_suspended),
        images = COALESCE($6, images),
        price = COALESCE($7, price),
        prices = COALESCE($8, prices),
        category = COALESCE($9, category),
        updated_at = NOW() 
       WHERE id = $10`,
      [name, description, inStock, formattedMetadata, isSuspended, images, price, formattedPrices, category, id]
    );
    console.log('✅ UPDATE query completed');

    // Note: prices update would normally involve stripe API; omitted for brevity.

    const updated = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    console.log('✅ Updated product:', updated.rows[0]);
    res.json({ product: updated.rows[0] });
  } catch (err) {
    console.error('🔴 SERVER: Update product error:', err);
    console.error('🔴 Stack trace:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Attempting to delete product with id: ${id}`);
    console.log(`Request by user: ${req.user.userId}, isAdmin: ${req.user.isAdmin}`);

    const prodRes = await pool.query('SELECT user_id FROM products WHERE id = $1', [id]);

    if (prodRes.rows.length === 0) {
      console.log(`Product with id: ${id} not found.`);
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = prodRes.rows[0];
    console.log(`Found product. Owner user_id: ${product.user_id}`);

    if (!req.user.isAdmin && product.user_id !== req.user.userId) {
      console.log(`Forbidden. User ${req.user.userId} is not owner ${product.user_id} and not admin.`);
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('UPDATE products SET is_deleted = true, updated_at = NOW() WHERE id = $1', [id]);
    console.log(`Product with id: ${id} successfully marked as deleted.`);

    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  console.log('🟠 SERVER: POST /api/products called');
  console.log('🟠 Request body:', JSON.stringify(req.body, null, 2));
  console.log('�� User:', req.user);
  
  try {
    const { name, description, images, metadata, inStock, prices, price, category } = req.body;
    console.log('🟠 Extracted fields:', { name, description, images, metadata, inStock, prices, price, category });
    const { userId } = req.user;

    // Basic validation
    if (!name || !prices || prices.length === 0) {
      return res.status(400).json({ error: 'Product name and price are required.' });
    }

    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_products FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM products WHERE user_id = $1 AND is_deleted = false', [userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    // Check for admin-set custom limit first, then fall back to subscription tier limits
    let maxProducts;
    if (user?.max_products !== null && user?.max_products !== undefined) {
      // Admin has set a custom limit
      maxProducts = user.max_products;
      console.log(`📋 Using admin-set custom limit: ${maxProducts} products for user ${userId}`);
    } else {
      // Use subscription tier limits
      const limits = {
        free: { maxProducts: 1 },
        basic: { maxProducts: 3 },
        premium: { maxProducts: 10 }
      };
      maxProducts = (limits[userTier] || limits.free).maxProducts;
      console.log(`📋 Using subscription tier limit: ${maxProducts} products for ${userTier} plan`);
    }
    
    if (currentCount >= maxProducts) {
      console.log(`🚫 Product creation blocked: User ${userId} has ${currentCount}/${maxProducts} products`);
      return res.status(403).json({ 
        error: `Product limit reached. You have reached your limit of ${maxProducts} products. Please contact support if you need to increase your limit.`,
        limit: maxProducts,
        current: currentCount,
        subscriptionTier: userTier,
        isCustomLimit: user?.max_products !== null && user?.max_products !== undefined
      });
    }

    console.log(`✅ Product creation allowed: User ${userId} has ${currentCount}/${maxProducts} products`);
    // END SUBSCRIPTION CHECK

    // Properly format JSON fields for PostgreSQL
    const formattedMetadata = metadata ? JSON.stringify(metadata) : JSON.stringify({});
    const formattedPrices = prices ? JSON.stringify(prices) : null;
    console.log('🟠 Formatted metadata:', formattedMetadata);
    console.log('🟠 Formatted prices:', formattedPrices);

    console.log('🟠 Executing INSERT query...');
    const result = await pool.query(
      `INSERT INTO products (user_id, name, description, images, metadata, in_stock, price, prices, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
      [userId, name, description, images, formattedMetadata, inStock, price, formattedPrices, category]
    );
    console.log('✅ INSERT completed, result:', result.rows[0]);

    const newProduct = result.rows[0];

    // In a real app, you'd also create Stripe Price objects here
    // and associate them. For now, we assume prices are managed elsewhere
    // and are passed in for context. We'll attach them to the response.
    newProduct.prices = prices;

    res.status(201).json({ product: newProduct });
  } catch (err) {
    console.error('🔴 SERVER: Create product error:', err);
    console.error('🔴 Stack trace:', err.stack);
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

app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  console.log('🖼️ UPLOAD: headers', req.headers['content-type']);
  console.log('🖼️ UPLOAD: req.body keys', Object.keys(req.body||{}));
  console.log('🖼️ UPLOAD: req.file', req.file);
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  console.log(`🖼️ UPLOAD: saved file at ${req.file.path}`);
  console.log(`🖼️ UPLOAD: returning fileUrl ${fileUrl}`);
  res.json({ fileUrl });
});

// ---------- MEDIA ROUTES ----------
app.post('/api/media', authenticateToken, async (req, res) => {
  try {
    const { title, filePath, url, filename, fileType, contentType, filesize, duration, uniqueId } = req.body;
    
    if (!title || !url) {
      return res.status(400).json({ error: 'Title and URL are required' });
    }

    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_audio_files FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM media WHERE user_id = $1', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    // Check for admin-set custom limit first, then fall back to subscription tier limits
    let maxAudioFiles;
    if (user?.max_audio_files !== null && user?.max_audio_files !== undefined) {
      // Admin has set a custom limit
      maxAudioFiles = user.max_audio_files;
      console.log(`📋 Using admin-set custom limit: ${maxAudioFiles} audio files for user ${req.user.userId}`);
    } else {
      // Use subscription tier limits
      const limits = {
        free: { maxAudioFiles: 3 },
        basic: { maxAudioFiles: 10 },
        premium: { maxAudioFiles: 20 }
      };
      maxAudioFiles = (limits[userTier] || limits.free).maxAudioFiles;
      console.log(`📋 Using subscription tier limit: ${maxAudioFiles} audio files for ${userTier} plan`);
    }
    
    if (currentCount >= maxAudioFiles) {
      console.log(`🚫 Media upload blocked: User ${req.user.userId} has ${currentCount}/${maxAudioFiles} audio files`);
      return res.status(403).json({ 
        error: `Audio file limit reached. You have reached your limit of ${maxAudioFiles} audio files. Please contact support if you need to increase your limit.`,
        limit: maxAudioFiles,
        current: currentCount,
        subscriptionTier: userTier,
        isCustomLimit: user?.max_audio_files !== null && user?.max_audio_files !== undefined
      });
    }

    console.log(`✅ Media upload allowed: User ${req.user.userId} has ${currentCount}/${maxAudioFiles} audio files`);
    // END SUBSCRIPTION CHECK

    const result = await pool.query(
      `INSERT INTO media (user_id, title, file_path, url, filename, file_type, content_type, filesize, duration, unique_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [req.user.userId, title, filePath || url, url, filename, fileType, contentType, filesize, duration, uniqueId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

app.get('/api/media', authenticateToken, async (req, res) => {
  try {
    const mine = req.query.mine === 'true';
    let result;
    
    if (mine) {
      result = await pool.query('SELECT * FROM media WHERE user_id = $1 ORDER BY created_at DESC', [req.user.userId]);
    } else {
      result = await pool.query('SELECT * FROM media ORDER BY created_at DESC');
    }
    
    res.json({ media: result.rows });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.get('/api/media/all', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM media ORDER BY created_at DESC');
    res.json({ media: result.rows });
  } catch (error) {
    console.error('Error fetching all media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.get('/api/media/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    const media = result.rows[0];
    
    // Create a proper HTTP URL for the audio file
    let properUrl = media.url;
    if (media.url && media.url.startsWith('data:')) {
      // If it's base64 data, serve it through our audio streaming endpoint
      properUrl = `${process.env.API_BASE_URL || 'http://localhost:5001'}/api/media/${id}/stream`;
    } else if (media.filename) {
      // If we have a filename, construct the proper URL
              properUrl = `${process.env.API_BASE_URL || 'http://localhost:5001'}/uploads/${media.filename}`;
    }
    
    // Return media with the proper URL structure expected by the frontend
    const mediaResponse = {
      ...media,
      url: properUrl,
      title: media.title,
      fileType: media.file_type,
      contentType: media.content_type
    };
    
    res.json({ media: mediaResponse });
  } catch (error) {
    console.error('Error fetching media by ID:', error);
    res.status(500).json({ error: 'Failed to fetch media file' });
  }
});

// Stream audio file from base64 data
app.get('/api/media/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    const media = result.rows[0];
    
    if (!media.url || !media.url.startsWith('data:')) {
      return res.status(400).json({ error: 'Media file is not stored as base64 data' });
    }
    
    // Clean up the data URL - handle potential duplicate prefixes
    let cleanUrl = media.url;
    if (cleanUrl.includes('data:audio/mpeg;base64,data:audio/mpeg;base64,')) {
      cleanUrl = cleanUrl.replace('data:audio/mpeg;base64,data:audio/mpeg;base64,', 'data:audio/mpeg;base64,');
    }
    
    // Parse the data URL
    const dataUrlMatch = cleanUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      console.error('Failed to parse data URL:', cleanUrl.substring(0, 100));
      return res.status(400).json({ error: 'Invalid base64 data format' });
    }
    
    let [, mimeType, base64Data] = dataUrlMatch;
    
    // Handle case where base64Data itself contains another data URL
    if (base64Data.startsWith('data:')) {
      const innerMatch = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (innerMatch) {
        console.log('Found nested data URL, extracting inner base64');
        mimeType = innerMatch[1];
        base64Data = innerMatch[2];
      }
    }
    const audioBuffer = Buffer.from(base64Data, 'base64');
    
    // Set appropriate headers for audio streaming
    res.setHeader('Content-Type', mimeType || 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Send the audio data
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error streaming media:', error);
    res.status(500).json({ error: 'Failed to stream media file' });
  }
});

app.delete('/api/media/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if media belongs to user or user is admin
    const mediaResult = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    const media = mediaResult.rows[0];
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    const isAdmin = userResult.rows[0]?.is_admin;
    
    if (media.user_id !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    await pool.query('DELETE FROM media WHERE id = $1', [id]);
    res.json({ message: 'Media deleted successfully' });
  } catch (error) {
    console.error('Error deleting media:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// ---------- CONTENT DETECTION ROUTE ----------
// Smart endpoint to determine if an ID is a playlist or media file
app.get('/api/content/:id/type', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check both tables efficiently with a single query each
    const [playlistCheck, mediaCheck] = await Promise.all([
      pool.query('SELECT id FROM playlists WHERE id = $1 LIMIT 1', [id]),
      pool.query('SELECT id FROM media WHERE id = $1 LIMIT 1', [id])
    ]);
    
    if (playlistCheck.rows.length > 0) {
      res.json({ 
        type: 'playlist', 
        id: id,
        exists: true 
      });
    } else if (mediaCheck.rows.length > 0) {
      res.json({ 
        type: 'media', 
        id: id,
        exists: true 
      });
    } else {
      res.status(404).json({ 
        type: 'unknown', 
        id: id,
        exists: false,
        error: 'Content not found' 
      });
    }
  } catch (error) {
    console.error('Error determining content type:', error);
    res.status(500).json({ error: 'Failed to determine content type' });
  }
});

// ---------- PLAYLIST ROUTES ----------
app.post('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const { name, description, mediaFileIds, requiresActivationCode, isPublic } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Playlist name is required' });
    }

    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_playlists FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM playlists WHERE user_id = $1', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    // Check for admin-set custom limit first, then fall back to subscription tier limits
    let maxPlaylists;
    if (user?.max_playlists !== null && user?.max_playlists !== undefined) {
      // Admin has set a custom limit
      maxPlaylists = user.max_playlists;
      console.log(`📋 Using admin-set custom limit: ${maxPlaylists} playlists for user ${req.user.userId}`);
    } else {
      // Use subscription tier limits
      const limits = {
        free: { maxPlaylists: 10 },
        basic: { maxPlaylists: 25 },
        premium: { maxPlaylists: 50 }
      };
      maxPlaylists = (limits[userTier] || limits.free).maxPlaylists;
      console.log(`📋 Using subscription tier limit: ${maxPlaylists} playlists for ${userTier} plan`);
    }
    
    if (currentCount >= maxPlaylists) {
      console.log(`🚫 Playlist creation blocked: User ${req.user.userId} has ${currentCount}/${maxPlaylists} playlists`);
      return res.status(403).json({ 
        error: `Playlist limit reached. You have reached your limit of ${maxPlaylists} playlists. Please contact support if you need to increase your limit.`,
        limit: maxPlaylists,
        current: currentCount,
        subscriptionTier: userTier,
        isCustomLimit: user?.max_playlists !== null && user?.max_playlists !== undefined
      });
    }

    console.log(`✅ Playlist creation allowed: User ${req.user.userId} has ${currentCount}/${maxPlaylists} playlists`);
    // END SUBSCRIPTION CHECK

    const result = await pool.query(
      `INSERT INTO playlists (user_id, name, description, requires_activation_code, is_public) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.userId, name, description || null, requiresActivationCode || false, isPublic || false]
    );

    const playlist = result.rows[0];

    // Add media files to playlist if provided
    if (mediaFileIds && mediaFileIds.length > 0) {
      for (let i = 0; i < mediaFileIds.length; i++) {
        await pool.query(
          `INSERT INTO playlist_media (playlist_id, media_id, display_order) VALUES ($1, $2, $3)`,
          [playlist.id, mediaFileIds[i], i + 1]
        );
      }
    }

    // Fetch complete playlist with media files
    const completePlaylist = await getPlaylistWithMedia(playlist.id, req);
    res.status(201).json({ playlist: completePlaylist });
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

app.get('/api/playlists', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username 
       FROM playlists p 
       JOIN users u ON p.user_id = u.id 
       WHERE p.user_id = $1 
       ORDER BY p.created_at DESC`,
      [req.user.userId]
    );

    const playlists = await Promise.all(
      result.rows.map(async (playlist) => {
        return await getPlaylistWithMedia(playlist.id, req);
      })
    );

    res.json({ playlists });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

app.get('/api/playlists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const playlist = await getPlaylistWithMedia(id, req);
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    res.json({ playlist });
  } catch (error) {
    console.error('Error fetching playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

app.patch('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, requiresActivationCode, isPublic } = req.body;

    console.log('🔴 PLAYLIST_PATCH: Updating playlist:', id);
    console.log('🔴 PLAYLIST_PATCH: Request body:', { name, description, requiresActivationCode, isPublic });
    console.log('🔴 PLAYLIST_PATCH: User ID:', req.user.userId);

    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );

    console.log('🔴 PLAYLIST_PATCH: Owner check result:', ownerCheck.rows);

    if (ownerCheck.rows.length === 0) {
      console.log('🔴 PLAYLIST_PATCH: Playlist not found');
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      console.log('🔴 PLAYLIST_PATCH: Not authorized - owner:', ownerCheck.rows[0].user_id, 'user:', req.user.userId);
      return res.status(403).json({ error: 'Not authorized to update this playlist' });
    }

    console.log('🔴 PLAYLIST_PATCH: About to run UPDATE query...');
    const result = await pool.query(
      `UPDATE playlists 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           requires_activation_code = COALESCE($3, requires_activation_code), 
           is_public = COALESCE($4, is_public)
       WHERE id = $5 RETURNING *`,
      [name, description, requiresActivationCode, isPublic, id]
    );

    console.log('🔴 PLAYLIST_PATCH: UPDATE query successful, result:', result.rows[0]);

    const updatedPlaylist = await getPlaylistWithMedia(id, req);
    console.log('🔴 PLAYLIST_PATCH: getPlaylistWithMedia result:', updatedPlaylist);
    
    res.json({ playlist: updatedPlaylist });
  } catch (error) {
    console.error('🔴 PLAYLIST_PATCH: Error updating playlist:', error);
    console.error('🔴 PLAYLIST_PATCH: Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

app.delete('/api/playlists/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this playlist' });
    }

    // Delete playlist (CASCADE will handle playlist_media)
    await pool.query('DELETE FROM playlists WHERE id = $1', [id]);
    
    res.json({ message: 'Playlist deleted successfully' });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// Helper function to get the correct API base URL from request
function getApiBaseUrl(req) {
  // For web requests, use the request host
  if (req && req.headers && req.headers.host) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers.host;
    return `${protocol}://${host}`;
  }
  
  // Fallback to environment variable or localhost
  return process.env.API_BASE_URL?.replace('/api', '') || 'http://localhost:5001';
}

// Helper function to get playlist with media files
async function getPlaylistWithMedia(playlistId, req = null) {
  console.log('🔴 GET_PLAYLIST: Fetching playlist:', playlistId);
  
  const playlistResult = await pool.query(
    `SELECT p.*, u.username 
     FROM playlists p 
     JOIN users u ON p.user_id = u.id 
     WHERE p.id = $1`,
    [playlistId]
  );

  if (playlistResult.rows.length === 0) {
    console.log('🔴 GET_PLAYLIST: Playlist not found:', playlistId);
    return null;
  }

  const playlist = playlistResult.rows[0];
  console.log('🔴 GET_PLAYLIST: Raw playlist data:', playlist);

  // Get media files for this playlist
  const mediaResult = await pool.query(
    `SELECT m.*, pm.display_order 
     FROM media m 
     JOIN playlist_media pm ON m.id = pm.media_id 
     WHERE pm.playlist_id = $1 
     ORDER BY pm.display_order`,
    [playlistId]
  );

  // Use the correct base URL based on the request
  const baseUrl = getApiBaseUrl(req);
  console.log('🔴 GET_PLAYLIST: Using base URL:', baseUrl);

  playlist.mediaFiles = mediaResult.rows.map(media => ({
    id: media.id,
    title: media.title,
    filePath: `/uploads/${media.filename}`,
    fileType: media.file_type,
    contentType: media.content_type,
    url: `${baseUrl}/api/media/${media.id}/stream`,
  }));

  // Get product links for this playlist
  const productLinksResult = await pool.query(
    `SELECT pl.*, p.name as product_name, p.description as product_description, p.images as product_images, p.price as product_price
     FROM product_links pl 
     LEFT JOIN products p ON pl.product_id = p.id 
     WHERE pl.playlist_id = $1 AND pl.is_active = true
     ORDER BY pl.display_order`,
    [playlistId]
  );

  playlist.productLinks = productLinksResult.rows.map(link => ({
    id: link.id,
    playlistId: link.playlist_id,
    productId: link.product_id,
    title: link.title,
    url: link.url,
    description: link.description,
    imageUrl: link.image_url || (link.product_images && link.product_images.length > 0 ? link.product_images[0] : null),
    displayOrder: link.display_order,
    isActive: link.is_active,
    createdAt: link.created_at,
    updatedAt: link.updated_at,
    // Include product info for reference
    product: link.product_id ? {
      id: link.product_id,
      name: link.product_name,
      description: link.product_description,
      images: link.product_images,
      price: link.product_price
    } : null
  }));

  console.log('🔴 GET_PLAYLIST: Found', playlist.productLinks.length, 'product links');

  // Convert snake_case fields to camelCase for frontend compatibility
  const convertedPlaylist = {
    ...playlist,
    requiresActivationCode: playlist.requires_activation_code,
    isPublic: playlist.is_public,
    userId: playlist.user_id,
    createdAt: playlist.created_at,
    updatedAt: playlist.updated_at
  };
  
  console.log('🔴 GET_PLAYLIST: Converted playlist data:', {
    id: convertedPlaylist.id,
    name: convertedPlaylist.name,
    requiresActivationCode: convertedPlaylist.requiresActivationCode,
    requires_activation_code: playlist.requires_activation_code,
    isPublic: convertedPlaylist.isPublic,
    is_public: playlist.is_public
  });
  
  return convertedPlaylist;
}

// ---------- STRIPE UTILITY ROUTES ----------
app.get('/api/stripe/health', (req, res) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  return res.json({
    stripeConfigured: !!secretKey,
    secretKeyType: secretKey?.startsWith('sk_live') ? 'live' : 'test',
    secretKeyValid: !!secretKey,
  });
});

app.post('/api/stripe/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { amount, subscriptionTier } = req.body;
    if (!amount) return res.status(400).json({ error: 'Amount required' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: { subscriptionTier, userId: req.user.userId },
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret, customerId: paymentIntent.customer });
  } catch (err) {
    console.error('PaymentIntent error', err);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Legacy alias expected by older test script
app.post('/api/stripe/create-checkout-session', authenticateToken, async (req, res) => {
  // Forward to the new handler
  req.url = '/api/checkout/session';
  return app._router.handle(req, res);
});

// ---------- CHECKOUT ROUTE ----------
app.post('/api/checkout/session', authenticateToken, async (req, res) => {
  try {
    const { items, successUrl, cancelUrl } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Fetch products from DB to build line items
    const ids = items.map((it) => it.productId);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(`SELECT * FROM products WHERE id IN (${placeholders})`, ids);

    const productsMap = new Map();
    rows.forEach((p) => productsMap.set(String(p.id), p));

    const line_items = [];

    for (const it of items) {
      const prod = productsMap.get(String(it.productId));
      if (!prod) continue;

      // Check if product is in stock
      if (!prod.in_stock) {
        console.log(`🚫 Product ${prod.name} is out of stock, skipping from checkout`);
        continue;
      }

      let unitAmount = 0;
      if (prod.prices && Array.isArray(prod.prices) && prod.prices.length) {
        unitAmount = prod.prices[0].unit_amount;
      } else if (prod.price) {
        unitAmount = prod.price; // fallback to legacy column
      } else if (prod.metadata && (prod.metadata.unit_amount || prod.metadata.price)) {
        unitAmount = Number(prod.metadata.unit_amount || prod.metadata.price);
      }
      if (unitAmount <= 0) continue;

      console.log('Adding line item', prod.name, unitAmount);

      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: prod.name,
            images: prod.images && prod.images.length ? [prod.images[0]] : undefined,
          },
          unit_amount: unitAmount,
        },
        quantity: it.quantity || 1,
      });
    }

    if (line_items.length === 0) {
      return res.status(400).json({ error: 'No valid items for checkout' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      success_url: successUrl || `${req.protocol}://${req.get('host')}/store/checkout/success`,
      cancel_url: cancelUrl || `${req.protocol}://${req.get('host')}/store/checkout/cancel`,
      phone_number_collection: { enabled: true }, // <-- Collect phone number
      metadata: {
        userId: req.user.userId,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout session error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ---------- PRODUCT LINKS API ----------

// Get product links for a playlist
app.get('/api/playlists/:playlistId/product-links', async (req, res) => {
  try {
    const { playlistId } = req.params;
    
    const result = await pool.query(
      `SELECT pl.*, p.name as product_name, p.description as product_description, p.images as product_images, p.price as product_price
       FROM product_links pl 
       LEFT JOIN products p ON pl.product_id = p.id 
       WHERE pl.playlist_id = $1
       ORDER BY pl.display_order`,
      [playlistId]
    );

    const productLinks = result.rows.map(link => ({
      id: link.id,
      playlistId: link.playlist_id,
      productId: link.product_id,
      title: link.title,
      url: link.url,
      description: link.description,
      imageUrl: link.image_url,
      displayOrder: link.display_order,
      isActive: link.is_active,
      createdAt: link.created_at,
      updatedAt: link.updated_at,
      product: link.product_id ? {
        id: link.product_id,
        name: link.product_name,
        description: link.product_description,
        images: link.product_images,
        price: link.product_price
      } : null
    }));

    res.json(productLinks);
  } catch (error) {
    console.error('Error fetching product links:', error);
    res.status(500).json({ error: 'Failed to fetch product links' });
  }
});

// Create a product link
app.post('/api/playlists/:playlistId/product-links', authenticateToken, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { productId, title, url, description, imageUrl, displayOrder } = req.body;

    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [playlistId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this playlist' });
    }

    const result = await pool.query(
      `INSERT INTO product_links (playlist_id, product_id, title, url, description, image_url, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [playlistId, productId, title, url, description, imageUrl, displayOrder || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating product link:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ error: 'Product already linked to this playlist' });
    } else {
      res.status(500).json({ error: 'Failed to create product link' });
    }
  }
});

// Update a product link
app.patch('/api/product-links/:linkId', authenticateToken, async (req, res) => {
  try {
    const { linkId } = req.params;
    const { title, url, description, imageUrl, displayOrder, isActive } = req.body;

    // Check if user owns the playlist that this link belongs to
    const ownerCheck = await pool.query(
      `SELECT p.user_id 
       FROM product_links pl 
       JOIN playlists p ON pl.playlist_id = p.id 
       WHERE pl.id = $1`,
      [linkId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Product link not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this product link' });
    }

    const result = await pool.query(
      `UPDATE product_links 
       SET title = COALESCE($1, title),
           url = COALESCE($2, url),
           description = COALESCE($3, description),
           image_url = COALESCE($4, image_url),
           display_order = COALESCE($5, display_order),
           is_active = COALESCE($6, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [title, url, description, imageUrl, displayOrder, isActive, linkId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating product link:', error);
    res.status(500).json({ error: 'Failed to update product link' });
  }
});

// Delete a product link
app.delete('/api/product-links/:linkId', authenticateToken, async (req, res) => {
  try {
    const { linkId } = req.params;

    // Check if user owns the playlist that this link belongs to
    const ownerCheck = await pool.query(
      `SELECT p.user_id 
       FROM product_links pl 
       JOIN playlists p ON pl.playlist_id = p.id 
       WHERE pl.id = $1`,
      [linkId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Product link not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this product link' });
    }

    await pool.query('DELETE FROM product_links WHERE id = $1', [linkId]);
    res.json({ message: 'Product link deleted successfully' });
  } catch (error) {
    console.error('Error deleting product link:', error);
    res.status(500).json({ error: 'Failed to delete product link' });
  }
});

// Reorder product links
app.patch('/api/playlists/:playlistId/product-links/reorder', authenticateToken, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { updates } = req.body; // Array of { id, displayOrder }

    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [playlistId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this playlist' });
    }

    // Update display orders
    for (const update of updates) {
      await pool.query(
        'UPDATE product_links SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND playlist_id = $3',
        [update.displayOrder, update.id, playlistId]
      );
    }

    res.json({ message: 'Product links reordered successfully' });
  } catch (error) {
    console.error('Error reordering product links:', error);
    res.status(500).json({ error: 'Failed to reorder product links' });
  }
});

// ---------- QR CODES API ----------

// Get all QR codes for the current user
app.get('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    console.log('📱 QR_CODES: Fetching QR codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT qr.*, COUNT(qs.id) as scan_count
       FROM qr_codes qr
       LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
       WHERE qr.owner_id = $1 AND qr.is_active = true
       GROUP BY qr.id
       ORDER BY qr.created_at DESC`,
      [req.user.userId]
    );
    
    const qrCodes = result.rows.map(qr => ({
      ...qr,
      options: typeof qr.options === 'string' ? JSON.parse(qr.options) : qr.options,
      scanCount: parseInt(qr.scan_count) || 0
    }));
    
    console.log('📱 QR_CODES: Found', qrCodes.length, 'QR codes');
    res.json({ qrCodes });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error fetching QR codes:', error);
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
});

// Get a specific QR code by ID
app.get('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📱 QR_CODES: Fetching QR code:', id);
    
    const result = await pool.query(
      `SELECT qr.*, COUNT(qs.id) as scan_count
       FROM qr_codes qr
       LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
       WHERE qr.id = $1 AND qr.owner_id = $2
       GROUP BY qr.id`,
      [id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    
    const qrCode = {
      ...result.rows[0],
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options,
      scanCount: parseInt(result.rows[0].scan_count) || 0
    };
    
    console.log('📱 QR_CODES: QR code found:', qrCode.name);
    res.json({ qrCode });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error fetching QR code:', error);
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
});

// Create a new QR code
app.post('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    console.log('📱 QR_CODES: ============ CREATE QR CODE DEBUG START ============');
    console.log('📱 QR_CODES: Request body:', JSON.stringify(req.body, null, 2));
    console.log('📱 QR_CODES: Authenticated user:', req.user);
    
    const { name, url, description, contentType, options } = req.body;
    
    if (!name || !url) {
      console.log('📱 QR_CODES: Validation failed - missing name or url:', { name, url });
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    
    console.log('📱 QR_CODES: Creating QR code:', { name, url, contentType });
    
    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_qr_codes FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM qr_codes WHERE owner_id = $1 AND is_active = true', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    // Check for admin-set custom limit first, then fall back to subscription tier limits
    let maxQRCodes;
    if (user?.max_qr_codes !== null && user?.max_qr_codes !== undefined) {
      maxQRCodes = user.max_qr_codes;
    } else {
      const limits = {
        free: { maxQRCodes: 10 },
        basic: { maxQRCodes: 50 },
        premium: { maxQRCodes: 100 }
      };
      maxQRCodes = (limits[userTier] || limits.free).maxQRCodes;
    }
    
    if (currentCount >= maxQRCodes) {
      return res.status(403).json({ 
        error: `QR code limit reached. You have reached your limit of ${maxQRCodes} QR codes.`,
        limit: maxQRCodes,
        current: currentCount,
        subscriptionTier: userTier
      });
    }

    // Generate QR code data (simplified - in production you might want to use a proper QR library)
    const qrCodeData = `qr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await pool.query(
      `INSERT INTO qr_codes (owner_id, name, url, qr_code_data, options, description) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.userId, name, url, qrCodeData, JSON.stringify(options || {}), description]
    );
    
    const qrCode = {
      ...result.rows[0],
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options,
      scanCount: 0
    };
    
    console.log('📱 QR_CODES: QR code created successfully:', qrCode.name);
    res.status(201).json({ qrCode });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error creating QR code:', error);
    res.status(500).json({ error: 'Failed to create QR code' });
  }
});

// Update a QR code
app.patch('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, description, options } = req.body;
    
    console.log('📱 QR_CODES: Updating QR code:', id);
    
    // Check if user owns the QR code
    const ownerCheck = await pool.query(
      'SELECT owner_id FROM qr_codes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    if (ownerCheck.rows[0].owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to update this QR code' });
    }

    const result = await pool.query(
      `UPDATE qr_codes 
       SET name = COALESCE($1, name), 
           url = COALESCE($2, url), 
           description = COALESCE($3, description), 
           options = COALESCE($4, options),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, url, description, options ? JSON.stringify(options) : null, id]
    );

    const qrCode = {
      ...result.rows[0],
      options: typeof result.rows[0].options === 'string' ? JSON.parse(result.rows[0].options) : result.rows[0].options
    };
    
    console.log('📱 QR_CODES: QR code updated successfully:', qrCode.name);
    res.json({ qrCode });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error updating QR code:', error);
    res.status(500).json({ error: 'Failed to update QR code' });
  }
});

// Delete a QR code (soft delete)
app.delete('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📱 QR_CODES: Deleting QR code:', id);
    
    // Check if user owns the QR code
    const ownerCheck = await pool.query(
      'SELECT owner_id FROM qr_codes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    if (ownerCheck.rows[0].owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this QR code' });
    }

    // Soft delete by setting is_active to false
    await pool.query(
      'UPDATE qr_codes SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );
    
    console.log('📱 QR_CODES: QR code deleted successfully');
    res.json({ message: 'QR code deleted successfully' });
    
  } catch (error) {
    console.error('📱 QR_CODES: Error deleting QR code:', error);
    res.status(500).json({ error: 'Failed to delete QR code' });
  }
});

// ---------- ACTIVATION CODES API ----------

// Generate new activation code
app.post('/api/activation-codes', authenticateToken, async (req, res) => {
  try {
    const { playlistId, slideshowId, maxUses, expiresAt } = req.body;
    
    // Validate that exactly one content type is specified
    if ((playlistId && slideshowId) || (!playlistId && !slideshowId)) {
      return res.status(400).json({ error: 'Must specify either playlistId or slideshowId, not both' });
    }
    
    // Generate unique code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase() + 
                 Math.random().toString(36).substring(2, 8).toUpperCase();
    
    console.log('🔑 ACTIVATION_CODES: Creating new code:', { code, playlistId, slideshowId, maxUses, expiresAt });
    
    const result = await pool.query(
      `INSERT INTO activation_codes (code, playlist_id, slideshow_id, created_by, max_uses, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [code, playlistId || null, slideshowId || null, req.user.userId, maxUses || null, expiresAt || null]
    );
    
    console.log('🔑 ACTIVATION_CODES: Code created successfully:', result.rows[0]);
    res.status(201).json({ activationCode: result.rows[0] });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error creating code:', error);
    res.status(500).json({ error: 'Failed to create activation code' });
  }
});

// Get all codes generated by user (ALL GENERATED CODES tab)
app.get('/api/activation-codes/generated', authenticateToken, async (req, res) => {
  try {
    console.log('🔑 ACTIVATION_CODES: Fetching all generated codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT ac.*, 
              p.name as playlist_name,
              s.name as slideshow_name,
              CASE WHEN ac.playlist_id IS NOT NULL THEN 'playlist' ELSE 'slideshow' END as content_type
       FROM activation_codes ac
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE ac.created_by = $1
       ORDER BY ac.created_at DESC`,
      [req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'generated codes');
    res.json({ activationCodes: result.rows });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error fetching generated codes:', error);
    res.status(500).json({ error: 'Failed to fetch activation codes' });
  }
});

// Get codes attached to user's profile (MY ACCESS CODES tab)
app.get('/api/activation-codes/my-access', authenticateToken, async (req, res) => {
  try {
    console.log('🔑 ACTIVATION_CODES: Fetching access codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT ac.*, uac.attached_at,
              p.name as playlist_name,
              s.name as slideshow_name,
              CASE WHEN ac.playlist_id IS NOT NULL THEN 'playlist' ELSE 'slideshow' END as content_type
       FROM user_activation_codes uac
       JOIN activation_codes ac ON uac.activation_code_id = ac.id
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE uac.user_id = $1 AND ac.is_active = true
       ORDER BY uac.attached_at DESC`,
      [req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'access codes');
    res.json({ accessCodes: result.rows });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error fetching access codes:', error);
    res.status(500).json({ error: 'Failed to fetch access codes' });
  }
});

// Attach activation code to user's profile
app.post('/api/activation-codes/attach', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Activation code is required' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Attaching code to user:', { code, userId: req.user.userId });
    
    // First, verify the code exists and is valid
    const codeResult = await pool.query(
      `SELECT * FROM activation_codes 
       WHERE code = $1 AND is_active = true 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR uses_count < max_uses)`,
      [code]
    );
    
    if (codeResult.rows.length === 0) {
      console.log('🔑 ACTIVATION_CODES: Invalid or expired code:', code);
      return res.status(400).json({ error: 'Invalid or expired activation code' });
    }
    
    const activationCode = codeResult.rows[0];
    
    // Check if already attached
    const existingResult = await pool.query(
      `SELECT * FROM user_activation_codes 
       WHERE user_id = $1 AND activation_code_id = $2`,
      [req.user.userId, activationCode.id]
    );
    
    if (existingResult.rows.length > 0) {
      console.log('🔑 ACTIVATION_CODES: Code already attached to user');
      return res.status(400).json({ error: 'Code already attached to your profile' });
    }
    
    // Attach the code
    await pool.query(
      `INSERT INTO user_activation_codes (user_id, activation_code_id) 
       VALUES ($1, $2)`,
      [req.user.userId, activationCode.id]
    );
    
    // Increment usage count
    await pool.query(
      `UPDATE activation_codes SET uses_count = uses_count + 1 WHERE id = $1`,
      [activationCode.id]
    );
    
    console.log('🔑 ACTIVATION_CODES: Code attached successfully');
    res.json({ message: 'Activation code attached successfully', activationCode });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error attaching code:', error);
    res.status(500).json({ error: 'Failed to attach activation code' });
  }
});

// Detach activation code from user's profile (removes access)
app.delete('/api/activation-codes/detach/:codeId', authenticateToken, async (req, res) => {
  try {
    const { codeId } = req.params;
    
    console.log('🔑 ACTIVATION_CODES: Detaching code from user:', { codeId, userId: req.user.userId });
    
    const result = await pool.query(
      `DELETE FROM user_activation_codes 
       WHERE user_id = $1 AND activation_code_id = $2 
       RETURNING *`,
      [req.user.userId, codeId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Code not found or not attached to your profile' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Code detached successfully');
    res.json({ message: 'Access code removed from your profile' });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error detaching code:', error);
    res.status(500).json({ error: 'Failed to detach activation code' });
  }
});

// Validate activation code for playlist/slideshow access
app.post('/api/activation-codes/validate', async (req, res) => {
  try {
    const { code, playlistId, slideshowId } = req.body;
    
    if (!code || (!playlistId && !slideshowId)) {
      return res.status(400).json({ error: 'Code and content ID required' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Validating code:', { code, playlistId, slideshowId });
    
    const result = await pool.query(
      `SELECT * FROM activation_codes 
       WHERE code = $1 AND is_active = true 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR uses_count < max_uses)
       AND (playlist_id = $2 OR slideshow_id = $3)`,
      [code, playlistId || null, slideshowId || null]
    );
    
    if (result.rows.length === 0) {
      console.log('🔑 ACTIVATION_CODES: Invalid code for content');
      return res.status(400).json({ error: 'Invalid activation code for this content' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Code validated successfully');
    res.json({ valid: true, message: 'Activation code is valid' });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error validating code:', error);
    res.status(500).json({ error: 'Failed to validate activation code' });
  }
});

// Get codes for specific playlist/slideshow (for content creators)
app.get('/api/activation-codes/content/:contentType/:contentId', authenticateToken, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    
    if (contentType !== 'playlist' && contentType !== 'slideshow') {
      return res.status(400).json({ error: 'Invalid content type' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Fetching codes for content:', { contentType, contentId });
    
    const column = contentType === 'playlist' ? 'playlist_id' : 'slideshow_id';
    const result = await pool.query(
      `SELECT ac.* FROM activation_codes ac
       WHERE ac.${column} = $1 AND ac.created_by = $2
       ORDER BY ac.created_at DESC`,
      [contentId, req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'codes for content');
    res.json({ activationCodes: result.rows });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error fetching content codes:', error);
    res.status(500).json({ error: 'Failed to fetch activation codes' });
  }
});

// Update activation code (change expiration date, usage limits, or active status)
app.patch('/api/activation-codes/:codeId', authenticateToken, async (req, res) => {
  try {
    const { codeId } = req.params;
    const { maxUses, expiresAt, isActive } = req.body;
    
    console.log('🔑 ACTIVATION_CODES: Updating code:', { codeId, maxUses, expiresAt, isActive });
    
    // First verify the user owns this code
    const ownerResult = await pool.query(
      `SELECT * FROM activation_codes WHERE id = $1 AND created_by = $2`,
      [codeId, req.user.userId]
    );
    
    if (ownerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Activation code not found or you do not have permission to edit it' });
    }
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (maxUses !== undefined) {
      updates.push(`max_uses = $${paramCount}`);
      values.push(maxUses === '' || maxUses === null ? null : parseInt(maxUses));
      paramCount++;
    }
    
    if (expiresAt !== undefined) {
      updates.push(`expires_at = $${paramCount}`);
      values.push(expiresAt === '' || expiresAt === null ? null : expiresAt);
      paramCount++;
    }
    
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount}`);
      values.push(isActive);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(codeId);
    
    const updateQuery = `
      UPDATE activation_codes 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount} 
      RETURNING *
    `;
    
    console.log('🔑 ACTIVATION_CODES: Update query:', updateQuery);
    console.log('🔑 ACTIVATION_CODES: Update values:', values);
    
    const result = await pool.query(updateQuery, values);
    
    console.log('🔑 ACTIVATION_CODES: Code updated successfully:', result.rows[0]);
    res.json({ activationCode: result.rows[0] });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error updating code:', error);
    res.status(500).json({ error: 'Failed to update activation code' });
  }
});

// Delete activation code
app.delete('/api/activation-codes/:codeId', authenticateToken, async (req, res) => {
  try {
    const { codeId } = req.params;
    
    console.log('🔑 ACTIVATION_CODES: Deleting code:', codeId);
    
    // First verify the user owns this code
    const result = await pool.query(
      `DELETE FROM activation_codes 
       WHERE id = $1 AND created_by = $2 
       RETURNING *`,
      [codeId, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activation code not found or you do not have permission to delete it' });
    }
    
    console.log('🔑 ACTIVATION_CODES: Code deleted successfully');
    res.json({ message: 'Activation code deleted successfully' });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error deleting code:', error);
    res.status(500).json({ error: 'Failed to delete activation code' });
  }
});

// ---------- SLIDESHOW API ----------

// Get all slideshows for the current user
app.get('/api/slideshows', authenticateToken, async (req, res) => {
  try {
    console.log('🎬 SLIDESHOWS: Fetching slideshows for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT s.* FROM slideshows s 
       WHERE s.user_id = $1 
       ORDER BY s.created_at DESC`,
      [req.user.userId]
    );
    
    // Get images for each slideshow
    const slideshows = await Promise.all(
      result.rows.map(async (slideshow) => {
        const imagesResult = await pool.query(
          `SELECT * FROM slideshow_images 
           WHERE slideshow_id = $1 
           ORDER BY display_order`,
          [slideshow.id]
        );
        
        // Map database fields to frontend camelCase fields
        const mappedSlideshow = {
          id: slideshow.id,
          userId: slideshow.user_id,
          name: slideshow.name,
          description: slideshow.description,
          autoplayInterval: slideshow.autoplay_interval,
          transition: slideshow.transition,
          requiresActivationCode: slideshow.requires_activation_code,
          audioUrl: slideshow.audio_url,
          isPublic: slideshow.is_public,
          createdAt: slideshow.created_at,
          updatedAt: slideshow.updated_at,
          uniqueId: `slideshow-${slideshow.id}`, // Generate uniqueId for frontend
          images: imagesResult.rows.map(img => ({
            id: img.id,
            slideshowId: img.slideshow_id,
            imageUrl: img.image_url,
            caption: img.caption,
            displayOrder: img.display_order,
            createdAt: img.created_at
          })),
        };
        
        return mappedSlideshow;
      })
    );
    
    console.log('🎬 SLIDESHOWS: Found', slideshows.length, 'slideshows');
    res.json({ slideshows });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: Error fetching slideshows:', error);
    res.status(500).json({ error: 'Failed to fetch slideshows' });
  }
});

// Get a specific slideshow by ID
app.get('/api/slideshows/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎬 SLIDESHOWS: Fetching slideshow:', id);
    
    const result = await pool.query(
      `SELECT s.* FROM slideshows s WHERE s.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = result.rows[0];
    
    // Get images for the slideshow
    const imagesResult = await pool.query(
      `SELECT * FROM slideshow_images 
       WHERE slideshow_id = $1 
       ORDER BY display_order`,
      [id]
    );
    
    // Map database fields to frontend camelCase fields
    const mappedSlideshow = {
      id: slideshow.id,
      userId: slideshow.user_id,
      name: slideshow.name,
      description: slideshow.description,
      autoplayInterval: slideshow.autoplay_interval,
      transition: slideshow.transition,
      requiresActivationCode: slideshow.requires_activation_code,
      audioUrl: slideshow.audio_url,
      isPublic: slideshow.is_public,
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at,
      uniqueId: `slideshow-${slideshow.id}`, // Generate uniqueId for frontend
      images: imagesResult.rows.map(img => ({
        id: img.id,
        slideshowId: img.slideshow_id,
        imageUrl: img.image_url,
        caption: img.caption,
        displayOrder: img.display_order,
        createdAt: img.created_at
      })),
    };
    
    console.log('🎬 SLIDESHOWS: Slideshow found:', mappedSlideshow.name);
    res.json({ slideshow: mappedSlideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: Error fetching slideshow:', error);
    res.status(500).json({ error: 'Failed to fetch slideshow' });
  }
});

// Create a new slideshow
app.post('/api/slideshows', authenticateToken, async (req, res) => {
  try {
    const { name, description, autoplayInterval, transition, requiresActivationCode } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Slideshow name is required' });
    }
    
    console.log('🎬 SLIDESHOWS: Creating slideshow:', name);
    
    // 🔒 SUBSCRIPTION LIMIT CHECK
    const userResult = await pool.query('SELECT subscription_tier, max_slideshows FROM users WHERE id = $1', [req.user.userId]);
    const user = userResult.rows[0];
    const userTier = user?.subscription_tier || 'free';
    
    const countResult = await pool.query('SELECT COUNT(*) FROM slideshows WHERE user_id = $1', [req.user.userId]);
    const currentCount = parseInt(countResult.rows[0].count);

    let maxSlideshows;
    if (user?.max_slideshows !== null && user?.max_slideshows !== undefined) {
      maxSlideshows = user.max_slideshows;
    } else {
      const limits = {
        free: { maxSlideshows: 5 },
        basic: { maxSlideshows: 15 },
        premium: { maxSlideshows: 30 }
      };
      maxSlideshows = (limits[userTier] || limits.free).maxSlideshows;
    }
    
    if (currentCount >= maxSlideshows) {
      return res.status(403).json({ 
        error: `Slideshow limit reached. You have reached your limit of ${maxSlideshows} slideshows.`,
        limit: maxSlideshows,
        current: currentCount,
        subscriptionTier: userTier
      });
    }

    const result = await pool.query(
      `INSERT INTO slideshows (user_id, name, description, autoplay_interval, transition, requires_activation_code) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.userId, name, description, autoplayInterval || 5000, transition || 'fade', requiresActivationCode || false]
    );
    
    // Map database fields to frontend camelCase fields
    const slideshow = {
      id: result.rows[0].id,
      userId: result.rows[0].user_id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      autoplayInterval: result.rows[0].autoplay_interval,
      transition: result.rows[0].transition,
      requiresActivationCode: result.rows[0].requires_activation_code,
      audioUrl: result.rows[0].audio_url,
      isPublic: result.rows[0].is_public,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
      uniqueId: `slideshow-${result.rows[0].id}`,
      images: []
    };
    
    console.log('🎬 SLIDESHOWS: Slideshow created successfully:', slideshow.name);
    res.status(201).json({ slideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: Error creating slideshow:', error);
    res.status(500).json({ error: 'Failed to create slideshow' });
  }
});

// Update a slideshow
app.patch('/api/slideshows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, autoplayInterval, transition, requiresActivationCode } = req.body;
    
    console.log('🎬 SLIDESHOWS: Updating slideshow:', id);
    
    // Check if user owns the slideshow
    const ownerCheck = await pool.query(
      'SELECT user_id FROM slideshows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to update this slideshow' });
    }

    const result = await pool.query(
      `UPDATE slideshows 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           autoplay_interval = COALESCE($3, autoplay_interval), 
           transition = COALESCE($4, transition),
           requires_activation_code = COALESCE($5, requires_activation_code),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, description, autoplayInterval, transition, requiresActivationCode, id]
    );

    // Map database fields to frontend camelCase fields
    const slideshow = {
      id: result.rows[0].id,
      userId: result.rows[0].user_id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      autoplayInterval: result.rows[0].autoplay_interval,
      transition: result.rows[0].transition,
      requiresActivationCode: result.rows[0].requires_activation_code,
      audioUrl: result.rows[0].audio_url,
      isPublic: result.rows[0].is_public,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at,
      uniqueId: `slideshow-${result.rows[0].id}`
    };
    
    console.log('🎬 SLIDESHOWS: Slideshow updated successfully:', slideshow.name);
    res.json({ slideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: Error updating slideshow:', error);
    res.status(500).json({ error: 'Failed to update slideshow' });
  }
});

// Delete a slideshow
app.delete('/api/slideshows/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🎬 SLIDESHOWS: Deleting slideshow:', id);
    
    // Check if user owns the slideshow
    const ownerCheck = await pool.query(
      'SELECT user_id FROM slideshows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this slideshow' });
    }

    // Delete slideshow (this will cascade delete images)
    await pool.query('DELETE FROM slideshows WHERE id = $1', [id]);
    
    console.log('🎬 SLIDESHOWS: Slideshow deleted successfully');
    res.json({ message: 'Slideshow deleted successfully' });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: Error deleting slideshow:', error);
    res.status(500).json({ error: 'Failed to delete slideshow' });
  }
});

// ---------- CHAT ROUTES ----------
app.get('/api/playlists/:playlistId/chat', async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    console.log('🔴 CHAT: Fetching messages for playlist:', playlistId);

    // Check if playlist exists and is accessible
    const playlistResult = await pool.query(
      'SELECT id, requires_activation_code, is_public FROM playlists WHERE id = $1',
      [playlistId]
    );

    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const playlist = playlistResult.rows[0];

    // For now, allow all users to view chat for public playlists
    // TODO: Add activation code check for protected playlists if needed

    const result = await pool.query(
      `SELECT cm.*, u.username 
       FROM chat_messages cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE cm.playlist_id = $1 AND cm.is_deleted = FALSE 
       ORDER BY cm.created_at DESC 
       LIMIT $2 OFFSET $3`,
      [playlistId, parseInt(limit), parseInt(offset)]
    );

    const messages = result.rows.map(msg => ({
      id: msg.id,
      playlistId: msg.playlist_id,
      userId: msg.user_id,
      username: msg.username,
      message: msg.message,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at,
      isDeleted: msg.is_deleted
    }));

    console.log('🔴 CHAT: Found', messages.length, 'messages');
    res.json({ messages: messages.reverse() }); // Reverse to show oldest first
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

app.post('/api/playlists/:playlistId/chat', authenticateToken, async (req, res) => {
  try {
    const { playlistId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (message.trim().length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    }

    console.log('🔴 CHAT: Creating message for playlist:', playlistId, 'by user:', req.user.userId);

    // Check if playlist exists
    const playlistResult = await pool.query(
      'SELECT id FROM playlists WHERE id = $1',
      [playlistId]
    );

    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Insert the message
    const result = await pool.query(
      `INSERT INTO chat_messages (playlist_id, user_id, message) 
       VALUES ($1, $2, $3) RETURNING *`,
      [playlistId, req.user.userId, message.trim()]
    );

    // Get the message with username
    const messageResult = await pool.query(
      `SELECT cm.*, u.username 
       FROM chat_messages cm 
       JOIN users u ON cm.user_id = u.id 
       WHERE cm.id = $1`,
      [result.rows[0].id]
    );

    const newMessage = messageResult.rows[0];
    const formattedMessage = {
      id: newMessage.id,
      playlistId: newMessage.playlist_id,
      userId: newMessage.user_id,
      username: newMessage.username,
      message: newMessage.message,
      createdAt: newMessage.created_at,
      updatedAt: newMessage.updated_at,
      isDeleted: newMessage.is_deleted
    };

    console.log('🔴 CHAT: Message created:', formattedMessage.id);
    res.status(201).json({ message: formattedMessage });
  } catch (error) {
    console.error('Error creating chat message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

app.delete('/api/playlists/:playlistId/chat/:messageId', authenticateToken, async (req, res) => {
  try {
    const { playlistId, messageId } = req.params;

    console.log('🔴 CHAT: Deleting message:', messageId, 'from playlist:', playlistId);

    // Check if user owns the message or is admin
    const messageResult = await pool.query(
      'SELECT user_id FROM chat_messages WHERE id = $1 AND playlist_id = $2',
      [messageId, playlistId]
    );

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const messageOwnerId = messageResult.rows[0].user_id;
    
    // Check if user is admin
    const userResult = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.userId]
    );
    const isAdmin = userResult.rows[0]?.is_admin || false;

    if (messageOwnerId !== req.user.userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    // Soft delete the message
    await pool.query(
      'UPDATE chat_messages SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1',
      [messageId]
    );

    console.log('🔴 CHAT: Message deleted:', messageId);
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ---------- WEB ROUTES FOR QR CODE SCANNING ----------
// These routes serve HTML pages for people who scan QR codes but don't have the app

app.get('/playlist-access/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🌐 WEB: Serving playlist access page for ID:', id);
    console.log('🌐 WEB: Request headers:', { host: req.headers.host, protocol: req.protocol, forwardedProto: req.headers['x-forwarded-proto'] });

    // Get playlist data with request context for proper URL generation
    const playlist = await getPlaylistWithMedia(id, req);
    if (!playlist) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Playlist Not Found - MerchTech</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #dc2626; }
          </style>
        </head>
        <body>
          <h1 class="error">Playlist Not Found</h1>
          <p>The playlist you're looking for doesn't exist.</p>
        </body>
        </html>
      `);
    }

    // Generate HTML page with embedded media player
    console.log('🌐 WEB: Media URLs for web player:', playlist.mediaFiles?.map(f => ({ title: f.title, url: f.url })));
    const htmlContent = generatePlaylistWebPage(playlist);
    res.send(htmlContent);

  } catch (error) {
    console.error('🌐 WEB: Error serving playlist page:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Error - MerchTech</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .error { color: #dc2626; }
        </style>
      </head>
      <body>
        <h1 class="error">Something went wrong</h1>
        <p>Please try again later.</p>
      </body>
      </html>
    `);
  }
});

console.log('🌐 WEB: Playlist access route registered');

// Function to generate the web page HTML
function generatePlaylistWebPage(playlist) {
  const isProtected = playlist.requiresActivationCode;
  const mediaFiles = playlist.mediaFiles || [];
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${playlist.name} - MerchTech</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: white;
        }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .playlist-title { font-size: 2.5rem; margin-bottom: 10px; }
        .playlist-subtitle { opacity: 0.8; font-size: 1.1rem; }
        .player-section { 
          background: rgba(255,255,255,0.1); 
          border-radius: 20px; 
          padding: 30px; 
          margin-bottom: 30px;
          backdrop-filter: blur(10px);
        }
        .track-list { list-style: none; }
        .track-item { 
          background: rgba(255,255,255,0.1); 
          margin: 10px 0; 
          padding: 15px; 
          border-radius: 10px;
          display: flex;
          align-items: center;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .track-item:hover { background: rgba(255,255,255,0.2); }
        .track-number { 
          background: rgba(255,255,255,0.2); 
          width: 30px; 
          height: 30px; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          margin-right: 15px;
          font-weight: bold;
        }
        .track-title { flex: 1; font-size: 1.1rem; }
        .play-button { 
          background: #10b981; 
          border: none; 
          color: white; 
          padding: 8px 12px; 
          border-radius: 20px; 
          cursor: pointer;
          font-size: 0.9rem;
        }
        .play-button:hover { background: #059669; }
        .activation-section { 
          background: rgba(255,255,255,0.1); 
          border-radius: 20px; 
          padding: 30px; 
          text-align: center;
          margin-bottom: 30px;
        }
        .activation-input { 
          width: 100%; 
          max-width: 300px; 
          padding: 15px; 
          border: none; 
          border-radius: 10px; 
          font-size: 1.1rem;
          margin: 15px 0;
          text-align: center;
          background: rgba(255,255,255,0.9);
          color: #333;
        }
        .activation-button { 
          background: #10b981; 
          border: none; 
          color: white; 
          padding: 15px 30px; 
          border-radius: 10px; 
          cursor: pointer;
          font-size: 1.1rem;
          margin: 10px;
        }
        .activation-button:hover { background: #059669; }
        .preview-button { 
          background: #f59e0b; 
          border: none; 
          color: white; 
          padding: 15px 30px; 
          border-radius: 10px; 
          cursor: pointer;
          font-size: 1.1rem;
          margin: 10px;
        }
        .preview-button:hover { background: #d97706; }
        .app-download { 
          background: rgba(255,255,255,0.1); 
          border-radius: 20px; 
          padding: 20px; 
          text-align: center;
          margin-top: 30px;
        }
        .download-button { 
          background: #3b82f6; 
          border: none; 
          color: white; 
          padding: 15px 30px; 
          border-radius: 10px; 
          cursor: pointer;
          font-size: 1.1rem;
          margin: 10px;
          text-decoration: none;
          display: inline-block;
        }
        .download-button:hover { background: #2563eb; }
        .audio-player { 
          width: 100%; 
          margin: 20px 0; 
          border-radius: 10px;
        }
        .current-track { 
          text-align: center; 
          margin: 20px 0; 
          font-size: 1.2rem; 
          font-weight: bold;
        }
        .preview-timer { 
          text-align: center; 
          font-size: 1.5rem; 
          color: #f59e0b; 
          margin: 20px 0;
        }
        .hidden { display: none; }
        @media (max-width: 768px) {
          .playlist-title { font-size: 2rem; }
          .container { padding: 15px; }
          .player-section, .activation-section { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="playlist-title">${playlist.name}</h1>
          <p class="playlist-subtitle">${mediaFiles.length} tracks • ${isProtected ? 'Premium Content' : 'Free Access'}</p>
        </div>

        ${isProtected ? `
          <div class="activation-section" id="activationSection">
            <h2>🔐 This playlist requires an activation code</h2>
            <p style="margin: 15px 0; opacity: 0.9;">Enter your activation code for full access, or try a 30-second preview</p>
            <div>
              <input type="text" id="activationCode" class="activation-input" placeholder="Enter activation code" maxlength="20">
              <br>
              <button class="activation-button" onclick="validateActivationCode()">🔓 Unlock Playlist</button>
              <button class="preview-button" onclick="startPreview()">▶️ 30s Preview</button>
            </div>
          </div>
        ` : ''}

        <div class="player-section" id="playerSection" ${isProtected ? 'style="display: none;"' : ''}>
          <div class="current-track" id="currentTrack">Select a track to play</div>
          <audio id="audioPlayer" class="audio-player" controls preload="none">
            Your browser does not support the audio element.
          </audio>
          
          <div class="preview-timer hidden" id="previewTimer">
            Preview: <span id="timeLeft">30</span>s remaining
          </div>

          <ul class="track-list">
            ${mediaFiles.map((track, index) => `
              <li class="track-item" onclick="playTrack(${index}, '${track.url}', '${track.title.replace(/'/g, "\\'")}')">
                <div class="track-number">${index + 1}</div>
                <div class="track-title">${track.title}</div>
                <button class="play-button">▶️</button>
              </li>
            `).join('')}
          </ul>
        </div>

        <div class="app-download">
          <h3>💾 CREATE YOUR PROFILE TODAY!</h3>
          <p style="margin: 15px 0; opacity: 0.9;">
            <strong>Save your access code to your profile</strong> and never lose access to your content again. Quick registration takes just 30 seconds!
          </p>
          <a href="/auth/register" class="download-button" style="background: linear-gradient(135deg, #10b981, #059669); font-weight: bold;">
            🚀 CREATE PROFILE & SAVE ACCESS
          </a>
        </div>
      </div>

      <script>
        let currentAudio = null;
        let isPreviewMode = false;
        let previewTimer = null;
        let timeLeft = 30;

        function playTrack(index, url, title) {
          const player = document.getElementById('audioPlayer');
          const currentTrackDiv = document.getElementById('currentTrack');
          
          if (currentAudio) {
            currentAudio.pause();
          }
          
          player.src = url;
          currentTrackDiv.textContent = title;
          currentAudio = player;
          
          player.play().catch(e => {
            console.error('Error playing audio:', e);
            alert('Unable to play this track. Please try another.');
          });

          // If in preview mode, start the timer
          if (isPreviewMode) {
            startPreviewTimer();
          }
        }

        function validateActivationCode() {
          const code = document.getElementById('activationCode').value.trim();
          if (!code) {
            alert('Please enter an activation code');
            return;
          }

          // TODO: Add actual API call to validate code
          // For demo, accept any code that looks valid
          if (code.length >= 6) {
            document.getElementById('activationSection').style.display = 'none';
            document.getElementById('playerSection').style.display = 'block';
            isPreviewMode = false;
            alert('✅ Access granted! Enjoy the full playlist.');
          } else {
            alert('❌ Invalid activation code. Please try again or use the preview option.');
          }
        }

        function startPreview() {
          document.getElementById('activationSection').style.display = 'none';
          document.getElementById('playerSection').style.display = 'block';
          document.getElementById('previewTimer').classList.remove('hidden');
          isPreviewMode = true;
          timeLeft = 30;
          
          alert('🎵 Starting 30-second preview. Create your profile to save access codes!');
        }

        function startPreviewTimer() {
          if (previewTimer) clearInterval(previewTimer);
          
          previewTimer = setInterval(() => {
            timeLeft--;
            document.getElementById('timeLeft').textContent = timeLeft;
            
            if (timeLeft <= 0) {
              clearInterval(previewTimer);
              if (currentAudio) {
                currentAudio.pause();
              }
              alert('⏰ Preview time expired! Create your profile to save access codes or enter an activation code for full access.');
              document.getElementById('activationSection').style.display = 'block';
              document.getElementById('playerSection').style.display = 'none';
            }
          }, 1000);
        }

        // Auto-play first track if not protected
        ${!isProtected && mediaFiles.length > 0 ? `
          window.addEventListener('load', () => {
            setTimeout(() => {
              playTrack(0, '${mediaFiles[0].url}', '${mediaFiles[0].title.replace(/'/g, "\\'")}');
            }, 1000);
          });
        ` : ''}
      </script>
    </body>
    </html>
  `;
}

// --- ERROR HANDLING & SERVER STARTUP ---
// NOTE: Generic error handlers MUST be registered after all other routes
// to avoid catching valid API paths (like /api/slideshows/:id/images) too early.
// They are moved to the bottom of the file, just before startServer().

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
      { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
      // Admin-configurable limits (NULL means use subscription tier defaults)
      { name: 'max_products', type: 'INTEGER' },
      { name: 'max_audio_files', type: 'INTEGER' },
      { name: 'max_playlists', type: 'INTEGER' },
      { name: 'max_qr_codes', type: 'INTEGER' },
      { name: 'max_slideshows', type: 'INTEGER' },
      { name: 'max_videos', type: 'INTEGER' },
      { name: 'max_activation_codes', type: 'INTEGER' }
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
        price INTEGER,
        prices JSONB,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Ensure new price columns exist for older installations
    const productColumns = [
      { name: 'price', type: 'INTEGER' },
      { name: 'prices', type: 'JSONB' },
    ];

    for (const col of productColumns) {
      await client.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`);
    }

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS media (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        file_path TEXT,
        url TEXT NOT NULL,
        filename VARCHAR(255),
        file_type VARCHAR(50),
        content_type VARCHAR(100),
        filesize BIGINT,
        duration INTEGER,
        unique_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        requires_activation_code BOOLEAN DEFAULT false,
        is_public BOOLEAN DEFAULT false,
        instagram_url TEXT,
        twitter_url TEXT,
        facebook_url TEXT,
        youtube_url TEXT,
        website_url TEXT,
        product_link TEXT,
        product_link_title VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Ensure all required columns exist (for existing installations)
    await client.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS description TEXT;`);
    await client.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS requires_activation_code BOOLEAN DEFAULT false;`);
    await client.query(`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS playlist_media (
        id SERIAL PRIMARY KEY,
        playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
        media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
        display_order INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS slideshows (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        requires_activation_code BOOLEAN DEFAULT false,
        is_public BOOLEAN DEFAULT false,
        autoplay_interval INTEGER DEFAULT 5000,
        transition VARCHAR(50) DEFAULT 'fade',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS slideshow_images (
        id SERIAL PRIMARY KEY,
        slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        caption TEXT,
        display_order INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS activation_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(255) UNIQUE NOT NULL,
        playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
        slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE CASCADE,
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        max_uses INTEGER DEFAULT NULL,
        uses_count INTEGER DEFAULT 0,
        expires_at TIMESTAMPTZ DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_activation_codes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        activation_code_id INTEGER REFERENCES activation_codes(id) ON DELETE CASCADE,
        attached_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create QR codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS qr_codes (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        qr_code_data TEXT NOT NULL,
        short_url VARCHAR(255),
        description TEXT,
        options JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create QR scans table for analytics
    await client.query(`
      CREATE TABLE IF NOT EXISTS qr_scans (
        id SERIAL PRIMARY KEY,
        qr_code_id INTEGER REFERENCES qr_codes(id) ON DELETE CASCADE,
        scanned_at TIMESTAMPTZ DEFAULT NOW(),
        location VARCHAR(255),
        device VARCHAR(255),
        country_name VARCHAR(100),
        country_code VARCHAR(2),
        device_type VARCHAR(50),
        browser_name VARCHAR(100),
        operating_system VARCHAR(100),
        ip_address INET
      );
    `);

    await client.query(`
      ALTER TABLE slideshows
      ADD COLUMN IF NOT EXISTS audio_url TEXT;
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
    console.error('❌ Failed to start server:', error);
    console.error('❌ Error stack:', error.stack);
    process.exit(1);
  }
};

// Start the server (moved to bottom to ensure routes are registered)


// ---------- STRIPE WEBHOOK ----------
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      // If no webhook secret, parse the event directly (for testing)
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('📮 Received Stripe webhook event:', event.type);

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('💳 Payment completed for session:', session.id);
      
      try {
        // Get line items from the session
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
          expand: ['data.price.product'],
        });

        const userId = session.metadata?.userId;
        if (userId) {
          console.log('👤 Found user ID in session metadata:', userId);
          
          // Create purchase notification
          const notification = {
            id: `purchase_${session.id}_${Date.now()}`,
            customerId: session.customer || 'unknown',
            customerEmail: session.customer_details?.email || session.customer_email,
            customerName: session.customer_details?.name,
            customerPhone: session.customer_details?.phone, // <-- Add phone number
            products: lineItems.data.map(item => ({
              id: item.price.product.id,
              name: item.price.product.name,
              price: item.price.unit_amount,
              quantity: item.quantity,
            })),
            total: session.amount_total,
            timestamp: new Date().toISOString(),
            activationCodeShared: false,
          };

          // Store the notification in a simple in-memory store for demo
          // In production, you'd want to use a proper database
          console.log('🔔 Creating purchase notification:', notification);
          
          if (!global.purchaseNotifications) {
            global.purchaseNotifications = new Map();
          }
          
          if (!global.purchaseNotifications.has(userId)) {
            global.purchaseNotifications.set(userId, []);
          }
          
          global.purchaseNotifications.get(userId).unshift(notification);

          // Send push notification to the user
          const customerName = notification.customerEmail?.split('@')[0] || 'Customer';
          const pushTitle = '🛒 New Sale!';
          const pushBody = `${customerName} just purchased for $${(notification.total / 100).toFixed(2)}. Tap to share activation code!`;
          const pushData = {
            type: 'sale',
            notificationId: notification.id,
            customerId: notification.customerId,
            amount: notification.total,
            url: 'merchtechapp://purchase-notifications'
          };

          // Send push notification asynchronously
          sendPushNotification(userId, pushTitle, pushBody, pushData)
            .then(sent => {
              if (sent) {
                console.log('📱 Push notification sent for sale to user:', userId);
              } else {
                console.log('📱 Push notification not sent (disabled or no token) for user:', userId);
              }
            })
            .catch(error => {
              console.error('📱 Error sending push notification:', error);
            });
          
          // Keep only the last 50 notifications per user
          const userNotifications = global.purchaseNotifications.get(userId);
          if (userNotifications.length > 50) {
            global.purchaseNotifications.set(userId, userNotifications.slice(0, 50));
          }
        }
      } catch (error) {
        console.error('Error processing checkout completion:', error);
      }
      break;
    
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('💰 PaymentIntent was successful:', paymentIntent.id);
      break;
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// ---------- PUSH NOTIFICATION SYSTEM ----------
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

// Store for user push tokens (in production, use database)
if (!global.userPushTokens) {
  global.userPushTokens = new Map();
}

// Register push token
app.post('/api/notifications/register-token', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { pushToken, platform, deviceId } = req.body;

    if (!pushToken) {
      return res.status(400).json({ error: 'Push token is required' });
    }

    // Validate the push token
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error('Invalid Expo push token:', pushToken);
      return res.status(400).json({ error: 'Invalid push token format' });
    }

    // Store the token
    global.userPushTokens.set(userId, {
      pushToken,
      platform,
      deviceId,
      registeredAt: new Date().toISOString(),
    });

    console.log('📱 Push token registered for user:', userId);
    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    console.error('Error registering push token:', error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

// Update notification settings
app.put('/api/notifications/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const settings = req.body;

    // In production, store these settings in database
    if (!global.userNotificationSettings) {
      global.userNotificationSettings = new Map();
    }
    
    global.userNotificationSettings.set(userId, {
      ...settings,
      updatedAt: new Date().toISOString(),
    });

    console.log('🔔 Notification settings updated for user:', userId, settings);
    res.json({ success: true, message: 'Notification settings updated' });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// Get notification settings
app.get('/api/notifications/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    if (!global.userNotificationSettings || !global.userNotificationSettings.has(userId)) {
      // Return default settings
      return res.json({
        salesNotifications: true,
        orderNotifications: true,
        marketingNotifications: false,
      });
    }
    
    const settings = global.userNotificationSettings.get(userId);
    res.json(settings);
  } catch (error) {
    console.error('Error getting notification settings:', error);
    res.status(500).json({ error: 'Failed to get notification settings' });
  }
});

// Send push notification function
const sendPushNotification = async (userId, title, body, data = {}) => {
  try {
    // Check if user has push notifications enabled
    const userSettings = global.userNotificationSettings?.get(userId);
    if (!userSettings?.salesNotifications) {
      console.log('📱 Push notifications disabled for user:', userId);
      return false;
    }

    // Get user's push token
    const tokenData = global.userPushTokens?.get(userId);
    if (!tokenData?.pushToken) {
      console.log('📱 No push token found for user:', userId);
      return false;
    }

    const pushToken = tokenData.pushToken;

    // Validate token
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error('📱 Invalid push token for user:', userId);
      return false;
    }

    // Create the message
    const message = {
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      priority: 'high',
      _displayInForeground: true,
    };

    // Send the notification
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('📱 Error sending push notification chunk:', error);
      }
    }

    // Handle the tickets (check for errors)
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        console.error('📱 Push notification error:', ticket.message);
        if (ticket.details?.error === 'DeviceNotRegistered') {
          // Remove invalid token
          global.userPushTokens.delete(userId);
        }
      } else {
        console.log('📱 Push notification sent successfully:', ticket.id);
      }
    }

    return true;
  } catch (error) {
    console.error('📱 Error sending push notification:', error);
    return false;
  }
};

// ---------- PURCHASE NOTIFICATIONS API ----------
app.get('/api/notifications/purchases', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    if (!global.purchaseNotifications || !global.purchaseNotifications.has(userId)) {
      return res.json([]);
    }
    
    const notifications = global.purchaseNotifications.get(userId) || [];
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching purchase notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications/purchases/:id/mark-shared', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = req.params.id;
    
    if (!global.purchaseNotifications || !global.purchaseNotifications.has(userId)) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    const notifications = global.purchaseNotifications.get(userId);
    const notification = notifications.find(n => n.id === notificationId);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    notification.activationCodeShared = true;
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as shared:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

app.delete('/api/notifications/purchases', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    if (global.purchaseNotifications && global.purchaseNotifications.has(userId)) {
      global.purchaseNotifications.set(userId, []);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// ---------- CHECKOUT ROUTE ----------

// ---------- SLIDESHOW IMAGE ROUTES ----------
app.post('/api/slideshows/:id/images', authenticateToken, async (req, res) => {
  console.log('��️ ADD_IMAGE: Params', req.params, 'Body', req.body);
  try {
    const { id } = req.params;
    const { imageUrl, caption = '', displayOrder = 1 } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    // Verify ownership
    const ownerCheck = await pool.query('SELECT user_id FROM slideshows WHERE id = $1', [id]);
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this slideshow' });
    }

    // Insert image row
    await pool.query(
      `INSERT INTO slideshow_images (slideshow_id, image_url, caption, display_order)
       VALUES ($1, $2, $3, $4)`,
      [id, imageUrl, caption, displayOrder]
    );

    // Return fresh slideshow
    const fresh = await getSlideshowById(id);
    res.status(201).json({ slideshow: fresh });
  } catch (error) {
    console.error('🖼️ ADD_IMAGE: Error details', error);
    res.status(500).json({ error: 'Failed to add image' });
  }
});

app.delete('/api/slideshows/:id/images/:imageId', authenticateToken, async (req, res) => {
  console.log('🖼️ DELETE_IMAGE: Params', req.params);
  console.log('🖼️ DELETE_IMAGE: Auth user', req.user);
  try {
    const { id, imageId } = req.params;

    // Verify ownership via join
    const check = await pool.query(
      `SELECT s.user_id FROM slideshows s
       JOIN slideshow_images si ON si.slideshow_id = s.id
       WHERE si.id = $1 AND s.id = $2`,
      [imageId, id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    if (check.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await pool.query('DELETE FROM slideshow_images WHERE id = $1', [imageId]);
    const fresh = await getSlideshowById(id);
    res.json({ slideshow: fresh });
  } catch (error) {
    console.error('🖼️ DELETE_IMAGE: Error details', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// ---------- SLIDESHOW AUDIO ROUTE ----------
app.patch('/api/slideshows/:id/audio', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { audioUrl } = req.body;
    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl is required' });
    }

    // ownership check
    const check = await pool.query('SELECT user_id FROM slideshows WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    if (check.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await pool.query('UPDATE slideshows SET audio_url = $1, updated_at = NOW() WHERE id = $2', [audioUrl, id]);
    const fresh = await getSlideshowById(id);
    res.json({ slideshow: fresh });
  } catch (error) {
    console.error('Error updating slideshow audio:', error);
    res.status(500).json({ error: 'Failed to update audio' });
  }
});

// Helper to fetch slideshow with images in camelCase mapping
async function getSlideshowById(slideshowId) {
  const sRes = await pool.query('SELECT * FROM slideshows WHERE id = $1', [slideshowId]);
  if (sRes.rows.length === 0) return null;
  const slideshow = sRes.rows[0];
  const imagesResult = await pool.query(
    'SELECT * FROM slideshow_images WHERE slideshow_id = $1 ORDER BY display_order',
    [slideshowId]
  );
  return {
    id: slideshow.id,
    userId: slideshow.user_id,
    name: slideshow.name,
    description: slideshow.description,
    autoplayInterval: slideshow.autoplay_interval,
    transition: slideshow.transition,
    requiresActivationCode: slideshow.requires_activation_code,
    audioUrl: slideshow.audio_url,
    isPublic: slideshow.is_public,
    createdAt: slideshow.created_at,
    updatedAt: slideshow.updated_at,
    uniqueId: `slideshow-${slideshow.id}`,
    images: imagesResult.rows.map(img => ({
      id: img.id,
      slideshowId: img.slideshow_id,
      imageUrl: img.image_url,
      caption: img.caption,
      displayOrder: img.display_order,
      createdAt: img.created_at,
    }))
  };
}

// ---------- SLIDESHOW PRODUCT LINKS API ----------
// Slideshow product links (moved before startServer)
app.get('/api/slideshows/:slideshowId/product-links', async (req, res) => {
  console.log('🔗 [GET] slideshow product links', req.params);
  try {
    const { slideshowId } = req.params;
    const result = await pool.query(
      `SELECT pl.*, p.name AS product_name, p.description AS product_description, p.images AS product_images, p.price AS product_price
       FROM product_links pl
       LEFT JOIN products p ON pl.product_id = p.id
       WHERE pl.slideshow_id = $1
       ORDER BY pl.display_order`,
      [slideshowId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('🔗 GET slideshow product links error', err);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/slideshows/:slideshowId/product-links', authenticateToken, async (req, res) => {
  console.log('🔗 [POST] slideshow product link', req.params, req.body);
  try {
    const { slideshowId } = req.params;
    const { productId } = req.body;

    // Check slideshow ownership
    const owner = await pool.query('SELECT user_id FROM slideshows WHERE id = $1', [slideshowId]);
    if (owner.rows.length === 0) return res.status(404).json({ error: 'Slideshow not found' });
    if (owner.rows[0].user_id !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

    // Get product information to populate required fields
    const product = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (product.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    
    const productData = product.rows[0];
    const productUrl = `${getApiBaseUrl(req).replace('/api', '')}/store/product/${productId}`;

    const ins = await pool.query(
      `INSERT INTO product_links (slideshow_id, product_id, title, url, description, image_url, display_order, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (slideshow_id, product_id) DO NOTHING RETURNING *`,
      [slideshowId, productId, productData.name, productUrl, productData.description, productData.image_url, 0, true]
    );

    res.status(201).json(ins.rows[0] || {});
  } catch (err) {
    console.error('🔗 POST slideshow product link error', err);
    res.status(500).json({ error: 'Failed' });
  }
});

app.delete('/api/slideshows/:slideshowId/product-links/:productId', authenticateToken, async (req, res) => {
  console.log('🔗 [DELETE] slideshow product link', req.params);
  try {
    const { slideshowId, productId } = req.params;

    const owner = await pool.query('SELECT user_id FROM slideshows WHERE id = $1', [slideshowId]);
    if (owner.rows.length === 0) return res.status(404).json({ error: 'Slideshow not found' });
    if (owner.rows[0].user_id !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

    await pool.query('DELETE FROM product_links WHERE slideshow_id = $1 AND product_id = $2', [slideshowId, productId]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('🔗 DELETE slideshow product link error', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// ---------- START SERVER ----------
startServer();

// ---------- ERROR HANDLERS (keep these LAST) ----------
app.use((req, res, next) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error('🔴 Unhandled Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

