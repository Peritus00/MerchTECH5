import axios from 'axios';

// API Configuration - Fixed for port 5001
const getApiBaseUrl = (): string => {
  // Force port 5001 for all environments
  if (typeof window !== 'undefined') {
    // Web environment - extract the base domain and force port 5001
    const currentUrl = window.location;
    const hostname = currentUrl.hostname;

    // For Replit domains
    if (hostname.includes('replit.dev') || hostname.includes('replit.co')) {
      return `https://${hostname}:5001/api`;
    }

    // For localhost development
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://${hostname}:5001/api`;
    }

    // Default fallback with port 5001
    return `https://${hostname}:5001/api`;
  }

  // Server-side or React Native environment
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  
  if (replitDomain) {
    // Always use port 5001 for Replit
    return `https://${replitDomain}:5001/api`;
  }

  // Environment variable override
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) {
    return apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
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