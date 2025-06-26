import axios from 'axios';

// Use the current Replit domain - port 5001 maps to external port 80
const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    // Use current browser hostname
    return window.location.hostname;
  }
  
  // Server-side - use environment or fallback to current domain
  return process.env.REPLIT_DEV_DOMAIN || '80458d8e-cde7-42e0-8b77-c3faea44c843-00-12w0lql5apse6.kirk.replit.dev';
};

const getApiBaseUrl = (): string => {
  const domain = getCurrentDomain();
  
  // Since port 5001 is mapped to external port 80, we can use the domain directly
  const baseUrl = `https://${domain}/api`;
  console.log('🔵 API Base URL:', baseUrl);
  return baseUrl;
};

const API_BASE_URL = getApiBaseUrl();

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