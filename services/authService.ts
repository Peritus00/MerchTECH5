import { User } from '@/types';
import { brevoService } from './emailService';

interface AuthResponse {
  user: User;
  token: string;
}

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    // Mock authentication for development
    const user = {
      id: 1,
      email,
      username: email.split('@')[0],
      subscriptionTier: 'free',
      createdAt: new Date().toISOString()
    };

    // In production, this would verify credentials against your database
    return Promise.resolve({
      user,
      token: 'mock-jwt-token'
    });
  },

  async register(email: string, password: string, username?: string): Promise<AuthResponse> {
    const user = {
      id: 1,
      email,
      username: username || email.split('@')[0],
      subscriptionTier: 'free',
      createdAt: new Date().toISOString()
    };

    try {
      // Send welcome email via Brevo
      await brevoService.sendWelcomeEmail(email, user.username);
      console.log('Welcome email sent successfully');
    } catch (error) {
      console.warn('Failed to send welcome email:', error);
      // Don't fail registration if email fails
    }

    return Promise.resolve({
      user,
      token: 'mock-jwt-token'
    });
  },

  async logout(): Promise<void> {
    // Clear stored authentication
    return Promise.resolve();
  },

  async getCurrentUser(): Promise<User | null> {
    // Mock current user check
    return Promise.resolve(null);
  },

  async refreshToken(): Promise<string> {
    return Promise.resolve('new-mock-token');
  },

  async sendEmailVerification(email: string): Promise<void> {
    try {
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      await brevoService.sendEmailVerification(email, verificationCode);
      console.log('Verification email sent successfully');
    } catch (error) {
      console.error('Failed to send verification email:', error);
      throw new Error('Failed to send verification email');
    }
  },

  async sendPasswordReset(email: string): Promise<void> {
    try {
      const resetToken = Math.random().toString(36).substring(2, 15);
      await brevoService.sendPasswordReset(email, resetToken);
      console.log('Password reset email sent successfully');
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  },

  async sendSMSVerification(phoneNumber: string): Promise<void> {
    try {
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      await brevoService.sendSMSVerification(phoneNumber, verificationCode);
      console.log('SMS verification sent successfully');
    } catch (error) {
      console.error('Failed to send SMS verification:', error);
      throw new Error('Failed to send SMS verification');
    }
  }
};