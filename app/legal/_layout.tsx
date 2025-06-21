
import { Stack } from 'expo-router';

export default function LegalLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#3b82f6',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="privacy" 
        options={{ 
          title: 'Privacy Policy',
          headerBackTitle: 'Back'
        }} 
      />
      <Stack.Screen 
        name="terms" 
        options={{ 
          title: 'Terms of Service',
          headerBackTitle: 'Back'
        }} 
      />
    </Stack>
  );
}
