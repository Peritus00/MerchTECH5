# Login Screen Flickering Fixes - Summary

## Changes Made

### 1. **Optimized State Management**
- Used `useCallback` for all event handlers to prevent unnecessary re-renders
- Used `useMemo` for computed values (`loading`, `keyboardBehavior`)
- Separated input change handlers to reduce re-render scope

### 2. **Android-Specific Keyboard Handling**
- Changed `KeyboardAvoidingView` behavior from `'height'` to `'padding'` on Android
  - `'height'` causes layout recalculations that lead to flickering
  - `'padding'` provides smoother keyboard transitions
- Added `keyboardVerticalOffset` for better Android positioning

### 3. **ScrollView Optimizations**
- Added `removeClippedSubviews={Platform.OS === 'android'}` to improve performance
- Added `bounces={false}` to prevent unnecessary scroll recalculations
- Added Android-specific style optimizations to prevent layout shifts

### 4. **Performance Monitoring**
- Added debug logging (only in development mode) to track re-renders
- Logs show when and why the component re-renders

### 5. **TouchableOpacity Optimizations**
- Added `activeOpacity` props for better visual feedback
- Prevents unnecessary re-renders during touch interactions

### 6. **TextInput Optimizations**
- Added `textContentType` props for better iOS/Android integration
- Helps prevent unnecessary re-renders

## Key Fixes for Android Flickering

### Primary Fix: KeyboardAvoidingView Behavior
**Before:**
```typescript
behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
```

**After:**
```typescript
behavior={keyboardBehavior} // 'padding' for both platforms
keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
```

The `'height'` behavior on Android causes the view to resize when the keyboard appears, leading to layout recalculations and flickering. Using `'padding'` provides a smoother transition.

### Secondary Fix: Memoized Handlers
All event handlers are now wrapped in `useCallback` to prevent child components from re-rendering unnecessarily.

## Testing Instructions

### 1. Test on Android Device
- Open the login screen
- Type in email and password fields
- Observe if flickering occurs:
  - When keyboard appears/disappears
  - While typing
  - When clicking login button
  - During login process

### 2. Monitor Console Logs
In development mode, check console for render logs:
```
🔄 LoginScreen render: { isLoading: false, isSubmitting: false, ... }
```

If you see excessive renders, note what triggers them.

### 3. Test Scenarios
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Toggle password visibility
- [ ] Navigate to forgot password
- [ ] Navigate to register screen
- [ ] Test with keyboard visible/hidden

### 4. Performance Check
- Monitor app performance during login
- Check for any remaining flickering
- Verify smooth transitions

## Additional Recommendations

### If Flickering Persists:

1. **Check AuthContext Updates**
   - Monitor `isLoading` state changes in AuthContext
   - Consider debouncing rapid state updates

2. **Check Navigation Logic**
   - Review routing logic in `app/_layout.tsx`
   - The 100ms timeout might cause navigation flickers

3. **Consider React.memo**
   - Wrap `MerchTechLogo` component in `React.memo`
   - Wrap `ThemedView` and `ThemedText` if needed

4. **Android Manifest Settings**
   - Consider adding `android:windowSoftInputMode="adjustResize"` to AndroidManifest.xml
   - This can provide better keyboard handling than KeyboardAvoidingView

5. **Test on Different Android Versions**
   - Some Android versions handle keyboard differently
   - Test on Android 10, 11, 12, 13, 14 if possible

## Debugging Tips

### Enable Performance Monitoring
The code includes debug logging that only runs in development:
```typescript
const DEBUG_RENDERS = __DEV__;
```

### Check Re-render Frequency
If flickering persists, check:
1. How many times the component re-renders during login
2. What state changes trigger re-renders
3. If AuthContext `isLoading` changes are causing issues

### Use React DevTools Profiler
1. Install React DevTools
2. Use Profiler to identify components causing re-renders
3. Look for components rendering more than necessary

## Next Steps

1. **Test the fixes** on your Android device
2. **Monitor console logs** for render patterns
3. **Report findings** - note when flickering occurs (if any)
4. **Test on iOS** when available to ensure no regressions

## Files Modified

- `app/auth/login.tsx` - Optimized with useCallback, useMemo, and Android-specific fixes

## Related Files to Review

- `contexts/AuthContext.tsx` - Check if `isLoading` updates are optimized
- `app/_layout.tsx` - Review navigation logic timing
- `components/ThemedView.tsx` - Consider memoization if needed
- `components/ThemedText.tsx` - Consider memoization if needed

