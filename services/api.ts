import axios from 'axios';

// Get the current Replit domain
const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return process.env.REPLIT_DEV_DOMAIN || 'localhost';
};

// FORCE PORT 5001 - NO EXCEPTIONS, NO DETECTION
const API_BASE_URL = `https://${getCurrentDomain()}:5001/api`;

console.log('🎯 FORCED API Base URL (PORT 5001):', API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
      status: error.response?.status,
      message: error.message
    });
    return Promise.reject(error);
  }
);

export default api;