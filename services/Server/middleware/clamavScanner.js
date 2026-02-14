/**
 * ClamAV Malware Scanner
 * Scans file buffers for malware before allowing upload to S3.
 * Supports direct clamd TCP connection (INSTREAM protocol) or REST API.
 */

const net = require('net');
const axios = require('axios');
const FormData = require('form-data');

const MIN_SCAN_TIMEOUT_MS = 180000; // never lower than 3 minutes
const SCAN_TIMEOUT_MS = Math.max(parseInt(process.env.SCAN_TIMEOUT_MS || '180000', 10), MIN_SCAN_TIMEOUT_MS);
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for INSTREAM

/**
 * Large uploads (especially video) need longer scan windows.
 * We keep a conservative floor from env, then scale by file size.
 */
function getScanTimeoutMs(bufferLength = 0) {
  const MB = 1024 * 1024;
  const sizeInMb = Math.max(1, Math.ceil(bufferLength / MB));
  const sizeBasedTimeout = Math.ceil(sizeInMb / 25) * 45000; // +45s per 25MB
  return Math.max(SCAN_TIMEOUT_MS, sizeBasedTimeout);
}

function isTimeoutError(err) {
  const message = String(err?.message || '').toLowerCase();
  return message.includes('timeout');
}

/**
 * Parse ClamAV URL - supports:
 * - tcp://host:port (default 3310)
 * - http://host:port (REST API)
 */
function parseClamAvConfig() {
  const url = process.env.CLAMAV_URL || '';
  const enabled = process.env.ENABLE_MALWARE_SCAN !== 'false';

  if (!url) {
    return { enabled: false, mode: null };
  }

  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return { enabled, mode: 'rest', url: url.replace(/\/$/, '') };
    }
    if (url.startsWith('tcp://')) {
      const parsed = new URL(url);
      return {
        enabled,
        mode: 'tcp',
        host: parsed.hostname,
        port: parseInt(parsed.port || '3310', 10)
      };
    }
    // Assume host:port format
    const [host, port] = url.split(':');
    return {
      enabled,
      mode: 'tcp',
      host: host || 'localhost',
      port: parseInt(port || '3310', 10)
    };
  } catch (e) {
    return { enabled: false, mode: null };
  }
}

const config = parseClamAvConfig();

/**
 * Scan buffer via clamd INSTREAM protocol (TCP socket)
 */
function scanViaClamd(buffer, filename) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const { host, port } = config;
    const timeoutMs = getScanTimeoutMs(buffer?.length || 0);

    const client = new net.Socket();
    client.setTimeout(timeoutMs);

    let responseData = '';

    client.on('data', (data) => {
      responseData += data.toString();
    });

    client.on('close', () => {
      const scanTime = Date.now() - startTime;
      const response = responseData.trim();

      if (response.includes('FOUND')) {
        const match = response.match(/stream:\s*(.+?)\s+FOUND/);
        const virusName = match ? match[1].trim() : 'Unknown';
        resolve({
          infected: true,
          viruses: [virusName],
          scanTime,
          raw: response
        });
      } else if (response.includes('OK')) {
        resolve({
          infected: false,
          viruses: [],
          scanTime,
          raw: response
        });
      } else if (response.includes('ERROR')) {
        reject(new Error(`ClamAV error: ${response}`));
      } else {
        resolve({
          infected: false,
          viruses: [],
          scanTime,
          raw: response
        });
      }
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('ClamAV scan timeout'));
    });

    client.connect(port, host, () => {
      client.write('zINSTREAM\0');

      let offset = 0;
      while (offset < buffer.length) {
        const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
        const sizeBuf = Buffer.alloc(4);
        sizeBuf.writeUInt32BE(chunk.length, 0);
        client.write(sizeBuf);
        client.write(chunk);
        offset += chunk.length;
      }

      const endBuf = Buffer.alloc(4);
      endBuf.writeUInt32BE(0, 0);
      client.write(endBuf);
      client.end();
    });
  });
}

/**
 * Scan buffer via REST API (e.g., clamav-rest, clamav-rest-api)
 */
async function scanViaRest(buffer, filename) {
  const startTime = Date.now();
  const timeoutMs = getScanTimeoutMs(buffer?.length || 0);
  const form = new FormData();
  form.append('file', buffer, { filename: filename || 'scan.bin' });

  const response = await axios.post(`${config.url}/scan`, form, {
    headers: form.getHeaders(),
    timeout: timeoutMs,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  const scanTime = Date.now() - startTime;
  const data = response.data;

  if (typeof data === 'object') {
    return {
      infected: data.infected || data.status === ' virus' || false,
      viruses: data.viruses || data.details || [],
      scanTime,
      raw: data
    };
  }

  const infected = typeof data === 'string' && data.includes('FOUND');
  return {
    infected,
    viruses: infected ? [data] : [],
    scanTime,
    raw: data
  };
}

/**
 * Scan a file buffer for malware
 * @param {Buffer} fileBuffer - File buffer to scan
 * @param {string} filename - Original filename (for logging)
 * @returns {Promise<{infected: boolean, viruses: string[], scanTime: number}>}
 */
async function scanBuffer(fileBuffer, filename = 'unknown') {
  if (!config.enabled || !config.mode) {
    return { infected: false, viruses: [], scanTime: 0, skipped: true };
  }

  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('Invalid file buffer');
  }

  const scanOnce = async () => {
    if (config.mode === 'tcp') {
      return scanViaClamd(fileBuffer, filename);
    }
    if (config.mode === 'rest') {
      return scanViaRest(fileBuffer, filename);
    }
    return { infected: false, viruses: [], scanTime: 0, skipped: true };
  };

  try {
    return await scanOnce();
  } catch (err) {
    // One retry for transient scanner/network timeout.
    if (isTimeoutError(err)) {
      console.warn('ClamAV scan timeout, retrying once:', err.message);
      try {
        return await scanOnce();
      } catch (retryErr) {
        console.error('ClamAV scan error after retry:', retryErr.message);
        throw retryErr;
      }
    }
    console.error('ClamAV scan error:', err.message);
    throw err;
  }
}

/**
 * Check if ClamAV scanning is configured and enabled
 */
function isConfigured() {
  return config.enabled && config.mode !== null;
}

/**
 * Express middleware to scan uploaded file
 * Expects req.file from multer. On infection: 403, quarantine, no upload.
 */
async function scanUploadMiddleware(req, res, next) {
  if (!req.file || !req.file.buffer) {
    return next();
  }

  if (!isConfigured()) {
    return next();
  }

  try {
    const result = await scanBuffer(req.file.buffer, req.file.originalname);

    if (result.skipped) {
      return next();
    }

    req.clamavResult = result;

    if (result.infected) {
      return res.status(403).json({
        error: 'File could not be processed. Please upload a different file.',
        code: 'FILE_REJECTED'
      });
    }

    next();
  } catch (err) {
    console.error('Malware scan failed:', err.message);
    return res.status(503).json({
      error: 'File scanning service is temporarily unavailable. Please try again later.',
      code: 'SCAN_SERVICE_UNAVAILABLE'
    });
  }
}

module.exports = {
  scanBuffer,
  scanUploadMiddleware,
  isConfigured,
  getConfig: () => ({ ...config })
};
