# SSL Certificate and Database Pool Exhaustion Fixes

## Issues Identified

### 1. SSL Certificate Mismatch (Android Error)
**Problem**: Android reports "server could not prove that the url is merchtrader.org - the security certificate is from up.railway.app"

**Root Cause**: Railway provides SSL certificates for `*.up.railway.app` domains by default. When using a custom domain like `merchtrader.org`, Railway needs to be configured to provision an SSL certificate for that custom domain.

**Impact**: 
- Android devices reject connections due to certificate mismatch
- Users cannot access the app on Android
- Security warnings on all platforms

### 2. Database Connection Pool Exhaustion (Playlist Freezing)
**Problem**: Playlist freezes when watching, system becomes unresponsive

**Root Cause**: 
- The `/api/playlists` endpoint uses `Promise.all()` to fetch ALL playlists concurrently (line 8472-8476)
- Each playlist calls `getPlaylistWithMedia()` which makes multiple database queries
- When there are 26 playlists, this creates 27+ concurrent database connections
- Database pool max is 30, so this exhausts the pool and causes:
  - Connection wait times
  - Query timeouts
  - System freezing

**Evidence from Logs**:
```
Lines 694-716: 27 database connections created simultaneously
Lines 630-730: 26 playlists being fetched concurrently
Pool max: 30 connections
```

## Solutions

### Solution 1: Configure Railway SSL Certificate for Custom Domain

**Current Status** (as of Railway dashboard):
- ✅ `www.merchtrader.org` - **Setup complete** (SSL certificate active)
- ⏳ `merchtrader.org` - **Issuing TLS certificate** (pending, ~5-10 minutes)

**Root Cause**: Android is trying to connect to `merchtrader.org` (without www) which doesn't have a valid SSL certificate yet.

**Immediate Solution**:
1. **Use `www.merchtrader.org`** - This domain already has SSL and is working
2. The codebase already normalizes URLs to use `www.merchtrader.org` (see `config/environment.ts`)
3. Wait for Railway to finish issuing the certificate for `merchtrader.org` (should complete automatically)

**After Certificate Issues**:
- Both `merchtrader.org` and `www.merchtrader.org` will work
- Consider setting up a redirect from `merchtrader.org` → `www.merchtrader.org` for consistency

**Verification**:
```bash
# Check www.merchtrader.org (should work now)
openssl s_client -connect www.merchtrader.org:443 -servername www.merchtrader.org

# Check merchtrader.org (will work after certificate issues)
openssl s_client -connect merchtrader.org:443 -servername merchtrader.org
```

### Solution 2: Optimize Playlist Fetching to Prevent Pool Exhaustion

**Option A: Batch Playlist Fetching (Recommended)**
- Limit concurrent playlist fetches to 5-10 at a time
- Use a concurrency limiter or batch processing

**Option B: Optimize Database Queries**
- Rewrite `getPlaylistWithMedia()` to use JOINs instead of multiple queries
- Fetch all playlists with media in a single query

**Option C: Increase Database Pool Size**
- Increase `DB_POOL_MAX` environment variable
- Monitor database connection usage
- Note: This is a temporary fix, not a solution

## Implementation Plan

### Priority 1: Fix Database Pool Exhaustion (Immediate)
1. Implement batch processing for playlist fetching
2. Add connection pool monitoring
3. Test with 26+ playlists

### Priority 2: Fix SSL Certificate (Critical for Android)
1. Configure Railway custom domain SSL
2. Verify certificate is valid
3. Test on Android device
4. Update Android network security config if needed

## Testing Checklist

- [ ] Playlist fetching doesn't freeze with 26+ playlists
- [ ] Database pool connections stay under max limit
- [ ] SSL certificate validates correctly for merchtrader.org
- [ ] Android app can connect without certificate errors
- [ ] No connection timeout errors in logs
- [ ] System remains responsive under load

