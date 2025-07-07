# 🔒 MerchTech Security Implementation Guide

## IMMEDIATE ACTION REQUIRED - Deploy Today

### Step 1: Install Required Packages ✅ DONE
```bash
npm install helmet express-rate-limit express-slow-down express-validator winston --save
```

### Step 2: Update Your Server Configuration

**Option A: Quick Implementation (5 minutes)**
Add these lines to the top of your `services/Server/main.js` file:

```javascript
// Add these imports at the top
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Add these middleware BEFORE your existing middleware
app.use(helmet());

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.'
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Apply rate limiting
app.use('/api/auth/', authLimiter);
app.use('/api/', apiLimiter);
```

**Option B: Full Implementation (15 minutes)**
Copy the `security-hardening-phase1.js` file to your `services/Server/` directory and update your main.js:

```javascript
const security = require('./security-hardening-phase1');

// Apply security middleware in order (add BEFORE your existing middleware)
app.use(security.helmet);
app.use(cors(security.corsConfig));
app.use(security.speedLimiter);
app.use(security.securityEventLogger);
app.use(security.suspiciousActivityDetector);

// Apply rate limiting to different routes
app.use('/api/', security.generalApiLimiter);
app.use('/api/auth/', security.authLimiter);

// Add error handling at the END of your middleware stack
app.use(security.securityErrorHandler);
```

### Step 3: Test Your Implementation

1. **Test Rate Limiting:**
   ```bash
   # Try logging in 6 times quickly - should get blocked
   curl -X POST http://localhost:5001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"wrong"}'
   ```

2. **Test Security Headers:**
   ```bash
   # Check if security headers are present
   curl -I http://localhost:5001/api/health
   ```

3. **Test File Upload Protection:**
   ```bash
   # Try uploading a suspicious file type
   curl -X POST http://localhost:5001/api/upload \
     -F "file=@malicious.exe"
   ```

### Step 4: Deploy and Monitor

1. **Deploy to Production:**
   ```bash
   # Build and deploy your updated server
   npm run build
   # Deploy to your production environment
   ```

2. **Monitor Security Logs:**
   ```bash
   # Watch security logs in real-time
   tail -f logs/security.log
   ```

## 🚨 Critical Security Vulnerabilities Fixed

### ✅ Rate Limiting Implemented
- **Before**: Unlimited requests allowed
- **After**: 5 login attempts per 15 minutes, 100 API requests per 15 minutes
- **Protection**: Prevents brute force attacks and DDoS

### ✅ Security Headers Added
- **Before**: Basic CORS only
- **After**: Comprehensive security headers via Helmet
- **Protection**: Prevents XSS, clickjacking, MIME-sniffing attacks

### ✅ Input Validation Enhanced
- **Before**: Basic validation only
- **After**: Comprehensive input sanitization and validation
- **Protection**: Prevents injection attacks and data corruption

### ✅ Request Monitoring Added
- **Before**: No security logging
- **After**: Comprehensive security event logging
- **Protection**: Detect and respond to attacks quickly

## 🔍 How to Verify Security is Working

### 1. Check Rate Limiting
Try making 6 login requests quickly:
```bash
for i in {1..6}; do
  curl -X POST http://localhost:5001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo "Request $i"
done
```
**Expected**: Request 6 should return 429 (Too Many Requests)

### 2. Check Security Headers
```bash
curl -I http://localhost:5001/api/health
```
**Expected**: Should see headers like:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0`

### 3. Check Suspicious Activity Detection
```bash
curl -X POST http://localhost:5001/api/test \
  -H "Content-Type: application/json" \
  -d '{"test":"<script>alert(1)</script>"}'
```
**Expected**: Should return 400 (Suspicious activity detected)

## 📊 Security Monitoring Dashboard

### View Security Logs
```bash
# View recent security events
tail -n 100 logs/security.log | grep -E "(rate_limit|suspicious|error)"

# Monitor failed login attempts
tail -n 100 logs/security.log | grep "rate_limit_exceeded"

# Check for injection attempts
tail -n 100 logs/security.log | grep "suspicious_activity"
```

### Security Metrics to Track
- Failed login attempts per hour
- Rate limit violations per day
- Suspicious activity detections
- File upload rejections
- Response time anomalies

## 🆘 Emergency Response

### If Under Attack:
1. **Check logs immediately:**
   ```bash
   tail -f logs/security.log
   ```

2. **Identify attack patterns:**
   ```bash
   grep "rate_limit_exceeded" logs/security.log | tail -20
   ```

3. **Block suspicious IPs (if needed):**
   ```bash
   # Add to your firewall or reverse proxy
   # Example: block IP 192.168.1.100
   sudo ufw deny from 192.168.1.100
   ```

### If Performance Issues:
1. **Check if rate limiting is too strict:**
   - Increase limits temporarily
   - Monitor legitimate user complaints

2. **Optimize security middleware:**
   - Move rate limiting to reverse proxy
   - Use Redis for distributed rate limiting

## 🎯 Next Steps (This Week)

1. **Add IP Whitelisting** for admin operations
2. **Implement CAPTCHA** after 3 failed login attempts
3. **Set up automated security scanning**
4. **Configure alerts** for suspicious activity
5. **Add database query monitoring**

## 📞 Emergency Contacts

- **Security Issues**: Check logs first, then contact system admin
- **Performance Issues**: Monitor response times and adjust limits
- **False Positives**: Review and adjust validation rules

---

**⚠️ IMPORTANT**: Test all security measures in development before deploying to production. Monitor logs closely after deployment to ensure legitimate users aren't blocked.

**🔄 REMEMBER**: Security is ongoing. Review and update these measures monthly. 