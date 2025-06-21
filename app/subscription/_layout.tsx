
import { Stack } from 'expo-router';

export default function SubscriptionLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Subscription Plans',
        }}
      />
      <Stack.Screen
        name="checkout"
        options={{
          title: 'Checkout',
        }}
      />
      <Stack.Screen
        name="success"
        options={{
          title: 'Success',
        }}
      />
    </Stack>
  );
}
