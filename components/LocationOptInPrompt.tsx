import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { analyticsService } from '@/services/analyticsService';
import {
  geolocationErrorToConsentStatus,
  LocationOptInScope,
  markLocationOptInAccepted,
  markLocationOptInDeclined,
  requestBrowserLocation,
  shouldPromptForLocation,
} from '@/utils/locationOptIn';

interface LocationOptInPromptProps {
  enabled: boolean;
  scope: LocationOptInScope;
  qrCodeId?: number | null;
  delayMs?: number;
}

export default function LocationOptInPrompt({
  enabled,
  scope,
  qrCodeId,
  delayMs = 1500,
}: LocationOptInPromptProps) {
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'web') {
      setVisible(false);
      return;
    }
    if (!shouldPromptForLocation(scope)) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, enabled, scope.contentId, scope.contentType, scope.leadId]);

  const persistConsent = async (status: 'denied' | 'unavailable') => {
    try {
      await analyticsService.submitGeoConsent({
        leadId: scope.leadId ?? undefined,
        qrCodeId: qrCodeId ?? undefined,
        consentStatus: status,
      });
    } catch {
      // Non-blocking; sessionStorage still records the user's choice.
    }
  };

  const handleDecline = async () => {
    markLocationOptInDeclined(scope);
    await persistConsent('denied');
    setVisible(false);
  };

  const handleAccept = async () => {
    if (!qrCodeId) {
      markLocationOptInDeclined(scope);
      await persistConsent('unavailable');
      setVisible(false);
      return;
    }
    setSubmitting(true);
    try {
      const pos = await requestBrowserLocation();
      await analyticsService.submitBrowserGeo(
        Number(qrCodeId),
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined,
        scope.leadId ?? undefined
      );
      markLocationOptInAccepted(scope);
      setVisible(false);
    } catch (err) {
      markLocationOptInDeclined(scope);
      await persistConsent(geolocationErrorToConsentStatus(err));
      setVisible(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (Platform.OS !== 'web' || !visible) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDecline}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="location-on" size={28} color="#2563eb" />
          </View>
          <ThemedText style={styles.title}>Share precise location?</ThemedText>
          <ThemedText style={styles.body}>
            Optional: share your device location so sponsors can research where content is enjoyed. We store precise
            coordinates only when you agree. Declining will not block playback.
          </ThemedText>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleDecline} disabled={submitting}>
              <ThemedText style={styles.secondaryText}>Not now</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleAccept} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.primaryText}>Share location</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 22, color: '#4b5563', marginBottom: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { color: '#374151', fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700' },
});
