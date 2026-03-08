import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MaterialIcons } from '@expo/vector-icons';
import { couponAPI } from '@/services/api';

export default function AdminCouponsScreen() {
  const router = useRouter();
  const [smsConfigured, setSmsConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    couponAPI.getSmsStatus().then((r) => setSmsConfigured(r?.configured === true)).catch(() => setSmsConfigured(false));
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="title" style={styles.title}>Admin: Coupons & SMS</ThemedText>
        <ThemedText style={styles.subtitle}>Manage sitewide coupons and preview gate settings.</ThemedText>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="sms" size={24} color="#3b82f6" />
            <ThemedText style={styles.cardTitle}>Brevo SMS Delivery</ThemedText>
          </View>
          {smsConfigured === null ? (
            <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 12 }} />
          ) : smsConfigured ? (
            <ThemedText style={styles.statusOk}>✓ Brevo SMS is configured. Coupon texts will be delivered.</ThemedText>
          ) : (
            <ThemedText style={styles.statusWarn}>
              ⚠ Brevo SMS is not configured. Set BREVO_API_KEY and BREVO_SMS_SENDER in your environment. Coupon SMS will fail until configured.
            </ThemedText>
          )}
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Preview Gate</ThemedText>
          <ThemedText style={styles.cardDesc}>
            When visitors tap "Preview" on playlist/slideshow access, they see a phone + consent modal. If skip is allowed, they can skip to the 30-second preview without receiving a coupon.
          </ThemedText>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color="#3b82f6" />
          <ThemedText style={styles.backBtnText}>Back to Settings</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  title: { marginBottom: 8 },
  subtitle: { color: '#6b7280', marginBottom: 24 },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  cardDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  statusOk: { color: '#059669', fontSize: 14 },
  statusWarn: { color: '#d97706', fontSize: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  backBtnText: { color: '#3b82f6', fontSize: 16 },
});
