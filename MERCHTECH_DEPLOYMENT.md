# MerchTech Deployment Guide
## www.merchtech.net Production Setup

### 🎯 Quick Setup (Recommended)

```bash
npm run deploy:merchtech
```

This will guide you through setting up your production environment specifically for www.merchtech.net.

### 📋 What You'll Need

Before running the setup, have these ready:

1. **Database URL** - Your production PostgreSQL connection string
2. **Stripe LIVE Keys** - From your Stripe dashboard (must start with `sk_live_` and `pk_live_`)
3. **Stripe Webhook Secret** - For production webhooks
4. **Brevo SMTP Key** - For sending emails
5. **JWT Secret** - A secure 32+ character string
6. **Expo Project ID** - From your Expo dashboard

### 🌐 Domain Configuration

✅ **Already configured for you:**
- API URL: `https://www.merchtech.net/api`
- Frontend URL: `https://www.merchtech.net`
- Android network security: `merchtech.net` domain allowed

### 🚀 Deployment Steps

1. **Run MerchTech setup**
   ```bash
   npm run deploy:merchtech
   ```

2. **Validate configuration**
   ```bash
   npm run deploy:validate
   ```

3. **Build for production**
   ```bash
   npm run build:production
   ```

4. **Deploy your server**
   ```bash
   npm run server:prod
   ```

### 🔧 Server Setup Requirements

Your server needs to:
- Serve the API at `https://www.merchtech.net/api`
- Serve the frontend at `https://www.merchtech.net`
- Have SSL certificate for `www.merchtech.net`
- Run Node.js with the production environment variables

### 🎛️ Stripe Configuration

After deployment, update your Stripe dashboard:

1. **Webhook Endpoint**: `https://www.merchtech.net/api/webhooks/stripe`
2. **Events to send**:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `checkout.session.completed`

### 📱 Mobile App Deployment

1. **Build mobile app**
   ```bash
   eas build --platform all
   ```

2. **Submit to app stores**
   ```bash
   eas submit --platform ios
   eas submit --platform android
   ```

### ✅ Production Checklist

- [ ] Domain `www.merchtech.net` points to your server
- [ ] SSL certificate installed and working
- [ ] Database is accessible from server
- [ ] Stripe webhook URL updated
- [ ] Email sending tested
- [ ] Push notifications tested
- [ ] All environment variables validated
- [ ] Mobile app built and submitted

### 🚨 Important Notes

- **Use LIVE Stripe keys** - Never use test keys in production
- **Secure JWT Secret** - Generate a strong, unique secret
- **Database backups** - Set up regular backups
- **Monitoring** - Set up error tracking and uptime monitoring

### 🆘 Troubleshooting

**API calls failing?**
- Check if server is running at `https://www.merchtech.net/api`
- Verify SSL certificate is valid
- Check CORS settings

**Stripe payments not working?**
- Verify you're using LIVE keys (not test keys)
- Check webhook URL in Stripe dashboard
- Verify webhook secret matches

**Push notifications not working?**
- Check Expo project ID is correct
- Verify FCM/APNS certificates for production

### 📞 Support

If you need help, check:
1. `npm run deploy:validate` - Shows configuration issues
2. Server logs - Check for error messages
3. Browser console - For frontend errors
4. Stripe dashboard - For payment issues 