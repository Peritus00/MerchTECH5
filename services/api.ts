
import axios from 'axios';

const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return process.env.REPLIT_DEV_DOMAIN || '4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev';
};

// Use Replit's external domain without port - this is how Replit works
const API_BASE_URL = `https://${getCurrentDomain()}/api`;

console.log('🔵 API Base URL:', API_BASE_URL);

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
