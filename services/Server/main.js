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

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
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

app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ imageUrl: fileUrl });
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
      properUrl = `${process.env.API_BASE_URL || 'http://192.168.1.70:5001'}/api/media/${id}/stream`;
    } else if (media.filename) {
      // If we have a filename, construct the proper URL
              properUrl = `${process.env.API_BASE_URL || 'http://192.168.1.70:5001'}/uploads/${media.filename}`;
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
    
    // Parse the data URL
    const dataUrlMatch = media.url.match(/^data:([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      return res.status(400).json({ error: 'Invalid base64 data format' });
    }
    
    const [, mimeType, base64Data] = dataUrlMatch;
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
    const completePlaylist = await getPlaylistWithMedia(playlist.id);
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
        return await getPlaylistWithMedia(playlist.id);
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
    const playlist = await getPlaylistWithMedia(id);
    
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

    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to update this playlist' });
    }

    const result = await pool.query(
      `UPDATE playlists 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           requires_activation_code = COALESCE($3, requires_activation_code), 
           is_public = COALESCE($4, is_public),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, description, requiresActivationCode, isPublic, id]
    );

    const updatedPlaylist = await getPlaylistWithMedia(id);
    res.json({ playlist: updatedPlaylist });
  } catch (error) {
    console.error('Error updating playlist:', error);
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

// Helper function to get playlist with media files
async function getPlaylistWithMedia(playlistId) {
  const playlistResult = await pool.query(
    `SELECT p.*, u.username 
     FROM playlists p 
     JOIN users u ON p.user_id = u.id 
     WHERE p.id = $1`,
    [playlistId]
  );

  if (playlistResult.rows.length === 0) {
    return null;
  }

  const playlist = playlistResult.rows[0];

  // Get media files for this playlist
  const mediaResult = await pool.query(
    `SELECT m.*, pm.display_order 
     FROM media m 
     JOIN playlist_media pm ON m.id = pm.media_id 
     WHERE pm.playlist_id = $1 
     ORDER BY pm.display_order`,
    [playlistId]
  );

  playlist.mediaFiles = mediaResult.rows.map(media => ({
    id: media.id,
    title: media.title,
    filePath: `/uploads/${media.filename}`,
    fileType: media.file_type,
    contentType: media.content_type,
    url: `${process.env.API_BASE_URL || 'http://localhost:5001'}/uploads/${media.filename}`,
  }));

  return playlist;
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
              'playlist' as content_type
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

startServer();
