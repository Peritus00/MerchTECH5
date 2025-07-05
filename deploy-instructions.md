# 🚀 MerchTech App Deployment Instructions

## 📱 **EXPO APP DEPLOYMENT**

### **Step 1: Start Development Server**
```bash
# Navigate to your project directory
cd /Users/admin/Downloads/merchtechapp5

# Install dependencies (if not already done)
npm install

# Start Expo development server
npx expo start
```

### **Step 2: Test on Device/Simulator**
- **iOS**: Press `i` to open iOS simulator
- **Android**: Press `a` to open Android emulator  
- **Web**: Press `w` to open in web browser
- **Physical Device**: Scan QR code with Expo Go app

### **Step 3: Build for Production**
```bash
# Login to Expo (create account if needed)
npx expo login

# Build for iOS
npx expo build:ios

# Build for Android
npx expo build:android

# Build for web
npx expo export:web
```

---

## 🌐 **VERCEL SERVER DEPLOYMENT**

### **Step 1: Prepare for Vercel**
```bash
# Make sure you're in the project root
cd /Users/admin/Downloads/merchtechapp5

# Login to Vercel (create account if needed)
vercel login
```

### **Step 2: Deploy to Vercel**
```bash
# Deploy (first time)
vercel --prod

# Follow prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N
# - Project name: merchtech-server
# - Directory: ./ (current directory)
# - Override settings? N
```

### **Step 3: Configure Environment Variables**
After deployment, go to Vercel dashboard and add these environment variables:

**Required Environment Variables:**
- `DATABASE_URL` = your Neon database connection string
- `JWT_SECRET` = your JWT secret key
- `STRIPE_SECRET_KEY` = your Stripe secret key
- `STRIPE_PUBLISHABLE_KEY` = your Stripe publishable key
- `BREVO_API_KEY` = your Brevo API key
- `BREVO_SMTP_KEY` = your Brevo SMTP key
- `AWS_ACCESS_KEY_ID` = your AWS access key
- `AWS_SECRET_ACCESS_KEY` = your AWS secret key
- `AWS_REGION` = us-east-2
- `AWS_S3_BUCKET_NAME` = merchtechbucket
- `EXPO_PUBLIC_GEMINI_API_KEY` = your Gemini API key

---

## 🔧 **QUICK START COMMANDS**

### **Local Development:**
```bash
# Terminal 1: Start server
npm run server:dev

# Terminal 2: Start Expo app
npx expo start
```

### **Production Deployment:**
```bash
# Deploy server to Vercel
vercel --prod

# Build Expo app for stores
npx expo build:ios
npx expo build:android
```

---

## 📱 **TESTING YOUR DEPLOYMENT**

### **Test Server:**
1. Visit your Vercel URL (e.g., https://merchtech-server.vercel.app)
2. Test API endpoints: `/api/health`, `/api/users/profile`

### **Test App:**
1. Update `EXPO_PUBLIC_API_URL` in your .env to point to Vercel URL
2. Test login with your admin account:
   - Email: djjetfuel@gmail.com
   - Password: GIZMO321$

---

## 🚨 **TROUBLESHOOTING**

### **Common Issues:**
1. **Database Connection**: Ensure DATABASE_URL is correctly set in Vercel
2. **CORS Errors**: Server is configured for cross-origin requests
3. **File Uploads**: Large files may timeout (30s limit on Vercel)
4. **Environment Variables**: Double-check all required vars are set

### **Support:**
- Check Vercel deployment logs
- Use `npx expo doctor` for Expo issues
- Test locally first before deploying

---

## 🎯 **NEXT STEPS AFTER DEPLOYMENT**

1. **Test all features** with your admin account
2. **Create additional test users** through the registration flow
3. **Monitor analytics** to ensure data is being tracked
4. **Test payment flows** with Stripe test cards
5. **Verify file uploads** work with S3 integration

Your MerchTech app is now ready for production use! 🚀 