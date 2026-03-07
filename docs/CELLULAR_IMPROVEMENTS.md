# Cellular / Non-WiFi Performance Improvements

## Implemented Changes

### Phase 1: Offline-Aware Data Layer
- Persisted React Query cache to AsyncStorage (24h max age)
- Network state detection via `@react-native-community/netinfo` (native) and `navigator.onLine` (web)
- React Query `onlineManager` wired to network state
- `useOfflineQuery` hook with `networkMode: 'offlineFirst'` for cached reads
- Offline/reconnecting banner in app shell

### Phase 2: Cached Reads
- Dashboard: `useDashboardData` with persisted cache, shows last synced data when offline
- Playlist player: `usePlaylistAccess` with 2min stale time
- Slideshow player: `useSlideshowAccess` with 2min stale time

### Phase 3: Reduced Round Trips
- New `/api/dashboard/counts` endpoint returns QR codes, playlists, slideshows, products, activation codes counts in one request
- Dashboard reduced from 6 API calls to 2 (analytics + counts)

### Phase 4: Media Prefetch
- `useMediaPrefetch` in PlaylistPlayer prefetches next 2 image assets
- MobileCompatibleImage switched to expo-image with `cachePolicy="disk"`

### Phase 5: Write Queue
- `pendingActionsQueue` stores failed analytics writes (trackQRScan, trackMediaPlay, trackPlaylistPlay, trackSlideshowPlay)
- Flush on reconnect in NetworkContext

## Metrics to Instrument

| Metric | Description | Target |
|--------|-------------|--------|
| Cold load time (cellular) | Time from app open to first meaningful content | < 3s with cache |
| Cache hit rate | % of reads served from cache | > 60% on cellular |
| Request count per screen | Dashboard, analytics, player screens | Dashboard: 2 (was 6) |
| Playlist/slideshow startup | Time to first frame | < 2s with prefetch |
| Queued actions replayed | Count of actions replayed on reconnect | Log on reconnect |

## Test Scenarios

1. **Offline dashboard**: Turn off network, open app, confirm cached dashboard loads
2. **Reconnect flush**: Go offline, trigger analytics (scan QR, play media), go online, confirm queue flushes
3. **Cellular throttling**: Use Chrome DevTools Network throttling (Slow 3G), verify dashboard loads from cache first
4. **Playlist prefetch**: Start playlist, advance to next track, verify next image loads faster

## Rollout Order

1. **Already shipped**: Persisted cache, network detection, offline banner, dashboard/player cached reads
2. **Already shipped**: Dashboard counts endpoint, media prefetch, analytics write queue
3. **Future**: Resumable multipart S3 uploads (requires backend multipart API)
4. **Future**: Feature flags for gradual rollout if needed

## Files Touched

- `app/_layout.tsx` - PersistQueryClientProvider, NetworkProvider, OfflineBanner
- `lib/queryClient.ts` - Persisted query client config
- `contexts/NetworkContext.tsx` - Network state, flush on reconnect
- `hooks/useOfflineQuery.ts` - Offline-first query defaults
- `hooks/useDashboardData.ts` - Cached dashboard
- `hooks/usePlaylistAccess.ts`, `hooks/useSlideshowAccess.ts` - Cached access
- `hooks/useMediaPrefetch.ts` - Next-asset prefetch
- `services/pendingActionsQueue.ts` - Write queue
- `services/analyticsService.ts` - Queue on failure
- `services/Server/main.js` - `/api/dashboard/counts`
- `components/OfflineBanner.tsx` - Offline UX
- `components/MobileCompatibleImage.tsx` - expo-image with disk cache
