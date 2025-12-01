# Create Web Application OAuth Client

## Problem
The "Desktop" client type doesn't support redirect URIs for web applications. You need to create a **Web application** client.

## Steps to Create Web Application Client

### 1. In Google Cloud Console
1. You're already on the **Clients** page (I can see your Desktop, iOS, and Android clients)
2. Click the **"+ Create client"** button at the top

### 2. Select Application Type
1. In the "Create client" dialog, you'll see application type options
2. Select **"Web application"** (NOT Desktop, iOS, or Android)
3. If you don't see "Web application" as an option, look for:
   - "Web" 
   - "Web app"
   - Or it might be under a different category

### 3. Configure the Web Client
1. **Name**: Enter something like `MerchTrader Web` or `Web Client`
2. **Authorized JavaScript origins**: Click "+ Add URI" and add:
   ```
   https://www.merchtrader.org
   https://app.merchtrader.org
   http://localhost:8081
   ```
3. **Authorized redirect URIs**: Click "+ Add URI" and add:
   ```
   https://www.merchtrader.org/auth/google
   https://app.merchtrader.org/auth/google
   http://localhost:8081/auth/google
   ```
4. Click **"Create"** or **"Save"**

### 4. Copy the New Client ID
- After creating, you'll see a new Client ID (it will start with `587879962618-` followed by different characters)
- Copy this full Client ID

### 5. Update Environment Variables

#### In Vercel:
1. Go to your Vercel project
2. Settings → Environment Variables
3. Find `EXPO_PUBLIC_GOOGLE_CLIENT_ID`
4. Replace the current value (Android client ID) with the **new Web Client ID**
5. Save

#### In Railway (optional):
1. Update `GOOGLE_CLIENT_ID` with the same Web Client ID
2. This ensures consistency

### 6. Keep Your Other Clients
- **Keep the Desktop client** - you might need it later
- **Keep the Android client** - needed for mobile apps
- **Keep the iOS client** - needed for iOS apps
- **Use the new Web client** - for web sign-in only

## Important Notes

- The **Web application** client type is different from Desktop
- Web clients support redirect URIs, Desktop clients don't
- You can have multiple client types in the same project
- Each client type serves a different purpose

## If You Don't See "Web Application" Option

If the new Google Auth Platform interface doesn't show "Web application" as an option:

1. Try clicking on your **Desktop client** to edit it
2. Look for the **"edit authorized redirect urls"** button at the top of the page (I can see it in your screenshot)
3. Click that button - it might allow you to add redirect URIs even to Desktop clients
4. Add: `https://www.merchtrader.org/auth/google`

## Alternative: Use the "edit authorized redirect urls" Button

I noticed there's an **"edit authorized redirect urls"** button at the top of your Google Cloud Console page. Try clicking that button - it might allow you to configure redirect URIs for your existing Desktop client.

