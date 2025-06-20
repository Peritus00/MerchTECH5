import { Image } from 'expo-image';
import { Platform, StyleSheet } from 'react-native';

import { Collapsible } from '@/components/Collapsible';
import { ExternalLink } from '@/components/ExternalLink';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';

import React, { useState, useEffect } from 'react';
import { ScrollView, RefreshControl, View, TouchableOpacity, Alert } from 'react-native';
import { QRCodeGenerator } from '@/components/QRCodeGenerator';
import { CreateQRModal } from '@/components/CreateQRModal';
import { qrCodeService } from '@/services/qrCodeService';
import { QRCode } from '@/types';

export default function QRCodesScreen() {
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);

  const fetchQRCodes = async () => {
    try {
      const codes = await qrCodeService.getQRCodes();
      setQrCodes(codes);
    } catch (error) {
      console.error('Error fetching QR codes:', error);
      Alert.alert('Error', 'Failed to load QR codes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQRCodes();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchQRCodes();
  };

  const handleDeleteQR = async (id: number) => {
    Alert.alert(
      'Delete QR Code',
      'Are you sure you want to delete this QR code?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await qrCodeService.deleteQRCode(id);
              setQrCodes(qrCodes.filter(qr => qr.id !== id));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete QR code');
            }
          },
        },
      ]
    );
  };

  if (loading && qrCodes.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading QR codes...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <ThemedView style={styles.header}>
        <ThemedText type="title">My QR Codes</ThemedText>
        <TouchableOpacity 
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <ThemedText style={styles.createButtonText}>+ Create New</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {qrCodes.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText type="subtitle">No QR codes yet</ThemedText>
          <ThemedText>Create your first QR code to get started</ThemedText>
        </ThemedView>
      ) : (
        qrCodes.map((qrCode) => (
          <ThemedView key={qrCode.id} style={styles.qrCodeCard}>
            <View style={styles.qrCodeHeader}>
              <View style={styles.qrCodeInfo}>
                <ThemedText type="defaultSemiBold">{qrCode.name}</ThemedText>
                <ThemedText style={styles.qrCodeUrl}>{qrCode.url}</ThemedText>
                <ThemedText style={styles.qrCodeDate}>
                  Created: {new Date(qrCode.createdAt).toLocaleDateString()}
                </ThemedText>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteQR(qrCode.id)}
              >
                <ThemedText style={styles.deleteButtonText}>Delete</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.qrCodePreview}>
              <QRCodeGenerator
                value={qrCode.url}
                size={150}
                options={qrCode.options}
              />
            </View>
          </ThemedView>
        ))
      )}

      <CreateQRModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onQRCreated={() => {
          setCreateModalVisible(false);
          fetchQRCodes();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
  },
  createButtonText: {
    color: 'white',
  },
  qrCodeCard: {
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    padding: 15,
    marginBottom: 15,
  },
  qrCodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  qrCodeInfo: {
    flex: 1,
  },
  qrCodeUrl: {
    fontSize: 12,
    color: 'gray',
  },
  qrCodeDate: {
    fontSize: 12,
    color: 'gray',
  },
  deleteButton: {
    backgroundColor: '#DC3545',
    padding: 8,
    borderRadius: 5,
  },
  deleteButtonText: {
    color: 'white',
  },
  qrCodePreview: {
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 50,
  },
});