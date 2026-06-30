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
  /** Google OAuth Web Client ID - must match backend GOOGLE_CLIENT_ID */
  GOOGLE_CLIENT_ID: string;
  /** Apple OAuth Client/Service ID - must match backend APPLE_CLIENT_ID/APPLE_SERVICE_ID */
  APPLE_CLIENT_ID: string | null;
  /** Playlist-level HLS continuous audio (web). Set EXPO_PUBLIC_CONTINUOUS_AUDIO_ENABLED=true to enable. */
  CONTINUOUS_AUDIO_ENABLED: boolean;
}

/**
 * Normalizes frontend URL to always use www.merchtrader.org (which has valid SSL)
 * This ensures QR codes always use the domain with a working certificate
 */
function normalizeFrontendUrl(url: string): string {
  if (!url) {
    return 'https://www.merchtrader.org';
  }
  
  // Remove trailing slashes
  url = url.trim().replace(/\/+$/, '');
  
  // If it's merchtrader.org without www, add www
  if (url === 'https://merchtrader.org' || url === 'http://merchtrader.org') {
    return 'https://www.merchtrader.org';
  }
  
  // If it already has www or is a different domain, return as-is
  return url;
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
    
    // Determine API base URL based on environment
    let apiBaseUrl: string;
    
    // Check if we're in production mode
    const isProduction = nodeEnv === 'production';
    
    if (isProduction) {
      // Use the actual Railway backend URL for production
      apiBaseUrl = 'https://merchtech5-production.up.railway.app/api';
      console.log('🔧 Using production API URL:', apiBaseUrl);
    } else {
      // For development, check if EXPO_PUBLIC_API_URL is set (for mobile testing)
      // Otherwise fall back to localhost (for web testing)
      apiBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';
      console.log('🔧 Using development API URL:', apiBaseUrl);
      
      // Warn if using localhost in mobile environment
      if (apiBaseUrl.includes('localhost')) {
        console.warn('⚠️  Using localhost API URL - this will not work on mobile devices!');
        console.warn('⚠️  Set EXPO_PUBLIC_API_URL to your computer\'s IP address for mobile testing');
        console.warn('⚠️  Example: EXPO_PUBLIC_API_URL=http://192.168.1.100:5001/api');
      }
    }
    
    // Normalize frontend URL to always use www.merchtrader.org (which has valid SSL)
    const rawFrontendUrl = process.env.EXPO_PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://www.merchtrader.org';
    const normalizedFrontendUrl = normalizeFrontendUrl(rawFrontendUrl);
    
    // Log if we had to normalize it
    if (rawFrontendUrl !== normalizedFrontendUrl) {
      console.log(`🔧 Normalized FRONTEND_URL: ${rawFrontendUrl} → ${normalizedFrontendUrl}`);
    }
    
    // Social auth - single source of truth; must align with backend env
    const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim()
      || '587879962618-hrknoc2i6g1jecittiro88qceavhj4ea.apps.googleusercontent.com';
    const appleClientId = process.env.EXPO_PUBLIC_APPLE_CLIENT_ID?.trim()
      || process.env.EXPO_PUBLIC_APPLE_SERVICE_ID?.trim()
      || null;

    const continuousAudioEnabled =
      process.env.EXPO_PUBLIC_CONTINUOUS_AUDIO_ENABLED === 'true';

    return {
      API_BASE_URL: apiBaseUrl,
      NODE_ENV: nodeEnv,
      IS_PRODUCTION: isProduction,
      IS_DEVELOPMENT: !isProduction,
      FRONTEND_URL: normalizedFrontendUrl,
      EXPO_PROJECT_ID: process.env.EXPO_PROJECT_ID || 'your-expo-project-id',
      GOOGLE_CLIENT_ID: googleClientId,
      APPLE_CLIENT_ID: appleClientId,
      CONTINUOUS_AUDIO_ENABLED: continuousAudioEnabled,
    };
  }

  private validateConfig(): void {
    const errors: string[] = [];

    // Validate API URL
    if (!this.config.API_BASE_URL) {
      errors.push('API_BASE_URL is required');
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

  get googleClientId(): string {
    return this.config.GOOGLE_CLIENT_ID;
  }

  get appleClientId(): string | null {
    return this.config.APPLE_CLIENT_ID;
  }

  get continuousAudioEnabled(): boolean {
    return this.config.CONTINUOUS_AUDIO_ENABLED;
  }

  /** Callback host for OAuth redirects - always use canonical frontend URL */
  get oauthCallbackHost(): string {
    return this.config.FRONTEND_URL;
  }

  // Debug information
  public logConfiguration(): void {
    console.log('🔧 Environment Configuration:');
    console.log(`  Environment: ${this.config.NODE_ENV}`);
    console.log(`  API Base URL: ${this.config.API_BASE_URL}`);
    console.log(`  Frontend URL: ${this.config.FRONTEND_URL}`);
    console.log(`  Expo Project ID: ${this.config.EXPO_PROJECT_ID}`);
    console.log(`  Is Production: ${this.config.IS_PRODUCTION}`);
    console.log(`  Google Client ID: ${this.config.GOOGLE_CLIENT_ID ? this.config.GOOGLE_CLIENT_ID.substring(0, 30) + '...' : 'not set'}`);
    console.log(`  Apple Client ID: ${this.config.APPLE_CLIENT_ID ? 'configured' : 'not set'}`);
    console.log(`  Continuous Audio: ${this.config.CONTINUOUS_AUDIO_ENABLED ? 'enabled' : 'disabled'}`);
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
  expoProjectId,
  googleClientId,
  appleClientId,
  continuousAudioEnabled,
  oauthCallbackHost,
} = env;

// Always log configuration for debugging
console.log('🔧 Environment Configuration Loading...');
console.log('🔧 TIMESTAMP:', new Date().toISOString());
console.log('🔧 process.env.NODE_ENV:', process.env.NODE_ENV);
console.log('🔧 process.env.EXPO_PUBLIC_NODE_ENV:', process.env.EXPO_PUBLIC_NODE_ENV);

env.logConfiguration(); 