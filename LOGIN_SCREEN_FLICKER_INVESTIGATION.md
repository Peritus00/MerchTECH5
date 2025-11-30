# Login Screen Flickering Investigation Guide

## Potential Causes Identified

### 1. **Multiple State Updates During Login**
The login process triggers multiple state updates that can cause re-renders:
- `isSubmitting` state changes
- `isLoading` from AuthContext changes
- `errors` state updates
- Navigation triggers

### 2. **KeyboardAvoidingView Behavior on Android**
Android uses `behavior="height"` which can cause layout shifts and flickering when the keyboard appears/disappears.

### 3. **AuthContext State Changes**
The `isLoading` state in AuthContext changes multiple times:
- Initial: `false` → `true` (when login starts)
- Final: `true` → `false` (when login completes)

### 4. **Theme Hook Re-renders**
`ThemedView` and `ThemedText` call `useThemeColor` on every render, which might cause unnecessary re-renders.

### 5. **Navigation Logic in Root Layout**
The routing logic in `_layout.tsx` has a 100ms timeout and multiple conditions that could cause navigation flickers.

### 6. **ScrollView + KeyboardAvoidingView Combination**
This combination can cause layout recalculations on Android, especially when combined with state updates.

## Investigation Steps

### Step 1: Add Performance Monitoring
Add React DevTools Profiler or console logs to identify which components are re-rendering:

```typescript
// Add to login.tsx
useEffect(() => {
  console.log('🔄 LoginScreen render:', {
    isLoading,
    isSubmitting,
    errors,
    email: email.length,
  });
}, [isLoading, isSubmitting, errors, email]);
```

### Step 2: Check Android-Specific Issues
- Test with different Android versions
- Check if flickering occurs:
  - Before typing credentials
  - While typing
  - After clicking login button
  - During the login process
  - After successful login

### Step 3: Monitor State Changes
Add logging to AuthContext to track state changes:

```typescript
// In AuthContext.tsx login function
console.log('🔐 AuthContext isLoading:', isLoading);
```

### Step 4: Test Keyboard Behavior
- Try logging in with keyboard visible vs hidden
- Test with different keyboard types
- Check if flickering occurs when keyboard appears/disappears

## Potential Fixes

### Fix 1: Optimize State Updates
Use `useCallback` and `useMemo` to prevent unnecessary re-renders.

### Fix 2: Improve KeyboardAvoidingView
Consider using `android:windowSoftInputMode="adjustResize"` in AndroidManifest.xml instead of KeyboardAvoidingView.

### Fix 3: Debounce State Updates
Debounce rapid state changes during login.

### Fix 4: Memoize Themed Components
Memoize ThemedView and ThemedText to prevent unnecessary re-renders.

### Fix 5: Optimize Navigation Logic
Reduce the navigation timeout or improve the routing conditions.

### Fix 6: Use React.memo
Wrap components in React.memo to prevent unnecessary re-renders.

## Testing Checklist

- [ ] Test on Android device (not emulator)
- [ ] Test with different Android versions
- [ ] Test with keyboard visible/hidden
- [ ] Test login flow multiple times
- [ ] Check console logs for re-render patterns
- [ ] Monitor performance with React DevTools
- [ ] Test with slow network connection
- [ ] Test with fast network connection

## Next Steps

1. Add performance monitoring to identify the exact cause
2. Implement fixes based on investigation results
3. Test fixes on Android device
4. Verify flickering is resolved
5. Test on iOS when available

