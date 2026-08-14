'use strict';
/**
 * Shared authentication middleware extracted from main.js.
 * Used by the new router modules so they don't depend on main.js scope.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Verifies the Bearer token and sets req.user.
 * Returns 401 on missing or invalid token.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    try {
      const { authenticationFailureHandler } = require('./config/security');
      authenticationFailureHandler(req, 'No token provided');
    } catch (_) { /* security module optional */ }
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      try {
        const { authenticationFailureHandler } = require('./config/security');
        authenticationFailureHandler(req, err.message);
      } catch (_) { /* security module optional */ }
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };
