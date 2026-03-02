import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="verify-email" options={{ headerShown: false }} />
      <Stack.Screen name="verification-success" options={{ headerShown: false }} />
      {/* OAuth callback routes - must be registered to prevent not-found on redirect */}
      <Stack.Screen name="google" options={{ headerShown: false }} />
      <Stack.Screen name="apple" options={{ headerShown: false }} />
    </Stack>
  );
}
