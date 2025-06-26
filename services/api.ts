
import axios from 'axios';

// Get the current Replit domain
const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return process.env.REPLIT_DEV_DOMAIN || 'localhost';
};

// Since we know the server runs on 5001, let's be direct about it
const getWorkingApiUrl = async (): Promise<string> => {
  const domain = getCurrentDomain();
  
  // Try port 5001 first since that's where our server actually runs
  const possibleUrls = [
    `https://${domain}:5001/api`,     // Server is on 5001
    `https://${domain}/api`,          // Fallback to standard
    `http://0.0.0.0:5001/api`,       // Internal Replit
    `http://localhost:5001/api`,      // Local development
  ];

  console.log('🔍 Testing API endpoints...');
  
  // Try each URL until one responds
  for (const url of possibleUrls) {
    try {
      console.log(`Testing: ${url}`);
      const response = await axios.get(`${url}/health`, { timeout: 5000 });
      if (response.status === 200) {
        console.log('✅ Found working API at:', url);
        return url;
      }
    } catch (error) {
      console.log('❌ Failed to reach:', url);
    }
  }

  // If nothing works, use port 5001 as fallback since we know that's correct
  const fallback = `https://${domain}:5001/api`;
  console.log('⚠️ No working API found, using port 5001 fallback:', fallback);
  return fallback;
};

// Initialize with port 5001 since we know that's where the server runs
let API_BASE_URL = `https://${getCurrentDomain()}:5001/api`;

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Force port 5001 since we know that's where the server runs
let urlDetected = false;

api.interceptors.request.use(
  async (config) => {
    // Force port 5001 - no detection needed, we know it's there
    if (!urlDetected) {
      const domain = getCurrentDomain();
      API_BASE_URL = `https://${domain}:5001/api`;
      config.baseURL = API_BASE_URL;
      api.defaults.baseURL = API_BASE_URL;
      urlDetected = true;
      console.log('🎯 Forced API URL to port 5001:', API_BASE_URL);
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
