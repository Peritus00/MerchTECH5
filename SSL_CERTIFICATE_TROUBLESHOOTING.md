# SSL Certificate Troubleshooting Guide

## If Certificate Stays "Issuing TLS Certificate" (Pending)

### Step 1: Verify DNS Configuration

The most common cause of stuck certificate issuance is incorrect DNS configuration.

**Check DNS Records**:
```bash
# Check A record for merchtrader.org
dig merchtrader.org A

# Check CNAME record (if using)
dig merchtrader.org CNAME

# Should point to Railway's IP or CNAME
```

**Required DNS Configuration**:
- **Option A (A Record)**: Point `merchtrader.org` → Railway's IP address
- **Option B (CNAME)**: Point `merchtrader.org` → `merchtech5-production.up.railway.app`

**Verify in Railway**:
1. Go to Railway Dashboard → Networking
2. Click on `merchtrader.org` domain
3. Check if DNS verification shows as "Verified"
4. If not verified, Railway will show what DNS records are needed

### Step 2: Check Certificate Provisioning Status

**In Railway Dashboard**:
1. Go to Networking → `merchtrader.org`
2. Check for any error messages
3. Look for "View Documentation" link for troubleshooting

**Common Issues**:
- DNS not propagated (can take up to 48 hours)
- DNS records pointing to wrong location
- Rate limiting from Let's Encrypt (too many certificate requests)
- Domain already has certificate elsewhere

### Step 3: Force Certificate Refresh

**In Railway**:
1. Delete the `merchtrader.org` domain
2. Wait 5 minutes
3. Re-add the domain
4. Railway will attempt to provision certificate again

**Note**: Be careful with rate limits - Let's Encrypt has limits on certificate requests per domain.

### Step 4: Alternative Solutions

#### Option A: Use Only www.merchtrader.org (Recommended)

**Why This Works**:
- `www.merchtrader.org` already has SSL certificate ✅
- Codebase already normalizes to `www.merchtrader.org`
- No additional configuration needed

**Implementation**:
1. Update all references to use `www.merchtrader.org`
2. Set up redirect from `merchtrader.org` → `www.merchtrader.org` (see Option B)
3. Update Android app to use `www.merchtrader.org`

#### Option B: Set Up Redirect (Best Long-term Solution)

**Using Railway Custom Domain Redirect**:
1. Keep `www.merchtrader.org` as primary domain
2. Set up redirect in Railway or at DNS level:
   - **DNS Level**: Use CNAME redirect service
   - **Application Level**: Add redirect middleware (see code below)

**Application-Level Redirect** (Add to `services/Server/main.js`):
```javascript
// Redirect merchtrader.org to www.merchtrader.org
app.use((req, res, next) => {
  if (req.hostname === 'merchtrader.org' && !req.hostname.startsWith('www.')) {
    return res.redirect(301, `https://www.merchtrader.org${req.originalUrl}`);
  }
  next();
});
```

#### Option C: Use Cloudflare (Most Reliable)

**Benefits**:
- Free SSL certificates (always works)
- DNS management
- CDN and performance benefits
- Automatic redirects

**Setup Steps**:
1. Sign up for Cloudflare (free tier)
2. Add `merchtrader.org` domain to Cloudflare
3. Update nameservers at your domain registrar
4. Configure DNS in Cloudflare:
   - `merchtrader.org` → CNAME → `merchtech5-production.up.railway.app`
   - `www.merchtrader.org` → CNAME → `merchtech5-production.up.railway.app`
5. Enable SSL/TLS → Full (strict)
6. Set up redirect rule: `merchtrader.org/*` → `https://www.merchtrader.org/$1`

#### Option D: Use Railway's Default Domain

**Temporary Workaround**:
- Use `merchtech5-production.up.railway.app` (has SSL)
- Update Android app to use this domain
- Not ideal for production but works immediately

### Step 5: Check Let's Encrypt Rate Limits

**If Certificate Keeps Failing**:
- Let's Encrypt has rate limits: 50 certificates per registered domain per week
- Check if you've hit the limit: https://letsencrypt.org/docs/rate-limits/
- Wait 7 days if limit is reached

**Check Certificate Status**:
```bash
# Check if certificate exists
openssl s_client -connect merchtrader.org:443 -servername merchtrader.org

# Check certificate details
echo | openssl s_client -connect merchtrader.org:443 -servername merchtrader.org 2>/dev/null | openssl x509 -noout -dates
```

### Step 6: Contact Railway Support

**If Nothing Works**:
1. Railway Support: support@railway.app or Railway Discord
2. Provide:
   - Domain name: `merchtrader.org`
   - DNS configuration screenshots
   - Certificate status from dashboard
   - Any error messages

## Recommended Action Plan

### Immediate (Today):
1. ✅ Use `www.merchtrader.org` - already working
2. ✅ Deploy database pool fix
3. ✅ Update Android app to use `www.merchtrader.org`

### Short-term (This Week):
1. Monitor certificate issuance in Railway
2. Verify DNS configuration is correct
3. If still pending after 24 hours, set up redirect (Option B)

### Long-term (Best Practice):
1. Set up Cloudflare (Option C) for reliable SSL
2. Configure redirect from `merchtrader.org` → `www.merchtrader.org`
3. Update all documentation to use `www.merchtrader.org`

## Quick Fix: Application-Level Redirect

Add this to `services/Server/main.js` right after CORS configuration:

```javascript
// Redirect merchtrader.org to www.merchtrader.org (ensures SSL works)
app.use((req, res, next) => {
  const hostname = req.get('host') || req.hostname;
  if (hostname === 'merchtrader.org' && !hostname.startsWith('www.')) {
    console.log(`🔀 REDIRECT: Redirecting ${hostname}${req.originalUrl} to www.merchtrader.org`);
    return res.redirect(301, `https://www.merchtrader.org${req.originalUrl}`);
  }
  next();
});
```

This ensures all requests to `merchtrader.org` automatically redirect to `www.merchtrader.org` (which has SSL).

