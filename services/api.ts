import axios from 'axios';

// Use the current Replit domain - port 5001 maps to external port 80
const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    // Use current browser hostname for web
    return window.location.hostname;
  }
  
  // Use current domain from environment
  return process.env.REPLIT_DEV_DOMAIN || '4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev';
};

const getApiBaseUrl = (): string => {
  const domain = getCurrentDomain();
  
  // ALWAYS use port 5001 for API requests
  const baseUrl = `https://${domain}:5001/api`;
  console.log('🔵 API Base URL (FORCED 5001):', baseUrl);
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