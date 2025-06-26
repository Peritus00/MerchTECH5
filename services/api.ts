
import axios from 'axios';

// Get API base URL from environment variable with proper fallback
const getApiBaseUrl = () => {
  // Try multiple environment variable names
  const envUrl = process.env.EXPO_PUBLIC_API_URL || 
                 process.env.API_BASE_URL || 
                 process.env.REACT_NATIVE_API_URL;
  
  if (envUrl) {
    console.log('Using environment API URL:', envUrl);
    return envUrl;
  }
  
  // Fallback to hardcoded URL with correct port
  const fallbackUrl = 'https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5001/api';
  console.log('Using fallback API URL:', fallbackUrl);
  return fallbackUrl;
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
