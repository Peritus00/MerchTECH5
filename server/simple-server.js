const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // Keep this global as it's used in auth middleware and initialization
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001; // Ensure PORT is consistently 5001

// Self-healing configuration
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const RESTART_DELAY = 5000; // 5 seconds
const MAX_RESTART_ATTEMPTS = 10;
let restartAttempts = 0;
let serverInstance = null;
let healthCheckTimer = null;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-development';

// Database configuration with retry logic
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/merchtech_qr',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    // Handle developer fallback token
    if (token === 'dev_jwt_token_djjetfuel_12345') {
        req.user = {
            userId: 1,
            id: 1,
            email: 'djjetfuel@gmail.com',
            username: 'djjetfuel',
            isAdmin: true
        };
        return next();
    }

    jwt.verify(token, JWT_SECRET, async (err, user) => {
        if (err) {
            console.error('JWT verification error:', err);
            return res.status(403).json({ error: 'Invalid token' });
        }

        // Check if user is admin in database
        try {
            const dbUser = await pool.query(
                'SELECT is_admin FROM users WHERE id = $1',
                [user.userId]
            );

            if (dbUser.rows.length > 0) {
                user.isAdmin = dbUser.rows[0].is_admin;
            }
        } catch (dbError) {
            console.error('Error checking admin status:', dbError);
            // Even if DB error, proceed with user data if token is valid
        }

        req.user = user;
        next();
    });
};

// CORS configuration - Dynamic origin handling for Replit development
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Allow all Replit development URLs
        if (origin.includes('.replit.dev') || origin.includes('.repl.co')) {
            return callback(null, true);
        }

        // Allow localhost for local development
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }

        // Log the origin for debugging
        console.log('🔴 SERVER: CORS request from origin:', origin);

        // Allow all origins in development (fallback)
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ limit: '1gb', extended: true }));

// Load and configure Stripe
console.log('🔴 SERVER: Checking Stripe configuration...');
console.log('🔴 SERVER: STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
console.log('🔴 SERVER: STRIPE_SECRET_KEY length:', process.env.STRIPE_SECRET_KEY?.length || 0);

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

// Configure Brevo email service
const axios = require('axios');
console.log('🔴 SERVER: Checking Brevo configuration...');
console.log('🔴 SERVER: BREVO_API_KEY exists:', !!process.env.BREVO_API_KEY);

const brevoConfig = {
    apiKey: process.env.BREVO_API_KEY,
    baseURL: 'https://api.brevo.com/v3',
    headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
    }
};

// Email service helper function
async function sendBrevoEmail(to, subject, htmlContent, templateId = null) {
    if (!process.env.BREVO_API_KEY) {
        console.warn('⚠️ SERVER: Brevo API key not configured. No emails will be sent.');
        return;
    }
    try {
        const emailData = {
            sender: {
                email: 'help@merchtech.net',
                name: 'MerchTech QR Platform'
            },
            to: [{ email: to }],
            subject: subject,
            htmlContent: htmlContent
        };

        if (templateId) {
            emailData.templateId = templateId;
        }

        const response = await axios.post(
            `${brevoConfig.baseURL}/smtp/email`,
            emailData,
            { headers: brevoConfig.headers }
        );

        console.log('✅ SERVER: Email sent successfully via Brevo:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ SERVER: Brevo email error:', error.response?.data || error.message);
        throw error;
    }
}


if (!stripe) {
    console.log('⚠️ SERVER: Stripe not configured - STRIPE_SECRET_KEY missing');
} else {
    console.log('✅ SERVER: Stripe configured successfully');
    console.log('✅ SERVER: Using key type:', process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST');
}

// Helper functions for user lookup
async function getUserByEmail(email) {
    const result = await pool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
}

async function getUserByUsername(username) {
    const result = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
}

// ==================== ALL ROUTE DEFINITIONS HERE ====================
// Moving all app.get, app.post, etc. BEFORE the startServer function.
// This ensures the Express `app` object has all its routes registered when `startServer` is called.

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'MerchTech QR API Server',
        status: 'running',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        port: PORT,
        pid: process.pid,
        uptime: process.uptime(),
        restartAttempts: restartAttempts
    });
});

// Enhanced health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Test database connection
        await pool.query('SELECT 1');

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            port: PORT,
            pid: process.pid,
            uptime: process.uptime(),
            database: 'connected',
            restartAttempts: restartAttempts,
            memoryUsage: process.memoryUsage()
        });
    } catch (error) {
        console.error('Health check database error:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message
        });
    }
});

// ==================== AUTH ENDPOINTS ====================

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
    console.log('🔴 SERVER: ============ REGISTRATION ENDPOINT DEBUG START ============');
    console.log('🔴 SERVER: Registration endpoint hit at:', new Date().toISOString());
    console.log('🔴 SERVER: Request method:', req.method);
    console.log('🔴 SERVER: Request URL:', req.url);
    console.log('🔴 SERVER: Request headers:', req.headers);
    console.log('🔴 SERVER: Request body:', req.body);

    try {
        const { email, password, username } = req.body;

        console.log('🔴 SERVER: Extracted registration data:', {
            email,
            username,
            hasPassword: !!password,
            passwordLength: password?.length
        });

        if (!email || !password || !username) {
            console.error('🔴 SERVER: Missing required fields:', {
                hasEmail: !!email,
                hasPassword: !!password,
                hasUsername: !!username
            });
            return res.status(400).json({ error: 'Email, password, and username are required' });
        }

        console.log('🔴 SERVER: Checking for existing user...');
        // Check if user already exists
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'This email address is already registered',
                message: 'This email address is already registered'
            });
        }

        const existingUsername = await getUserByUsername(username);
        if (existingUsername) {
            return res.status(409).json({
                success: false,
                error: 'This username is already taken',
                message: 'This username is already taken'
            });
        }

        console.log('🔴 SERVER: Hashing password...');
        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        console.log('🔴 SERVER: Password hashed successfully');

        console.log('🔴 SERVER: Inserting new user into database...');
        // Insert new user
        const result = await pool.query(
            `INSERT INTO users (email, username, password_hash, is_email_verified, subscription_tier, is_new_user, created_at, updated_at)
             VALUES ($1, $2, $3, false, 'free', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING id, email, username, is_email_verified, subscription_tier, is_new_user, created_at, updated_at`,
            [email, username, hashedPassword]
        );

        console.log('🔴 SERVER: Database insert result:', {
            rowCount: result.rowCount,
            rows: result.rows
        });

        const user = result.rows[0];
        console.log('🔴 SERVER: Created user:', user);

        console.log('🔴 SERVER: Generating JWT token...');
        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                username: user.username
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('🔴 SERVER: JWT token generated:', {
            tokenLength: token.length,
            tokenPreview: token.substring(0, 20) + '...'
        });

        console.log('🔴 SERVER: Registration successful for:', { userId: user.id, email: user.email, username: user.username });
        console.log('🔴 SERVER: ============ REGISTRATION ENDPOINT DEBUG END ============');

        res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                firstName: null,
                lastName: null,
                isEmailVerified: user.is_email_verified,
                subscriptionTier: user.subscription_tier,
                isNewUser: user.is_new_user,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            },
            token,
            refreshToken: `refresh_${token}`
        });

    } catch (error) {
        console.error('🔴 SERVER: ============ REGISTRATION ERROR DEBUG START ============');
        console.error('🔴 SERVER: Registration error:', error);
        console.error('🔴 SERVER: Error type:', typeof error);
        console.error('🔴 SERVER: Error name:', error.name);
        console.error('🔴 SERVER: Error message:', error.message);
        console.error('🔴 SERVER: Error stack:', error.stack);
        console.error('🔴 SERVER: ============ REGISTRATION ERROR DEBUG END ============');

        res.status(500).json({
            error: 'Internal server error during registration',
            details: error.message
        });
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    console.log('🔴 SERVER: ============ LOGIN ENDPOINT DEBUG START ============');
    console.log('🔴 SERVER: Login endpoint hit at:', new Date().toISOString());
    console.log('🔴 SERVER: Request body:', req.body);

    try {
        const { email, password } = req.body;

        console.log('🔴 SERVER: Login attempt for:', { email, hasPassword: !!password });

        if (!email || !password) {
            console.error('🔴 SERVER: Missing email or password');
            return res.status(400).json({ error: 'Email and password are required' });
        }

        console.log('🔴 SERVER: Querying database for user...');
        // Get user from database
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        console.log('🔴 SERVER: Database query result:', {
            rowCount: result.rowCount,
            foundUser: result.rows.length > 0
        });

        if (result.rows.length === 0) {
            console.log('🔴 SERVER: User not found for email:', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        console.log('🔴 SERVER: Found user:', { id: user.id, email: user.email, username: user.username });

        console.log('🔴 SERVER: Verifying password...');
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);

        console.log('🔴 SERVER: Password verification result:', isValidPassword);

        if (!isValidPassword) {
            console.log('🔴 SERVER: Invalid password for user:', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('🔴 SERVER: Generating JWT token...');
        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                username: user.username,
                isAdmin: user.is_admin || false
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        const responseData = {
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                firstName: user.first_name,
                lastName: user.last_name,
                isEmailVerified: user.is_email_verified,
                subscriptionTier: user.subscription_tier,
                isNewUser: user.is_new_user,
                isAdmin: user.is_admin || false,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            },
            token,
            refreshToken: `refresh_${token}`
        };

        console.log('🔴 SERVER: Login successful for:', { userId: user.id, email: user.email, username: user.username });
        console.log('🔴 SERVER: ============ LOGIN ENDPOINT DEBUG END ============');

        res.json(responseData);

    } catch (error) {
        console.error('🔴 SERVER: ============ LOGIN ERROR DEBUG START ============');
        console.error('🔴 SERVER: Login error:', error);
        console.error('🔴 SERVER: Error message:', error.message);
        console.error('🔴 SERVER: Error stack:', error.stack);
        console.error('🔴 SERVER: ============ LOGIN ERROR DEBUG END ============');

        res.status(500).json({
            error: 'Internal server error during login',
            details: error.message
        });
    }
});

// Playlist endpoints
app.get('/api/playlists', authenticateToken, async (req, res) => {
    try {
        console.log('🔴 SERVER: Get playlists endpoint hit for user:', req.user?.id);

        const query = `
            SELECT
                p.*,
                COALESCE(
                    JSON_AGG(
                        CASE WHEN m.id IS NOT NULL THEN
                            JSON_BUILD_OBJECT(
                                'id', m.id,
                                'title', m.title,
                                'fileName', m.filename,
                                'fileType', m.file_type,
                                'filePath', m.file_path,
                                'contentType', m.content_type,
                                'fileSize', m.filesize,
                                'timestamp', m.created_at
                            )
                        END
                    ) FILTER (WHERE m.id IS NOT NULL),
                    '[]'::json
                ) as media_files
            FROM playlists p
            LEFT JOIN playlist_media pm ON p.id = pm.playlist_id
            LEFT JOIN media_files m ON pm.media_id = m.id
            WHERE p.user_id = $1
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `;

        const result = await pool.query(query, [req.user.id]);

        const playlists = result.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            name: row.name,
            description: row.description,
            requiresActivationCode: row.requires_activation_code,
            isPublic: row.is_public,
            instagramUrl: row.instagram_url,
            twitterUrl: row.twitter_url,
            facebookUrl: row.facebook_url,
            youtubeUrl: row.youtube_url,
            websiteUrl: row.website_url,
            productLink: row.product_link,
            productLinkTitle: row.product_link_title,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            mediaFiles: row.media_files || []
        }));

        console.log('🔴 SERVER: Found playlists:', playlists.length);
        res.json(playlists);
    } catch (error) {
        console.error('🔴 SERVER: Error fetching playlists:', error);
        res.status(500).json({ error: 'Failed to fetch playlists' });
    }
});

app.get('/api/playlists/:id', authenticateToken, async (req, res) => {
    try {
        const playlistId = req.params.id;
        console.log('🔴 SERVER: Get playlist by ID:', playlistId);

        const query = `
            SELECT
                p.*,
                COALESCE(
                    JSON_AGG(
                        CASE WHEN m.id IS NOT NULL THEN
                            JSON_BUILD_OBJECT(
                                'id', m.id,
                                'title', m.title,
                                'fileName', m.filename,
                                'fileType', m.file_type,
                                'filePath', m.file_path,
                                'contentType', m.content_type,
                                'fileSize', m.filesize,
                                'timestamp', m.created_at
                            )
                        END
                    ) FILTER (WHERE m.id IS NOT NULL),
                    '[]'::json
                ) as media_files
            FROM playlists p
            LEFT JOIN playlist_media pm ON p.id = pm.playlist_id
            LEFT JOIN media_files m ON pm.media_id = m.id
            WHERE p.id = $1 AND p.user_id = $2
            GROUP BY p.id
        `;

        const result = await pool.query(query, [playlistId, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const row = result.rows[0];
        const playlist = {
            id: row.id,
            userId: row.user_id,
            name: row.name,
            description: row.description,
            requiresActivationCode: row.requires_activation_code,
            isPublic: row.is_public,
            instagramUrl: row.instagram_url,
            twitterUrl: row.twitter_url,
            facebookUrl: row.facebook_url,
            youtubeUrl: row.youtube_url,
            websiteUrl: row.website_url,
            productLink: row.product_link,
            productLinkTitle: row.product_link_title,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            mediaFiles: row.media_files || []
        };

        console.log('🔴 SERVER: Found playlist:', playlist.name, 'with', playlist.mediaFiles.length, 'media files');
        res.json(playlist);
    } catch (error) {
        console.error('🔴 SERVER: Error fetching playlist:', error);
        res.status(500).json({ error: 'Failed to fetch playlist' });
    }
});

app.post('/api/playlists', authenticateToken, async (req, res) => {
    try {
        const { name, description, mediaFileIds, requiresActivationCode, isPublic } = req.body;
        console.log('🔴 SERVER: Creating playlist:', { name, mediaFileIds: mediaFileIds?.length });

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Create playlist
        const playlistQuery = `
            INSERT INTO playlists (user_id, name, description, requires_activation_code, is_public)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        const playlistResult = await pool.query(playlistQuery, [
            req.user.id,
            name,
            description || null,
            requiresActivationCode || false,
            isPublic || false
        ]);

        const playlist = playlistResult.rows[0];

        // Add media files to playlist if provided
        if (mediaFileIds && mediaFileIds.length > 0) {
            // Constructing a safe batch insert query
            const mediaValues = mediaFileIds.map((mediaId, i) => `($1, $${i + 2})`).join(', ');
            const mediaQuery = `
                INSERT INTO playlist_media (playlist_id, media_id)
                VALUES ${mediaValues}
            `;
            await pool.query(mediaQuery, [playlist.id, ...mediaFileIds]);
        }

        console.log('🔴 SERVER: Created playlist with ID:', playlist.id);
        res.status(201).json({
            id: playlist.id,
            userId: playlist.user_id,
            name: playlist.name,
            description: playlist.description,
            requiresActivationCode: playlist.requires_activation_code,
            isPublic: playlist.is_public,
            createdAt: playlist.created_at,
            mediaFiles: [] // Media files are not returned on creation directly from this endpoint
        });
    } catch (error) {
        console.error('🔴 SERVER: Error creating playlist:', error);
        res.status(500).json({ error: 'Failed to create playlist' });
    }
});

app.put('/api/playlists/:id', authenticateToken, async (req, res) => {
    try {
        const playlistId = req.params.id;
        const { name, description, requiresActivationCode, isPublic } = req.body;
        console.log('🔴 SERVER: Updating playlist:', playlistId);

        const query = `
            UPDATE playlists
            SET name = $1, description = $2, requires_activation_code = $3, is_public = $4, updated_at = NOW()
            WHERE id = $5 AND user_id = $6
            RETURNING *
        `;

        const result = await pool.query(query, [
            name,
            description,
            requiresActivationCode,
            isPublic,
            playlistId,
            req.user.id
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        const playlist = result.rows[0];
        res.json({
            id: playlist.id,
            userId: playlist.user_id,
            name: playlist.name,
            description: playlist.description,
            requiresActivationCode: playlist.requires_activation_code,
            isPublic: playlist.is_public,
            createdAt: playlist.created_at,
            updatedAt: playlist.updated_at
        });
    } catch (error) {
        console.error('🔴 SERVER: Error updating playlist:', error);
        res.status(500).json({ error: 'Failed to update playlist' });
    }
});

app.delete('/api/playlists/:id', authenticateToken, async (req, res) => {
    try {
        const playlistId = req.params.id;
        console.log('🔴 SERVER: Deleting playlist:', playlistId);

        // Delete playlist (cascade will handle playlist_media)
        const result = await pool.query(
            'DELETE FROM playlists WHERE id = $1 AND user_id = $2 RETURNING *',
            [playlistId, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Playlist not found' });
        }

        console.log('🔴 SERVER: Deleted playlist:', result.rows[0].name);
        res.json({ message: 'Playlist deleted successfully' });
    } catch (error) {
        console.error('🔴 SERVER: Error deleting playlist:', error);
        res.status(500).json({ error: 'Failed to delete playlist' });
    }
});

// ==================== QR CODE ENDPOINTS ====================
console.log('🔧 Registering QR code endpoints...');

// Get all QR codes for user
app.get('/api/qr-codes', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Get QR codes endpoint hit');
    try {
        const result = await pool.query(
            'SELECT * FROM qr_codes WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.userId]
        );

        console.log('🔴 SERVER: Found QR codes:', result.rows.length);
        res.json(result.rows);
    } catch (error) {
        console.error('🔴 SERVER: Get QR codes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create QR code
app.post('/api/qr-codes', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Create QR code endpoint hit');
    try {
        const { name, url, options = {} } = req.body;

        if (!name || !url) {
            return res.status(400).json({ error: 'Name and URL are required' });
        }

        const result = await pool.query(
            `INSERT INTO qr_codes (user_id, name, url, options, created_at, updated_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING *`,
            [req.user.userId, name, url, JSON.stringify(options)]
        );

        console.log('🔴 SERVER: QR code created:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('🔴 SERVER: Create QR code error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update QR code
app.put('/api/qr-codes/:id', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Update QR code endpoint hit');
    try {
        const { id } = req.params;
        const { name, url, options, is_active } = req.body;

        const result = await pool.query(
            `UPDATE qr_codes
             SET name = COALESCE($1, name),
                 url = COALESCE($2, url),
                 options = COALESCE($3, options),
                 is_active = COALESCE($4, is_active),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5 AND user_id = $6
             RETURNING *`,
            [name, url, options ? JSON.stringify(options) : null, is_active, id, req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'QR code not found' });
        }

        console.log('🔴 SERVER: QR code updated:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('🔴 SERVER: Update QR code error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete QR code
app.delete('/api/qr-codes/:id', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Delete QR code endpoint hit');
    try {
        const { id } = req.params;

        console.log('🔴 SERVER: Attempting to delete QR code:', {
            id: id,
            userId: req.user.userId,
            userDetails: req.user
        });

        // First check if the QR code exists and belongs to the user
        const checkResult = await pool.query(
            'SELECT id, name FROM qr_codes WHERE id = $1 AND user_id = $2',
            [id, req.user.userId]
        );

        if (checkResult.rows.length === 0) {
            console.log('🔴 SERVER: QR code not found or does not belong to user:', id);
            return res.status(404).json({ error: 'QR code not found or access denied' });
        }

        const qrCodeToDelete = checkResult.rows[0];
        console.log('🔴 SERVER: Found QR code to delete:', qrCodeToDelete);

        // Now delete the QR code
        const deleteResult = await pool.query(
            'DELETE FROM qr_codes WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, req.user.userId]
        );

        if (deleteResult.rows.length === 0) {
            console.log('🔴 SERVER: Delete operation failed for QR code:', id);
            return res.status(500).json({ error: 'Failed to delete QR code' });
        }

        const deletedQrCode = deleteResult.rows[0];
        console.log('🔴 SERVER: QR code deleted successfully:', {
            id: deletedQrCode.id,
            name: deletedQrCode.name,
            user_id: deletedQrCode.user_id
        });

        res.json({
            success: true,
            message: 'QR code deleted successfully',
            deletedQrCode: {
                id: deletedQrCode.id,
                name: deletedQrCode.name
            }
        });
    } catch (error) {
        console.error('🔴 SERVER: Delete QR code error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});


// ==================== MEDIA ENDPOINTS ====================

// Get all media files for user
app.get('/api/media', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Get media files endpoint hit');
    try {
        const result = await pool.query(
            'SELECT * FROM media_files WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.userId]
        );

        console.log('🔴 SERVER: Found media files:', result.rows.length);
        res.json(result.rows);
    } catch (error) {
        console.error('🔴 SERVER: Get media files error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upload media file
app.post('/api/media', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Upload media file endpoint hit');
    try {
        const {
            title,
            filePath,
            url,
            filename,
            fileType,
            contentType,
            filesize,
            duration,
            uniqueId
        } = req.body;

        if (!title || !filePath || !fileType) {
            return res.status(400).json({ error: 'Title, file path, and file type are required' });
        }

        // Check file size limit (1GB)
        const maxSize = 1024 * 1024 * 1024; // 1GB
        if (filesize && filesize > maxSize) {
            return res.status(413).json({
                error: 'File too large',
                message: `File size ${Math.round((filesize / 1024 / 1024) * 100) / 100}MB exceeds the 1GB limit`
            });
        }

        const result = await pool.query(`INSERT INTO media_files (
                user_id, title, file_path, url, filename, file_type,
                content_type, filesize, duration, unique_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            RETURNING *`,
            [
                req.user.userId, title, filePath, url || filePath, filename,
                fileType, contentType, filesize, duration, uniqueId
            ]
        );

        console.log('🔴 SERVER: Media file uploaded:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('🔴 SERVER: Upload media file error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get media file by ID
app.get('/api/media/:id', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Get media file by ID endpoint hit');
    try {
        const { id } = req.params;

        const result = await pool.query(
            'SELECT * FROM media_files WHERE id = $1 AND user_id = $2',
            [id, req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Media file not found' });
        }

        console.log('🔴 SERVER: Found media file:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('🔴 SERVER: Get media file by ID error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete media file
app.delete('/api/media/:id', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Delete media file endpoint hit');
    try {
        const { id } = req.params;

        console.log('🔴 SERVER: Attempting to delete media file:', {
            id: id,
            userId: req.user.userId,
            userDetails: req.user
        });

        // First check if the file exists and belongs to the user
        const checkResult = await pool.query(
            'SELECT id, title FROM media_files WHERE id = $1 AND user_id = $2',
            [id, req.user.userId]
        );

        if (checkResult.rows.length === 0) {
            console.log('🔴 SERVER: Media file not found or does not belong to user:', id);
            return res.status(404).json({ error: 'Media file not found or access denied' });
        }

        const fileToDelete = checkResult.rows[0];
        console.log('🔴 SERVER: Found file to delete:', fileToDelete);

        // Now delete the file
        const deleteResult = await pool.query(
            'DELETE FROM media_files WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, req.user.userId]
        );

        if (deleteResult.rows.length === 0) {
            console.log('🔴 SERVER: Delete operation failed for file:', id);
            return res.status(500).json({ error: 'Failed to delete media file' });
        }

        const deletedFile = deleteResult.rows[0];
        console.log('🔴 SERVER: Media file deleted successfully:', {
            id: deletedFile.id,
            title: deletedFile.title,
            user_id: deletedFile.user_id
        });

        res.json({
            success: true,
            message: 'Media file deleted successfully',
            deletedFile: {
                id: deletedFile.id,
                title: deletedFile.title
            }
        });
    } catch (error) {
        console.error('🔴 SERVER: Delete media file error:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// ==================== ANALYTICS ENDPOINTS ====================

// Get analytics summary
app.get('/api/analytics/summary', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Analytics summary endpoint hit');
    try {
        const qrCodeCount = await pool.query(
            'SELECT COUNT(*) as count FROM qr_codes WHERE user_id = $1',
            [req.user.userId]
        );

        const totalScans = await pool.query(
            'SELECT SUM(scan_count) as total FROM qr_codes WHERE user_id = $1',
            [req.user.userId]
        );

        const analytics = {
            qrCodes: parseInt(qrCodeCount.rows[0].count),
            totalScans: parseInt(totalScans.rows[0].total || 0),
            activeQRs: parseInt(qrCodeCount.rows[0].count) // Assuming all QR codes are active count
        };

        console.log('🔴 SERVER: Analytics summary:', analytics);
        res.json(analytics);
    } catch (error) {
        console.error('🔴 SERVER: Analytics summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// Server restart endpoint for health monitoring
app.post('/api/admin/restart', authenticateToken, async (req, res) => {
    try {
        if (!req.user.isAdmin && req.user.username !== 'djjetfuel') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        console.log('🔄 Admin restart request received from:', req.user.username);

        res.json({
            message: 'Server restart initiated',
            timestamp: new Date().toISOString()
        });

        // Graceful restart after response
        setTimeout(() => {
            console.log('🔄 Performing graceful restart...');
            process.kill(process.pid, 'SIGTERM');
        }, 1000);

    } catch (error) {
        console.error('❌ Admin restart error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all users (admin only) - legacy endpoint
app.get('/api/admin/users', authenticateToken, async (req, res) => {
    console.log('🔴 SERVER: Get admin users endpoint hit (legacy)');
    console.log('🔴 SERVER: User requesting:', req.user);

    try {
        if (!req.user.isAdmin && req.user.username !== 'djjetfuel') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const result = await pool.query(
            `SELECT id, email, username, first_name, last_name,
                    is_email_verified, subscription_tier, is_new_user,
                    is_admin,
                    created_at, updated_at
               FROM users
               ORDER BY created_at DESC`
        );

        // Transform to match frontend expectations
        const users = result.rows.map(user => ({
            id: user.id,
            email: user.email,
            username: user.username || user.email?.split('@')[0] || 'Unknown',
            firstName: user.first_name,
            lastName: user.last_name,
            isAdmin: user.is_admin || false,
            subscriptionTier: user.subscription_tier || 'free',
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            status: 'confirmed', // Assuming these are fixed values for legacy endpoint
            isPending: false,
            isSuspended: false,
            // Add required permissions fields
            canViewAnalytics: true,
            canManagePlaylists: true,
            canEditPlaylists: true,
            canUploadMedia: true,
            canGenerateCodes: true,
            canAccessStore: true,
            canViewFanmail: true,
            canManageQRCodes: true,
            maxPlaylists: 50,
            maxVideos: 100,
            maxAudioFiles: 100,
            maxActivationCodes: 50,
            maxProducts: 25,
            maxQrCodes: 50,
            maxSlideshows: 10,
            lastActive: user.updated_at
        }));

        console.log('🔴 SERVER: Found users:', users.length);
        res.json(users);
    } catch (error) {
        console.error('🔴 SERVER: Get admin users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== END OF ROUTE DEFINITIONS ====================


// Database initialization function
async function initializeDatabase() {
    try {
        console.log('Initializing database...');

        // Create tables (users, playlists, media_files, playlist_media, qr_codes)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                first_name VARCHAR(100),
                last_name VARCHAR(100),
                is_email_verified BOOLEAN DEFAULT false,
                subscription_tier VARCHAR(20) DEFAULT 'free',
                is_new_user BOOLEAN DEFAULT true,
                is_admin BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                verification_token VARCHAR(255)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS playlists (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                requires_activation_code BOOLEAN DEFAULT FALSE,
                is_public BOOLEAN DEFAULT FALSE,
                instagram_url VARCHAR(500),
                twitter_url VARCHAR(500),
                facebook_url VARCHAR(500),
                youtube_url VARCHAR(500),
                website_url VARCHAR(500),
                product_link VARCHAR(500),
                product_link_title VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS media_files (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                file_path TEXT NOT NULL,
                url TEXT,
                filename VARCHAR(255),
                file_type VARCHAR(50) NOT NULL,
                content_type VARCHAR(100),
                filesize INTEGER,
                duration INTEGER,
                unique_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS playlist_media (
                id SERIAL PRIMARY KEY,
                playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
                media_id INTEGER REFERENCES media_files(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(playlist_id, media_id)
            )
        `);

        // Create qr_codes table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS qr_codes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                url TEXT NOT NULL,
                short_url VARCHAR(255),
                is_active BOOLEAN DEFAULT true,
                scan_count INTEGER DEFAULT 0,
                options JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // Admin user logic
        console.log('Checking for admin user...');
        const adminUser = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            ['djjetfuel@gmail.com']
        );

        if (adminUser.rows.length === 0) {
            console.log('Creating admin user...');
            const adminPassword = await bcrypt.hash('admin123!', 12);

            await pool.query(
                `INSERT INTO users (email, username, password_hash, is_email_verified, subscription_tier, is_admin, is_new_user, created_at, updated_at)
                 VALUES ($1, $2, $3, true, 'premium', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                ['djjetfuel@gmail.com', 'djjetfuel', adminPassword]
            );
            console.log('✅ Admin user created: djjetfuel@gmail.com / admin123!');
        } else {
            console.log('✅ Admin user already exists');

            // Always reset admin password and ensure proper permissions on startup
            const adminPassword = await bcrypt.hash('admin123!', 12);

            await pool.query(
                `UPDATE users
                 SET is_admin = true,
                     subscription_tier = 'premium',
                     is_email_verified = true,
                     password_hash = $1,
                     is_new_user = false,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE email = $2`,
                [adminPassword, 'djjetfuel@gmail.com']
            );
            console.log('✅ Admin user password reset to: admin123! and permissions updated');
        }

        console.log('Database tables initialized successfully');

        // Create dev account if it doesn't exist OR reset password if it does
        try {
            const existingDev = await pool.query(
                'SELECT id FROM users WHERE email = $1',
                ['djjetfuel@gmail.com']
            );

            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash('Kerrie321', saltRounds);

            if (existingDev.rows.length === 0) {
                await pool.query(
                    `INSERT INTO users (email, username, password_hash, is_email_verified, subscription_tier, is_new_user, is_admin, created_at, updated_at)
                     VALUES ($1, $2, $3, true, 'premium', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    ['djjetfuel@gmail.com', 'djjetfuel', hashedPassword]
                );

                console.log('✅ Dev account created for djjetfuel@gmail.com with password Kerrie321');
            } else {
                // Update existing account with correct password
                await pool.query(
                    `UPDATE users
                     SET password_hash = $1, is_email_verified = true, subscription_tier = 'premium', is_admin = true, updated_at = CURRENT_TIMESTAMP
                     WHERE email = $2`,
                    [hashedPassword, 'djjetfuel@gmail.com']
                );

                console.log('✅ Dev account password reset for djjetfuel@gmail.com to Kerrie321');
            }
        } catch (devError) {
            console.error('Dev account creation/update error:', devError);
        }
    } catch (error) {
        console.error('Database initialization error:', error);
        // Don't exit the process, just log the error
    }
}


// --- Utility functions (smartPortCleanup, checkPortInUse, findAvailablePort) ---
// These functions were declared before, but might need to be moved for scope or clarity.
// I'll keep them here for now, as their content is self-contained.

// Enhanced port cleanup with automatic port detection
async function smartPortCleanup() {
    try {
        console.log('🧹 Starting smart port cleanup for port', PORT);
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        // Clean up both current port and common conflicting ports
        // Check current port and 5001 for cleanup
        const portsToCheck = [PORT, 5001].filter((port, index, arr) => arr.indexOf(port) === index);

        for (const port of portsToCheck) {
            try {
                const { stdout } = await execAsync(`lsof -ti:${port} || true`);
                if (stdout.trim()) {
                    const pids = stdout.trim().split('\n').filter(pid => pid.trim());
                    console.log(`🧹 Found processes on port ${port}:`, pids);

                    for (const pid of pids) {
                        try {
                            await execAsync(`kill -TERM ${pid}`);
                            console.log(`🧹 Gracefully terminated process ${pid} on port ${port}`);
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            // Check if process is still running
                            try {
                                await execAsync(`kill -0 ${pid}`);
                                // Still running, force kill
                                await execAsync(`kill -9 ${pid}`);
                                console.log(`🧹 Force killed process ${pid}`);
                            } catch {
                                // Process already terminated
                                console.log(`🧹 Process ${pid} terminated gracefully`);
                            }
                        } catch (err) {
                            console.log(`🧹 Could not terminate process ${pid}:`, err.message);
                        }
                    }
                }
            } catch (error) {
                // Ignore lsof errors
            }
        }

        // Strategy 2: Kill by pattern (clean up any server processes)
        const patterns = [
            'node.*simple-server',
            'node.*stable-server',
            'node.*index.js',
            'node.*server'
        ];

        for (const pattern of patterns) {
            try {
                await execAsync(`pkill -f "${pattern}" || true`);
                console.log('🧹 Cleaned up processes matching:', pattern);
            } catch (error) {
                // Ignore errors
            }
        }

        // Wait for cleanup to take effect
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify target port is now free
        const isPortInUse = await checkPortInUse(PORT);
        if (isPortInUse) {
            console.warn('⚠️ Port', PORT, 'is still in use after cleanup');
            // Try alternative port (original logic, will reuse if needed)
            const alternativePort = await findAvailablePort(PORT + 1);
            if (alternativePort) {
                console.log('🔄 Switching to alternative port:', alternativePort);
                process.env.PORT = alternativePort.toString(); // Ensure it's a string for process.env
                return alternativePort;
            } else {
                // If no alternative port found, stick to original PORT
                return PORT;
            }
        } else {
            console.log('✅ Port', PORT, 'is now available');
        }

        return PORT; // Return the current PORT if no alternative needed
    } catch (error) {
        console.log('🧹 Port cleanup completed with warnings:', error.message);
        return PORT;
    }
}

// Check if a port is in use
async function checkPortInUse(port) {
    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);

        const { stdout } = await execAsync(`lsof -ti:${port} || true`);
        return stdout.trim().length > 0;
    } catch (error) {
        return false;
    }
}

// Find an available port starting from a given port
async function findAvailablePort(startPort) {
    for (let port = startPort; port <= startPort + 10; port++) {
        const inUse = await checkPortInUse(port);
        if (!inUse) {
            return port;
        }
    }
    return null;
}

// Aggressive port cleanup (defined as it was referenced earlier)
async function aggressivePortCleanup() {
    console.log('💥 Performing aggressive port cleanup...');
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);

    try {
        // Kill all node processes related to this project
        await execAsync(`pkill -f "node.*simple-server" || true`);
        await execAsync(`pkill -f "node.*stable-server" || true`);
        await execAsync(`pkill -f "node.*index.js" || true`);
        await execAsync(`pkill -f "node.*server" || true`);
        // You might add specific commands to kill processes on PORT if needed here.
        await new Promise(resolve => setTimeout(resolve, 2000)); // Give time to kill
        console.log('💥 Aggressive cleanup complete.');
    } catch (error) {
        console.error('❌ Aggressive cleanup failed:', error.message);
    }
}


// --- Self-healing server health check ---
function startHealthMonitoring() {
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
    }

    healthCheckTimer = setInterval(async () => {
        try {
            // Check if server is still listening
            if (!serverInstance || !serverInstance.listening) {
                console.log('⚠️ Server health check: Server not listening');
                await attemptServerRestart();
                return;
            }

            // Check database connection
            try {
                await pool.query('SELECT 1');
                console.log('💚 Health check: Server and database OK');
                restartAttempts = 0; // Reset on successful check
            } catch (dbError) {
                console.log('⚠️ Health check: Database connection issue');
                // Don't restart for database issues, just log
            }
        } catch (error) {
            console.error('❌ Health check error:', error);
            await attemptServerRestart();
        }
    }, HEALTH_CHECK_INTERVAL);
}

// Self-healing restart mechanism
async function attemptServerRestart() {
    if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
        console.error(`❌ Maximum restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Manual intervention required.`);
        return;
    }

    restartAttempts++;
    console.log(`🔄 Attempting server restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS}...`);

    try {
        // Stop current server
        if (serverInstance) {
            serverInstance.close(() => {
                console.log('🚫 Existing HTTP server closed for restart');
            });
            // Give time for close event to propagate if needed
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Clear health monitoring
        if (healthCheckTimer) {
            clearInterval(healthCheckTimer);
            healthCheckTimer = null; // Clear reference
        }

        // Wait before restart
        await new Promise(resolve => setTimeout(resolve, RESTART_DELAY));

        // Cleanup port
        const actualPort = await smartPortCleanup();
        // Update the global PORT constant if an alternative was found
        if (actualPort !== PORT) {
            // Note: This won't change the constant directly, but process.env.PORT is updated
            // The next server startup will use the new process.env.PORT.
            console.log(`Updated process.env.PORT to ${actualPort} for next attempt.`);
        }


        // Restart server
        await startServer(); // This will use the potentially updated process.env.PORT
    } catch (error) {
        console.error(`❌ Restart attempt ${restartAttempts} failed:`, error);

        // Try again after delay
        setTimeout(() => attemptServerRestart(), RESTART_DELAY * 2);
    }
}

// Enhanced graceful shutdown handlers
const gracefulShutdown = async (signal) => {
    console.log(`🛑 ${signal} received, starting graceful shutdown...`);

    // Clear health monitoring
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        console.log('🔄 Health monitoring stopped');
    }

    // Close server
    if (serverInstance) {
        serverInstance.close(() => {
            console.log('🚫 HTTP server closed');
            // Only exit here once everything is truly closed
            pool.end().then(() => {
                console.log('📊 Database pool closed');
                console.log('✅ Graceful shutdown complete');
                process.exit(0);
            }).catch(dbError => {
                console.error('❌ Error closing database pool during shutdown:', dbError);
                process.exit(1); // Exit with error if pool doesn't close
            });
        });
    } else {
        // If serverInstance was never set (e.g. startup failed early)
        // ensure database is closed before exiting
        if (pool) {
            await pool.end();
            console.log('📊 Database pool closed');
        }
        console.log('✅ Graceful shutdown complete (server not running)');
        process.exit(0);
    }
};


// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // For unhandled rejections, attempt a restart
    // setTimeout(() => attemptServerRestart(), 1000); // Consider if you want to restart on every unhandled rejection
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // For uncaught exceptions, we should restart
    setTimeout(() => attemptServerRestart(), 1000);
});


// Main server startup function
async function startServer() {
    try {
        // Ensure that `app` is correctly instantiated and routes are attached before this point.
        // The routes are now defined *before* this function, which is the fix.

        console.log(`🚀 Starting server (attempt ${restartAttempts + 1})`);

        // Initialize database (if not already done)
        await initializeDatabase(); // This is called once by validateAndStart, but also here on restart attempts.
                                   // Ensure it's idempotent. It is, so this is fine.

        // Start the server with enhanced error handling
        // Make sure the PORT constant accurately reflects process.env.PORT if it was changed by smartPortCleanup
        const currentPort = parseInt(process.env.PORT || PORT);

        serverInstance = app.listen(currentPort, '0.0.0.0', () => { // Use currentPort for listening
            console.log(`✅ Production server running on port ${currentPort}`);
            console.log(`📍 API available at: http://0.0.0.0:${currentPort}/api`);
            console.log(`🌐 External API URL: https://${process.env.REPLIT_DEV_DOMAIN || 'YOUR_REPLIT_DOMAIN'}:${currentPort}/api`);
            console.log(`❤️ Health check URL: https://${process.env.REPLIT_DEV_DOMAIN || 'YOUR_REPLIT_DOMAIN'}:${currentPort}/api/health`);
            console.log(`🔒 Process ID: ${process.pid}`);
            console.log(`🔄 Restart attempts: ${restartAttempts}`);
            console.log(`🛡️ Self-healing enabled`);

            // Reset restart count on successful start
            restartAttempts = 0;

            // Start health monitoring
            startHealthMonitoring();
        });

        // Enhanced error handling with self-healing
        serverInstance.on('error', async (error) => {
            console.error('❌ Server error:', error);

            if (error.code === 'EADDRINUSE') {
                console.error('❌ Port', currentPort, 'is already in use');
                await attemptServerRestart();
            } else {
                console.error('❌ Unhandled server error:', error);
                await attemptServerRestart();
            }
        });

        return serverInstance; // Return the server instance
    } catch (error) {
        console.error('❌ Failed to start server in startServer function:', error);
        // This catch block is for errors *before* app.listen or immediate listen errors
        await attemptServerRestart();
    }
}

// Startup validation and initialization
async function validateAndStart() {
    try {
        console.log('🔍 Starting server validation...');

        // Validate environment
        console.log('🔍 Checking environment variables...');
        console.log('  - PORT:', PORT); // Note: This PORT is the initial constant, not necessarily the actual running port
        console.log('  - REPLIT_DEV_DOMAIN:', process.env.REPLIT_DEV_DOMAIN || 'Not set');
        console.log('  - DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
        console.log('  - JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Using fallback');

        // Check if port is available and clean up if necessary
        // This will also update process.env.PORT if an alternative is found
        console.log(`🔍 Checking if port ${PORT} is available...`);
        const initialPortCheck = await smartPortCleanup();
        if (initialPortCheck !== PORT) {
             console.log(`Initial port check led to use of alternative port: ${initialPortCheck}`);
        } else {
            console.log(`✅ Port ${PORT} is available (initial check)`);
        }


        // Test database connection early
        console.log('🔍 Testing database connection...');
        try {
            await pool.query('SELECT 1');
            console.log('✅ Database connection test passed');
        } catch (error) {
            console.warn('⚠️ Database connection test failed:', error.message);
            console.log('🔄 Server will continue and retry database connection...');
        }

        console.log('✅ Validation complete. Starting production server...');
        await startServer(); // Call the main server startup

    } catch (error) {
        console.error('❌ Validation failed:', error);
        // If validation itself fails, attempt to start the server anyway
        // This might be a loop if startServer also fails, but for robustness
        console.log('🔄 Attempting to start server anyway (after validation failure)...');
        await startServer();
    }
}

// Start the production server with validation when the script is run
// This is the entry point for your server
validateAndStart();
