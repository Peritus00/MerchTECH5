
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { AdvancedQRCodeGenerator } from '@/components/AdvancedQRCodeGenerator';
import { qrCodeService } from '@/services/qrCodeService';
import { downloadQRCode, shareQRCode, QRCodeFormat } from '@/services/qrUtils';
import { captureRef } from 'react-native-view-shot';
import { QRCode } from '@/types';

export default function QRCodeDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const qrRef = useRef(null);
  
  const [qrCode, setQrCode] = useState<QRCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedQRCode, setEditedQRCode] = useState<QRCode | null>(null);

  useEffect(() => {
    fetchQRCode();
  }, [id]);

  const fetchQRCode = async () => {
    try {
      const qr = await qrCodeService.getQRCodeById(parseInt(id as string));
      setQrCode(qr);
      setEditedQRCode(qr);
    } catch (error) {
      Alert.alert('Error', 'Failed to load QR code');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editedQRCode) return;

    try {
      await qrCodeService.updateQRCode(editedQRCode.id, {
        name: editedQRCode.name,
        url: editedQRCode.url,
        description: editedQRCode.description,
        options: editedQRCode.options,
      });
      
      setQrCode(editedQRCode);
      setEditing(false);
      Alert.alert('Success', 'QR code updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update QR code');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete QR Code',
      'Are you sure you want to delete this QR code? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await qrCodeService.deleteQRCode(parseInt(id as string));
              Alert.alert('Deleted', 'QR code deleted successfully');
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete QR code');
            }
          },
        },
      ]
    );
  };

  const handleDownload = async (format: QRCodeFormat) => {
    if (!qrCode || !qrRef.current) return;
    
    try {
      await downloadQRCode(qrRef.current, qrCode.name, format);
    } catch (error) {
      Alert.alert('Error', 'Failed to download QR code');
    }
  };

  const handleShare = async () => {
    if (!qrCode || !qrRef.current) return;
    
    try {
      const uri = await captureRef(qrRef.current, {
        format: 'png',
        quality: 1.0,
        width: 800,
        height: 800,
      });
      
      await shareQRCode(uri, `${qrCode.name}.png`);
    } catch (error) {
      Alert.alert('Error', 'Failed to share QR code');
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  if (!qrCode) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>QR Code not found</ThemedText>
      </ThemedView>
    );
  }

  const currentQRCode = editing ? editedQRCode : qrCode;

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.header}>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.backButtonText}>← Back</ThemedText>
          </TouchableOpacity>
          
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.editButton}
              onPress={() => {
                if (editing) {
                  setEditedQRCode(qrCode);
                }
                setEditing(!editing);
              }}
            >
              <ThemedText style={styles.editButtonText}>
                {editing ? 'Cancel' : 'Edit'}
              </ThemedText>
            </TouchableOpacity>
            
            {editing && (
              <TouchableOpacity 
                style={styles.saveButton}
                onPress={handleSave}
              >
                <ThemedText style={styles.saveButtonText}>Save</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ThemedView>

      <ThemedView style={styles.content}>
        {/* QR Code Preview */}
        <View style={styles.qrSection}>
          <View ref={qrRef} style={styles.qrContainer}>
            <AdvancedQRCodeGenerator
              value={currentQRCode?.url || ''}
              size={280}
              fgColor={currentQRCode?.options?.foregroundColor || '#000000'}
              bgColor={currentQRCode?.options?.backgroundColor || '#FFFFFF'}
              level={currentQRCode?.options?.errorCorrectionLevel || 'H'}
              cornerRadius={currentQRCode?.options?.cornerRadius || 0}
              gradientColors={currentQRCode?.options?.gradientColors}
              logoOptions={currentQRCode?.options?.logo}
            />
          </View>
        </View>

        {/* QR Code Info */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Name</ThemedText>
            {editing ? (
              <TextInput
                style={styles.input}
                value={editedQRCode?.name}
                onChangeText={(text) => setEditedQRCode(prev => prev ? {...prev, name: text} : null)}
              />
            ) : (
              <ThemedText style={styles.value}>{currentQRCode?.name}</ThemedText>
            )}
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Content</ThemedText>
            {editing ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editedQRCode?.url}
                onChangeText={(text) => setEditedQRCode(prev => prev ? {...prev, url: text} : null)}
                multiline
              />
            ) : (
              <ThemedText style={styles.value}>{currentQRCode?.url}</ThemedText>
            )}
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Description</ThemedText>
            {editing ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editedQRCode?.description}
                onChangeText={(text) => setEditedQRCode(prev => prev ? {...prev, description: text} : null)}
                multiline
                placeholder="Add description..."
              />
            ) : (
              <ThemedText style={styles.value}>
                {currentQRCode?.description || 'No description'}
              </ThemedText>
            )}
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Created</ThemedText>
            <ThemedText style={styles.value}>
              {new Date(currentQRCode?.createdAt || '').toLocaleDateString()}
            </ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Scans</ThemedText>
            <ThemedText style={styles.value}>{currentQRCode?.scanCount || 0}</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Status</ThemedText>
            {editing ? (
              <Switch
                value={editedQRCode?.isActive}
                onValueChange={(value) => setEditedQRCode(prev => prev ? {...prev, isActive: value} : null)}
              />
            ) : (
              <ThemedText style={[styles.value, currentQRCode?.isActive ? styles.active : styles.inactive]}>
                {currentQRCode?.isActive ? 'Active' : 'Inactive'}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        {!editing && (
          <View style={styles.actionSection}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleShare}
            >
              <ThemedText style={styles.actionButtonText}>Share</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleDownload(QRCodeFormat.PNG)}
            >
              <ThemedText style={styles.actionButtonText}>Download PNG</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleDownload(QRCodeFormat.PDF)}
            >
              <ThemedText style={styles.actionButtonText}>Download PDF</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.deleteButton]}
              onPress={handleDelete}
            >
              <ThemedText style={[styles.actionButtonText, styles.deleteButtonText]}>
                Delete
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#007BFF',
    fontSize: 16,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#007BFF',
    borderRadius: 6,
  },
  editButtonText: {
    color: '#007BFF',
  },
  saveButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#007BFF',
    borderRadius: 6,
  },
  saveButtonText: {
    color: '#FFFFFF',
  },
  content: {
    padding: 16,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  infoSection: {
    marginBottom: 32,
  },
  infoRow: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    color: '#666',
  },
  value: {
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  active: {
    color: '#28a745',
    fontWeight: '600',
  },
  inactive: {
    color: '#dc3545',
    fontWeight: '600',
  },
  actionSection: {
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#007BFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  deleteButtonText: {
    color: '#FFFFFF',
  },
});
