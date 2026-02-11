/**
 * File Magic Number Validation
 * Validates file contents match declared MIME types using magic bytes.
 * Prevents attackers from renaming malicious files (e.g., malware.exe → image.jpg).
 */

const path = require('path');

/**
 * Magic byte signatures for file type validation.
 * Format: { ext: { offset: number, bytes: number[] } } or { ext: number[] } for offset 0
 */
const MAGIC_SIGNATURES = {
  // Images
  jpeg: [0xFF, 0xD8, 0xFF],
  jpg: [0xFF, 0xD8, 0xFF],
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  gif: [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]], // GIF87a or GIF89a
  webp: { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], subCheck: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } }, // RIFF....WEBP

  // Video - MP4/MOV have ftyp at offset 4
  mp4: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
  mov: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
  webm: [0x1A, 0x45, 0xDF, 0xA3],
  avi: { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], subCheck: { offset: 8, bytes: [0x41, 0x56, 0x49, 0x20] } }, // RIFF....AVI
  wmv: { offset: 0, bytes: [0x30, 0x26, 0xB2, 0x75] },
  flv: [0x46, 0x4C, 0x56],
  mkv: [0x1A, 0x45, 0xDF, 0xA3],

  // Audio
  mp3: [
    [0x49, 0x44, 0x33],           // ID3 tag
    [0xFF, 0xFB],                // MPEG frame sync
    [0xFF, 0xFA],                // MPEG frame sync
    [0xFF, 0xF3],
    [0xFF, 0xF2]
  ],
  wav: { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], subCheck: { offset: 8, bytes: [0x57, 0x41, 0x56, 0x45] } }, // RIFF....WAVE
  m4a: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp (same as mp4)
  ogg: [0x4F, 0x67, 0x67, 0x53], // OggS

  // App packages (ZIP-based - IPA and APK are ZIP archives)
  ipa: [0x50, 0x4B, 0x03, 0x04], // PK.. (ZIP)
  apk: [0x50, 0x4B, 0x03, 0x04], // PK.. (ZIP)
};

/**
 * Check if buffer matches signature at given offset
 */
function matchesSignature(buffer, offset, bytes) {
  if (!buffer || buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

/**
 * Validate buffer against a single signature (array of bytes)
 */
function validateSimple(buffer, sig) {
  if (Array.isArray(sig[0])) {
    return sig.some(s => matchesSignature(buffer, 0, s));
  }
  return matchesSignature(buffer, 0, sig);
}

/**
 * Validate buffer against complex signature (with offset and/or subCheck)
 */
function validateComplex(buffer, sig) {
  if (Array.isArray(sig)) return validateSimple(buffer, sig);
  if (typeof sig !== 'object') return false;

  const offset = sig.offset || 0;
  if (!matchesSignature(buffer, offset, sig.bytes)) return false;
  if (sig.subCheck) {
    return matchesSignature(buffer, sig.subCheck.offset, sig.subCheck.bytes);
  }
  return true;
}

/**
 * Validate file buffer matches the expected file type based on extension
 * @param {Buffer} fileBuffer - The file buffer to validate
 * @param {string} filename - Original filename (used to determine expected type)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFileMagic(fileBuffer, filename) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    return { valid: false, error: 'Invalid file buffer' };
  }

  if (fileBuffer.length < 12) {
    return { valid: false, error: 'File too small to validate' };
  }

  const ext = path.extname(filename || '').toLowerCase().replace(/^\./, '') || '';
  const sig = MAGIC_SIGNATURES[ext];

  if (!sig) {
    return { valid: true }; // Unknown type - let other validation handle it
  }

  const valid = validateComplex(fileBuffer, sig);
  if (!valid) {
    return {
      valid: false,
      error: `File content does not match declared type. The file may have been renamed or is corrupted.`
    };
  }

  return { valid: true };
}

/**
 * Express middleware to validate uploaded file magic bytes
 * Expects req.file to exist (from multer) with buffer and originalname
 */
function validateUploadMagic(req, res, next) {
  if (!req.file || !req.file.buffer) {
    return next();
  }

  const result = validateFileMagic(req.file.buffer, req.file.originalname);

  if (!result.valid) {
    return res.status(400).json({
      error: result.error || 'File validation failed',
      code: 'FILE_CONTENT_MISMATCH'
    });
  }

  next();
}

module.exports = {
  validateFileMagic,
  validateUploadMagic,
  MAGIC_SIGNATURES
};
