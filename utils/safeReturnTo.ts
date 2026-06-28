const AUTH_RETURN_TO_KEY = 'auth_return_to';

const ALLOWED_RETURN_PREFIXES = [
  '/playlist-access/',
  '/slideshow-access/',
];

export function isSafeInternalReturnTo(path: unknown): path is string {
  if (typeof path !== 'string') {
    return false;
  }

  const trimmed = path.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return false;
  }
  if (trimmed.includes('://') || trimmed.includes('\\')) {
    return false;
  }

  return ALLOWED_RETURN_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export function normalizeReturnToParam(returnTo: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  if (!raw || !isSafeInternalReturnTo(raw)) {
    return undefined;
  }
  return raw;
}

export function storeAuthReturnTo(path: string): void {
  if (!isSafeInternalReturnTo(path)) {
    return;
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, path);
  }
}

export function consumeAuthReturnTo(): string | undefined {
  if (typeof sessionStorage === 'undefined') {
    return undefined;
  }

  const stored = sessionStorage.getItem(AUTH_RETURN_TO_KEY);
  sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
  return normalizeReturnToParam(stored ?? undefined);
}

export function resolvePostLoginRoute(options: {
  returnTo?: string | string[];
  hasPendingShare?: boolean;
}): string {
  if (options.hasPendingShare) {
    return '/handle-share';
  }

  const fromParam = normalizeReturnToParam(options.returnTo);
  if (fromParam) {
    return fromParam;
  }

  const fromSession = consumeAuthReturnTo();
  if (fromSession) {
    return fromSession;
  }

  return '/(tabs)';
}
