import { Stack } from 'expo-router';

export default function POSLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[eventId]" options={{ headerShown: false }} />
    </Stack>
  );
}
