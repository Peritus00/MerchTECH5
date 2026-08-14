/**
 * Signing Key screen — generate and display per-event ECDSA keys.
 * super_admin only; shows download prompt for private key.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useIsAdmin } from '@/hooks/useIsAdmin';

interface SigningKey {
  key_id: string;
  public_key: string;
  algorithm: string;
  created_at: string;
}

export default function SigningKeyScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const isAdmin = useIsAdmin();
  const [keys, setKeys] = useState<SigningKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newPrivateKey, setNewPrivateKey] = useState<{ key_id: string; pem: string; warning: string } | null>(null);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/events/${eventId}/signing-key`);
      setKeys(Array.isArray(res.data) ? res.data : [res.data]);
    } catch (err: any) {
      if (err.response?.status !== 404) {
        Alert.alert('Error', 'Failed to load signing keys');
      }
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchKeys(); }, [eventId]));

  const handleGenerate = async () => {
    Alert.alert(
      'Generate Signing Key',
      'A new ECDSA P-256 key pair will be generated. The private key will be shown ONCE. You must save it immediately as an environment variable. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate', style: 'destructive',
          onPress: async () => {
            setGenerating(true);
            try {
              const res = await api.post(`/events/${eventId}/signing-key`);
              setNewPrivateKey({
                key_id: res.data.key_id,
                pem: res.data.private_key_pem,
                warning: res.data.warning,
              });
              fetchKeys();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error || 'Failed to generate key');
            } finally {
              setGenerating(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {newPrivateKey && (
        <View style={styles.warningCard}>
          <MaterialIcons name="warning" size={24} color="#FFD700" style={{ marginBottom: 8 }} />
          <Text style={styles.warningTitle}>Save Your Private Key Now</Text>
          <Text style={styles.warningText}>{newPrivateKey.warning}</Text>
          <Text style={styles.keyLabel}>Key ID:</Text>
          <Text style={styles.keyValue}>{newPrivateKey.key_id}</Text>
          <Text style={styles.keyLabel}>Private Key PEM (copy to env):</Text>
          <Text style={styles.keyPem}>{newPrivateKey.pem}</Text>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={() => { Clipboard.setStringAsync(newPrivateKey.pem); Alert.alert('Copied', 'Private key copied to clipboard'); }}
          >
            <MaterialIcons name="content-copy" size={18} color="#fff" />
            <Text style={styles.copyBtnText}>Copy PEM</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissBtn} onPress={() => setNewPrivateKey(null)}>
            <Text style={styles.dismissBtnText}>I have saved the private key</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#4CAF50" style={{ margin: 24 }} />
      ) : (
        keys.map(key => (
          <View key={key.key_id} style={styles.keyCard}>
            <Text style={styles.keyId}>{key.key_id}</Text>
            <Text style={styles.meta}>{key.algorithm} · {new Date(key.created_at).toLocaleString()}</Text>
            <Text style={styles.keyLabel}>Public Key:</Text>
            <Text style={styles.keyPem}>{key.public_key}</Text>
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => { Clipboard.setStringAsync(key.public_key); Alert.alert('Copied', 'Public key copied'); }}
            >
              <MaterialIcons name="content-copy" size={16} color="#fff" />
              <Text style={styles.copyBtnText}>Copy Public Key</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {isAdmin && (
        <TouchableOpacity
          style={[styles.generateBtn, generating && { opacity: 0.6 }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="vpn-key" size={20} color="#fff" />
              <Text style={styles.generateBtnText}>Generate New Key Pair</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  warningCard: { backgroundColor: '#1A1200', borderWidth: 1, borderColor: '#FFD700', borderRadius: 10, padding: 16, marginBottom: 20 },
  warningTitle: { color: '#FFD700', fontWeight: '700', fontSize: 16, marginBottom: 8 },
  warningText: { color: '#aaa', fontSize: 12, marginBottom: 12 },
  keyCard: { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 14, marginBottom: 16 },
  keyId: { color: '#fff', fontWeight: '700', fontFamily: 'monospace', fontSize: 13 },
  meta: { color: '#666', fontSize: 12, marginTop: 4 },
  keyLabel: { color: '#888', fontSize: 12, marginTop: 10, marginBottom: 4 },
  keyValue: { color: '#ccc', fontFamily: 'monospace', fontSize: 12 },
  keyPem: { color: '#4CAF50', fontFamily: 'monospace', fontSize: 10, lineHeight: 14 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#333', padding: 8, borderRadius: 6, marginTop: 8, alignSelf: 'flex-start' },
  copyBtnText: { color: '#fff', fontSize: 12 },
  dismissBtn: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 6, alignItems: 'center', marginTop: 12 },
  dismissBtnText: { color: '#fff', fontWeight: '700' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1565C0', padding: 14, borderRadius: 10, justifyContent: 'center', marginTop: 8 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
