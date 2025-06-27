import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';

export default function SubscriptionSuccessScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState('Processing your subscription...');

  useEffect(() => {
    const sendVerificationEmail = async () => {
      if (!user?.email) {
        setStatus('Could not find user email. Please log in and try again.');
        return;
      }

      try {
        setStatus('Payment successful! Sending verification email...');
        
        const response = await fetch(`${API_BASE_URL}/auth/send-verification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });

        if (!response.ok) {
          throw new Error('Failed to send verification email.');
        }

        setStatus('Verification email sent! Please check your inbox to complete setup.');
        Alert.alert(
          'Email Sent!',
          'Please check your inbox (and spam folder) to verify your account.'
        );

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        setStatus(`Error: ${errorMessage}`);
        Alert.alert('Error', 'Could not send verification email. You can request another from your profile.');
      }
    };

    sendVerificationEmail();
  }, [user]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          🎉 Subscription Activated!
        </ThemedText>
        <ActivityIndicator size="large" style={styles.spinner} animating={status.includes('Processing') || status.includes('Sending')} />
        <ThemedText style={styles.statusText}>{status}</ThemedText>
        {/* FIX: Corrected the router path to remove the trailing slash. */}
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/(tabs)')}>
          <ThemedText style={styles.buttonText}>Go to Dashboard</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 24,
    alignItems: 'center',
    maxWidth: 400,
  },
  title: {
    marginBottom: 24,
    textAlign: 'center',
  },
  spinner: {
    marginVertical: 24,
  },
  statusText: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
