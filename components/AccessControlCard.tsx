
import React from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Playlist } from '@/shared/media-schema';

interface AccessControlCardProps {
  playlist: Playlist;
  onToggle: (requiresCode: boolean) => void;
  isUpdating: boolean;
}

const AccessControlCard: React.FC<AccessControlCardProps> = ({
  playlist,
  onToggle,
  isUpdating,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <MaterialIcons
            name={playlist.requiresActivationCode ? 'lock' : 'lock-open'}
            size={24}
            color={playlist.requiresActivationCode ? '#ef4444' : '#10b981'}
          />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Access Control</Text>
          <Text style={styles.description}>
            {playlist.requiresActivationCode
              ? 'Users need an activation code to access this playlist'
              : 'This playlist is publicly accessible without codes'
            }
          </Text>
        </View>
        <View style={styles.switchContainer}>
          {isUpdating ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <Switch
              value={playlist.requiresActivationCode}
              onValueChange={onToggle}
              trackColor={{ false: '#e5e7eb', true: '#bfdbfe' }}
              thumbColor={playlist.requiresActivationCode ? '#3b82f6' : '#9ca3af'}
            />
          )}
        </View>
      </View>

      {/* Status Details */}
      <View style={styles.statusContainer}>
        <View style={[
          styles.statusBadge,
          playlist.requiresActivationCode ? styles.restrictedBadge : styles.publicBadge
        ]}>
          <MaterialIcons
            name={playlist.requiresActivationCode ? 'security' : 'public'}
            size={16}
            color={playlist.requiresActivationCode ? '#dc2626' : '#059669'}
          />
          <Text style={[
            styles.statusText,
            playlist.requiresActivationCode ? styles.restrictedText : styles.publicText
          ]}>
            {playlist.requiresActivationCode ? 'Restricted Access' : 'Public Access'}
          </Text>
        </View>
      </View>

      {/* Information Box */}
      <View style={styles.infoBox}>
        <MaterialIcons name="info" size={16} color="#3b82f6" />
        <Text style={styles.infoText}>
          {playlist.requiresActivationCode
            ? 'Generate activation codes below to share with specific users. Each code can have usage limits and expiration dates.'
            : 'Anyone with the playlist link can access and view the content without any restrictions.'
          }
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  switchContainer: {
    marginLeft: 12,
  },
  statusContainer: {
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    gap: 6,
  },
  restrictedBadge: {
    backgroundColor: '#fee2e2',
  },
  publicBadge: {
    backgroundColor: '#d1fae5',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  restrictedText: {
    color: '#dc2626',
  },
  publicText: {
    color: '#059669',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
});

export default AccessControlCard;
