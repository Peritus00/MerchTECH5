import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="user-permissions" options={{ title: 'User Permissions' }} />
      <Stack.Screen name="master-store-manager" options={{ title: 'Master Store Manager' }} />
      <Stack.Screen name="enhanced-sales-reports" options={{ title: 'Enhanced Sales Reports' }} />
      <Stack.Screen name="master-sales-reports" options={{ title: 'Master Sales Reports' }} />

    </Stack>
  );
} 