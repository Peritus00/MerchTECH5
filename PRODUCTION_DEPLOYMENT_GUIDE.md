# Production Deployment Guide

## 🚀 Environment Variables Setup

Create a `.env` file in your project root with these variables:

### Development (.env)
```bash
# API Configuration
EXPO_PUBLIC_API_URL=http://localhost:5001/api

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/merchtech_db

# Stripe
STRIPE_SECRET_KEY=sk_test_your_test_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key
STRIPE_WEBHOOK_SECRET=whsec_your_test_secret

# Email
BREVO_SMTP_KEY=your_brevo_key

# Security
JWT_SECRET=your_jwt_secret

# Server
PORT=5001

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:8081
```

### Production (.env.production)
```bash
# API Configuration - MerchTech Production
EXPO_PUBLIC_API_URL=https://www.merchtech.net/api

# Database - UPDATE THIS!
DATABASE_URL=postgresql://username:password@your-db-host:5432/merchtech_db

# Stripe - USE LIVE KEYS!
STRIPE_SECRET_KEY=sk_live_your_live_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key
STRIPE_WEBHOOK_SECRET=whsec_your_live_secret

# Email
BREVO_SMTP_KEY=your_brevo_key

# Security - CHANGE THIS!
JWT_SECRET=your_super_secure_jwt_secret

# Server
PORT=5001

# Frontend URL - MerchTech Production  
FRONTEND_URL=https://www.merchtech.net
```

## 🌐 Deployment Steps

### 1. Backend Deployment (Server)

**Option A: Railway/Render/Heroku**
1. Push your code to GitHub
2. Connect your repository to your hosting service
3. Set environment variables in the hosting dashboard
4. Deploy the `services/Server/main.js` file

**Option B: VPS/DigitalOcean**
1. Set up a server with Node.js
2. Clone your repository
3. Install dependencies: `npm install`
4. Set up environment variables
5. Use PM2 or similar to run the server: `pm2 start services/Server/main.js`

### 2. Database Setup

**Production Database:**
1. Set up PostgreSQL on your hosting provider
2. Update `DATABASE_URL` in your environment variables
3. Run migrations: `node scripts/migrate.js`

### 3. Frontend Deployment (Expo App)

**For Web:**
1. Update `EXPO_PUBLIC_API_URL` to your production API
2. Build: `npx expo export`
3. Deploy the `dist` folder to Netlify/Vercel/etc.

**For Mobile:**
1. Update environment variables
2. Build: `eas build --platform all`
3. Submit to app stores: `eas submit`

### 4. Domain & SSL Setup

1. Point your domain to your server
2. Set up SSL certificate (Let's Encrypt recommended)
3. Update all environment variables with `https://` URLs

## 🔧 Files That Need Updates

### Android Network Security (android/app/src/main/res/xml/network_security_config.xml)
```xml
<domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">merchtech.net</domain>
</domain-config>
```

### Expo Configuration
Update your `app.json` or `app.config.js` if needed for production builds.

## ⚠️ Security Checklist

- [ ] Change JWT_SECRET to a strong, unique value
- [ ] Use HTTPS in production (never HTTP)
- [ ] Update Stripe to live keys
- [ ] Set up proper CORS origins
- [ ] Enable database SSL
- [ ] Set secure cookie settings
- [ ] Remove debug logs from production

## 🧪 Testing Production Setup

1. Test API endpoints with production URLs
2. Verify Stripe payments work with live keys
3. Test email sending
4. Verify push notifications work
5. Test all app functionality end-to-end

## 🚨 Common Issues & Solutions

### Issue: API calls fail in production
**Solution:** Check CORS settings and ensure API_BASE_URL is correct

### Issue: Stripe webhooks don't work
**Solution:** Update webhook endpoint URL in Stripe dashboard

### Issue: Push notifications don't work
**Solution:** Ensure FCM/APNS certificates are set up for production

### Issue: Database connection fails
**Solution:** Check DATABASE_URL and firewall settings

### Issue: Email verification links don't work
**Solution:** Update FRONTEND_URL environment variable

## 📱 Mobile App Store Deployment

### iOS App Store
1. Set up Apple Developer account
2. Configure app signing certificates
3. Build with EAS: `eas build --platform ios`
4. Submit: `eas submit --platform ios`

### Google Play Store
1. Set up Google Play Developer account
2. Build with EAS: `eas build --platform android`
3. Submit: `eas submit --platform android`

## 🔄 Environment Management

Use different environment files for different stages:
- `.env.development` - Local development
- `.env.staging` - Staging server
- `.env.production` - Production server

## 📊 Monitoring & Logging

Set up monitoring for:
- Server uptime
- Database performance
- API response times
- Error tracking (Sentry recommended)
- User analytics

## 🔐 Backup Strategy

- Regular database backups
- Code repository backups
- Environment variable backups (secure storage)
- Media file backups 