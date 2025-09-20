# Testing the New Audio Picker Feature

## 🎵 Issue: Still Seeing File Upload Dialog

You're still seeing the old file upload dialog instead of the new AudioMediaPicker. Here are the steps to resolve this:

## 🔧 Troubleshooting Steps

### 1. **Clear Browser/App Cache**

**For Web (Browser):**
```bash
# Hard refresh the page
Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

# Or clear browser cache completely
# Chrome: Settings > Privacy > Clear browsing data
```

**For Mobile App (Expo):**
```bash
# Restart the Expo development server with cache clearing
npx expo start --clear

# Then refresh the app on your phone
```

### 2. **Check Console Logs**

When you click "Add Background Music", you should see this log:
```
🎵 SLIDESHOW handleAddAudio: Opening audio media picker
```

If you see this instead, it means the old code is still running:
```
🎵 SLIDESHOW handleAddAudio: Starting audio selection
```

### 3. **Verify the Code is Updated**

The updated `handleAddAudio` function should be:
```typescript
const handleAddAudio = () => {
  console.log('🎵 SLIDESHOW handleAddAudio: Opening audio media picker');
  setShowAudioPicker(true);
};
```

NOT the old version:
```typescript
const handleAddAudio = async () => {
  // DocumentPicker code...
};
```

### 4. **Force Deployment Update**

If the issue persists, let's force a deployment update:

```bash
# Add a small change to trigger redeployment
git add .
git commit -m "fix: Force deployment update for audio picker"
git push origin main
```

## 🧪 Testing the New Feature

Once the AudioMediaPicker is working, you should see:

### **Expected Behavior:**
1. Click "Add Background Music"
2. **NEW:** A modal appears showing your existing audio files
3. **NEW:** You can select from existing audio files
4. **NEW:** Upload button in the top right for new files
5. **NEW:** Visual indicators for currently selected audio

### **Old Behavior (What you're seeing now):**
1. Click "Add Background Music"  
2. **OLD:** System file picker opens immediately
3. **OLD:** Must upload a new file every time

## 🔍 Debug Information

### Check These Files:
1. **`components/SlideshowImageManager.tsx`** - Should import AudioMediaPicker
2. **`components/AudioMediaPicker.tsx`** - Should exist and be complete
3. **Console logs** - Should show the new log messages

### Expected File Structure:
```
components/
├── SlideshowImageManager.tsx (updated)
├── AudioMediaPicker.tsx (new)
└── ...
```

## 🚀 Quick Test Commands

```bash
# 1. Verify files exist
ls -la components/Audio*

# 2. Check the import in SlideshowImageManager
grep -n "AudioMediaPicker" components/SlideshowImageManager.tsx

# 3. Restart development server
npx expo start --clear
```

## 📱 Mobile Testing

If you're testing on mobile:
1. Make sure you're using the correct IP address for your development server
2. The mobile app might be cached - try force-closing and reopening
3. Check that your phone is on the same WiFi network

## ✅ Success Indicators

The feature is working when you see:
- ✅ Modal with list of your existing audio files
- ✅ Upload button (cloud icon) in the modal header
- ✅ File information (size, format) displayed
- ✅ Visual selection indicators
- ✅ "Currently selected" indicator for active audio

## 🆘 If Still Not Working

1. **Check browser developer tools** for JavaScript errors
2. **Verify the deployment** completed successfully
3. **Try a different browser** to rule out caching issues
4. **Check the network tab** for failed requests

Let me know what you see in the console logs when you click the button!
