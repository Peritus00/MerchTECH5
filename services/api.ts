// FORCE PORT 5001 - CLEAR ALL CACHES
delete process.env.EXPO_PUBLIC_API_URL;
delete process.env.API_BASE_URL;

import axios from 'axios';

// ABSOLUTELY FORCE PORT 5001 - NO EXCEPTIONS
const FORCED_PORT = '5001';

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // Web environment - ALWAYS use current hostname with port 5001
    const hostname = window.location.hostname;
    const baseUrl = `https://${hostname}:${FORCED_PORT}/api`;
    console.log('🔵 FORCED API URL (web):', baseUrl);
    return baseUrl;
  }

  // Server-side - use environment domain with forced port
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) {
    const baseUrl = `https://${replitDomain}:${FORCED_PORT}/api`;
    console.log('🔵 FORCED API URL (server):', baseUrl);
    return baseUrl;
  }

  // Fallback - but still force port 5001
  const fallbackUrl = `http://localhost:${FORCED_PORT}/api`;
  console.log('🔵 FORCED API URL (fallback):', fallbackUrl);
  return fallbackUrl;
};

// Force regeneration on every import
const API_BASE_URL = getApiBaseUrl();
console.log('🔴 FINAL FORCED API BASE URL:', API_BASE_URL);

// Override any environment variables that might interfere
if (typeof process !== 'undefined' && process.env) {
  process.env.EXPO_PUBLIC_API_URL = API_BASE_URL;
  process.env.API_BASE_URL = API_BASE_URL;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor
api.interceptors.request.use(
  (config) => {
    console.log('🔵 API Request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`
    });
    return config;
  },
  (error) => {
    console.error('🔴 API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor
api.interceptors.response.use(
  (response) => {
    console.log('🟢 API Response Success:', {
      url: response.config.url,
      status: response.status
    });
    return response;
  },
  (error) => {
    console.error('🔴 API Response Error:', {
      url: error.config?.url,
      fullURL: `${error.config?.baseURL}${error.config?.url}`,
      status: error.response?.status,
      message: error.message
    });
    return Promise.reject(error);
  }
);

export default api;