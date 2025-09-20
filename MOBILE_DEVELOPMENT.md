# Mobile Development Setup Guide

## 🔍 Problem: Mobile Upload Network Errors

If you're experiencing network errors when uploading files from your mobile device but web uploads work fine, this is likely because your mobile app cannot access `localhost` on your development machine.

## 🔧 Solution

### Quick Fix

1. **Find your computer's IP address:**
   ```bash
   ./scripts/setup-mobile-dev.sh
   ```

2. **Start Expo with the correct API URL:**
   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.1.180:5001/api npx expo start --clear
   ```
   (Replace `192.168.1.180` with your actual IP address)

### Manual Setup

1. **Find your computer's local IP address:**
   - **macOS/Linux:** `ifconfig | grep "inet " | grep -v 127.0.0.1`
   - **Windows:** `ipconfig` (look for IPv4 Address)

2. **Set the environment variable:**
   ```bash
   export EXPO_PUBLIC_API_URL=http://YOUR_IP_ADDRESS:5001/api
   ```

3. **Clear Expo cache and restart:**
   ```bash
   npx expo start --clear
   ```

## 🚨 Troubleshooting

### Network Error Still Occurs?

1. **Check your backend server is running:**
   ```bash
   curl http://YOUR_IP_ADDRESS:5001/api/health
   ```

2. **Verify your mobile device is on the same WiFi network**

3. **Check firewall settings:**
   - Make sure port 5001 is not blocked by your firewall
   - On macOS: System Preferences > Security & Privacy > Firewall
   - Allow incoming connections for Node.js

4. **Test the connection from mobile:**
   - Open your mobile browser
   - Navigate to `http://YOUR_IP_ADDRESS:5001/api/health`
   - You should see a JSON response

### FormData Issues?

The app handles FormData differently on mobile vs web:
- **Web:** Uses File objects
- **Mobile:** Uses `{ uri, name, type }` objects

This is already handled in the code, but if you see FormData-related errors, check the `mediaAPI.uploadFile` function in `services/api.ts`.

## 🎯 Key Points

- **Web development:** Uses `http://localhost:5001/api` ✅
- **Mobile development:** Uses `http://YOUR_IP:5001/api` ✅
- **Production:** Uses `https://merchtech5-production.up.railway.app/api` ✅

## 📱 Testing Checklist

- [ ] Backend server running on port 5001
- [ ] Mobile device on same WiFi network
- [ ] EXPO_PUBLIC_API_URL set to your IP address
- [ ] Expo cache cleared with `--clear` flag
- [ ] Firewall allows port 5001
- [ ] Can access health endpoint from mobile browser
