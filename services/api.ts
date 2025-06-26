
import axios from 'axios';

// Get the current Replit domain
const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return process.env.REPLIT_DEV_DOMAIN || 'localhost';
};

// Smart API URL detection - try multiple endpoints until one works
const getWorkingApiUrl = async (): Promise<string> => {
  const domain = getCurrentDomain();
  
  // Possible API endpoints to try
  const possibleUrls = [
    `https://${domain}/api`,           // Standard Replit external
    `http://localhost:5001/api`,       // Local development
    `http://0.0.0.0:5001/api`,        // Replit internal
    `https://${domain}:5001/api`,     // With port
  ];

  // Try each URL until one responds
  for (const url of possibleUrls) {
    try {
      const response = await axios.get(`${url}/health`, { timeout: 3000 });
      if (response.status === 200) {
        console.log('✅ Found working API at:', url);
        return url;
      }
    } catch (error) {
      console.log('❌ Failed to reach:', url);
    }
  }

  // Fallback to first option if none work
  console.log('⚠️ No working API found, using fallback:', possibleUrls[0]);
  return possibleUrls[0];
};

// Initialize API with dynamic URL detection
let API_BASE_URL = `https://${getCurrentDomain()}/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auto-detect working API on first request
let urlDetected = false;

api.interceptors.request.use(
  async (config) => {
    // Only detect URL once
    if (!urlDetected) {
      API_BASE_URL = await getWorkingApiUrl();
      config.baseURL = API_BASE_URL;
      api.defaults.baseURL = API_BASE_URL;
      urlDetected = true;
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
