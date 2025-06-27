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
  login: async (email: string, password: string) => {
      console.log('🔴 API: Making login request for:', email);

      try {
        const response = await api.post('/auth/login', { email, password });
        console.log('🔴 API: Login response:', response.data);
        return response.data;
      } catch (error) {
        console.log('🔴 API: Login failed, checking for developer fallback');

        // Try dev login for djjetfuel@gmail.com
        if (email === 'djjetfuel@gmail.com') {
          console.log('🔴 API: Using developer fallback login');
          try {
            const devResponse = await api.post('/auth/dev-login', { email, password });
            console.log('🔴 API: Dev login response:', devResponse.data);
            return devResponse.data;
          } catch (devError) {
            console.log('🔴 API: Dev login also failed');
            throw error; // Throw original error
          }
        }

        throw error;
      }
    },
  // ... other api calls
};

export default api;