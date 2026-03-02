const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Google OAuth2 client
const googleClientId = process.env.GOOGLE_CLIENT_ID;
console.log('🔧 Google OAuth Client ID configured:', googleClientId ? `${googleClientId.substring(0, 30)}...` : 'NOT SET');
const googleClient = googleClientId 
  ? new OAuth2Client(googleClientId)
  : null;

// Apple JWKS client for verifying tokens
const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
});

/**
 * Verify Google ID token and extract user information
 * @param {string} idToken - Google ID token from client
 * @returns {Promise<{googleId: string, email: string, name?: string, picture?: string}>}
 */
async function verifyGoogleToken(idToken) {
  if (!googleClient) {
    throw new Error('Google OAuth not configured. Please set GOOGLE_CLIENT_ID environment variable.');
  }

  try {
    const audience = process.env.GOOGLE_CLIENT_ID;
    // Only log verification in development to reduce log noise
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Verifying Google token with audience:', audience ? `${audience.substring(0, 30)}...` : 'NOT SET');
    }
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: audience,
    });

    const payload = ticket.getPayload();
    
    if (!payload) {
      throw new Error('Invalid Google token payload');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified || false,
      name: payload.name,
      picture: payload.picture,
      givenName: payload.given_name,
      familyName: payload.family_name,
    };
  } catch (error) {
    console.error('Google token verification error:', error);
    throw new Error('Invalid Google token');
  }
}

/**
 * Get Apple signing key from JWKS
 * @param {string} kid - Key ID from token header
 * @returns {Promise<string>}
 */
function getAppleSigningKey(kid) {
  return new Promise((resolve, reject) => {
    appleJwksClient.getSigningKey(kid, (err, key) => {
      if (err) {
        return reject(err);
      }
      const signingKey = key.getPublicKey();
      resolve(signingKey);
    });
  });
}

/**
 * Verify Apple identity token and extract user information
 * @param {string} identityToken - Apple identity token from client
 * @param {string} nonce - Nonce used during Apple sign-in (optional, for additional security)
 * @returns {Promise<{appleId: string, email?: string, emailVerified?: boolean}>}
 */
async function verifyAppleToken(identityToken, nonce = null) {
  // Define expected audiences outside try so catch can reference them
  const expectedAudiences = [
    process.env.APPLE_CLIENT_ID || process.env.APPLE_SERVICE_ID, // Service ID for web
    'com.peritus00.merchtech', // Bundle ID for iOS native
  ].filter(Boolean);

  try {
    // Decode token header to get key ID
    const decoded = jwt.decode(identityToken, { complete: true });

    if (!decoded || !decoded.header || !decoded.header.kid) {
      throw new Error('Invalid Apple token format');
    }

    // Get Apple's public key
    const signingKey = await getAppleSigningKey(decoded.header.kid);

    // Verify token signature and issuer (without audience check first)
    let payload;
    payload = jwt.verify(identityToken, signingKey, {
      algorithms: ['RS256'],
      issuer: 'https://appleid.apple.com',
      // Don't check audience here - we'll verify manually
    });

    // Manually verify audience matches one of our expected values
    if (!payload.aud) {
      console.error('Apple token missing audience field');
      throw new Error('Invalid Apple token: missing audience');
    }

    if (!expectedAudiences.includes(payload.aud)) {
      console.error('Apple token audience mismatch:', {
        received: payload.aud,
        expected: expectedAudiences,
      });
      throw new Error(`Invalid Apple token audience. Expected one of: ${expectedAudiences.join(', ')}, but got: ${payload.aud}`);
    }

    // Verify nonce if provided
    if (nonce) {
      if (!payload.nonce) {
        console.warn('Nonce provided but token has no nonce field - may be expected for some Apple token types');
      } else if (payload.nonce !== nonce) {
        console.error('Nonce mismatch');
        throw new Error('Nonce mismatch');
      }
    }

    return {
      appleId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified || false,
    };
  } catch (error) {
    console.error('Apple token verification error:', error.message);

    if (error.message && error.message.includes('audience')) {
      throw new Error(`Invalid Apple token audience. Expected one of: ${expectedAudiences.join(', ')}`);
    }

    throw new Error('Invalid Apple token');
  }
}

/**
 * Find or create user by social provider
 * @param {Object} db - Database connection
 * @param {string} provider - 'google' or 'apple'
 * @param {string} providerId - Provider user ID
 * @param {string} email - User email
 * @param {Object} metadata - Additional provider metadata
 * @returns {Promise<Object>} User object
 */
async function findOrCreateSocialUser(db, provider, providerId, email, metadata = {}) {
  const providerColumn = provider === 'google' ? 'google_id' : 'apple_id';
  
  // First, try to find user by provider ID
  let result = await db.query(
    `SELECT * FROM users WHERE ${providerColumn} = $1`,
    [providerId]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // If not found, try to find by email (for linking existing accounts)
  // Only auto-link when provider email is verified to prevent account takeover
  if (email && metadata.emailVerified) {
    result = await db.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    if (result.rows.length > 0) {
      // Link provider to existing account
      const existingUser = result.rows[0];
      await db.query(
        `UPDATE users SET ${providerColumn} = $1, provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) || $2::jsonb WHERE id = $3`,
        [providerId, JSON.stringify(metadata), existingUser.id]
      );
      
      // Fetch updated user
      result = await db.query('SELECT * FROM users WHERE id = $1', [existingUser.id]);
      return result.rows[0];
    }
  }

  // Create new user
  // Generate a random username if not provided
  const username = metadata.username || `user_${providerId.substring(0, 8)}`;
  
  // Check if username is taken
  let finalUsername = username;
  let usernameCheck = await db.query('SELECT id FROM users WHERE username = $1', [finalUsername]);
  let counter = 1;
  while (usernameCheck.rows.length > 0) {
    finalUsername = `${username}_${counter}`;
    usernameCheck = await db.query('SELECT id FROM users WHERE username = $1', [finalUsername]);
    counter++;
  }

  const insertResult = await db.query(
    `INSERT INTO users (email, username, ${providerColumn}, first_name, last_name, provider_metadata, is_email_verified, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NULL)
     RETURNING *`,
    [
      email || null,
      finalUsername,
      providerId,
      metadata.givenName || metadata.firstName || null,
      metadata.familyName || metadata.lastName || null,
      JSON.stringify(metadata),
      metadata.emailVerified || false,
    ]
  );

  return insertResult.rows[0];
}

/**
 * Link social provider to existing user account
 * @param {Object} db - Database connection
 * @param {number} userId - User ID
 * @param {string} provider - 'google' or 'apple'
 * @param {string} providerId - Provider user ID
 * @param {Object} metadata - Additional provider metadata
 */
async function linkSocialProvider(db, userId, provider, providerId, metadata = {}) {
  const providerColumn = provider === 'google' ? 'google_id' : 'apple_id';
  
  // Check if provider ID is already linked to another account
  const existingLink = await db.query(
    `SELECT id FROM users WHERE ${providerColumn} = $1 AND id != $2`,
    [providerId, userId]
  );

  if (existingLink.rows.length > 0) {
    throw new Error(`${provider} account is already linked to another user`);
  }

  // Link provider to user
  await db.query(
    `UPDATE users 
     SET ${providerColumn} = $1, 
         provider_metadata = COALESCE(provider_metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $3`,
    [providerId, JSON.stringify(metadata), userId]
  );
}

/**
 * Unlink social provider from user account
 * @param {Object} db - Database connection
 * @param {number} userId - User ID
 * @param {string} provider - 'google' or 'apple'
 */
async function unlinkSocialProvider(db, userId, provider) {
  const providerColumn = provider === 'google' ? 'google_id' : 'apple_id';
  
  // Check if user has other auth methods
  const user = await db.query(
    `SELECT password_hash, google_id, apple_id FROM users WHERE id = $1`,
    [userId]
  );

  if (user.rows.length === 0) {
    throw new Error('User not found');
  }

  const userData = user.rows[0];
  const hasPassword = !!userData.password_hash;
  const hasGoogle = !!userData.google_id;
  const hasApple = !!userData.apple_id;

  // Count remaining auth methods after unlinking
  let remainingMethods = 0;
  if (hasPassword) remainingMethods++;
  if (hasGoogle && provider !== 'google') remainingMethods++;
  if (hasApple && provider !== 'apple') remainingMethods++;

  if (remainingMethods === 0) {
    throw new Error('Cannot unlink the last authentication method. Please add a password or another social account first.');
  }

  // Unlink provider
  await db.query(
    `UPDATE users SET ${providerColumn} = NULL WHERE id = $1`,
    [userId]
  );
}

module.exports = {
  verifyGoogleToken,
  verifyAppleToken,
  findOrCreateSocialUser,
  linkSocialProvider,
  unlinkSocialProvider,
};

