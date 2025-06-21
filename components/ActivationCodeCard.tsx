
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { ActivationCode } from '@/shared/media-schema';

interface ActivationCodeCardProps {
  code: ActivationCode;
  onDelete: () => void;
  onToggleStatus: (isActive: boolean) => void;
}

const ActivationCodeCard: React.FC<ActivationCodeCardProps> = ({
  code,
  onDelete,
  onToggleStatus,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(code.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy code');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = code.expiresAt && new Date(code.expiresAt) < new Date();
  const isMaxUsesReached = code.maxUses !== null && code.usesCount >= code.maxUses;
  const isEffectivelyInactive = !code.isActive || isExpired || isMaxUsesReached;

  const getStatusColor = () => {
    if (!code.isActive) return '#6b7280';
    if (isExpired || isMaxUsesReached) return '#ef4444';
    return '#10b981';
  };

  const getStatusText = () => {
    if (!code.isActive) return 'Disabled';
    if (isExpired) return 'Expired';
    if (isMaxUsesReached) return 'Max uses reached';
    return 'Active';
  };

  return (
    <View style={[styles.card, isEffectivelyInactive && styles.inactiveCard]}>
      <View style={styles.header}>
        <View style={styles.codeSection}>
          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>Code</Text>
            <TouchableOpacity
              style={styles.codeBox}
              onPress={handleCopyCode}
              activeOpacity={0.7}
            >
              <Text style={styles.codeText}>{code.code}</Text>
              <MaterialIcons
                name={copied ? 'check' : 'content-copy'}
                size={18}
                color={copied ? '#10b981' : '#6b7280'}
              />
            </TouchableOpacity>
            {copied && (
              <Text style={styles.copiedText}>Copied!</Text>
            )}
          </View>
        </View>
        <View style={styles.statusSection}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <MaterialIcons name="access-time" size={16} color="#6b7280" />
          <Text style={styles.detailLabel}>Created:</Text>
          <Text style={styles.detailValue}>{formatDate(code.createdAt)}</Text>
        </View>
        <View style={styles.detailRow}>
          <MaterialIcons name="analytics" size={16} color="#6b7280" />
          <Text style={styles.detailLabel}>Uses:</Text>
          <Text style={styles.detailValue}>
            {code.usesCount}{code.maxUses !== null ? ` / ${code.maxUses}` : ' (unlimited)'}
          </Text>
        </View>
        {code.expiresAt && (
          <View style={styles.detailRow}>
            <MaterialIcons name="event" size={16} color="#6b7280" />
            <Text style={styles.detailLabel}>Expires:</Text>
            <Text style={[
              styles.detailValue,
              isExpired && styles.expiredText
            ]}>
              {formatDate(code.expiresAt)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <View style={styles.switchSection}>
          <Text style={styles.switchLabel}>Active</Text>
          <Switch
            value={code.isActive}
            onValueChange={onToggleStatus}
            trackColor={{ false: '#e5e7eb', true: '#bfdbfe' }}
            thumbColor={code.isActive ? '#3b82f6' : '#9ca3af'}
            disabled={isExpired || isMaxUsesReached}
          />
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => {
            Alert.alert(
              'Delete Code',
              'Are you sure you want to delete this activation code?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: onDelete },
              ]
            );
          }}
        >
          <MaterialIcons name="delete" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inactiveCard: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  codeSection: {
    flex: 1,
  },
  codeContainer: {
    alignItems: 'flex-start',
  },
  codeLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  copiedText: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 4,
    fontWeight: '500',
  },
  statusSection: {
    marginLeft: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  details: {
    gap: 8,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
    minWidth: 60,
  },
  detailValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  expiredText: {
    color: '#ef4444',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  switchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
});

export default ActivationCodeCard;
