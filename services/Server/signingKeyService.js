'use strict';
/**
 * Event signing key service
 *
 * Generates ECDSA P-256 key pairs per event.
 * Private key: stored in process.env as EVENT_SIGNING_KEY_<key_id> (never in DB).
 * Public key: stored in event_signing_keys table; delivered via pre-flight response.
 *
 * Key ID format: evt_<eventId>_<timestamp>
 */

const crypto = require('crypto');
const db = require('./config/database');

/**
 * Generate a new ECDSA P-256 key pair for an event and store the public key in the DB.
 * The private key is returned for the caller to store in the environment (e.g. via .env or secrets manager).
 *
 * @param {number} eventId
 * @returns {{ keyId: string, publicKey: string, privateKeyPEM: string }}
 */
async function generateEventSigningKey(eventId) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const keyId = `evt_${eventId}_${Date.now()}`;

  await db.query(
    `INSERT INTO event_signing_keys (key_id, event_id, public_key, algorithm)
     VALUES ($1, $2, $3, 'ECDSA-P256')`,
    [keyId, eventId, publicKey],
    { queryName: 'insert_signing_key' }
  );

  return { keyId, publicKey, privateKeyPEM: privateKey };
}

/**
 * Sign a credential payload with the event's private key.
 * Private key is read from process.env[`EVENT_SIGNING_KEY_${keyId}`].
 *
 * Payload: { public_code, access_level_id, event_id, day_bitmap, expiry_iso }
 *
 * @param {string} keyId
 * @param {object} payload
 * @returns {string} base64url signature
 */
function signCredentialPayload(keyId, payload) {
  const envKey = `EVENT_SIGNING_KEY_${keyId.toUpperCase().replace(/-/g, '_')}`;
  const privateKeyPEM = process.env[envKey];
  if (!privateKeyPEM) throw new Error(`Private key not found in env for key_id: ${keyId}`);

  const data = JSON.stringify(payload);
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  return sign.sign(privateKeyPEM, 'base64url');
}

/**
 * Verify a signed payload using the public key stored in the DB.
 * Used server-side when syncing Trust-mode scans.
 *
 * @param {string} keyId
 * @param {object} payload
 * @param {string} signatureBase64url
 * @returns {Promise<boolean>}
 */
async function verifyCredentialPayload(keyId, payload, signatureBase64url) {
  const result = await db.query(
    'SELECT public_key FROM event_signing_keys WHERE key_id=$1',
    [keyId], { queryName: 'get_signing_key_for_verify' }
  );
  if (!result.rows[0]) throw new Error(`Signing key not found: ${keyId}`);

  const data = JSON.stringify(payload);
  const verify = crypto.createVerify('SHA256');
  verify.update(data);
  verify.end();
  return verify.verify(result.rows[0].public_key, signatureBase64url, 'base64url');
}

module.exports = { generateEventSigningKey, signCredentialPayload, verifyCredentialPayload };
