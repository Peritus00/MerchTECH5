import React from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import PurchaseNotifications from '@/components/PurchaseNotifications';

export default function PurchaseNotificationsScreen() {
  console.log('🔔 PURCHASE NOTIFICATIONS SCREEN: Component rendering');
  console.log('🔔 PURCHASE NOTIFICATIONS SCREEN: About to render PurchaseNotifications component');
  
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Purchase Notifications',
          headerShown: true,
          headerBackTitleVisible: false,
        }}
      />
      <PurchaseNotifications />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
}); 