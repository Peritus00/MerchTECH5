import axios from 'axios';

// Rely on the environment variable set in Replit Secrets.
// This ensures it uses the full, correct public URL.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

console.log('✅ API configured to use public URL:', API_BASE_URL);

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auth API endpoints
export const authAPI = {
  async login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },
  // ... other api calls
};

export default api;
