
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface UserActivationCode {
  id: number;
  code: string;
  playlistId: string;
  playlistName: string;
  contentType: 'playlist' | 'slideshow';
  addedAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

interface UserActivationCodeCardProps {
  code: UserActivationCode;
  onRemove: () => void;
}

const UserActivationCodeCard: React.FC<UserActivationCodeCardProps> = ({
  code,
  onRemove,
}) => {
  const isExpired = code.expiresAt && new Date(code.expiresAt) < new Date();
  const isEffectivelyInactive = !code.isActive || isExpired;

  const getStatusColor = () => {
    if (isExpired) return '#ef4444';
    if (!code.isActive) return '#6b7280';
    return '#10b981';
  };

  const getStatusText = () => {
    if (isExpired) return 'Expired';
    if (!code.isActive) return 'Inactive';
    return 'Active';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <View style={[
      styles.card,
      isEffectivelyInactive && styles.inactiveCard
    ]}>
      <View style={styles.header}>
        <View style={styles.codeInfo}>
          <Text style={[
            styles.codeText,
            isEffectivelyInactive && styles.inactiveText
          ]}>
            {code.code}
          </Text>
          <Text style={styles.playlistName}>{code.playlistName}</Text>
        </View>
        
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <MaterialIcons 
            name={code.contentType === 'playlist' ? 'queue-music' : 'slideshow'} 
            size={14} 
            color="#6b7280" 
          />
          <Text style={styles.detailText}>
            {code.contentType === 'playlist' ? 'Playlist' : 'Slideshow'}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <MaterialIcons name="access-time" size={14} color="#6b7280" />
          <Text style={styles.detailText}>
            Added {formatDate(code.addedAt)}
          </Text>
        </View>

        {code.expiresAt && (
          <View style={styles.detailRow}>
            <MaterialIcons name="event" size={14} color="#6b7280" />
            <Text style={[
              styles.detailText,
              isExpired && styles.expiredText
            ]}>
              {isExpired ? 'Expired' : 'Expires'} {formatDate(code.expiresAt)}
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => {
          Alert.alert(
            'Remove Access Code',
            'Are you sure you want to remove this activation code? You will lose access to the associated content.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: onRemove },
            ]
          );
        }}
      >
        <MaterialIcons name="remove-circle" size={16} color="#ef4444" />
        <Text style={styles.removeText}>Remove Access</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  inactiveCard: {
    opacity: 0.7,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  codeInfo: {
    flex: 1,
  },
  codeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  inactiveText: {
    color: '#9ca3af',
  },
  playlistName: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  details: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#6b7280',
  },
  expiredText: {
    color: '#ef4444',
    fontWeight: '500',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  removeText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '500',
  },
});

export default UserActivationCodeCard;
