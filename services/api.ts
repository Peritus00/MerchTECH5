import axios from 'axios';

// Rely on the environment variable set in your .env file
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';

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

  async register(email: string, password: string, username: string) {
    const response = await api.post('/auth/register', { email, password, username });
    return response.data;
  },

  // **THE FIX**: Added the missing sendVerification function.
  async sendVerification(email: string) {
    const response = await api.post('/auth/send-verification', { email });
    return response.data;
  },
  
  // You may need these other functions later, so I've added them proactively.
  async resendVerification(email: string) {
    const response = await api.post('/auth/resend-verification', { email });
    return response.data;
  },

  async verifyEmail(token: string) {
    // Note: The verification link is a GET request, but if you have a form for it, it might be a POST.
    // This assumes the server has a POST route for this.
    const response = await api.post('/auth/verify-email', { token });
    return response.data;
  },
};

// Products API
export const productsAPI = {
  async getMyProducts() {
    const res = await api.get('/products?mine=true');
    return res.data.products;
  },
  async getAllProducts() {
    const res = await api.get('/products/all');
    return res.data.products;
  },
  async updateProduct(productId: string, updates: Partial<Record<string, any>>) {
    const res = await api.patch(`/products/${productId}`, updates);
    return res.data.product;
  },
};

export default api;
