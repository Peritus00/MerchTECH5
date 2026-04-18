import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/services/api';

/**
 * Public route opened from SMS link. Marks the preview lead as verified; the access tab polls until verified.
 */
export default function PreviewVerifyScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLocalSearchParams<{ t?: string }>();
  const [status, setStatus] = useState<'loading' | 'ok' | 'err'>('loading');
  const [message, setMessage] = useState('Verifying…');

  useEffect(() => {
    const token = typeof t === 'string' ? t : Array.isArray(t) ? t[0] : '';
    if (!token) {
      setStatus('err');
      setMessage('Missing verification link. Please use the link from your text message.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post('/preview-leads/verify', { token });
        if (cancelled) return;
        if (res.data?.ok) {
          setStatus('ok');
          setMessage('Your phone is verified. Return to the preview tab in this browser to continue.');
        } else {
          setStatus('err');
          setMessage(res.data?.error || 'Verification failed.');
        }
      } catch (e: any) {
        if (cancelled) return;
        setStatus('err');
        setMessage(e.response?.data?.error || e.message || 'Verification failed.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <ScrollView
      style={[styles.root, { paddingTop: insets.top + 24 }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.card}>
        {status === 'loading' && <ActivityIndicator size="large" color="#3b82f6" style={{ marginBottom: 16 }} />}
        <Text style={styles.title}>Phone verification</Text>
        <Text style={[styles.body, status === 'ok' && styles.ok, status === 'err' && styles.err]}>
          {message}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12 },
  body: { fontSize: 16, color: '#4b5563', lineHeight: 24 },
  ok: { color: '#059669' },
  err: { color: '#b91c1c' },
});
