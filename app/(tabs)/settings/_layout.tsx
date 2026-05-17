import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="user-permissions" options={{ title: 'User Permissions' }} />
      <Stack.Screen name="restore-deleted" options={{ title: 'Restore Deleted Items' }} />
      <Stack.Screen name="master-store-manager" options={{ title: 'Master Store Manager' }} />
      <Stack.Screen name="enhanced-sales-reports" options={{ title: 'Enhanced Sales Reports' }} />
      <Stack.Screen name="master-sales-reports" options={{ title: 'Master Sales Reports' }} />
      <Stack.Screen name="purchase-notifications" options={{ title: 'Purchase Notifications' }} />
      <Stack.Screen name="preview-leads" options={{ title: 'Preview leads', headerShown: false }} />
      <Stack.Screen name="text-campaigns" options={{ title: 'Text campaigns', headerShown: false }} />
      <Stack.Screen name="debug-logs" options={{ title: 'Debug Logs', headerShown: false }} />
    </Stack>
  );
} 