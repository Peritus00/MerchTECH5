
import { Stack } from 'expo-router';

export default function StoreLayout() {
  return (
    <Stack>
      <Stack.Screen name="cart" options={{ title: 'Shopping Cart' }} />
    </Stack>
  );
}
