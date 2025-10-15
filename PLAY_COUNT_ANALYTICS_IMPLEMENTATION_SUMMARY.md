# Play Count & Analytics Implementation Summary

## ✅ Completed Components

### 1. Database Schema (Migration 008)
- **File**: `database/migrations/008_add_analytics_tracking.sql`
- Created tables:
  - `media_plays` - Track individual media playback events (>= 30 seconds)
  - `playlist_plays` - Track playlist playback sessions
  - `slideshow_plays` - Track slideshow playback sessions
  - `cart_events` - Track cart additions
  - `purchase_events` - Track completed purchases
- Added columns to existing tables:
  - `media`: `total_plays`, `unique_plays`
  - `playlists`: `total_plays`, `unique_plays`, `times_created`
  - `slideshows`: `total_plays`, `unique_plays`, `times_created`
- Added indexes for performance

### 2. Session Tracking Utility
- **File**: `utils/sessionTracking.ts`
- Generates and maintains UUID session IDs
- Session duration: 24 hours
- Stored in AsyncStorage
- Functions:
  - `getSessionId()` - Get or create session
  - `clearSession()` - Clear current session
  - `regenerateSession()` - Force new session

### 3. Analytics Service Updates
- **File**: `services/analyticsService.ts`
- Added tracking methods:
  - `trackMediaPlay(mediaId, duration, sessionId, userId?)` - Track media plays >= 30s
  - `trackPlaylistPlay(playlistId, duration, sessionId, userId?)`
  - `trackSlideshowPlay(slideshowId, duration, sessionId, userId?)`
  - `trackCartAdd(productId, quantity, sessionId, userId?)`
  - `trackPurchase(stripeSessionId, items, totalAmount, userId?)`
- Added retrieval methods:
  - `getPlayStats(userId?)` - Get play statistics
  - `getCartConversionStats(userId?)` - Get cart conversion metrics

### 4. Backend API Endpoints
- **File**: `services/Server/main.js`
- **Tracking Endpoints**:
  - `POST /api/analytics/track-media-play` - Record media plays >= 30s
  - `POST /api/analytics/track-playlist-play` - Record playlist plays
  - `POST /api/analytics/track-slideshow-play` - Record slideshow plays
  - `POST /api/analytics/track-cart-add` - Record cart additions
  - `POST /api/analytics/track-purchase` - Record completed purchases
- **Retrieval Endpoints**:
  - `GET /api/analytics/play-stats?userId=X` - Get play statistics
  - `GET /api/analytics/cart-conversion?userId=X` - Get cart conversion data
- **Features**:
  - Unique play detection based on session_id
  - Aggregate counters automatically updated
  - 30-second minimum duration enforced
  - IP address tracking

### 5. Stripe Webhook Handler
- **File**: `services/Server/main.js`
- **Endpoint**: `POST /api/webhooks/stripe`
- Handles `checkout.session.completed` events
- Verifies webhook signature with `STRIPE_WEBHOOK_SECRET`
- Automatically tracks purchases in `purchase_events` table
- Prevents duplicate purchase tracking
- **Configuration Needed**: Add webhook URL in Stripe Dashboard:
  - URL: `https://www.merchtech.net/api/webhooks/stripe`
  - Events: `checkout.session.completed`, `payment_intent.succeeded`

### 6. Creation Counter Increments
- **Files**: `services/Server/main.js`
- Updated playlist creation endpoint to set `times_created = 1`
- Updated slideshow creation endpoint to set `times_created = 1`
- Automatically tracks when content is created

### 7. Cart Tracking
- **File**: `contexts/CartContext.tsx`
- Updated `addToCart` method to track additions
- Calls `analyticsService.trackCartAdd()` with session ID
- Non-blocking (doesn't fail if analytics fails)

### 8. Purchase Tracking
- **File**: `app/store/checkout-success.tsx`
- Tracks purchase from checkout success page
- Extracts Stripe session ID from URL
- Tracks before clearing cart
- Prevents duplicate tracking with state flag
- Works alongside Stripe webhook for redundancy

### 9. Analytics Dashboard
- **File**: `app/(tabs)/analytics.tsx`
- Added state for play stats and cart conversion
- Fetches new metrics in `fetchAllAnalytics()`
- **New Sections**:
  - **Media Engagement**:
    - Total Media Plays
    - Unique Plays
    - Playlists Created
    - Slideshows Created
    - Most Played Media list (top 5)
  - **Commerce Analytics**:
    - Items Added to Cart
    - Items Purchased
    - Conversion Rate (%)
    - Total Revenue ($)

### 10. Media Player Tracking
- **File**: `components/MediaPlayer.tsx`
- Added play duration tracking with 1-second timer
- Tracks when playback reaches 30 seconds
- Tracks both individual media and parent playlist/slideshow
- Automatically stops tracking when paused
- Resets tracking for new media items

## 🔄 Remaining Implementation

### 1. PlaylistPlayer Component
- **File**: `components/PlaylistPlayer.tsx`
- **What to add**:
  ```typescript
  // Add imports
  import { analyticsService } from '../services/analyticsService';
  import { getSessionId } from '../utils/sessionTracking';
  import { useAuth } from '../contexts/AuthContext';

  // Add state/refs
  const playDurationRef = useRef<number>(0);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasTrackedPlayRef = useRef<boolean>(false);
  const currentMediaIdRef = useRef<number | null>(null);
  const { user } = useAuth();

  // Add tracking functions (same pattern as MediaPlayer)
  const startPlayTracking = useCallback(async (mediaItem) => {
    // Reset for new media
    if (currentMediaIdRef.current !== mediaItem.id) {
      playDurationRef.current = 0;
      hasTrackedPlayRef.current = false;
      currentMediaIdRef.current = mediaItem.id;
    }

    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
    }

    playTimerRef.current = setInterval(async () => {
      playDurationRef.current += 1;

      if (playDurationRef.current >= 30 && !hasTrackedPlayRef.current) {
        hasTrackedPlayRef.current = true;
        const sessionId = await getSessionId();
        
        // Track media and playlist
        if (mediaItem.id) {
          await analyticsService.trackMediaPlay(
            mediaItem.id,
            playDurationRef.current,
            sessionId,
            user?.id
          );
        }
        if (playlist?.id) {
          await analyticsService.trackPlaylistPlay(
            playlist.id,
            playDurationRef.current,
            sessionId,
            user?.id
          );
        }
      }
    }, 1000);
  }, [playlist, user]);

  // Add effect to manage tracking based on isPlaying state
  useEffect(() => {
    const currentMedia = media[currentIndex];
    if (isPlaying && currentMedia) {
      startPlayTracking(currentMedia);
    } else {
      stopPlayTracking();
    }
    return () => stopPlayTracking();
  }, [isPlaying, currentIndex, media]);
  ```

### 2. PreviewPlayer Component
- **File**: `components/PreviewPlayer.tsx`
- Follow same pattern as MediaPlayer
- Track both individual media and parent playlist
- Consider preview duration vs full play distinction

## 📝 Configuration Required

### Environment Variables
Add to `.env` and `env.merchtrader.production`:
```
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Stripe Dashboard Configuration
1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://www.merchtech.net/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### Database Migration
Run the migration to create new tables:
```bash
psql $DATABASE_URL < database/migrations/008_add_analytics_tracking.sql
```

## 🧪 Testing Checklist

- [ ] Test media play tracking (< 30s should not track)
- [ ] Test media play tracking (>= 30s should track)
- [ ] Test unique play detection (same session should not create unique)
- [ ] Test playlist play tracking
- [ ] Test slideshow play tracking
- [ ] Test cart addition tracking
- [ ] Test purchase tracking from checkout-success page
- [ ] Test Stripe webhook with test checkout
- [ ] Verify analytics dashboard displays all new metrics
- [ ] Test times_created increment for playlists
- [ ] Test times_created increment for slideshows
- [ ] Test conversion rate calculation
- [ ] Verify data persists across sessions

## 📊 Analytics Data Structure

### Play Stats Response
```json
{
  "media": {
    "totalPlays": 150,
    "uniquePlays": 95,
    "averageDuration": 127
  },
  "playlists": {
    "totalPlays": 45,
    "uniquePlays": 30,
    "timesCreated": 12
  },
  "slideshows": {
    "totalPlays": 23,
    "uniquePlays": 18,
    "timesCreated": 8
  },
  "mostPlayedMedia": [
    { "id": 5, "title": "Track 1", "total_plays": 50, "unique_plays": 35 }
  ]
}
```

### Cart Conversion Response
```json
{
  "totalItemsAddedToCart": 342,
  "totalItemsPurchased": 128,
  "conversionRate": 37.43,
  "totalPurchases": 64,
  "totalRevenue": 12850,
  "averageOrderValue": 2008
}
```

## 🎯 Key Features

1. **30-Second Threshold**: Only plays >= 30 seconds are tracked
2. **Unique Play Detection**: Based on session_id (24-hour sessions)
3. **Dual Purchase Tracking**: Both webhook and success page for reliability
4. **Non-Blocking Analytics**: Failures don't affect user experience
5. **Real-Time Aggregate Counters**: Updated immediately on each tracked event
6. **User-Specific Analytics**: Can filter by user ID or view global stats
7. **Comprehensive Dashboard**: Visual representation of all metrics

## 🚀 Next Steps

1. Complete PlaylistPlayer tracking implementation
2. Complete PreviewPlayer tracking implementation
3. Add `STRIPE_WEBHOOK_SECRET` to production environment
4. Configure Stripe webhook endpoint
5. Run database migration in production
6. Test all tracking functionality
7. Monitor analytics data collection
8. Consider adding time-based analytics (daily/weekly trends)
9. Consider adding export functionality for analytics data

