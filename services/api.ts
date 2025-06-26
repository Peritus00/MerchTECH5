import axios from 'axios';

// API Configuration with dynamic port handling
const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // Web environment
    const currentUrl = window.location;
    const protocol = currentUrl.protocol;
    const hostname = currentUrl.hostname;

    // For Replit, use the current domain with port 5001
    if (hostname.includes('replit.dev') || hostname.includes('replit.co')) {
      return `${protocol}//${hostname.replace(/:\d+$/, '')}:5001/api`;
    }

    // For localhost development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:5001/api`;
    }

    // Default fallback
    return `${protocol}//${hostname}:5001/api`;
  }

  // Server-side or React Native environment
  const replitDomain = process.env.REPLIT_DEV_DOMAIN || process.env.EXPO_PUBLIC_API_URL;

  if (replitDomain) {
    // Handle full URL
    if (replitDomain.startsWith('http')) {
      return replitDomain.endsWith('/api') ? replitDomain : `${replitDomain}/api`;
    }
    // Handle domain only
    return `https://${replitDomain}:5001/api`;
  }

  // Local development fallback
  return 'http://localhost:5001/api';
};

const API_BASE_URL = getApiBaseUrl();

console.log('Final API Base URL:', API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for auth token
api.interceptors.request.use(
  (config) => {
    // Get token from storage or context
    const token = null; // This will be handled by your auth service
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

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

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log('🟢 API Response Success:', {
      url: response.config.url,
      status: response.status,
      data: response.data
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