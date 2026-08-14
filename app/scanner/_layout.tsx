import { Stack } from 'expo-router';

export default function ScannerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        statusBarHidden: true,
      }}
    />
  );
}
