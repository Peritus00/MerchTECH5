/**
 * Canonical SMS opt-in copy for toll-free verification and marketing_sms_consents.consent_copy_version.
 * Keep in sync with services/Server/main.js COUPON_CONSENT_COPY.
 */

export const SMS_COMPANY_NAME = 'MerchTrader';

/** Checkbox 1 — transactional disclosure (TCPA-style). */
export const SMS_TRANSACTIONAL_CONSENT_TEXT =
  'By checking this box and clicking "SEND" you consent to receive transactional text messages for notifications and alerts from ' +
  SMS_COMPANY_NAME +
  '. Reply STOP to opt out. Reply HELP for help. Message and data rates may apply. Message frequency may vary.';

/** Checkbox 2 — Terms + Privacy (label only; links are in UI). */
export const SMS_TERMS_CONSENT_SUMMARY =
  'I agree to the Terms and Conditions and Privacy Policy.';

/** Optional — recurring marketing / promotional SMS (separate from transactional preview verification). */
export const SMS_MARKETING_OPT_IN_TEXT =
  'I agree to receive recurring promotional and marketing text messages from ' +
  SMS_COMPANY_NAME +
  '. Consent is not a condition of purchase. Reply STOP to opt out. Reply HELP for help. Message and data rates may apply. Message frequency may vary.';

/** Single stored version string for API + DB audit trail. */
export function buildSmsConsentCopyVersion(): string {
  return `${SMS_TRANSACTIONAL_CONSENT_TEXT} | ${SMS_TERMS_CONSENT_SUMMARY}`;
}

/** Marketing opt-in copy version (stored when user checks optional marketing box). */
export function buildMarketingConsentCopyVersion(): string {
  return SMS_MARKETING_OPT_IN_TEXT;
}
