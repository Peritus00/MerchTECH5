import { Stack } from 'expo-router';

export default function StoreLayout() {
  return (
    <Stack>
      <Stack.Screen name="cart" options={{ title: 'Shopping Cart' }} />
      <Stack.Screen name="manager" options={{ title: 'My Store Manager' }} />
      <Stack.Screen name="sales" options={{ title: 'My Sales Reports' }} />
      <Stack.Screen name="product/[id]" options={{ title: 'Product Details' }} />
      <Stack.Screen name="checkout-cancel" options={{ title: 'Checkout Cancelled' }} />
    </Stack>
  );
}
