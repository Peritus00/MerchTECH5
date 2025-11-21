const { body, param, query, validationResult } = require('express-validator');

// Validation middleware that checks validation results
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// Common validation rules
const validators = {
  // Email validation
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),

  // Password validation
  password: body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  // Username validation
  username: body('username')
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),

  // ID parameter validation
  id: param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),

  // File name validation for presigned URLs (allow spaces and most characters)
  fileName: body('fileName')
    .notEmpty()
    .withMessage('File name is required')
    .isLength({ max: 255 })
    .withMessage('File name must be less than 255 characters')
    .trim()
    .custom((value) => {
      // Prevent path traversal and dangerous characters
      if (value.includes('..') || value.includes('/') || value.includes('\\')) {
        throw new Error('File name cannot contain path separators');
      }
      return true;
    }),

  // Content type validation
  contentType: body('contentType')
    .notEmpty()
    .withMessage('Content type is required')
    .matches(/^(image|audio|video|application)\/[a-zA-Z0-9.+-]+$/)
    .withMessage('Invalid content type'),

  // File size validation (in bytes)
  fileSize: body('fileSize')
    .optional()
    .isInt({ min: 1, max: 5368709120 }) // Max 5GB
    .withMessage('File size must be between 1 byte and 5GB'),

  // S3 key validation
  s3Key: body('s3Key')
    .notEmpty()
    .withMessage('S3 key is required')
    .matches(/^users\/\d+\/media\/[\d]+-[a-zA-Z0-9._-]+$/)
    .withMessage('Invalid S3 key format'),

  // Title validation
  title: body('title')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Title must be less than 255 characters'),

  // Optional string sanitization
  optionalString: (field, maxLength = 1000) => 
    body(field)
      .optional()
      .trim()
      .isLength({ max: maxLength })
      .withMessage(`${field} must be less than ${maxLength} characters`),
};

module.exports = {
  validate,
  validators,
};

