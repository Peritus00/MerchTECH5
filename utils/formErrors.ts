export type FieldErrors = Record<string, string>;

export type NormalizedApiError = {
  message: string;
  fields: FieldErrors;
  code?: string;
  status?: number;
  retryable?: boolean;
};

const FALLBACK_MESSAGE = 'Something went wrong. Please check your information and try again.';

const cleanMessage = (message: unknown): string | undefined => {
  if (typeof message !== 'string') return undefined;
  const trimmed = message.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (lower === 'internal server error') {
    return 'We could not complete that request. Please try again in a moment.';
  }
  if (lower.includes('network error')) {
    return 'Network error. Please check your connection and try again.';
  }

  return trimmed;
};

const fieldsFromDetails = (details: unknown): FieldErrors => {
  if (!Array.isArray(details)) return {};

  return details.reduce<FieldErrors>((acc, item) => {
    if (!item || typeof item !== 'object') return acc;
    const field = 'field' in item ? String((item as any).field || '') : '';
    const message = cleanMessage('message' in item ? (item as any).message : undefined);
    if (field && message && !acc[field]) {
      acc[field] = message;
    }
    return acc;
  }, {});
};

const coerceFields = (fields: unknown): FieldErrors => {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};

  return Object.entries(fields as Record<string, unknown>).reduce<FieldErrors>((acc, [field, message]) => {
    const nextMessage = cleanMessage(message);
    if (nextMessage) acc[field] = nextMessage;
    return acc;
  }, {});
};

const fieldsFromLegacyMessage = (message: string, status?: number): FieldErrors => {
  const lower = message.toLowerCase();

  if (status === 409 && lower.includes('email') && lower.includes('username')) {
    const guidance = 'An account already exists with this email or username. Sign in to continue, or use a different email/username.';
    return { email: guidance, username: guidance };
  }

  if (lower.includes('email')) return { email: message };
  if (lower.includes('username')) return { username: message };
  if (lower.includes('password')) return { password: message };
  if (lower.includes('phone')) return { phone: message };
  if (lower.includes('terms') || lower.includes('privacy')) return { termsConsent: message };

  return {};
};

export function normalizeApiError(error: any, fallbackMessage = FALLBACK_MESSAGE): NormalizedApiError {
  const data = error?.response?.data;
  const status = error?.response?.status ?? error?.status;
  const nested = data?.error && typeof data.error === 'object' ? data.error : undefined;

  const code =
    nested?.code ||
    data?.code ||
    error?.rateLimitInfo?.code ||
    error?.code;

  const fields = {
    ...coerceFields(nested?.fields),
    ...coerceFields(data?.fields),
    ...fieldsFromDetails(nested?.details),
    ...fieldsFromDetails(data?.details),
  };

  const serverMessage =
    cleanMessage(nested?.message) ||
    cleanMessage(data?.message) ||
    cleanMessage(typeof data?.error === 'string' ? data.error : undefined) ||
    cleanMessage(error?.rateLimitInfo?.message) ||
    cleanMessage(error?.message) ||
    fallbackMessage;

  const message =
    status === 409 && serverMessage.toLowerCase().includes('email') && serverMessage.toLowerCase().includes('username')
      ? 'An account already exists with this email or username. Sign in to continue, or use a different email/username.'
      : serverMessage;

  const retryAfter = error?.rateLimitInfo?.retryAfter;
  const rateLimitMessage =
    status === 429 && retryAfter && Number.isFinite(retryAfter)
      ? `${message} Please try again in about ${retryAfter} seconds.`
      : message;

  const nextFields = Object.keys(fields).length > 0 ? fields : fieldsFromLegacyMessage(rateLimitMessage, status);

  return {
    message: rateLimitMessage,
    fields: nextFields,
    code,
    status,
    retryable: Boolean(data?.retryable || status === 429 || (status && status >= 500)),
  };
}

export function mergeFieldErrors<T extends FieldErrors>(current: T, normalized: NormalizedApiError): T & FieldErrors {
  return {
    ...current,
    ...normalized.fields,
    ...(Object.keys(normalized.fields).length === 0 ? { general: normalized.message } : {}),
  };
}
