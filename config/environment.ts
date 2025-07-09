/**
 * Environment Configuration
 * Centralized configuration management for different environments
 */

export interface EnvironmentConfig {
  API_BASE_URL: string;
  NODE_ENV: 'development' | 'staging' | 'production';
  IS_PRODUCTION: boolean;
  IS_DEVELOPMENT: boolean;
  FRONTEND_URL: string;
  EXPO_PROJECT_ID: string;
}

class Environment {
  private config: EnvironmentConfig;

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  private loadConfig(): EnvironmentConfig {
    // Check both regular and EXPO_PUBLIC_ prefixed environment variables
    const nodeEnv = (process.env.EXPO_PUBLIC_NODE_ENV || process.env.NODE_ENV || 'development') as 'development' | 'staging' | 'production';
    
    // Force development mode for local development
    // Use Railway backend ONLY if explicitly set to production
    let apiBaseUrl = nodeEnv === 'production' && process.env.EXPO_PUBLIC_NODE_ENV === 'production'
      ? 'https://merchtech5-production.up.railway.app/api'
      : (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.70:5001/api');
    
    // Force local server if running on localhost (web development)
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      apiBaseUrl = 'http://192.168.1.70:5001/api';
      console.log('🔧 Forced local API URL for localhost development:', apiBaseUrl);
    }
    
    return {
      API_BASE_URL: apiBaseUrl,
      NODE_ENV: nodeEnv,
      IS_PRODUCTION: nodeEnv === 'production',
      IS_DEVELOPMENT: nodeEnv === 'development',
      FRONTEND_URL: process.env.EXPO_PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://merchtech5-production.up.railway.app',
      EXPO_PROJECT_ID: process.env.EXPO_PROJECT_ID || 'your-expo-project-id',
    };
  }

  private validateConfig(): void {
    const errors: string[] = [];

    // Validate API URL
    if (!this.config.API_BASE_URL) {
      errors.push('EXPO_PUBLIC_API_URL is required');
    }

    // Production-specific validations
    if (this.config.IS_PRODUCTION) {
      if (this.config.API_BASE_URL.includes('localhost')) {
        errors.push('Production API URL cannot use localhost');
      }
      
      if (!this.config.API_BASE_URL.startsWith('https://')) {
        errors.push('Production API URL must use HTTPS');
      }
      
      if (this.config.FRONTEND_URL.includes('localhost')) {
        errors.push('Production frontend URL cannot use localhost');
      }
      
      if (!this.config.FRONTEND_URL.startsWith('https://')) {
        errors.push('Production frontend URL must use HTTPS');
      }
    }

    if (errors.length > 0) {
      console.error('❌ Environment Configuration Errors:');
      errors.forEach(error => console.error(`  - ${error}`));
      
      if (this.config.IS_PRODUCTION) {
        throw new Error('Invalid production configuration. Check environment variables.');
      } else {
        console.warn('⚠️ Development environment has configuration issues, but continuing...');
      }
    }
  }

  // Getters for easy access
  get apiBaseUrl(): string {
    return this.config.API_BASE_URL;
  }

  get nodeEnv(): string {
    return this.config.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.config.IS_PRODUCTION;
  }

  get isDevelopment(): boolean {
    return this.config.IS_DEVELOPMENT;
  }

  get frontendUrl(): string {
    return this.config.FRONTEND_URL;
  }

  get expoProjectId(): string {
    return this.config.EXPO_PROJECT_ID;
  }

  // Debug information
  public logConfiguration(): void {
    console.log('🔧 Environment Configuration:');
    console.log(`  Environment: ${this.config.NODE_ENV}`);
    console.log(`  API Base URL: ${this.config.API_BASE_URL}`);
    console.log(`  Frontend URL: ${this.config.FRONTEND_URL}`);
    console.log(`  Expo Project ID: ${this.config.EXPO_PROJECT_ID}`);
    console.log(`  Is Production: ${this.config.IS_PRODUCTION}`);
  }

  // Get full configuration object
  public getConfig(): EnvironmentConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const env = new Environment();

// Export individual values for convenience
export const {
  apiBaseUrl,
  nodeEnv,
  isProduction,
  isDevelopment,
  frontendUrl,
  expoProjectId
} = env;

// Always log configuration for debugging
console.log('🔧 Environment Configuration Loading...');
console.log('🔧 process.env.NODE_ENV:', process.env.NODE_ENV);
console.log('🔧 process.env.EXPO_PUBLIC_NODE_ENV:', process.env.EXPO_PUBLIC_NODE_ENV);
console.log('🔧 process.env.EXPO_PUBLIC_API_URL:', process.env.EXPO_PUBLIC_API_URL);

env.logConfiguration();

// Force development mode if we're on localhost
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  console.log('🔧 Detected localhost - forcing development mode');
} 