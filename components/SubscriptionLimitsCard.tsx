import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSubscriptionLimits } from '@/hooks/useSubscriptionLimits';

interface SubscriptionLimitsCardProps {
  showUpgradeButton?: boolean;
  compact?: boolean;
}

export const SubscriptionLimitsCard: React.FC<SubscriptionLimitsCardProps> = ({ 
  showUpgradeButton = true, 
  compact = false 
}) => {
  const { tier, limits, usage, isLoading, getUsagePercentage } = useSubscriptionLimits();
  const router = useRouter();

  const handleUpgrade = () => {
    router.push('/subscription');
  };

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 90) return '#ef4444'; // Red
    if (percentage >= 70) return '#f59e0b'; // Orange
    return '#10b981'; // Green
  };

  const renderProgressBar = (current: number, max: number, label: string) => {
    const percentage = getUsagePercentage(label.toLowerCase().replace(' ', '') as any);
    const isAtLimit = current >= max;
    
    return (
      <View style={styles.progressItem}>
        <View style={styles.progressHeader}>
          <ThemedText style={styles.progressLabel}>{label}</ThemedText>
          <ThemedText style={[styles.progressText, isAtLimit && styles.atLimitText]}>
            {current}/{max}
          </ThemedText>
        </View>
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressBar, 
              { 
                width: `${percentage}%`, 
                backgroundColor: getProgressBarColor(percentage) 
              }
            ]} 
          />
        </View>
        {isAtLimit && (
          <ThemedText style={styles.limitReachedText}>
            Limit reached - upgrade to create more
          </ThemedText>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading subscription limits...</ThemedText>
      </ThemedView>
    );
  }

  const tierColors = {
    free: '#6b7280',
    basic: '#3b82f6',
    premium: '#8b5cf6'
  };

  const tierIcons = {
    free: '👤',
    basic: '⚡',
    premium: '👑'
  };

  return (
    <ThemedView style={[styles.container, compact && styles.compactContainer]}>
      <View style={styles.header}>
        <View style={styles.tierInfo}>
          <Text style={styles.tierIcon}>{tierIcons[tier as keyof typeof tierIcons] || '❓'}</Text>
          <ThemedText style={[styles.tierName, { color: tierColors[tier as keyof typeof tierColors] }]}>
            {tier.charAt(0).toUpperCase() + tier.slice(1)} Plan
          </ThemedText>
        </View>
        {showUpgradeButton && tier !== 'premium' && (
          <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
            <Text style={styles.upgradeButtonText}>Upgrade</Text>
          </TouchableOpacity>
        )}
      </View>

      {!compact && (
        <View style={styles.limitsContainer}>
          {renderProgressBar(usage.products, limits.maxProducts, 'Products')}
          {renderProgressBar(usage.media, limits.maxAudioFiles, 'Audio Files')}
          {renderProgressBar(usage.playlists, limits.maxPlaylists, 'Playlists')}
          {limits.maxQrCodes > 0 && renderProgressBar(usage.qrCodes, limits.maxQrCodes, 'QR Codes')}
          {limits.maxSlideshows > 0 && renderProgressBar(usage.slideshows, limits.maxSlideshows, 'Slideshows')}
        </View>
      )}

      {compact && (
        <View style={styles.compactLimits}>
          <ThemedText style={styles.compactText}>
            {usage.products}/{limits.maxProducts} products • {usage.media}/{limits.maxAudioFiles} audio files
          </ThemedText>
        </View>
      )}

      {!limits.canEditPlaylists && (
        <View style={styles.featureRestriction}>
          <ThemedText style={styles.restrictionText}>
            ⚠️ Playlist editing after creation requires Basic plan or higher
          </ThemedText>
        </View>
      )}
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  compactContainer: {
    padding: 12,
    margin: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  tierName: {
    fontSize: 18,
    fontWeight: '600',
  },
  upgradeButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  upgradeButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  limitsContainer: {
    gap: 12,
  },
  progressItem: {
    gap: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressText: {
    fontSize: 12,
    color: '#6b7280',
  },
  atLimitText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  limitReachedText: {
    fontSize: 10,
    color: '#ef4444',
    fontStyle: 'italic',
  },
  compactLimits: {
    marginTop: 8,
  },
  compactText: {
    fontSize: 12,
    color: '#6b7280',
  },
  featureRestriction: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
  },
  restrictionText: {
    fontSize: 12,
    color: '#92400e',
  },
});

export default SubscriptionLimitsCard; 