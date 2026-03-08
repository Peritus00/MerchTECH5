/**
 * Brevo SMS delivery service for coupon texts.
 * Uses Brevo Transactional SMS API - same API key as email.
 * Requires BREVO_API_KEY and BREVO_SMS_SENDER in env.
 */

const axios = require('axios');
const BREVO_API_URL = 'https://api.brevo.com/v3/transactionalSMS/sms';

/**
 * Send a coupon SMS via Brevo.
 * @param {string} phoneE164 - Phone number in E.164 format (e.g. +15551234567)
 * @param {string} body - Message content
 * @returns {Promise<{ messageId?: string; error?: string }>}
 */
async function sendCouponSms(phoneE164, body) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SMS_SENDER || 'MerchTech';

  if (!apiKey) {
    return { error: 'BREVO_API_KEY not configured' };
  }
  if (!sender) {
    return { error: 'BREVO_SMS_SENDER not configured' };
  }
  if (!phoneE164 || !body) {
    return { error: 'Phone and message body required' };
  }

  // Strip + for Brevo recipient (they want digits only)
  const recipient = phoneE164.replace(/^\+/, '');

  try {
    const response = await axios.post(BREVO_API_URL, {
      sender: sender.substring(0, 11), // Max 11 alphanumeric
      recipient,
      content: body,
      type: 'marketing', // Coupon SMS is marketing (consent required before send)
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
    });

    const data = response.data || {};
    return { messageId: String(data.messageId || data.reference || ''), providerResponse: data };
  } catch (err) {
    const data = err.response?.data || {};
    const errMsg = data.message || data.error || err.message || 'SMS send failed';
    return { error: errMsg, statusCode: err.response?.status, providerResponse: data };
  }
}

/**
 * Check if Brevo SMS is configured and ready.
 */
function isSmsConfigured() {
  return !!(process.env.BREVO_API_KEY && process.env.BREVO_SMS_SENDER);
}

module.exports = {
  sendCouponSms,
  isSmsConfigured,
};
