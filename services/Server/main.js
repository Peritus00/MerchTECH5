require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const s3Service = require('./s3Service');
const brevo = require('@getbrevo/brevo');

console.log('DEBUG: Server script starting...');

// Basic environment checks
const dbUrl = process.env.DATABASE_URL;
console.log(`DEBUG: .env loaded, DATABASE_URL: ${dbUrl ? dbUrl.substring(0, 80) + '...' : 'Not Found'}`);
console.log(`DEBUG: NODE_ENV: ${process.env.NODE_ENV}`);

// Log S3 Key existence for debugging
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
console.log(`AWS Access Key Suffix: ${awsAccessKeyId ? awsAccessKeyId.slice(-4) : 'Not Found'}`);
console.log(`AWS Secret Key Suffix: ${awsSecretAccessKey ? awsSecretAccessKey.slice(-4) : 'Not Found'}`);


// --- App & Middleware Setup ---
const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = 10;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const allowedOrigins = [
  'https://app.merchtech.net',
  'http://localhost:8081',
  'http://localhost:19006',
  'https://merchtech.app',
  'exp://192.168.1.70:8081'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', cors());


// --- Database Pool Configuration ---
// Robust configuration for NeonDB serverless connections
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000, // 10 seconds to connect
  idleTimeoutMillis: 20000,      // 20 seconds to release idle clients
  max: 10,                       // Max 10 clients in the pool
});

pool.on('error', (err, client) => {
  console.error('🔴 DATABASE_POOL_ERROR: Unexpected error on idle client', err);
  process.exit(-1);
});


// --- S3 & Upload Configuration ---
if (s3Service.isConfigured()) {
  console.log('✅ S3 service loaded and instantiated successfully');
  console.log(`   AWS Region: ${process.env.AWS_REGION}`);
  console.log(`   S3 Bucket: ${process.env.S3_BUCKET_NAME}`);
  console.log(`   AWS Access Key: ${process.env.AWS_ACCESS_KEY_ID ? 'Configured' : 'Missing'}`);
} else {
  console.error('⚠️ S3 service is not configured. File uploads will fail.');
}

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('📂 Uploads directory created:', UPLOADS_DIR);
} else {
  console.log('📂 Uploads directory already exists:', UPLOADS_DIR);
}

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
      console.error(`❌ FILE_FILTER [${requestId}]: File rejected. Type not allowed: ${file.mimetype}`);
      cb(filterError, false);
    }
  }
});


// --- Brevo Email Transporter ---
const createTransporter = () => {
    const defaultClient = brevo.ApiClient.instance;
    let apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    return new brevo.TransactionalEmailsApi();
};
const transporter = createTransporter();


// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    console.log('AUTH: No token provided');
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('AUTH: Token verification failed', err.message);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};

const isAdmin = async (req, res, next) => {
  try {
    const userResult = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
    if (userResult.rows.length > 0 && userResult.rows[0].is_admin) {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: Requires admin privileges' });
    }
  } catch (error) {
    console.error('ADMIN_CHECK_ERROR:', error);
    res.status(500).json({ error: 'Internal server error during admin check' });
  }
};


// --- Helper Functions ---
const sanitizeImageUrls = (urls) => {
  if (!Array.isArray(urls)) return [];
  const publicBaseUrl = process.env.NODE_ENV === 'production'
    ? 'https://merchtech5-production.up.railway.app'
    : `http://localhost:${PORT}`;

  return urls.map(url => {
    if (typeof url !== 'string') return null;
    let newUrl = url.replace(/^http:/, 'https:');
    const localIpRegex = /https:\/\/192\.168\.\d{1,3}\.\d{1,3}:\d+/;
    newUrl = newUrl.replace(localIpRegex, publicBaseUrl);
    if (newUrl.startsWith('/api/')) {
      newUrl = `${publicBaseUrl}${newUrl}`;
    }
    return newUrl;
  }).filter(Boolean);
};

const mapProductFields = (product) => {
  if (!product) return null;
  return {
    id: product.id,
    userId: product.user_id,
    name: product.name,
    description: product.description,
    images: product.images || [],
    price: product.price,
    stripeProductId: product.stripe_product_id,
    inStock: product.in_stock,
    category: product.category,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    artistName: product.artist_name
  };
};

async function getPlaylistWithMedia(playlistId) {
    if (playlistId === null || typeof playlistId === 'undefined') {
        console.log('🔴 GET_PLAYLIST: Received null or undefined playlistId. Skipping.');
        return null;
    }
    const playlistIdInt = parseInt(playlistId, 10);
    if (isNaN(playlistIdInt)) {
        console.log('🔴 GET_PLAYLIST: Invalid playlist ID:', playlistId);
        return null;
    }
    // ... rest of the function
}


// ========== API ENDPOINTS ==========

// --- Authentication Endpoints ---

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, is_admin',
            [username, email, hashedPassword]
        );
        const user = result.rows[0];
        const token = jwt.sign({ userId: user.id, email: user.email, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin } });
    } catch (error) {
        console.error('🔴 REGISTER ERROR:', error);
        if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({ error: 'Email or username already exists.' });
        }
        res.status(500).json({ error: 'Failed to register user.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (match) {
      const token = jwt.sign({ userId: user.id, email: user.email, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '24h' });
      res.json({
        token,
        user: { id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin }
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('🔴 LOGIN ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// --- Upload Endpoint ---

app.post('/api/upload', authenticateToken, upload.single('image'), async (req, res) => {
    const requestId = `req_${Date.now()}`;
    console.log(`📤 UPLOAD [${requestId}]: Starting upload request for user ${req.user?.userId}`);
    
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
        const result = await s3Service.uploadFile(req.file, req.user.userId);
        
        const proxyUrl = `${process.env.NODE_ENV === 'production' ? 'https://merchtech5-production.up.railway.app' : `http://localhost:${PORT}`}/api/images/s3/${result.Key}`;
        
        console.log(`✅ UPLOAD_SUCCESS [${requestId}]: S3 URL: ${result.Location}`);
        console.log(`✅ UPLOAD_SUCCESS [${requestId}]: Proxy URL: ${proxyUrl}`);

        res.status(200).json({
            message: 'File uploaded successfully',
            url: result.Location, // Direct S3 URL
            proxy_url: proxyUrl,   // URL proxied through our server
            key: result.Key
        });

    } catch (error) {
        console.error(`❌ UPLOAD_ERROR [${requestId}]:`, error);
        res.status(500).json({ 
            error: 'Failed to upload file.', 
            message: error.message 
        });
    }
});


// --- Image Proxy Endpoint ---

app.get('/api/images/s3/*', async (req, res) => {
    const key = req.params[0];
    if (!key) {
        return res.status(400).send('Invalid image key');
    }
    try {
        const { stream, metadata } = await s3Service.getStream(key);
        res.setHeader('Content-Type', metadata.ContentType);
        res.setHeader('Content-Length', metadata.ContentLength);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
        stream.pipe(res);
    } catch (error) {
        console.error(`🔴 IMAGE_PROXY_ERROR: Failed to stream image for key "${key}":`, error);
        res.status(404).send('Image not found');
    }
});


// --- Product Endpoints ---

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username as artist_name 
       FROM products p
       JOIN users u ON p.user_id = u.id
       WHERE p.is_deleted = false 
       ORDER BY p.created_at DESC`
    );
    const products = result.rows.map(p => {
        if (p.price) p.price = parseFloat((p.price / 100).toFixed(2));
        if (p.images) p.images = sanitizeImageUrls(p.images);
        return mapProductFields(p);
    });
    res.json({ products });
  } catch (error) {
    console.error('🔴 GET ALL PRODUCTS ERROR:', error);
    res.status(500).json({ error: 'Failed to retrieve products' });
  }
});

// Helper function to safely fetch and process a single product by its ID
async function getProductById(id) {
  const productId = parseInt(id, 10);

  if (isNaN(productId)) {
    console.error('🔴 GET_PRODUCT_BY_ID_ERROR: Invalid or missing product ID received:', id);
    return null;
  }

  const result = await pool.query(
    `SELECT p.*, u.username as artist_name 
     FROM products p 
     JOIN users u ON p.user_id = u.id 
     WHERE p.id = $1 AND p.is_deleted = false`,
    [productId]
  );

  if (result.rows.length === 0) {
    return null;
  }
  
  let product = result.rows[0];
  if (product.price) {
    product.price = parseFloat((product.price / 100).toFixed(2));
  }
  if (product.images && Array.isArray(product.images)) {
    product.images = sanitizeImageUrls(product.images);
  }
  
  return mapProductFields(product);
}

// Get a single product by ID
app.get('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const product = await getProductById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ product });

  } catch (error) {
    console.error('🔴 GET PRODUCT ENDPOINT ERROR:', error);
    res.status(500).json({ error: 'Failed to retrieve product' });
  }
});


// Create product
app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    const { name, description, images, price, category } = req.body;
    
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const priceInCents = Math.round(parseFloat(price) * 100);
    const sanitizedImages = sanitizeImageUrls(images || []);

    const result = await pool.query(
      `INSERT INTO products (user_id, name, description, images, price, category)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.userId, name, description, sanitizedImages, priceInCents, category]
    );

    let newProduct = result.rows[0];
    newProduct.price = parseFloat((newProduct.price / 100).toFixed(2));
    
    res.status(201).json({ product: mapProductFields(newProduct) });
    
  } catch (error) {
    console.error('🔴 CREATE PRODUCT ERROR:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
app.patch('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const productId = parseInt(id, 10);

        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }

        const { name, description, images, price, category } = req.body;

        const currentProductResult = await pool.query('SELECT user_id FROM products WHERE id = $1', [productId]);
        if (currentProductResult.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        if (currentProductResult.rows[0].user_id !== req.user.userId && !req.user.isAdmin) {
            return res.status(403).json({ error: 'You are not authorized to edit this product' });
        }
        
        const fieldsToUpdate = [];
        const values = [productId];
        let queryIndex = 2;

        if (name) { fieldsToUpdate.push(`name = $${queryIndex++}`); values.push(name); }
        if (description) { fieldsToUpdate.push(`description = $${queryIndex++}`); values.push(description); }
        if (images) { fieldsToUpdate.push(`images = $${queryIndex++}`); values.push(sanitizeImageUrls(images)); }
        if (price) { fieldsToUpdate.push(`price = $${queryIndex++}`); values.push(Math.round(parseFloat(price) * 100)); }
        if (category) { fieldsToUpdate.push(`category = $${queryIndex++}`); values.push(category); }

        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        fieldsToUpdate.push(`updated_at = NOW()`);

        const query = `UPDATE products SET ${fieldsToUpdate.join(', ')} WHERE id = $1 RETURNING *`;
        const result = await pool.query(query, values);
        
        let updatedProduct = result.rows[0];
        updatedProduct.price = parseFloat((updatedProduct.price / 100).toFixed(2));

        res.json({ product: mapProductFields(updatedProduct) });

    } catch (error) {
        console.error('🔴 UPDATE PRODUCT ERROR:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    // Soft delete implementation
    try {
        const { id } = req.params;
        const result = await pool.query(
            'UPDATE products SET is_deleted = true, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, req.user.userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Product not found or you do not have permission to delete it.' });
        }
        res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error('🔴 DELETE PRODUCT ERROR:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// --- Debug & Admin Endpoints ---

app.get('/api/debug/s3', (req, res) => {
    res.json({
      s3ServiceAvailable: s3Service.isConfigured(),
      s3ServiceConfigured: s3Service.isConfigured(),
      awsRegion: process.env.AWS_REGION,
      s3Bucket: process.env.S3_BUCKET_NAME,
      accessKeyConfigured: !!process.env.AWS_ACCESS_KEY_ID
    });
});

// --- Global Error Handler ---
app.use((error, req, res, next) => {
  console.error('🚨 GLOBAL_ERROR_HANDLER:', {
    message: error.message,
    code: error.code,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    user: req.user?.userId
  });

  if (res.headersSent) {
    return next(error);
  }
  
  if (error.code === 'FILE_TYPE_NOT_ALLOWED') {
    return res.status(400).json({ error: error.message });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred. Please try again later.',
  });
});


// --- Server Initialization ---
const initializeDatabase = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Database connection test successful.');
        const res = await client.query('SELECT NOW()');
        console.log('🕒 Postgres server time:', res.rows[0].now);
        client.release();
        return true;
    } catch (error) {
        console.error('🔴 DATABASE_CONNECTION_ERROR: Could not connect to the database.');
        console.error(error.stack);
        return false;
    }
};

const startServer = async () => {
    console.log('Attempting to initialize database...');
    const dbReady = await initializeDatabase();

    if (!dbReady) {
        console.error('Halting server startup due to database connection failure.');
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ PORT_ERROR: Port ${PORT} is already in use. Is another server instance running?`);
        } else {
            console.error('❌ SERVER_START_ERROR:', err);
        }
        process.exit(1);
    });
};

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    app.close(() => {
        console.log('HTTP server closed');
        pool.end(() => {
            console.log('Database pool has ended');
            process.exit(0);
        });
    });
});

startServer();

module.exports = app;