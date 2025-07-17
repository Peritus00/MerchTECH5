// Load .env from project root regardless of where the script is run from
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const s3Service = require('./s3Service');
const brevo = require('@getbrevo/brevo');
const axios = require('axios');

console.log('DEBUG: Server script starting...');
console.log('DEBUG: .env loaded, DATABASE_URL:', process.env.DATABASE_URL ? 'configured' : 'missing');
console.log('DEBUG: NODE_ENV:', process.env.NODE_ENV);

const app = express();
const PORT = process.env.PORT || 5001;

// --- MIDDLEWARE ---
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- STATIC FILE SERVING ---
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));
const distDir = path.join(__dirname, '../../dist');
app.use(express.static(distDir));

const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    const requestId = `req_${Date.now()}`;
    console.log(`🔍 FILE_FILTER [${requestId}]: Checking file:`, {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
    });

    const allowedTypes = /jpeg|jpg|png|gif|webp|mp3|wav|m4a|aac|ogg|mp4|webm|avi|mov|wmv|flv|mkv|quicktime/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || 
                    file.mimetype.startsWith('audio/') || 
                    file.mimetype.startsWith('image/') ||
                    file.mimetype.startsWith('video/');
    
    if (extname || mimetype) {
      console.log(`✅ FILE_FILTER [${requestId}]: File accepted`);
      cb(null, true);
    } else {
      const filterError = new Error('File type not allowed. Only images, audio, and video are supported.');
      filterError.code = 'FILE_TYPE_NOT_ALLOWED';
      console.log(`❌ FILE_FILTER [${requestId}]: File rejected. Type not allowed: ${file.mimetype}`);
      cb(filterError, false);
    }
  }
});

// --- CONFIGURATION ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 20000,
  max: 10
});
const JWT_SECRET = process.env.JWT_SECRET || 'your-fallback-secret-key';
const SALT_ROUNDS = 10;

// --- S3 Service Setup ---
try {
  if (process.env.AWS_ACCESS_KEY_ID) {
    console.log('AWS Access Key Suffix:', process.env.AWS_ACCESS_KEY_ID.slice(-4));
  }
  if (process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('AWS Secret Key Suffix:', process.env.AWS_SECRET_ACCESS_KEY.slice(-4));
  }
  console.log('✅ S3 service loaded and instantiated successfully');
  console.log('   AWS Region:', process.env.AWS_REGION);
  console.log('   S3 Bucket:', process.env.AWS_S3_BUCKET_NAME);
  console.log('   AWS Access Key:', process.env.AWS_ACCESS_KEY_ID ? 'Configured' : 'Missing');
} catch (error) {
  console.error('❌ S3 service initialization failed:', error);
}

// Initialize Stripe only if the secret key is available
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn('⚠️ STRIPE_SECRET_KEY not found - Stripe functionality will be disabled');
}

// --- Brevo Email Transporter ---
const createTransporter = () => {
    const emailAPI = new brevo.TransactionalEmailsApi();
    // Set authentication for the API
    emailAPI.authentications.apiKey.apiKey = process.env.BREVO_API_KEY;
    return emailAPI;
};
const transporter = createTransporter();

// --- MIDDLEWARE ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const allowedOrigins = [
  'https://app.merchtech.net',
  'http://localhost:8081',
  'http://localhost:19006',
  'https://merchtech.app',
  'exp://192.168.1.70:8081',
  // Add production frontend URLs
  'https://merchtech5-production.up.railway.app',
  'https://merchtech.net',
  'https://www.merchtech.net',
  // Add Vercel deployment URLs (common patterns)
  'https://merchtechapp5.vercel.app',
  'https://merchtech-app.vercel.app',
  // Add any custom domain that might be configured
  process.env.FRONTEND_URL,
  process.env.EXPO_PUBLIC_FRONTEND_URL
].filter(Boolean); // Remove any undefined values

app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Add a separate, more detailed CORS error logger to help debug future issues
app.use((req, res, next) => {
  console.log('🔗 CORS: Request from origin:', req.headers.origin);
  next();
});

app.use('/uploads', express.static(uploadsDir));

// Handle domain redirects for legacy URLs
app.use((req, res, next) => {
  const host = req.get('host');
  if (host === 'merchtechapp5-production.up.railway.app') {
    console.log(`🔀 REDIRECT: Redirecting from ${host} to merchtech5-production.up.railway.app`);
    return res.redirect(301, `https://merchtech5-production.up.railway.app${req.originalUrl}`);
  }
  next();
});

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

app.get('/api/health', (req, res) => {
    try {
        const healthData = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            services: {
                database: !!process.env.DATABASE_URL,
                brevo: !!process.env.BREVO_API_KEY
            }
        };
        
        // Safely check S3 service
        try {
            healthData.services.s3 = s3Service && s3Service.isConfigured ? s3Service.isConfigured() : false;
        } catch (error) {
            console.error('Health check S3 error:', error);
            healthData.services.s3 = false;
        }
        
        res.status(200).json(healthData);
    } catch (error) {
        console.error('Health check error:', error);
        // Always return 200 for Railway health checks, even if there are issues
        res.status(200).json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            error: error.message
        });
    }
});

// Backup health endpoint that's super simple
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
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

// Analytics summary endpoint
app.get('/api/analytics/summary', authenticateToken, async (req, res) => {
  try {
    console.log('📊 ANALYTICS: Fetching summary for user:', req.user.userId);
    
    // Get counts of user's content
    const [
      playlistsResult,
      slideshowsResult,
      qrCodesResult,
      activationCodesResult,
      productsResult
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM playlists WHERE user_id = $1', [req.user.userId]),
      pool.query('SELECT COUNT(*) FROM slideshows WHERE user_id = $1', [req.user.userId]),
      pool.query('SELECT COUNT(*) FROM qr_codes WHERE user_id = $1', [req.user.userId]),
      pool.query('SELECT COUNT(*) FROM activation_codes WHERE created_by = $1', [req.user.userId]),
      pool.query('SELECT COUNT(*) FROM products WHERE user_id = $1 AND is_deleted = false', [req.user.userId])
    ]);
    
    const summary = {
      playlists: parseInt(playlistsResult.rows[0].count),
      slideshows: parseInt(slideshowsResult.rows[0].count),
      qrCodes: parseInt(qrCodesResult.rows[0].count),
      activationCodes: parseInt(activationCodesResult.rows[0].count),
      products: parseInt(productsResult.rows[0].count)
    };
    
    console.log('📊 ANALYTICS: Summary data:', summary);
    res.json(summary);
    
  } catch (error) {
    console.error('📊 ANALYTICS: Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
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
      return { 
        ...p, 
        price: p.price ? p.price / 100 : 0, // Convert cents to dollars
        prices: pricesArr 
      };
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
      return { 
        ...p, 
        price: p.price ? p.price / 100 : 0, // Convert cents to dollars
        prices: pricesArr 
      };
    });
    res.json({ products: productsWithPrices });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single product by ID
app.get('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 GET_PRODUCT: Fetching product with ID:', id);

    const result = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND is_deleted = false',
      [id]
    );

    if (result.rows.length === 0) {
      console.log('❌ GET_PRODUCT: Product not found with ID:', id);
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];
    console.log('✅ GET_PRODUCT: Found product:', product.name);
    
    // Format prices array
    let pricesArr = product.prices;
    if (!pricesArr || !pricesArr.length) {
      const amount = product.price || (product.metadata && (product.metadata.price || product.metadata.unit_amount)) || 0;
      pricesArr = [{ id: 'default', unit_amount: amount, currency: 'usd' }];
    }

    const productWithPrices = { 
      ...product, 
      price: product.price ? product.price / 100 : 0, // Convert cents to dollars
      prices: pricesArr,
      in_stock: product.in_stock !== false // Ensure boolean
    };
    
    res.json({ product: productWithPrices });
  } catch (error) {
    console.error('🔴 GET_PRODUCT: Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
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

    // Convert price to cents for database storage if provided
    const priceInCents = price !== undefined ? Math.round(parseFloat(price) * 100) : undefined;
    if (price !== undefined) {
      console.log('🟠 Price conversion:', price, '→', priceInCents, 'cents');
    }

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
      [name, description, inStock, formattedMetadata, isSuspended, images, priceInCents, formattedPrices, category, id]
    );
    console.log('✅ UPDATE query completed');

    // Note: prices update would normally involve stripe API; omitted for brevity.

    const updated = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    console.log('✅ Updated product:', updated.rows[0]);
    
    // Convert price back to dollars for frontend
    const updatedProduct = updated.rows[0];
    if (updatedProduct.price) {
      updatedProduct.price = updatedProduct.price / 100;
    }
    
    res.json({ product: updatedProduct });
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

    // Convert price to cents for database storage
    const priceInCents = Math.round(parseFloat(price) * 100);
    console.log('🟠 Price conversion:', price, '→', priceInCents, 'cents');

    console.log('🟠 Executing INSERT query...');
    const result = await pool.query(
      `INSERT INTO products (user_id, name, description, images, metadata, in_stock, price, prices, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
      [userId, name, description, images, formattedMetadata, inStock, priceInCents, formattedPrices, category]
    );
    console.log('✅ INSERT completed, result:', result.rows[0]);

    const newProduct = result.rows[0];

    // Convert price back to dollars for frontend
    newProduct.price = newProduct.price / 100;

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

app.post('/api/upload', authenticateToken, (req, res, next) => {
    const requestId = `req_${Date.now()}`;
    console.log(`📤 UPLOAD [${requestId}]: Starting upload request for user ${req.user?.userId}`);
    
    // Use multer middleware with proper error handling
    upload.single('image')(req, res, async (err) => {
        if (err) {
            console.error(`❌ MULTER_ERROR [${requestId}]:`, err);
            
            if (err.code === 'FILE_TYPE_NOT_ALLOWED') {
                return res.status(400).json({ 
                    error: 'File type not allowed. Only images, audio, and video are supported.',
                    code: 'FILE_TYPE_NOT_ALLOWED'
                });
            }
            
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    error: 'File too large. Maximum size is 500MB.',
                    code: 'FILE_TOO_LARGE'
                });
            }
            
            return res.status(400).json({ 
                error: 'File upload error.', 
                message: err.message,
                code: err.code || 'UPLOAD_ERROR'
            });
        }
        
        if (!req.file) {
            console.error(`❌ UPLOAD_ERROR [${requestId}]: No file uploaded.`);
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        if (!s3Service.isConfigured()) {
            console.error(`❌ UPLOAD_ERROR [${requestId}]: S3 service is not configured.`);
            return res.status(500).json({ error: 'File upload service is not available.' });
        }

        try {
            console.log(`📤 UPLOAD [${requestId}]: Uploading to S3...`);
            console.log(`📤 UPLOAD [${requestId}]: File info:`, {
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                hasBuffer: !!req.file.buffer,
                bufferLength: req.file.buffer ? req.file.buffer.length : 'undefined'
            });
            
            // Generate a unique key for the file
            const key = `users/${req.user.userId}/media/${Date.now()}-${req.file.originalname}`;
            
            const result = await s3Service.uploadFile(req.file.buffer, key, req.file.mimetype);
            
            const proxyUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/images/s3/${result.Key}`;
            
            console.log(`✅ UPLOAD_SUCCESS [${requestId}]: S3 URL: ${result.Location}`);
            console.log(`✅ UPLOAD_SUCCESS [${requestId}]: Proxy URL: ${proxyUrl}`);

            res.status(200).json({
                message: 'File uploaded successfully',
                url: result.Location, // Direct S3 URL
                proxy_url: proxyUrl,   // URL proxied through our server
                key: result.Key,
                imageUrl: proxyUrl    // Legacy field for backward compatibility
            });

        } catch (error) {
            console.error(`❌ UPLOAD_ERROR [${requestId}]:`, error);
            res.status(500).json({ 
                error: 'Failed to upload file.', 
                message: error.message 
            });
        }
    });
});

// --- Image Proxy Endpoint ---
app.get('/api/images/s3/*', async (req, res) => {
    const key = req.params[0];
    if (!key) {
        return res.status(400).send('Invalid image key');
    }
    
    console.log(`🔗 IMAGE_PROXY: Requested key: "${key}"`);
    
    try {
        let s3Key = key;
        
        // Handle legacy URL structure: if key doesn't start with "users/", 
        // try to convert it to the new structure
        if (!key.startsWith('users/')) {
            // Legacy format: "1/filename" -> "users/1/media/filename"
            const keyParts = key.split('/');
            if (keyParts.length >= 2) {
                const userId = keyParts[0];
                const filename = keyParts.slice(1).join('/');
                s3Key = `users/${userId}/media/${filename}`;
                console.log(`🔗 IMAGE_PROXY: Converted legacy key "${key}" to "${s3Key}"`);
            }
        }
        
        const { stream, metadata } = await s3Service.getStream(s3Key);
        
        console.log(`🔍 IMAGE_PROXY: S3 metadata for "${s3Key}":`, metadata);
        
        // Ensure we have a proper image content type
        let contentType = metadata.ContentType;
        if (!contentType || contentType === 'text/plain') {
          // Try to determine content type from file extension
          const ext = s3Key.toLowerCase().split('.').pop();
          switch (ext) {
            case 'jpg':
            case 'jpeg':
              contentType = 'image/jpeg';
              break;
            case 'png':
              contentType = 'image/png';
              break;
            case 'gif':
              contentType = 'image/gif';
              break;
            case 'webp':
              contentType = 'image/webp';
              break;
            default:
              contentType = 'application/octet-stream';
          }
          console.log(`🔧 IMAGE_PROXY: Corrected content type from "${metadata.ContentType}" to "${contentType}"`);
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', metadata.ContentLength);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        stream.pipe(res);
        
        console.log(`✅ IMAGE_PROXY: Successfully streamed "${s3Key}" with content type "${contentType}"`);
        
    } catch (error) {
        console.error(`🔴 IMAGE_PROXY_ERROR: Failed to stream image for key "${key}":`, error);
        
        // If the converted key failed, try the original key as fallback
        if (!key.startsWith('users/')) {
            try {
                console.log(`🔗 IMAGE_PROXY: Trying original key as fallback: "${key}"`);
                const { stream, metadata } = await s3Service.getStream(key);
                res.setHeader('Content-Type', metadata.ContentType);
                res.setHeader('Content-Length', metadata.ContentLength);
                res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
                stream.pipe(res);
                console.log(`✅ IMAGE_PROXY: Successfully streamed original key "${key}"`);
                return;
            } catch (fallbackError) {
                console.error(`🔴 IMAGE_PROXY_ERROR: Fallback also failed for key "${key}":`, fallbackError);
            }
        }
        
        // Return a placeholder image for missing files
        console.log(`🔴 IMAGE_PROXY: Image not found, returning placeholder`);
        res.redirect(302, 'https://placehold.co/600x600/e5e7eb/6b7280?text=Image+Not+Found');
    }
});

// --- Local Image Endpoint ---
app.get('/api/images/local/:filename', async (req, res) => {
    const filename = req.params.filename;
    if (!filename) {
        return res.status(400).send('Invalid filename');
    }
    
    console.log(`🖼️ LOCAL_IMAGE: Requested filename: "${filename}"`);
    
    try {
        const filePath = path.join(__dirname, 'uploads', filename);
        
        if (!fs.existsSync(filePath)) {
            console.log(`🔴 LOCAL_IMAGE: File not found: ${filePath}`);
            return res.status(404).send('Image not found');
        }
        
        // Get file stats for content length
        const stats = fs.statSync(filePath);
        
        // Determine content type based on file extension
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        
        switch (ext) {
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.gif':
                contentType = 'image/gif';
                break;
            case '.webp':
                contentType = 'image/webp';
                break;
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        console.log(`✅ LOCAL_IMAGE: Successfully streamed "${filename}"`);
        
    } catch (error) {
        console.error(`🔴 LOCAL_IMAGE_ERROR: Failed to stream image "${filename}":`, error);
        res.status(500).send('Failed to stream image');
    }
});

// ---------- MEDIA ROUTES ----------
app.post('/api/media', authenticateToken, async (req, res) => {
  try {
    const { title, filePath, url, filename, fileType, contentType, filesize, duration, uniqueId, s3_key } = req.body;
    
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
      `INSERT INTO media (user_id, title, file_path, url, filename, file_type, content_type, filesize, duration, unique_id, s3_key) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
       RETURNING *`,
      [req.user.userId, title, filePath || url, url, filename, fileType, contentType, filesize, duration, uniqueId, s3_key]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

app.get('/api/media', authenticateToken, async (req, res) => {
  try {
    console.log('🔴 MEDIA: Fetching media files for user:', req.user.userId);
    
    // Get admin user ID (djjetfuel@gmail.com)
    const adminResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', ['djjetfuel@gmail.com']);
    const adminUserId = adminResult.rows.length > 0 ? adminResult.rows[0].id : null;
    
    console.log('🔴 MEDIA: Admin user ID:', adminUserId);
    
    // Always return user's own files + admin files (if admin exists)
    let query = 'SELECT * FROM media WHERE user_id = $1';
    let params = [req.user.userId];
    
    if (adminUserId && adminUserId !== req.user.userId) {
      // If admin exists and user is not the admin, also include admin's files
      query += ' OR user_id = $2';
      params.push(adminUserId);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    
    console.log('🔴 MEDIA: Found', result.rows.length, 'media files for user');
    
    // Process media files to handle S3 URLs properly
    const processedMedia = await Promise.all(result.rows.map(async (media) => {
      let properUrl = media.url;
      
      // Handle S3 files - use streaming endpoint for consistency
      if (media.s3_key && s3Service) {
        // Use streaming endpoint for S3 files to ensure consistent playback
        properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/media/${media.id}/stream`;
      } else if (media.url && media.url.startsWith('data:')) {
        // Handle base64 files - use streaming endpoint
        properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/media/${media.id}/stream`;
      } else if (media.filename && !media.s3_key) {
        // Handle local files
        properUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/uploads/${media.filename}`;
      }
      
      return {
        ...media,
        url: properUrl,
        title: media.title,
        fileType: media.file_type,
        contentType: media.content_type,
        type: media.file_type // Add this field for MediaPlayer component
      };
    }));
    
    res.json({ media: processedMedia });
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.get('/api/media/all', authenticateToken, async (req, res) => {
  try {
    console.log('🔴 MEDIA_ALL: Fetching all media files for user:', req.user.userId);
    
    // Get admin user ID (djjetfuel@gmail.com)
    const adminResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', ['djjetfuel@gmail.com']);
    const adminUserId = adminResult.rows.length > 0 ? adminResult.rows[0].id : null;
    
    console.log('🔴 MEDIA_ALL: Admin user ID:', adminUserId);
    
    // Always return user's own files + admin files (if admin exists)
    let query = 'SELECT * FROM media WHERE user_id = $1';
    let params = [req.user.userId];
    
    if (adminUserId && adminUserId !== req.user.userId) {
      // If admin exists and user is not the admin, also include admin's files
      query += ' OR user_id = $2';
      params.push(adminUserId);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    
    console.log('🔴 MEDIA_ALL: Found', result.rows.length, 'media files for user');
    
    res.json({ media: result.rows });
  } catch (error) {
    console.error('Error fetching all media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

app.get('/api/media/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    const media = result.rows[0];
    
    // Check if user owns this media file or if it's from admin
    const adminResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', ['djjetfuel@gmail.com']);
    const adminUserId = adminResult.rows.length > 0 ? adminResult.rows[0].id : null;
    
    // Allow access if: user owns the file OR file is from admin OR user is admin
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    const isAdmin = userResult.rows[0]?.is_admin;
    
    if (media.user_id !== req.user.userId && media.user_id !== adminUserId && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You can only access your own media files' });
    }
    
    // Create a proper HTTP URL for the audio file
    const baseUrl = process.env.API_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN 
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
      : 'https://merchtech5-production.up.railway.app';
    
    let properUrl = media.url;
    if (media.url && media.url.startsWith('data:')) {
      // If it's base64 data, serve it through our audio streaming endpoint
      properUrl = `${baseUrl}/api/media/${id}/stream`;
    } else if (media.filename) {
      // If we have a filename, construct the proper URL
      properUrl = `${baseUrl}/uploads/${media.filename}`;
    }
    
    // Return media with the proper URL structure expected by the frontend
    const mediaResponse = {
      ...media,
      url: properUrl,
      title: media.title,
      fileType: media.file_type,
      contentType: media.content_type,
      type: media.file_type // Add type property for MediaPlayer compatibility
    };
    
    res.json({ media: mediaResponse });
  } catch (error) {
    console.error('Error fetching media by ID:', error);
    res.status(500).json({ error: 'Failed to fetch media file' });
  }
});

// Stream media file (supports both base64 data and S3 files) - PUBLIC endpoint for browser media compatibility
app.get('/api/media/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📺 MEDIA_STREAM: Public streaming request for media ${id}`);
    
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      console.log(`📺 MEDIA_STREAM: Media ${id} not found`);
      return res.status(404).json({ error: 'Media file not found' });
    }
    
    const media = result.rows[0];
    
    // Get admin user ID for access control
    const adminResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', ['djjetfuel@gmail.com']);
    const adminUserId = adminResult.rows.length > 0 ? adminResult.rows[0].id : null;
    
    // Optional authentication - check for token if present
    let requestingUser = null;
    let isAdmin = false;
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      try {
        const user = jwt.verify(token, JWT_SECRET);
        requestingUser = user;
        
        // Check if authenticated user is admin
        const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [user.userId]);
        isAdmin = userResult.rows[0]?.is_admin || false;
        
        console.log(`📺 MEDIA_STREAM: Authenticated user ${user.userId} (admin: ${isAdmin})`);
      } catch (error) {
        console.log(`📺 MEDIA_STREAM: Invalid token provided, continuing as public access`);
      }
    }
    
    // Security model for public streaming:
    // 1. All media files are publicly accessible for streaming (browsers need this)
    // 2. Optional authentication for enhanced features or logging
    // 3. Admin users get full access and logging
    
    const isAdminFile = media.user_id === adminUserId;
    const isOwnFile = requestingUser && media.user_id === requestingUser.userId;
    
    console.log(`📺 MEDIA_STREAM: Access control check:`, {
      mediaId: id,
      mediaUserId: media.user_id,
      adminUserId,
      isAdminFile,
      hasAuth: !!requestingUser,
      isOwnFile,
      isAdmin
    });
    
    // Allow public access to all media files for streaming compatibility
    // Deployment timestamp: 2025-07-16T03:52:00Z
    console.log(`📺 MEDIA_STREAM: Public access granted for media ${id}`);
    
    
    // Set CORS headers for media streaming
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    
    // Handle S3 files
    let s3Key = media.s3_key;
    
    // If s3_key is null but we have an S3 URL, extract the key from the URL
    if (!s3Key && media.url && media.url.includes('merchtechbucket.s3.')) {
      const urlMatch = media.url.match(/merchtechbucket\.s3\.[^/]+\/(.+)$/);
      if (urlMatch) {
        s3Key = urlMatch[1];
        console.log(`📺 MEDIA_STREAM: Extracted S3 key from URL for media ${id}: ${s3Key}`);
      }
    }
    
    if (s3Key && s3Service) {
      try {
        console.log(`📺 MEDIA_STREAM: Streaming S3 file for media ${id}: ${s3Key}`);
        
        // Get file metadata from S3
        const metadata = await s3Service.getMetadata(s3Key);
        const fileSize = metadata.ContentLength;
        const contentType = metadata.ContentType || media.content_type || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        const range = req.headers.range;
        
        if (range) {
          // Handle range requests for video/audio streaming
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;
          
          console.log(`📺 MEDIA_STREAM: Range request for ${s3Key}: bytes=${start}-${end}`);
          
          // Ensure range is valid
          if (start >= fileSize || end >= fileSize) {
            return res.status(416).send('Requested range not satisfiable');
          }
          
          const { stream } = await s3Service.getStream(s3Key, { start, end });
          
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': chunksize,
          });
          
          stream.pipe(res);
        } else {
          // Full file request
          console.log(`📺 MEDIA_STREAM: Full file request for ${s3Key}`);
          res.setHeader('Content-Length', fileSize);
          const { stream } = await s3Service.getStream(s3Key);
          stream.pipe(res);
        }
        
        return;
      } catch (error) {
        console.error(`❌ MEDIA_STREAM: Failed to stream S3 file ${s3Key}:`, error);
        return res.status(500).json({ error: 'Failed to stream S3 file' });
      }
    }
    
    // Handle base64 data files
    if (media.url && media.url.startsWith('data:')) {
      console.log(`📺 MEDIA_STREAM: Streaming base64 data for media ${id}`);
      
      // Parse the data URL
      const dataUrlMatch = media.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!dataUrlMatch) {
        return res.status(400).json({ error: 'Invalid base64 data format' });
      }
      
      const [, mimeType, base64Data] = dataUrlMatch;
      const audioBuffer = Buffer.from(base64Data, 'base64');
      
      // Set appropriate headers for media streaming
      res.setHeader('Content-Type', mimeType || 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      // Send the media data
      res.send(audioBuffer);
      return;
    }
    
    // Handle local files (fallback)
    if (media.filename) {
      console.log(`📺 MEDIA_STREAM: Attempting to stream local file for media ${id}: ${media.filename}`);
      const filePath = path.join(__dirname, 'uploads', media.filename);
      
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const contentType = media.content_type || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        return;
      }
    }
    
    // No valid streaming source found
    return res.status(400).json({ error: 'No streamable media source found' });
    
  } catch (error) {
    console.error('❌ MEDIA_STREAM: Error streaming media:', error);
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
    console.error('🌐 WEB: Error in playlist-access route:', error);
    console.error('🌐 WEB: Error stack:', error.stack);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Server Error - MerchTech</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f3f4f6; }
          .error { color: #dc2626; font-size: 1.5rem; margin-bottom: 1rem; }
          .message { color: #6b7280; }
        </style>
      </head>
      <body>
        <h1 class="error">🔥 Server Error</h1>
        <p class="message">Something went wrong while loading the playlist.</p>
      </body>
      </html>
    `);
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

    const updatedPlaylist = await getPlaylistWithMedia(id);
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

// Helper function to get playlist with media files
async function getPlaylistWithMedia(playlistId) {
  console.log('🔴 GET_PLAYLIST: Fetching playlist:', playlistId);
  console.log('🔴 GET_PLAYLIST: playlistId type:', typeof playlistId);

  const playlistResult = await pool.query(
    `SELECT p.*, u.username 
     FROM playlists p 
     JOIN users u ON p.user_id = u.id 
     WHERE p.id = $1`,
    [playlistId]
  );

  console.log('🔴 GET_PLAYLIST: Query result rows:', playlistResult.rows.length);
  if (playlistResult.rows.length > 0) {
    console.log('🔴 GET_PLAYLIST: Found playlist:', playlistResult.rows[0].name);
  }

  if (playlistResult.rows.length === 0) {
    console.log('🔴 GET_PLAYLIST: No playlist found, returning null');
    return null;
  }

  const playlistData = playlistResult.rows[0];
  const mediaResult = await pool.query(
    `SELECT m.*, pm.display_order 
     FROM media m 
     JOIN playlist_media pm ON m.id = pm.media_id 
     WHERE pm.playlist_id = $1 
     ORDER BY pm.display_order`,
    [playlistId]
  );

  console.log('🔴 GET_PLAYLIST: Media query result:', mediaResult.rows.length, 'media files found');
  if (mediaResult.rows.length === 0) {
    console.log('🔴 GET_PLAYLIST: No media files found for playlist', playlistId);
    // Let's check if media files exist but aren't linked
    const allMediaResult = await pool.query('SELECT COUNT(*) FROM media');
    console.log('🔴 GET_PLAYLIST: Total media files in database:', allMediaResult.rows[0].count);
    
    const playlistMediaResult = await pool.query('SELECT COUNT(*) FROM playlist_media WHERE playlist_id = $1', [playlistId]);
    console.log('🔴 GET_PLAYLIST: Playlist-media links for playlist', playlistId, ':', playlistMediaResult.rows[0].count);
  }

  const mediaFiles = await Promise.all(mediaResult.rows.map(async (media) => {
    let signedUrl = null;
    if (media.s3_key) {
      try {
        signedUrl = await s3Service.getSignedUrl(media.s3_key);
      } catch (error) {
        console.error(`Failed to get signed URL for key ${media.s3_key}:`, error);
        // signedUrl remains null
      }
    } else {
      console.warn(`Media file with ID ${media.id} is missing an s3_key. It will not be playable.`);
    }

    return {
    id: media.id,
    userId: media.user_id,
    title: media.title,
    description: media.description,
    filename: media.filename,
    filePath: `/uploads/${media.filename}`,
    fileType: media.file_type,
    contentType: media.content_type,
    displayOrder: media.display_order,
    createdAt: media.created_at,
    updatedAt: media.updated_at,
    type: media.file_type,
      url: signedUrl, // Will be null if s3_key is missing or signing fails
    };
  }));

  // Get product links for this playlist
  let productLinks = [];
  try {
    const productLinksResult = await pool.query(`
      SELECT pl.*, p.name as product_name, p.price, p.images as product_images
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.playlist_id = $1 AND pl.is_active = true
      ORDER BY pl.display_order, pl.created_at
    `, [playlistId]);

    // Format product links for frontend
    productLinks = productLinksResult.rows.map(link => ({
      id: link.product_id.toString(), // Use product_id, not link.id
      linkId: link.id.toString(), // Keep link ID for reference
      title: link.title,
      url: link.url,
      description: link.description,
      imageUrl: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url,
      images: link.product_images || (link.image_url ? [link.image_url] : []),
      displayOrder: link.display_order,
      isActive: link.is_active,
      price: link.price ? `$${(link.price / 100).toFixed(2)}` : null,
      productName: link.product_name
    }));

    console.log('🔴 GET_PLAYLIST: Found', productLinks.length, 'product links');
  } catch (error) {
    console.error('🔴 GET_PLAYLIST: Error fetching product links:', error);
    productLinks = [];
  }

  const finalPlaylist = {
    id: playlistData.id,
    userId: playlistData.user_id,
    name: playlistData.name,
    description: playlistData.description,
    username: playlistData.username,
    requiresActivationCode: playlistData.requires_activation_code,
    isPublic: playlistData.is_public,
    createdAt: playlistData.created_at,
    updatedAt: playlistData.updated_at,
    mediaFiles: mediaFiles,
    productLinks: productLinks,
  };
  
  return finalPlaylist;
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
      
      // Debug: Log product data to see what images are available
      console.log('💳 CHECKOUT: Product data for', prod.name, ':', {
        id: prod.id,
        images: prod.images,
        imageType: typeof prod.images,
        imageLength: prod.images ? prod.images.length : 'undefined'
      });

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

      // Handle product images - use actual product images with proper content type
      let productImages = [];
      console.log('💳 CHECKOUT: Processing images for product', prod.name, '- Images available:', !!prod.images, 'Length:', prod.images ? prod.images.length : 'N/A');
      
      if (prod.images && prod.images.length > 0) {
        const firstImage = prod.images[0];
        console.log('💳 CHECKOUT: Original image URL:', firstImage);
        
        if (firstImage) {
          // Use the actual product image
          productImages = [firstImage];
          console.log('💳 CHECKOUT: Using actual product image for Stripe:', firstImage);
        }
      } else {
        console.log('💳 CHECKOUT: No images found for product', prod.name);
      }

      console.log('💳 CHECKOUT: Final productImages array:', productImages);
      console.log('💳 CHECKOUT: Sending to Stripe - Product:', prod.name, 'Images:', productImages.length > 0 ? productImages : 'NO IMAGES');

      const lineItem = {
        price_data: {
          currency: 'usd',
          product_data: {
            name: prod.name,
            images: productImages.length > 0 ? productImages : undefined,
          },
          unit_amount: unitAmount,
        },
        quantity: it.quantity || 1,
      };

      console.log('💳 CHECKOUT: Complete line item being sent to Stripe:', JSON.stringify(lineItem, null, 2));
      line_items.push(lineItem);
    }

    if (line_items.length === 0) {
      return res.status(400).json({ error: 'No valid items for checkout' });
    }

    console.log('💳 CHECKOUT: Creating Stripe session with line_items:', JSON.stringify(line_items, null, 2));
    
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

    console.log('✅ CHECKOUT: Stripe session created successfully. Session ID:', session.id);
    console.log('💳 CHECKOUT: Session URL:', session.url);
    
    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout session error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ---------- QR CODES API ----------

// Get all QR codes for the current user (alias for backward compatibility)
app.get('/api/qrcodes', authenticateToken, async (req, res) => {
  try {
    console.log('📱 QR_CODES: Fetching QR codes for user:', req.user.userId);
    
    // First try with scan count, fall back to simple query if qr_scans table doesn't exist
    let result;
    try {
      result = await pool.query(
        `SELECT qr.*, COUNT(qs.id) as scan_count
         FROM qr_codes qr
         LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
         WHERE qr.user_id = $1 AND qr.is_active = true
         GROUP BY qr.id
         ORDER BY qr.created_at DESC`,
        [req.user.userId]
      );
    } catch (scanError) {
      console.log('📱 QR_CODES: qr_scans table not available, using simple query');
      result = await pool.query(
        `SELECT qr.*, 0 as scan_count
         FROM qr_codes qr
         WHERE qr.user_id = $1 AND qr.is_active = true
         ORDER BY qr.created_at DESC`,
        [req.user.userId]
      );
    }
    
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

// Get all QR codes for the current user
app.get('/api/qr-codes', authenticateToken, async (req, res) => {
  try {
    console.log('📱 QR_CODES: Fetching QR codes for user:', req.user.userId);
    
    // First try with scan count, fall back to simple query if qr_scans table doesn't exist
    let result;
    try {
      result = await pool.query(
        `SELECT qr.*, COUNT(qs.id) as scan_count
         FROM qr_codes qr
         LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
         WHERE qr.user_id = $1 AND qr.is_active = true
         GROUP BY qr.id
         ORDER BY qr.created_at DESC`,
        [req.user.userId]
      );
    } catch (scanError) {
      console.log('📱 QR_CODES: qr_scans table not available, using simple query');
      result = await pool.query(
        `SELECT qr.*, 0 as scan_count
         FROM qr_codes qr
         WHERE qr.user_id = $1 AND qr.is_active = true
         ORDER BY qr.created_at DESC`,
        [req.user.userId]
      );
    }
    
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

// Get a specific QR code by ID (alias for backward compatibility)
app.get('/api/qrcodes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📱 QR_CODES: Fetching QR code:', id);
    
    const result = await pool.query(
      `SELECT qr.*, COUNT(qs.id) as scan_count
       FROM qr_codes qr
       LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
       WHERE qr.id = $1 AND qr.user_id = $2
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

// Get a specific QR code by ID
app.get('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📱 QR_CODES: Fetching QR code:', id);
    
    const result = await pool.query(
      `SELECT qr.*, COUNT(qs.id) as scan_count
       FROM qr_codes qr
       LEFT JOIN qr_scans qs ON qr.id = qs.qr_code_id
       WHERE qr.id = $1 AND qr.user_id = $2
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

// Create a new QR code (alias for backward compatibility)
app.post('/api/qrcodes', authenticateToken, async (req, res) => {
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
    
    const countResult = await pool.query('SELECT COUNT(*) FROM qr_codes WHERE user_id = $1 AND is_active = true', [req.user.userId]);
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
      `INSERT INTO qr_codes (user_id, name, url, qr_code_data, options, description) 
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
    
    const countResult = await pool.query('SELECT COUNT(*) FROM qr_codes WHERE user_id = $1 AND is_active = true', [req.user.userId]);
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
      `INSERT INTO qr_codes (user_id, name, url, qr_code_data, options, description) 
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

// Update a QR code (alias for backward compatibility)
app.patch('/api/qrcodes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, description, options } = req.body;
    
    console.log('📱 QR_CODES: Updating QR code:', id);
    
    // Check if user owns the QR code
    const ownerCheck = await pool.query(
      'SELECT user_id FROM qr_codes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
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

// Update a QR code
app.patch('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, description, options } = req.body;
    
    console.log('📱 QR_CODES: Updating QR code:', id);
    
    // Check if user owns the QR code
    const ownerCheck = await pool.query(
      'SELECT user_id FROM qr_codes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
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

// Delete a QR code (soft delete) (alias for backward compatibility)
app.delete('/api/qrcodes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📱 QR_CODES: Deleting QR code:', id);
    
    // Check if user owns the QR code
    const ownerCheck = await pool.query(
      'SELECT user_id FROM qr_codes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
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

// Delete a QR code (soft delete)
app.delete('/api/qr-codes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📱 QR_CODES: Deleting QR code:', id);
    
    // Check if user owns the QR code
    const ownerCheck = await pool.query(
      'SELECT user_id FROM qr_codes WHERE id = $1 AND is_active = true',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
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

// Get all activation codes for the user (simple GET endpoint)
app.get('/api/activation-codes', authenticateToken, async (req, res) => {
  try {
    console.log('🔑 ACTIVATION_CODES: Fetching all activation codes for user:', req.user.userId);
    
    const result = await pool.query(
      `SELECT ac.*, 
              p.name as playlist_name,
              s.name as slideshow_name
       FROM activation_codes ac
       LEFT JOIN playlists p ON ac.playlist_id = p.id
       LEFT JOIN slideshows s ON ac.slideshow_id = s.id
       WHERE ac.created_by = $1
       ORDER BY ac.created_at DESC`,
      [req.user.userId]
    );
    
    console.log('🔑 ACTIVATION_CODES: Found', result.rows.length, 'activation codes');
    res.json({ activationCodes: result.rows });
    
  } catch (error) {
    console.error('🔑 ACTIVATION_CODES: Error fetching codes:', error);
    res.status(500).json({ error: 'Failed to fetch activation codes' });
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
        
        // Convert snake_case fields to camelCase for frontend compatibility
        return {
          id: slideshow.id,
          userId: slideshow.user_id,
          name: slideshow.name,
          description: slideshow.description,
          requiresActivationCode: slideshow.requires_activation_code,
          isPublic: slideshow.is_public,
          autoplayInterval: slideshow.autoplay_interval,
          transition: slideshow.transition,
          backgroundAudioUrl: slideshow.audio_url,
          createdAt: slideshow.created_at,
          updatedAt: slideshow.updated_at,
          images: imagesResult.rows.map(img => ({
            id: img.id,
            slideshowId: img.slideshow_id,
            imageUrl: img.image_url,
            caption: img.caption,
            displayOrder: img.display_order,
            createdAt: img.created_at
          }))
        };
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
    
    console.log('🎬 SLIDESHOWS: ===== GET SLIDESHOW DEBUG START =====');
    console.log('🎬 SLIDESHOWS: Fetching slideshow ID:', id);
    
    const result = await pool.query(
      `SELECT s.*, u.username 
       FROM slideshows s 
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      console.log('🎬 SLIDESHOWS: ❌ Slideshow not found');
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = result.rows[0];
    
    console.log('🎬 SLIDESHOWS: ✅ Slideshow found in database');
    console.log('🎬 SLIDESHOWS: Raw slideshow data from database:');
    console.log('🎬 SLIDESHOWS:   - id:', slideshow.id);
    console.log('🎬 SLIDESHOWS:   - name:', slideshow.name);
    console.log('🎬 SLIDESHOWS:   - audio_url:', slideshow.audio_url);
    console.log('🎬 SLIDESHOWS:   - audio_url type:', typeof slideshow.audio_url);
    console.log('🎬 SLIDESHOWS:   - autoplay_interval:', slideshow.autoplay_interval);
    console.log('🎬 SLIDESHOWS:   - requires_activation_code:', slideshow.requires_activation_code);
    
    const imagesResult = await pool.query(
      `SELECT * FROM slideshow_images 
       WHERE slideshow_id = $1 
       ORDER BY display_order`,
      [id]
    );
    
    console.log('🎬 SLIDESHOWS: Found', imagesResult.rows.length, 'images for slideshow');
    
    const images = await Promise.all(imagesResult.rows.map(async (img) => {
      const s3Key = s3Service.extractKeyFromUrl(img.image_url);
      const signedUrl = s3Key ? await s3Service.getSignedUrl(s3Key) : img.image_url;
      
      return {
        id: img.id,
        slideshowId: id,
        displayOrder: img.display_order,
        createdAt: img.created_at,
        title: img.caption || `Image ${img.display_order + 1}`,
        description: img.caption,
        url: signedUrl, 
        type: 'image',
        fileType: 'image',
        contentType: 'image/jpeg'
      };
    }));

    console.log('🎬 SLIDESHOWS: Processing background audio URL...');
    console.log('🎬 SLIDESHOWS: Original audio_url:', slideshow.audio_url);
    
    // Pre-sign the background audio URL if it exists
    let signedAudioUrl = null;
    if (slideshow.audio_url) {
      let actualAudioUrl = slideshow.audio_url;
      
      // Check if the audio_url is a JSON string and parse it
      if (typeof slideshow.audio_url === 'string' && slideshow.audio_url.startsWith('{')) {
        try {
          const audioData = JSON.parse(slideshow.audio_url);
          actualAudioUrl = audioData.url || slideshow.audio_url;
          console.log('🎵 SLIDESHOWS: Parsed JSON audio data, extracted URL:', actualAudioUrl);
        } catch (e) {
          console.log('🎵 SLIDESHOWS: ⚠️ Failed to parse audio_url as JSON:', e.message);
          // Try to extract URL from malformed JSON string using regex
          const urlMatch = slideshow.audio_url.match(/"url":"([^"]+)"/);
          if (urlMatch) {
            actualAudioUrl = urlMatch[1];
            console.log('🎵 SLIDESHOWS: Extracted URL from malformed JSON using regex:', actualAudioUrl);
          } else {
            actualAudioUrl = slideshow.audio_url;
          }
        }
      }
      
      if (actualAudioUrl && actualAudioUrl.includes('amazonaws.com')) {
        console.log('🎵 SLIDESHOWS: Audio URL is S3, generating signed URL...');
        const audioKey = s3Service.extractKeyFromUrl(actualAudioUrl);
        console.log('🎵 SLIDESHOWS: Extracted S3 key:', audioKey);
        if (audioKey) {
          signedAudioUrl = await s3Service.getSignedUrl(audioKey);
          console.log('🎵 SLIDESHOWS: Generated signed audio URL:', signedAudioUrl);
        } else {
          console.log('🎵 SLIDESHOWS: ⚠️ Could not extract S3 key from audio URL');
        }
      } else if (actualAudioUrl) {
        console.log('🎵 SLIDESHOWS: Audio URL is not S3, using as-is');
        signedAudioUrl = actualAudioUrl;
      } else {
        console.log('🎵 SLIDESHOWS: ⚠️ No valid audio URL found after parsing');
      }
    } else {
      console.log('🎵 SLIDESHOWS: No background audio URL found');
    }

    // Get product links for this slideshow
    let productLinks = [];
    try {
      const productLinksResult = await pool.query(`
        SELECT pl.*, p.name as product_name, p.price, p.images as product_images
        FROM product_links pl
        JOIN products p ON pl.product_id = p.id
        WHERE pl.slideshow_id = $1 AND pl.is_active = true
        ORDER BY pl.display_order, pl.created_at
      `, [id]);

      // Format product links for frontend
      productLinks = productLinksResult.rows.map(link => ({
        id: link.product_id.toString(), // Use product_id, not link.id
        linkId: link.id.toString(), // Keep link ID for reference
        title: link.title,
        url: link.url,
        description: link.description,
        imageUrl: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url,
        images: link.product_images || (link.image_url ? [link.image_url] : []),
        displayOrder: link.display_order,
        isActive: link.is_active,
        price: link.price ? `$${(link.price / 100).toFixed(2)}` : null,
        productName: link.product_name
      }));

      console.log('🎬 SLIDESHOWS: Found', productLinks.length, 'product links');
    } catch (error) {
      console.error('🎬 SLIDESHOWS: Error fetching product links:', error);
      productLinks = [];
    }

    const finalSlideshow = {
      id: slideshow.id,
      userId: slideshow.user_id,
      name: slideshow.name,
      description: slideshow.description,
      username: slideshow.username,
      isPublic: slideshow.is_public,
      requiresActivationCode: slideshow.requires_activation_code,
      autoplayInterval: slideshow.autoplay_interval,
      backgroundAudioUrl: signedAudioUrl,
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at,
      images: images,
      productLinks: productLinks
    };
    
    console.log('🎬 SLIDESHOWS: Final slideshow object prepared:');
    console.log('🎬 SLIDESHOWS:   - id:', finalSlideshow.id);
    console.log('🎬 SLIDESHOWS:   - name:', finalSlideshow.name);
    console.log('🎬 SLIDESHOWS:   - backgroundAudioUrl:', finalSlideshow.backgroundAudioUrl);
    console.log('🎬 SLIDESHOWS:   - backgroundAudioUrl type:', typeof finalSlideshow.backgroundAudioUrl);
    console.log('🎬 SLIDESHOWS:   - autoplayInterval:', finalSlideshow.autoplayInterval);
    console.log('🎬 SLIDESHOWS:   - requiresActivationCode:', finalSlideshow.requiresActivationCode);
    console.log('🎬 SLIDESHOWS:   - images count:', finalSlideshow.images.length);
    
    console.log('🎬 SLIDESHOWS: Sending response to frontend...');
    console.log('🎬 SLIDESHOWS: ===== GET SLIDESHOW DEBUG END =====');
    
    res.json({ slideshow: finalSlideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: ❌ Error fetching slideshow:', error);
    console.error('🎬 SLIDESHOWS: Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product links for a specific slideshow
app.get('/api/slideshows/:slideshowId/products', async (req, res) => {
  try {
    const { slideshowId } = req.params;
    console.log(`🔗 PRODUCTS: Fetching product links for slideshow ${slideshowId}`);

    const result = await pool.query(
      `SELECT p.*
       FROM products p
       JOIN product_links pl ON p.id = pl.product_id
       WHERE pl.slideshow_id = $1 AND p.is_deleted = false`,
      [slideshowId]
    );

    const products = result.rows;

    const productsWithSignedUrls = await Promise.all(products.map(async (product) => {
      // Convert price from cents to dollars
      if (product.price) {
        product.price = product.price / 100;
      }
      
      if (product.image_url && product.image_url.includes('amazonaws.com')) {
        const s3Key = s3Service.extractKeyFromUrl(product.image_url);
        if (s3Key) {
          product.image_url = await s3Service.getSignedUrl(s3Key);
        }
      }
      if (product.image_urls && Array.isArray(product.image_urls)) {
        product.image_urls = await Promise.all(product.image_urls.map(async (url) => {
           if (url && url.includes('amazonaws.com')) {
            const s3Key = s3Service.extractKeyFromUrl(url);
            if (s3Key) {
              return s3Service.getSignedUrl(s3Key);
            }
          }
          return url;
        }));
      }
      return product;
    }));

    console.log(`🔗 PRODUCTS: Found ${productsWithSignedUrls.length} product links.`);
    res.json({ products: productsWithSignedUrls });

  } catch (error) {
    console.error('🔗 PRODUCTS: Error fetching product links for slideshow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific playlist by ID for access control (no auth required)
app.get('/api/playlist-access/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎵 PLAYLIST_ACCESS: Fetching playlist for access:', id);
    
    const playlist = await getPlaylistWithMedia(id);
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Convert to access format
    const accessData = {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      requiresActivationCode: playlist.requiresActivationCode,
      isPublic: playlist.isPublic,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      mediaFiles: playlist.mediaFiles || [],
      productLinks: playlist.productLinks || [],
      // Add access control flag
      accessRestricted: playlist.requiresActivationCode && !playlist.isPublic
    };
    
    console.log('🎵 PLAYLIST_ACCESS: Playlist found:', accessData.name);
    console.log('🎵 PLAYLIST_ACCESS: Access restricted:', accessData.accessRestricted);
    res.json(accessData);
    
  } catch (error) {
    console.error('🎵 PLAYLIST_ACCESS: Error fetching playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// Get a specific slideshow by ID for access control (no auth required)
app.get('/api/slideshow-access/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎬 SLIDESHOW_ACCESS: Fetching slideshow for access:', id);
    
    const result = await pool.query(
      `SELECT s.* FROM slideshows s WHERE s.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = result.rows[0];
    
    // Fix audio_url if it's stored as JSON object
    if (slideshow.audio_url && typeof slideshow.audio_url === 'string') {
      try {
        const audioData = JSON.parse(slideshow.audio_url);
        if (audioData && audioData.url) {
          slideshow.audio_url = audioData.url;
        }
      } catch (e) {
        // If it's not valid JSON, leave it as is
        console.log('🎬 SLIDESHOW_ACCESS: Audio URL is not JSON, keeping as string');
      }
    }
    
    // Get images for the slideshow
    const imagesResult = await pool.query(
      `SELECT * FROM slideshow_images 
       WHERE slideshow_id = $1 
       ORDER BY display_order`,
      [id]
    );
    
    slideshow.images = imagesResult.rows.map(img => ({
      id: img.id,
      slideshowId: img.slideshow_id,
      // The direct S3 URL should not be sent to the client.
      // Instead, we construct a secure, streamable URL.
      url: `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/slideshow-images/${img.id}/stream`,
      caption: img.caption,
      title: img.caption || `Image ${img.display_order + 1}`, // Add title field for MediaPlayer compatibility
      displayOrder: img.display_order,
      createdAt: img.created_at,
      // Add media type fields for MediaPlayer compatibility
      type: 'image',
      fileType: 'image',
      contentType: 'image/jpeg'
    }));
    
    // Get product links for this slideshow
    let productLinks = [];
    try {
      const productLinksResult = await pool.query(`
        SELECT pl.*, p.name as product_name, p.price, p.images as product_images
        FROM product_links pl
        JOIN products p ON pl.product_id = p.id
        WHERE pl.slideshow_id = $1 AND pl.is_active = true
        ORDER BY pl.display_order, pl.created_at
      `, [id]);

      // Format product links for frontend
      productLinks = productLinksResult.rows.map(link => ({
        id: link.product_id.toString(), // Use product_id, not link.id
        linkId: link.id.toString(), // Keep link ID for reference
        title: link.title,
        url: link.url,
        description: link.description,
        imageUrl: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url,
        images: link.product_images || (link.image_url ? [link.image_url] : []),
        displayOrder: link.display_order,
        isActive: link.is_active,
        price: link.price ? `$${(link.price / 100).toFixed(2)}` : null,
        productName: link.product_name
      }));

      console.log('🎬 SLIDESHOW_ACCESS: Found', productLinks.length, 'product links');
    } catch (error) {
      console.error('🎬 SLIDESHOW_ACCESS: Error fetching product links:', error);
      productLinks = [];
    }
    
    // Convert snake_case fields to camelCase for frontend compatibility
    const accessData = {
      id: slideshow.id,
      name: slideshow.name,
      description: slideshow.description,
      requiresActivationCode: slideshow.requires_activation_code,
      isPublic: slideshow.is_public,
      autoplayInterval: slideshow.autoplay_interval,
      transition: slideshow.transition,
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at,
      audioUrl: slideshow.audio_url,
      images: slideshow.images,
      productLinks: productLinks,
      // Add access control flag - ONLY based on requiresActivationCode
      accessRestricted: slideshow.requires_activation_code
    };
    
    console.log('🎬 SLIDESHOW_ACCESS: Slideshow found:', accessData.name);
    console.log('🎬 SLIDESHOW_ACCESS: Access restricted:', accessData.accessRestricted);
    res.json(accessData);
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_ACCESS: Error fetching slideshow:', error);
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
    
    const slideshow = {
      ...result.rows[0],
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
    const { name, description, autoplayInterval, transition, requiresActivationCode, audio_url } = req.body;
    
    console.log('🎬 SLIDESHOWS: ===== SLIDESHOW UPDATE DEBUG START =====');
    console.log('🎬 SLIDESHOWS: Updating slideshow ID:', id);
    console.log('🎬 SLIDESHOWS: Request body received:', JSON.stringify(req.body, null, 2));
    console.log('🎬 SLIDESHOWS: Extracted fields:');
    console.log('🎬 SLIDESHOWS:   - name:', name);
    console.log('🎬 SLIDESHOWS:   - description:', description);
    console.log('🎬 SLIDESHOWS:   - autoplayInterval:', autoplayInterval);
    console.log('🎬 SLIDESHOWS:   - transition:', transition);
    console.log('🎬 SLIDESHOWS:   - requiresActivationCode:', requiresActivationCode);
    console.log('🎬 SLIDESHOWS:   - audio_url:', audio_url);
    console.log('🎬 SLIDESHOWS:   - audio_url type:', typeof audio_url);
    console.log('🎬 SLIDESHOWS: User ID:', req.user.userId);
    
    // Check if user owns the slideshow
    console.log('🎬 SLIDESHOWS: Checking slideshow ownership...');
    const ownerCheck = await pool.query(
      'SELECT user_id FROM slideshows WHERE id = $1',
      [id]
    );

    if (ownerCheck.rows.length === 0) {
      console.log('🎬 SLIDESHOWS: ❌ Slideshow not found');
      return res.status(404).json({ error: 'Slideshow not found' });
    }

    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      console.log('🎬 SLIDESHOWS: ❌ Not authorized - owner:', ownerCheck.rows[0].user_id, 'user:', req.user.userId);
      return res.status(403).json({ error: 'Not authorized to update this slideshow' });
    }

    console.log('🎬 SLIDESHOWS: ✅ Ownership verified');
    
    // Process audio_url - extract just the URL if it's an object
    let processedAudioUrl = audio_url;
    if (audio_url && typeof audio_url === 'object' && audio_url.url) {
      processedAudioUrl = audio_url.url;
      console.log('🎵 SLIDESHOWS: Audio URL is object, extracting URL:', processedAudioUrl);
    } else if (audio_url && typeof audio_url === 'string') {
      // If it's a JSON string, try to parse it and extract the URL
      if (audio_url.startsWith('{')) {
        try {
          const audioData = JSON.parse(audio_url);
          processedAudioUrl = audioData.url || audio_url;
          console.log('🎵 SLIDESHOWS: Audio URL is JSON string, extracted URL:', processedAudioUrl);
        } catch (e) {
          console.log('🎵 SLIDESHOWS: Failed to parse audio URL JSON, using as-is:', audio_url);
          processedAudioUrl = audio_url;
        }
      } else {
        console.log('🎵 SLIDESHOWS: Audio URL is string, using as-is:', processedAudioUrl);
      }
    }
    
    console.log('🎬 SLIDESHOWS: Executing UPDATE query with parameters:');
    console.log('🎬 SLIDESHOWS:   $1 (name):', name);
    console.log('🎬 SLIDESHOWS:   $2 (description):', description);
    console.log('🎬 SLIDESHOWS:   $3 (autoplayInterval):', autoplayInterval);
    console.log('🎬 SLIDESHOWS:   $4 (transition):', transition);
    console.log('🎬 SLIDESHOWS:   $5 (requiresActivationCode):', requiresActivationCode);
    console.log('🎬 SLIDESHOWS:   $6 (processedAudioUrl):', processedAudioUrl);
    console.log('🎬 SLIDESHOWS:   $7 (id):', id);

    const result = await pool.query(
      `UPDATE slideshows 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           autoplay_interval = COALESCE($3, autoplay_interval), 
           transition = COALESCE($4, transition),
           requires_activation_code = COALESCE($5, requires_activation_code),
           audio_url = COALESCE($6, audio_url),
           updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, description, autoplayInterval, transition, requiresActivationCode, processedAudioUrl, id]
    );

    const slideshow = result.rows[0];
    
    console.log('🎬 SLIDESHOWS: ✅ UPDATE query successful');
    console.log('🎬 SLIDESHOWS: Updated slideshow data from database:');
    console.log('🎬 SLIDESHOWS:   - id:', slideshow.id);
    console.log('🎬 SLIDESHOWS:   - name:', slideshow.name);
    console.log('🎬 SLIDESHOWS:   - audio_url:', slideshow.audio_url);
    console.log('🎬 SLIDESHOWS:   - audio_url type:', typeof slideshow.audio_url);
    console.log('🎬 SLIDESHOWS:   - autoplay_interval:', slideshow.autoplay_interval);
    console.log('🎬 SLIDESHOWS:   - requires_activation_code:', slideshow.requires_activation_code);
    console.log('🎬 SLIDESHOWS:   - updated_at:', slideshow.updated_at);
    
    if (processedAudioUrl) {
      console.log('🎵 SLIDESHOWS: ✅ Audio URL was provided and should be updated');
      console.log('🎵 SLIDESHOWS: Original audio_url from request:', audio_url);
      console.log('🎵 SLIDESHOWS: Processed audio_url for database:', processedAudioUrl);
      console.log('🎵 SLIDESHOWS: Stored audio_url in database:', slideshow.audio_url);
      
      if (processedAudioUrl !== slideshow.audio_url) {
        console.log('🎵 SLIDESHOWS: ⚠️ WARNING: Audio URL mismatch!');
        console.log('🎵 SLIDESHOWS: Expected:', processedAudioUrl);
        console.log('🎵 SLIDESHOWS: Got:', slideshow.audio_url);
      } else {
        console.log('🎵 SLIDESHOWS: ✅ Audio URL stored correctly');
      }
    } else {
      console.log('🎵 SLIDESHOWS: ℹ️ No audio_url provided in request');
    }
    
    console.log('🎬 SLIDESHOWS: Preparing response object...');
    const responseSlideshow = {
      id: slideshow.id,
      name: slideshow.name,
      description: slideshow.description,
      autoplayInterval: slideshow.autoplay_interval,
      transition: slideshow.transition,
      requiresActivationCode: slideshow.requires_activation_code,
      backgroundAudioUrl: slideshow.audio_url,
      updatedAt: slideshow.updated_at
    };
    
    console.log('🎬 SLIDESHOWS: Response object prepared:');
    console.log('🎬 SLIDESHOWS:', JSON.stringify(responseSlideshow, null, 2));
    console.log('🎬 SLIDESHOWS: ===== SLIDESHOW UPDATE DEBUG END =====');
    
    res.json({ slideshow: responseSlideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOWS: ❌ Error updating slideshow:', error);
    console.error('🎬 SLIDESHOWS: Error stack:', error.stack);
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

// Upload image for slideshow
app.post('/api/slideshows/:id/images', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    console.log('🎬 SLIDESHOW_UPLOAD: Starting image upload process');
    const { id } = req.params;
    const { caption, position } = req.body;
    
    console.log('🎬 SLIDESHOW_UPLOAD: Parameters received:', { 
      id, 
      caption, 
      position,
      hasFile: !!req.file,
      fileInfo: req.file ? {
        originalname: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size
      } : null
    });
    
    if (!req.file) {
      console.log('🎬 SLIDESHOW_UPLOAD: No file provided');
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    // Check if user owns the slideshow
    const slideshowResult = await pool.query(
      'SELECT user_id FROM slideshows WHERE id = $1',
      [id]
    );
    
    if (slideshowResult.rows.length === 0) {
      console.log('🎬 SLIDESHOW_UPLOAD: Slideshow not found:', id);
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    if (slideshowResult.rows[0].user_id !== req.user.userId) {
      console.log('🎬 SLIDESHOW_UPLOAD: User not authorized:', req.user.userId);
      return res.status(403).json({ error: 'Not authorized to upload to this slideshow' });
    }
    
    // Upload to S3
    let imageUrl;
    try {
      if (!s3Service) {
        return res.status(500).json({ error: 'S3 service not configured' });
      }
      
      console.log('🎬 SLIDESHOW_UPLOAD: Uploading to S3...');
      const key = `users/${req.user.userId}/media/${Date.now()}-${Math.floor(Math.random() * 1000000000)}.${req.file.originalname.split('.').pop()}`;
      const uploadResult = await s3Service.uploadFile(
        req.file.buffer,
        key,
        req.file.mimetype
      );
      imageUrl = uploadResult.Location || uploadResult.location || `https://merchtechbucket.s3.us-east-2.amazonaws.com/${key}`;
      console.log('🎬 SLIDESHOW_UPLOAD: S3 upload successful:', imageUrl);
    } catch (error) {
      console.error('🎬 SLIDESHOW_UPLOAD: S3 upload failed:', error);
      return res.status(500).json({ error: 'Failed to upload image to S3', details: error.message });
    }
    
    // Get next position if not provided
    let displayOrder = position;
    if (!displayOrder) {
      console.log('🎬 SLIDESHOW_UPLOAD: Getting next position for slideshow:', id);
      const maxPositionResult = await pool.query(
        'SELECT MAX(display_order) as max_pos FROM slideshow_images WHERE slideshow_id = $1',
        [id]
      );
      displayOrder = (maxPositionResult.rows[0].max_pos || 0) + 1;
      console.log('🎬 SLIDESHOW_UPLOAD: Next position calculated:', displayOrder);
    }
    
    // Save image record to database with S3 URL
    console.log('🎬 SLIDESHOW_UPLOAD: About to save image record with S3 URL:', imageUrl);
    
    const imageResult = await pool.query(
      `INSERT INTO slideshow_images (slideshow_id, image_url, caption, display_order, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [id, imageUrl, caption || '', displayOrder]
    );
    
    console.log('🎬 SLIDESHOW_UPLOAD: Image record saved successfully:', imageResult.rows[0]);
    
    const image = {
      id: imageResult.rows[0].id,
      slideshowId: imageResult.rows[0].slideshow_id,
      imageUrl: imageResult.rows[0].image_url,
      caption: imageResult.rows[0].caption,
      displayOrder: imageResult.rows[0].display_order,
      createdAt: imageResult.rows[0].created_at
    };
    
    console.log('🎬 SLIDESHOW_UPLOAD: Image uploaded successfully to S3:', {
      imageId: image.id,
      s3Url: image.imageUrl
    });
    
    res.status(201).json({ image });
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_UPLOAD: Error uploading image:', error);
    console.error('🎬 SLIDESHOW_UPLOAD: Error message:', error.message);
    if (error.stack) {
      console.error('🎬 SLIDESHOW_UPLOAD: Error stack:', error.stack);
    }
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

// Delete image from slideshow
app.delete('/api/slideshows/:slideshowId/images/:imageId', authenticateToken, async (req, res) => {
  try {
    const { slideshowId, imageId } = req.params;
    
    console.log('🎬 SLIDESHOW_DELETE_IMAGE: Deleting image:', { slideshowId, imageId });
    
    // Check if user owns the slideshow
    const slideshowResult = await pool.query(
      'SELECT user_id FROM slideshows WHERE id = $1',
      [slideshowId]
    );
    
    if (slideshowResult.rows.length === 0) {
      console.log('🎬 SLIDESHOW_DELETE_IMAGE: Slideshow not found:', slideshowId);
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    if (slideshowResult.rows[0].user_id !== req.user.userId) {
      console.log('🎬 SLIDESHOW_DELETE_IMAGE: User not authorized:', req.user.userId);
      return res.status(403).json({ error: 'Not authorized to delete from this slideshow' });
    }
    
    // Get image details for file deletion
    const imageResult = await pool.query(
      'SELECT * FROM slideshow_images WHERE id = $1 AND slideshow_id = $2',
      [imageId, slideshowId]
    );
    
    if (imageResult.rows.length === 0) {
      console.log('🎬 SLIDESHOW_DELETE_IMAGE: Image not found:', imageId);
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Delete image record
    await pool.query(
      'DELETE FROM slideshow_images WHERE id = $1',
      [imageId]
    );
    
    // Delete file from S3 if it's an S3 URL
    const imageUrl = imageResult.rows[0].image_url;
    if (imageUrl.includes('amazonaws.com') && s3Service) {
      try {
        const key = s3Service.extractKeyFromUrl(imageUrl);
        if (key) {
          await s3Service.deleteFile(key);
          console.log('🎬 SLIDESHOW_DELETE_IMAGE: S3 file deleted:', key);
        }
      } catch (s3Error) {
        console.error('🎬 SLIDESHOW_DELETE_IMAGE: Failed to delete S3 file:', s3Error);
        // Continue with response even if S3 deletion fails
      }
    } else if (imageUrl.includes('localhost') || imageUrl.includes('uploads/')) {
      // Delete file from filesystem for local files
      const filename = imageUrl.split('/').pop();
      const filePath = path.join(__dirname, 'uploads', filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('🎬 SLIDESHOW_DELETE_IMAGE: File deleted from filesystem:', filename);
      }
    }
    
    // Get updated slideshow with remaining images
    const updatedSlideshowResult = await pool.query(
      'SELECT * FROM slideshows WHERE id = $1',
      [slideshowId]
    );
    
    if (updatedSlideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = updatedSlideshowResult.rows[0];
    
    // Get remaining images for the slideshow
    const remainingImagesResult = await pool.query(
      `SELECT * FROM slideshow_images 
       WHERE slideshow_id = $1 
       ORDER BY display_order`,
      [slideshowId]
    );
    
    const updatedSlideshow = {
      id: slideshow.id,
      name: slideshow.name,
      description: slideshow.description,
      uniqueId: slideshow.unique_id,
      userId: slideshow.user_id,
      autoplayInterval: slideshow.autoplay_interval,
      transition: slideshow.transition,
      audioUrl: slideshow.audio_url,
      requiresActivationCode: slideshow.requires_activation_code,
      isPublic: slideshow.is_public,
      createdAt: slideshow.created_at,
      updatedAt: slideshow.updated_at,
      images: remainingImagesResult.rows.map(img => ({
        id: img.id,
        slideshowId: img.slideshow_id,
        imageUrl: img.image_url,
        caption: img.caption,
        displayOrder: img.display_order,
        createdAt: img.created_at
      }))
    };
    
    console.log('🎬 SLIDESHOW_DELETE_IMAGE: Image deleted successfully, returning updated slideshow with', updatedSlideshow.images.length, 'images');
    res.json({ slideshow: updatedSlideshow });
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_DELETE_IMAGE: Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Stream slideshow image endpoint - serves images for slideshow preview
app.get('/api/slideshow-images/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎬 SLIDESHOW_IMAGE_STREAM: Streaming image:', id);
    
    // Set CORS headers for image streaming
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    
    // Get image details from database
    const result = await pool.query(
      'SELECT * FROM slideshow_images WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      console.log('🎬 SLIDESHOW_IMAGE_STREAM: Image not found:', id);
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const image = result.rows[0];
    const imageUrl = image.image_url;
    
    console.log('🎬 SLIDESHOW_IMAGE_STREAM: Image URL:', imageUrl);
    
    // If it's an S3 URL, stream through our S3 service
    if (imageUrl.includes('amazonaws.com') && s3Service) {
      try {
        console.log('🎬 SLIDESHOW_IMAGE_STREAM: Streaming S3 image');
        const key = s3Service.extractKeyFromUrl(imageUrl);
        if (!key) {
          console.error('🎬 SLIDESHOW_IMAGE_STREAM: Could not extract S3 key from URL:', imageUrl);
          return res.status(500).json({ error: 'Invalid S3 URL format' });
        }
        console.log('🎬 SLIDESHOW_IMAGE_STREAM: Extracted S3 key:', key);
        
        // Stream the image through our S3 service
        const { stream, metadata } = await s3Service.getStream(key);
        
        // Set appropriate headers for image streaming
        res.setHeader('Content-Type', metadata.ContentType || 'image/jpeg');
        res.setHeader('Content-Length', metadata.ContentLength);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        // Pipe the response stream directly
        stream.pipe(res);
        console.log('🎬 SLIDESHOW_IMAGE_STREAM: Successfully streaming S3 image');
        return;
        
      } catch (error) {
        console.error('🎬 SLIDESHOW_IMAGE_STREAM: Error streaming S3 image:', error);
        return res.status(500).json({ error: 'Failed to stream S3 image' });
      }
    }
    
    // If it's a local file, serve it directly
    if (imageUrl.startsWith('/') || imageUrl.startsWith('./') || imageUrl.includes('uploads/')) {
      const filename = imageUrl.split('/').pop();
      const filePath = path.join(__dirname, 'uploads', filename);
      if (fs.existsSync(filePath)) {
        console.log('🎬 SLIDESHOW_IMAGE_STREAM: Serving local file:', filePath);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(filePath);
      }
    }
    
    // For other URLs, try to proxy them
    try {
      console.log('🎬 SLIDESHOW_IMAGE_STREAM: Proxying external URL:', imageUrl);
      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        headers: {
          'Range': req.headers.range || undefined
        }
      });
      
      res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      // Copy content-length if present
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      
      // Pipe the response stream directly
      response.data.pipe(res);
      return;
    } catch (err) {
      console.error('🎬 SLIDESHOW_IMAGE_STREAM: Error proxying external URL:', err);
      // Fall back to redirect for external URLs
      console.log('🎬 SLIDESHOW_IMAGE_STREAM: Redirecting to external URL');
      return res.redirect(imageUrl);
    }
    
  } catch (error) {
    console.error('🎬 SLIDESHOW_IMAGE_STREAM: Error streaming image:', error);
    res.status(500).json({ error: 'Failed to stream image' });
  }
});

// Stream slideshow audio endpoint - serves audio files for slideshow background music
app.get('/api/slideshow-audio/:id/stream', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🎵 SLIDESHOW_AUDIO_STREAM: Streaming audio for slideshow:', id);
    
    // Set CORS headers for audio streaming
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization');
    
    // Get slideshow details from database
    const result = await pool.query(
      'SELECT * FROM slideshows WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      console.log('🎵 SLIDESHOW_AUDIO_STREAM: Slideshow not found:', id);
      return res.status(404).json({ error: 'Slideshow not found' });
    }
    
    const slideshow = result.rows[0];
    let audioUrl = slideshow.audio_url;
    
    if (!audioUrl) {
      console.log('🎵 SLIDESHOW_AUDIO_STREAM: No audio URL for slideshow:', id);
      return res.status(404).json({ error: 'No audio file for this slideshow' });
    }
    
    // Fix audio_url if it's stored as JSON object
    if (typeof audioUrl === 'string' && audioUrl.startsWith('{')) {
      try {
        const audioData = JSON.parse(audioUrl);
        if (audioData && audioData.url) {
          audioUrl = audioData.url;
        }
      } catch (e) {
        // If it's not valid JSON, try to extract URL using regex
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Audio URL is not valid JSON, trying regex extraction');
        const urlMatch = audioUrl.match(/"url":"([^"]+)"/);
        if (urlMatch) {
          audioUrl = urlMatch[1];
          console.log('🎵 SLIDESHOW_AUDIO_STREAM: Extracted URL from malformed JSON using regex:', audioUrl);
        } else {
          console.log('🎵 SLIDESHOW_AUDIO_STREAM: Could not extract URL, using as string');
        }
      }
    }
    
    console.log('🎵 SLIDESHOW_AUDIO_STREAM: Audio URL:', audioUrl);
    
    // If it's an S3 URL, stream through our S3 service
    if (audioUrl.includes('amazonaws.com') && s3Service) {
      try {
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Streaming S3 audio');
        const key = s3Service.extractKeyFromUrl(audioUrl);
        if (!key) {
          console.error('🎵 SLIDESHOW_AUDIO_STREAM: Could not extract S3 key from URL:', audioUrl);
          return res.status(500).json({ error: 'Invalid S3 URL format' });
        }
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Extracted S3 key:', key);
        
        // Stream the audio through our S3 service
        const { stream, metadata } = await s3Service.getStream(key);
        
        // Set appropriate headers for audio streaming
        res.setHeader('Content-Type', metadata.ContentType || 'audio/mpeg');
        res.setHeader('Content-Length', metadata.ContentLength);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        // Pipe the response stream directly
        stream.pipe(res);
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Successfully streaming S3 audio');
        return;
        
      } catch (error) {
        console.error('🎵 SLIDESHOW_AUDIO_STREAM: Error streaming S3 audio:', error);
        return res.status(500).json({ error: 'Failed to stream S3 audio' });
      }
    }
    
    // If it's a local file, serve it directly
    if (audioUrl.startsWith('/') || audioUrl.startsWith('./') || audioUrl.includes('uploads/')) {
      const filename = audioUrl.split('/').pop();
      const filePath = path.join(__dirname, 'uploads', filename);
      if (fs.existsSync(filePath)) {
        console.log('🎵 SLIDESHOW_AUDIO_STREAM: Serving local file:', filePath);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(filePath);
      }
    }
    
    // For other URLs, try to proxy them
    try {
      console.log('🎵 SLIDESHOW_AUDIO_STREAM: Proxying external URL:', audioUrl);
      const response = await axios.get(audioUrl, {
        responseType: 'stream',
        headers: {
          'Range': req.headers.range || undefined
        }
      });
      
      res.setHeader('Content-Type', response.headers['content-type'] || 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      
      // Copy content-length if present
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      
      // Pipe the response stream directly
      response.data.pipe(res);
      return;
    } catch (err) {
      console.error('🎵 SLIDESHOW_AUDIO_STREAM: Error proxying external URL:', err);
      // Fall back to redirect for external URLs
      console.log('🎵 SLIDESHOW_AUDIO_STREAM: Redirecting to external URL');
      return res.redirect(audioUrl);
    }
    
  } catch (error) {
    console.error('🎵 SLIDESHOW_AUDIO_STREAM: Error streaming audio:', error);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
});

// ---------- PLAYLIST MEDIA MANAGEMENT ROUTES ----------

// Add media files to a playlist
app.post('/api/playlists/:id/media', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { mediaFileIds } = req.body;
    
    console.log('🔴 PLAYLIST_MEDIA_ADD: Adding media to playlist:', id);
    console.log('🔴 PLAYLIST_MEDIA_ADD: Media file IDs:', mediaFileIds);
    
    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this playlist' });
    }
    
    // Get current max display order
    const maxOrderResult = await pool.query(
      'SELECT COALESCE(MAX(display_order), 0) as max_order FROM playlist_media WHERE playlist_id = $1',
      [id]
    );
    let nextOrder = parseInt(maxOrderResult.rows[0].max_order) + 1;
    
    // Add media files to playlist
    if (mediaFileIds && mediaFileIds.length > 0) {
      for (const mediaId of mediaFileIds) {
        // Check if media file exists and belongs to user
        const mediaCheck = await pool.query(
          'SELECT id FROM media WHERE id = $1 AND user_id = $2',
          [mediaId, req.user.userId]
        );
        
        if (mediaCheck.rows.length === 0) {
          return res.status(404).json({ error: `Media file ${mediaId} not found or not authorized` });
        }
        
        // Check if already linked
        const existingLink = await pool.query(
          'SELECT id FROM playlist_media WHERE playlist_id = $1 AND media_id = $2',
          [id, mediaId]
        );
        
        if (existingLink.rows.length === 0) {
          await pool.query(
            'INSERT INTO playlist_media (playlist_id, media_id, display_order) VALUES ($1, $2, $3)',
            [id, mediaId, nextOrder]
          );
          nextOrder++;
        }
      }
    }
    
    // Return updated playlist
    const updatedPlaylist = await getPlaylistWithMedia(id);
    res.json({ playlist: updatedPlaylist });
    
  } catch (error) {
    console.error('🔴 PLAYLIST_MEDIA_ADD: Error adding media:', error);
    res.status(500).json({ error: 'Failed to add media to playlist' });
  }
});

// Remove media file from a playlist
app.delete('/api/playlists/:id/media/:mediaId', authenticateToken, async (req, res) => {
  try {
    const { id, mediaId } = req.params;
    
    console.log('🔴 PLAYLIST_MEDIA_REMOVE: Removing media from playlist:', id, 'media:', mediaId);
    
    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this playlist' });
    }
    
    // Remove media from playlist
    const result = await pool.query(
      'DELETE FROM playlist_media WHERE playlist_id = $1 AND media_id = $2',
      [id, mediaId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Media file not found in playlist' });
    }
    
    // Return updated playlist
    const updatedPlaylist = await getPlaylistWithMedia(id);
    res.json({ playlist: updatedPlaylist });
    
  } catch (error) {
    console.error('🔴 PLAYLIST_MEDIA_REMOVE: Error removing media:', error);
    res.status(500).json({ error: 'Failed to remove media from playlist' });
  }
});

// Update playlist media order
app.put('/api/playlists/:id/media', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { mediaFileIds } = req.body; // Array of media IDs in desired order
    
    console.log('🔴 PLAYLIST_MEDIA_UPDATE: Updating playlist media order:', id);
    console.log('🔴 PLAYLIST_MEDIA_UPDATE: New order:', mediaFileIds);
    
    // Check if user owns the playlist
    const ownerCheck = await pool.query(
      'SELECT user_id FROM playlists WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to modify this playlist' });
    }
    
    // Clear existing media links
    await pool.query('DELETE FROM playlist_media WHERE playlist_id = $1', [id]);
    
    // Add media files in new order
    if (mediaFileIds && mediaFileIds.length > 0) {
      for (let i = 0; i < mediaFileIds.length; i++) {
        const mediaId = mediaFileIds[i];
        
        // Check if media file exists and belongs to user
        const mediaCheck = await pool.query(
          'SELECT id FROM media WHERE id = $1 AND user_id = $2',
          [mediaId, req.user.userId]
        );
        
        if (mediaCheck.rows.length === 0) {
          return res.status(404).json({ error: `Media file ${mediaId} not found or not authorized` });
        }
        
        await pool.query(
          'INSERT INTO playlist_media (playlist_id, media_id, display_order) VALUES ($1, $2, $3)',
          [id, mediaId, i + 1]
        );
      }
    }
    
    // Return updated playlist
    const updatedPlaylist = await getPlaylistWithMedia(id);
    res.json({ playlist: updatedPlaylist });
    
  } catch (error) {
    console.error('🔴 PLAYLIST_MEDIA_UPDATE: Error updating playlist media:', error);
    res.status(500).json({ error: 'Failed to update playlist media' });
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

// ---------- CHAT ENDPOINTS ----------

// Get universal chat messages
app.get('/api/chat/universal', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, filterType = 'all', userId, category, messageType } = req.query;
    
    console.log('🌍 UNIVERSAL_CHAT: Fetching messages with filters:', { 
      limit, offset, filterType, userId, category, messageType 
    });

    let query = `
      SELECT cm.*, u.username, u.id as user_id
      FROM universal_chat_messages cm 
      JOIN users u ON cm.user_id = u.id 
      WHERE cm.is_deleted = FALSE
    `;
    
    const queryParams = [];
    let paramIndex = 1;

    // Add filters
    if (filterType === 'user_store' && userId) {
      query += ` AND cm.user_id = $${paramIndex}`;
      queryParams.push(userId);
      paramIndex++;
    }
    
    if (filterType === 'category' && category) {
      query += ` AND cm.product_category = $${paramIndex}`;
      queryParams.push(category);
      paramIndex++;
    }
    
    if (messageType) {
      query += ` AND cm.message_type = $${paramIndex}`;
      queryParams.push(messageType);
      paramIndex++;
    }

    query += ` ORDER BY cm.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, queryParams);

    const messages = result.rows.map(msg => ({
      id: msg.id,
      userId: msg.user_id,
      username: msg.username,
      message: msg.message,
      messageType: msg.message_type || 'general',
      category: msg.product_category,
      createdAt: msg.created_at,
      updatedAt: msg.updated_at
    }));

    console.log('🌍 UNIVERSAL_CHAT: Found', messages.length, 'messages');
    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('🌍 UNIVERSAL_CHAT: Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch chat messages' });
  }
});

// Post universal chat message
app.post('/api/chat/universal', authenticateToken, async (req, res) => {
  try {
    const { message, messageType = 'general', relatedProductId, relatedStoreUserId, productCategory } = req.body;
    const userId = req.user.id;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    console.log('🌍 UNIVERSAL_CHAT: Posting message:', { 
      userId, message: message.trim(), messageType, productCategory 
    });

    const result = await pool.query(
      `INSERT INTO universal_chat_messages (user_id, message, message_type, product_category, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, NOW(), NOW()) 
       RETURNING *`,
      [userId, message.trim(), messageType, productCategory]
    );

    const newMessage = result.rows[0];

    // Get username for response
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    const username = userResult.rows[0]?.username || 'Unknown';

    const responseMessage = {
      id: newMessage.id,
      userId: newMessage.user_id,
      username: username,
      message: newMessage.message,
      messageType: newMessage.message_type,
      category: newMessage.product_category,
      createdAt: newMessage.created_at,
      updatedAt: newMessage.updated_at
    };

    console.log('🌍 UNIVERSAL_CHAT: Message posted successfully');
    res.json({ message: responseMessage });
  } catch (error) {
    console.error('🌍 UNIVERSAL_CHAT: Error posting message:', error);
    res.status(500).json({ error: 'Failed to post message' });
  }
});

// Delete universal chat message
app.delete('/api/chat/universal/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    console.log('🌍 UNIVERSAL_CHAT: Deleting message:', messageId, 'by user:', userId);

    // Check if message exists and belongs to user (or user is admin)
    const messageResult = await pool.query(
      'SELECT user_id FROM universal_chat_messages WHERE id = $1 AND is_deleted = FALSE',
      [messageId]
    );

    if (messageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const messageOwnerId = messageResult.rows[0].user_id;
    
    if (messageOwnerId !== userId && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await pool.query(
      'UPDATE universal_chat_messages SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1',
      [messageId]
    );

    console.log('🌍 UNIVERSAL_CHAT: Message deleted successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('🌍 UNIVERSAL_CHAT: Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Get chat categories
app.get('/api/chat/categories', authenticateToken, async (req, res) => {
  try {
    console.log('🌍 CHAT_CATEGORIES: Fetching categories');
    
    // Get distinct categories from universal chat messages
    const result = await pool.query(
      `SELECT DISTINCT product_category 
       FROM universal_chat_messages 
       WHERE product_category IS NOT NULL AND product_category != '' AND is_deleted = FALSE 
       ORDER BY product_category`
    );

    const categories = result.rows.map(row => row.product_category);
    
    // Add some default categories if none exist
    if (categories.length === 0) {
      categories.push('general', 'products', 'support', 'feedback');
    }

    console.log('🌍 CHAT_CATEGORIES: Found categories:', categories);
    res.json({ categories });
  } catch (error) {
    console.error('🌍 CHAT_CATEGORIES: Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch chat categories' });
  }
});

// ---------- PRODUCT LINKS ROUTES ----------

// Get product links for a playlist
app.get('/api/playlists/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT pl.*, p.name as product_name, p.price, p.images as product_images
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.playlist_id = $1 AND pl.is_active = true
      ORDER BY pl.display_order, pl.created_at
    `, [id]);

    // Convert price from cents to dollars and format images
    const formattedLinks = result.rows.map(link => ({
      ...link,
      price: link.price ? (link.price / 100).toFixed(2) : null,
      image_url: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url
    }));

    res.json(formattedLinks);
  } catch (error) {
    console.error('❌ Get playlist product links error:', error);
    res.status(500).json({ error: 'Failed to get product links' });
  }
});

// Add product link to playlist
app.post('/api/playlists/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    console.log('🔗 PRODUCT_LINK: Adding product link:', { playlistId: id, productId, userId: req.user.userId });

    // Check if playlist exists and user owns it
    const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found or access denied' });
    }

    // Check if product exists and user owns it
    const productResult = await pool.query('SELECT * FROM products WHERE id = $1 AND user_id = $2', [productId, req.user.userId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    const product = productResult.rows[0];

    // Add link with product details
    const result = await pool.query(`
      INSERT INTO product_links (playlist_id, product_id, title, url, description, image_url, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM product_links WHERE playlist_id = $1))
      ON CONFLICT (playlist_id, product_id) DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      id, 
      productId, 
      product.name,
      `${process.env.FRONTEND_URL || 'http://localhost:8081'}/store/product/${productId}`,
      product.description || product.name,
      product.images && product.images.length > 0 ? product.images[0] : null
    ]);

    console.log('✅ PRODUCT_LINK: Product link created:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Add playlist product link error:', error);
    res.status(500).json({ error: 'Failed to add product link' });
  }
});

// Remove product link from playlist
app.delete('/api/playlists/:id/product-links/:productId', authenticateToken, async (req, res) => {
  try {
    const { id, productId } = req.params;
    
    console.log('🔗 PRODUCT_LINK: Removing product link:', { playlistId: id, productId, userId: req.user.userId });

    // Check if playlist exists and user owns it
    const playlistResult = await pool.query('SELECT * FROM playlists WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found or access denied' });
    }

    // Remove link
    const result = await pool.query(`
      DELETE FROM product_links 
      WHERE playlist_id = $1 AND product_id = $2 RETURNING *
    `, [id, productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product link not found' });
    }

    console.log('✅ PRODUCT_LINK: Product link removed:', result.rows[0]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Remove playlist product link error:', error);
    res.status(500).json({ error: 'Failed to remove product link' });
  }
});

// ---------- SLIDESHOW PRODUCT LINKS ROUTES ----------

// Get product links for a slideshow
app.get('/api/slideshows/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔗 SLIDESHOW_PRODUCT_LINK: Getting product links for slideshow:', id);
    
    const result = await pool.query(`
      SELECT pl.*, p.name as product_name, p.price, p.images as product_images
      FROM product_links pl
      JOIN products p ON pl.product_id = p.id
      WHERE pl.slideshow_id = $1 AND pl.is_active = true
      ORDER BY pl.display_order, pl.created_at
    `, [id]);

    // Convert price from cents to dollars and format images
    const formattedLinks = result.rows.map(link => ({
      ...link,
      price: link.price ? (link.price / 100).toFixed(2) : null,
      image_url: link.product_images && link.product_images.length > 0 ? link.product_images[0] : link.image_url
    }));

    console.log('🔗 SLIDESHOW_PRODUCT_LINK: Found', formattedLinks.length, 'product links');
    res.json(formattedLinks);
  } catch (error) {
    console.error('❌ Get slideshow product links error:', error);
    res.status(500).json({ error: 'Failed to get product links' });
  }
});

// Add product link to slideshow
app.post('/api/slideshows/:id/product-links', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    console.log('🔗 SLIDESHOW_PRODUCT_LINK: Adding product link:', { slideshowId: id, productId, userId: req.user.userId });

    // Check if slideshow exists and user owns it
    const slideshowResult = await pool.query('SELECT * FROM slideshows WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (slideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found or access denied' });
    }

    // Check if product exists and user owns it
    const productResult = await pool.query('SELECT * FROM products WHERE id = $1 AND user_id = $2', [productId, req.user.userId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found or access denied' });
    }

    const product = productResult.rows[0];

    // Add link with product details
    const result = await pool.query(`
      INSERT INTO product_links (slideshow_id, product_id, title, url, description, image_url, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM product_links WHERE slideshow_id = $1))
      ON CONFLICT (slideshow_id, product_id) DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [
      id, 
      productId, 
      product.name,
      `${process.env.FRONTEND_URL || 'http://localhost:8081'}/store/product/${productId}`,
      product.description || product.name,
      product.images && product.images.length > 0 ? product.images[0] : null
    ]);

    console.log('✅ SLIDESHOW_PRODUCT_LINK: Product link created:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Add slideshow product link error:', error);
    res.status(500).json({ error: 'Failed to add product link' });
  }
});

// Remove product link from slideshow
app.delete('/api/slideshows/:id/product-links/:productId', authenticateToken, async (req, res) => {
  try {
    const { id, productId } = req.params;
    
    console.log('🔗 SLIDESHOW_PRODUCT_LINK: Removing product link:', { slideshowId: id, productId, userId: req.user.userId });

    // Check if slideshow exists and user owns it
    const slideshowResult = await pool.query('SELECT * FROM slideshows WHERE id = $1 AND user_id = $2', [id, req.user.userId]);
    if (slideshowResult.rows.length === 0) {
      return res.status(404).json({ error: 'Slideshow not found or access denied' });
    }

    // Remove link
    const result = await pool.query(`
      DELETE FROM product_links 
      WHERE slideshow_id = $1 AND product_id = $2 RETURNING *
    `, [id, productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product link not found' });
    }

    console.log('✅ SLIDESHOW_PRODUCT_LINK: Product link removed:', result.rows[0]);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Remove slideshow product link error:', error);
    res.status(500).json({ error: 'Failed to remove product link' });
  }
});

// ---------- WEB ROUTES FOR QR CODE SCANNING ----------
// These routes serve HTML pages for people who scan QR codes but don't have the app

// Test route to verify deployment
app.get('/test-route', (req, res) => {
  res.send('Test route working! Deployment timestamp: ' + new Date().toISOString());
});

// Media player route - serve the specific HTML file for this route
app.get('/media-player/:id', (req, res) => {
  const { id } = req.params;
  console.log('🎬 MEDIA_PLAYER: Serving media player HTML for ID:', id);
  
  // Serve the specific media player HTML file
  const mediaPlayerPath = path.join(__dirname, '../../dist/media-player/[id].html');
  console.log('🎬 MEDIA_PLAYER: Serving file:', mediaPlayerPath);
  
  res.sendFile(mediaPlayerPath, (err) => {
    if (err) {
      console.error('🎬 MEDIA_PLAYER: Error serving media player HTML:', err);
      // Fallback to index.html if the specific file doesn't exist
      res.sendFile(path.join(__dirname, '../../dist/index.html'), (fallbackErr) => {
        if (fallbackErr) {
          console.error('🎬 MEDIA_PLAYER: Error serving fallback index.html:', fallbackErr);
          res.status(500).json({ error: 'Error serving media player' });
        }
      });
    }
  });
});

// Generate HTML media player page
function generateMediaPlayerHTML(playlist) {
  const mediaFiles = playlist.mediaFiles || [];  // Fixed: use mediaFiles not media_files
  const mediaList = mediaFiles.map(file => ({
    id: file.id,
    title: file.title,
    url: `${process.env.BASE_URL || 'https://merchtech5-production.up.railway.app'}/api/media/${file.id}/stream`,
    type: file.fileType,  // Fixed: use fileType not file_type
    contentType: file.contentType  // Fixed: use contentType not content_type
  }));

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${playlist.name} - MerchTech</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px;
        }
        
        .container {
          max-width: 800px;
          width: 100%;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 30px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        
        h1 {
          text-align: center;
          margin-bottom: 30px;
          font-size: 2.5em;
          font-weight: 700;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .media-player {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 15px;
          padding: 20px;
          margin-bottom: 20px;
  }
        
        .current-track {
          text-align: center;
          margin-bottom: 20px;
        }
        
        .track-title {
          font-size: 1.5em;
          font-weight: 600;
          margin-bottom: 10px;
        }
        
        .track-info {
          opacity: 0.8;
          font-size: 0.9em;
        }
        
        .media-element {
          width: 100%;
          border-radius: 10px;
          margin-bottom: 15px;
          background: black;
        }
        
        .controls {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 20px;
          margin-bottom: 20px;
        }
        
        .control-btn {
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          color: white;
          font-size: 1.5em;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .control-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.05);
        }
        
        .play-btn {
          background: #007AFF;
          width: 60px;
          height: 60px;
          font-size: 1.8em;
        }
        
        .play-btn:hover {
          background: #0056CC;
        }
        
        .progress-container {
          margin-bottom: 20px;
        }
        
        .progress-bar {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
          overflow: hidden;
          cursor: pointer;
        }
        
        .progress-fill {
          height: 100%;
          background: #007AFF;
          width: 0%;
          transition: width 0.1s ease;
        }
        
        .time-display {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          font-size: 0.9em;
          opacity: 0.8;
        }
        
        .playlist {
          margin-top: 30px;
        }
        
        .playlist-title {
          font-size: 1.3em;
          font-weight: 600;
          margin-bottom: 15px;
          text-align: center;
        }
        
        .track-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          }
        
          .track-item { 
          background: rgba(255, 255, 255, 0.1);
            padding: 15px; 
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 15px;
          }
        
        .track-item:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        .track-item.active {
          background: rgba(0, 122, 255, 0.3);
          border: 2px solid #007AFF;
        }
        
          .track-number { 
          background: rgba(255, 255, 255, 0.2);
            width: 30px; 
            height: 30px; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
          font-weight: 600;
          font-size: 0.9em;
          }
        
        .track-details {
          flex: 1;
        }
        
        .track-name {
          font-weight: 600;
          margin-bottom: 5px;
        }
        
        .track-type {
          font-size: 0.8em;
          opacity: 0.7;
          text-transform: uppercase;
        }
        
        .loading {
            text-align: center;
          padding: 20px;
          opacity: 0.7;
        }
        
        .error {
          background: rgba(220, 38, 38, 0.2);
          color: #fca5a5;
            padding: 15px; 
            border-radius: 10px; 
            text-align: center;
          margin-bottom: 20px;
        }
        
        @media (max-width: 768px) {
          .container {
            padding: 20px; 
          }
          
          h1 {
            font-size: 2em;
          }
          
          .controls {
            gap: 15px;
          }
          
          .control-btn {
            width: 45px;
            height: 45px;
            font-size: 1.3em;
          }
          
          .play-btn {
            width: 55px;
            height: 55px;
            font-size: 1.6em;
          }
          }
        </style>
      </head>
      <body>
        <div class="container">
        <h1>${playlist.name}</h1>
        
        <div class="media-player">
          <div class="current-track">
            <div class="track-title" id="currentTitle">Select a track to play</div>
            <div class="track-info" id="currentInfo">Choose from ${mediaFiles.length} tracks</div>
          </div>

          <div id="mediaContainer">
            <div class="loading">Click a track below to start playing</div>
              </div>
          
          <div class="controls">
            <button class="control-btn" id="prevBtn" onclick="previousTrack()">⏮</button>
            <button class="control-btn play-btn" id="playBtn" onclick="togglePlay()">▶</button>
            <button class="control-btn" id="nextBtn" onclick="nextTrack()">⏭</button>
            </div>

          <div class="progress-container">
            <div class="progress-bar" id="progressBar" onclick="seek(event)">
              <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="time-display">
              <span id="currentTime">0:00</span>
              <span id="totalTime">0:00</span>
            </div>
          </div>
            </div>

        <div class="playlist">
          <div class="playlist-title">Playlist (${mediaFiles.length} tracks)</div>
          <div class="track-list">
            ${mediaList.map((file, index) => `
              <div class="track-item" onclick="loadTrack(${index})">
                  <div class="track-number">${index + 1}</div>
                <div class="track-details">
                  <div class="track-name">${file.title}</div>
                  <div class="track-type">${file.type || 'media'}</div>
                </div>
              </div>
              `).join('')}
          </div>
          </div>
        </div>

        <script>
        const mediaFiles = ${JSON.stringify(mediaList)};
        let currentTrack = 0;
        let isPlaying = false;
        let currentMedia = null;

        function loadTrack(index) {
          if (index < 0 || index >= mediaFiles.length) return;
          
          currentTrack = index;
          const file = mediaFiles[index];
          
          // Update UI
          document.getElementById('currentTitle').textContent = file.title;
          document.getElementById('currentInfo').textContent = \`Track \${index + 1} of \${mediaFiles.length}\`;
          
          // Update active track in playlist
          document.querySelectorAll('.track-item').forEach((item, i) => {
            item.classList.toggle('active', i === index);
          });
          
          // Create media element
          const mediaContainer = document.getElementById('mediaContainer');
          mediaContainer.innerHTML = '';
          
          if (file.type === 'video' || file.contentType?.startsWith('video/')) {
            currentMedia = document.createElement('video');
            currentMedia.controls = true;
            currentMedia.className = 'media-element';
            currentMedia.style.width = '100%';
            currentMedia.style.height = 'auto';
            currentMedia.style.maxHeight = '400px';
          } else {
            currentMedia = document.createElement('audio');
            currentMedia.controls = true;
            currentMedia.className = 'media-element';
            currentMedia.style.width = '100%';
          }
          
          currentMedia.src = file.url;
          currentMedia.onloadedmetadata = () => {
            updateTimeDisplay();
          };
          
          currentMedia.ontimeupdate = () => {
            updateProgress();
          };
          
          currentMedia.onended = () => {
            nextTrack();
          };
          
          currentMedia.onplay = () => {
            isPlaying = true;
            updatePlayButton();
          };
          
          currentMedia.onpause = () => {
            isPlaying = false;
            updatePlayButton();
          };
          
          mediaContainer.appendChild(currentMedia);
          
          // Auto-play after loading
          setTimeout(() => {
            if (currentMedia) {
              currentMedia.play();
            }
          }, 100);
        }
        
        function togglePlay() {
          if (!currentMedia) {
            if (mediaFiles.length > 0) {
              loadTrack(0);
            }
              return;
            }

          if (isPlaying) {
            currentMedia.pause();
            } else {
            currentMedia.play();
          }
        }
        
        function previousTrack() {
          const prevIndex = currentTrack > 0 ? currentTrack - 1 : mediaFiles.length - 1;
          loadTrack(prevIndex);
          }

        function nextTrack() {
          const nextIndex = currentTrack < mediaFiles.length - 1 ? currentTrack + 1 : 0;
          loadTrack(nextIndex);
        }
        
        function updatePlayButton() {
          const playBtn = document.getElementById('playBtn');
          playBtn.textContent = isPlaying ? '⏸' : '▶';
        }
        
        function updateProgress() {
          if (!currentMedia) return;
          
          const progress = (currentMedia.currentTime / currentMedia.duration) * 100;
          document.getElementById('progressFill').style.width = progress + '%';
          
          updateTimeDisplay();
          }

        function updateTimeDisplay() {
          if (!currentMedia) return;
          
          const current = formatTime(currentMedia.currentTime);
          const total = formatTime(currentMedia.duration);
          
          document.getElementById('currentTime').textContent = current;
          document.getElementById('totalTime').textContent = total;
        }
        
        function formatTime(seconds) {
          if (isNaN(seconds)) return '0:00';
          const mins = Math.floor(seconds / 60);
          const secs = Math.floor(seconds % 60);
          return mins + ':' + secs.toString().padStart(2, '0');
        }
        
        function seek(event) {
          if (!currentMedia) return;
          
          const progressBar = document.getElementById('progressBar');
          const rect = progressBar.getBoundingClientRect();
          const pos = (event.clientX - rect.left) / rect.width;
          currentMedia.currentTime = pos * currentMedia.duration;
          }

        // Initialize with first track if available
        if (mediaFiles.length > 0) {
          // Don't auto-load, let user choose
          document.getElementById('currentTitle').textContent = 'Ready to play';
          document.getElementById('currentInfo').textContent = 'Choose any track below to start';
        }
        </script>
      </body>
      </html>
    `;
}

// REMOVED: app.get('/playlist-access/:id') - This was interfering with React Native app's client-side routing
// The React Native app handles this route through app/(public)/playlist-access/[id].tsx

// This must be the last non-error-handling route
app.get('*', (req, res) => {
  // If the request path looks like an API call, it means no API route was matched,
  // so we should send a 404 instead of the web app.
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  // For any other route, serve the main index.html file.
  // This allows the React Native web app's router to handle the path.
  console.log(`🌐 WEB: Serving index.html for non-API route: ${req.path}`);
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) {
      console.error(`❌ WEB_SERVE_ERROR: Could not send index.html for path ${req.path}:`, err);
      // Check if the file doesn't exist, which likely means the web app wasn't built.
      if (err.code === 'ENOENT') {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
            <title>500 - Server Configuration Error</title>
            <style>body { font-family: sans-serif; text-align: center; padding-top: 50px; }</style>
      </head>
      <body>
            <h1>Error 500: Server Misconfiguration</h1>
            <p>The application's web files (dist/index.html) could not be found.</p>
            <p>This usually means the <code>npm run build</code> or <code>expo export -p web</code> command was not run during deployment.</p>
      </body>
      </html>
    `);
      } else {
        res.status(500).send('Error serving the application.');
      }
    }
  });
});

app.get('/api/slideshow-access/check-code', async (req, res) => {
  try {
    const { code, slideshowId } = req.query;
    if (!code || !slideshowId) {
      return res.status(400).json({ error: 'Code and slideshowId are required' });
    }

    const result = await pool.query(
      `SELECT * FROM activation_codes 
       WHERE code = $1 
         AND slideshow_id = $2 
         AND is_active = true 
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR uses_count < max_uses)`,
      [code, slideshowId]
    );

    if (result.rows.length > 0) {
      res.json({ valid: true });
    } else {
      res.json({ valid: false });
    }
  } catch (error) {
    console.error('Error checking activation code:', error);
    res.status(500).json({ error: 'Failed to check activation code' });
  }
});

// -----------------------------------------------------------------------------
// --- WEB APP SERVING (Client-Side Routing) ---
// This must be after all API routes. It serves the main web application.
// Any route not caught by the API will be handled by the client-side router.
// -----------------------------------------------------------------------------

// This must be the last non-error-handling route
app.get('*', (req, res) => {
  // If the request path looks like an API call, it means no API route was matched,
  // so we should send a 404 instead of the web app.
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  // For any other route, serve the main index.html file.
  // This allows the React Native web app's router to handle the path.
  console.log(`🌐 WEB: Serving index.html for non-API route: ${req.path}`);
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) {
      console.error(`❌ WEB_SERVE_ERROR: Could not send index.html for path ${req.path}:`, err);
      // Check if the file doesn't exist, which likely means the web app wasn't built.
      if (err.code === 'ENOENT') {
        res.status(500).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>500 - Server Configuration Error</title>
            <style>body { font-family: sans-serif; text-align: center; padding-top: 50px; }</style>
          </head>
          <body>
            <h1>Error 500: Server Misconfiguration</h1>
            <p>The application's web files (dist/index.html) could not be found.</p>
            <p>This usually means the <code>npm run build</code> or <code>expo export -p web</code> command was not run during deployment.</p>
          </body>
          </html>
        `);
    } else {
        res.status(500).send('Error serving the application.');
      }
    }
  });
});


// --- SERVER START ---
const server = app.listen(PORT, '0.0.0.0', () => {
  const address = server.address();
  console.log(`✅ Server listening on http://${address.address}:${address.port}`);
  console.log(`🚀 To test locally, open http://localhost:${PORT}`);
});
