
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { SUBSCRIPTION_TIERS } from '@/types/subscription';

export default function SubscriptionScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { newUser } = useLocalSearchParams();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const isNewUser = newUser === 'true';

  const getTierIcon = (tierKey: string) => {
    switch (tierKey) {
      case 'free':
        return '👤';
      case 'basic':
        return '⚡';
      case 'premium':
        return '👑';
      default:
        return '❓';
    }
  };

  const getTierColor = (tierKey: string) => {
    switch (tierKey) {
      case 'free':
        return '#6b7280';
      case 'basic':
        return '#3b82f6';
      case 'premium':
        return '#8b5cf6';
      default:
        return '#6b7280';
    }
  };

  const isCurrentPlan = (tierKey: string) => {
    return user?.subscriptionTier === tierKey;
  };

  const handleSelectPlan = async (tierKey: string) => {
    if (tierKey === 'free') {
      if (isNewUser) {
        // Show confirmation for new users choosing free tier
        Alert.alert(
          'Confirm Free Plan',
          'Are you sure you want to continue with the free plan? You can upgrade anytime.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Continue with Free', 
              onPress: () => router.push('/(tabs)/') 
            }
          ]
        );
        return;
      }
      
      if (user) {
        router.push('/(tabs)/');
      } else {
        router.push('/auth/login');
      }
      return;
    }

    if (!user) {
      router.push(`/auth/login?plan=${tierKey}`);
      return;
    }

    router.push(`/subscription/checkout?tier=${tierKey}&newUser=${isNewUser}`);
  };

  const renderTierCard = (tierKey: string, tier: any) => {
    const isPopular = tier.popular;
    const isCurrent = isCurrentPlan(tierKey);
    const loading = isLoading === tierKey;

    return (
      <ThemedView
        key={tierKey}
        style={[
          styles.tierCard,
          isPopular && styles.popularCard,
          isCurrent && styles.currentCard,
        ]}
      >
        {isPopular && (
          <View style={styles.popularBadge}>
            <ThemedText style={styles.popularText}>Most Popular</ThemedText>
          </View>
        )}

        <View style={styles.cardHeader}>
          <View style={[styles.iconContainer, { backgroundColor: getTierColor(tierKey) }]}>
            <ThemedText style={styles.iconText}>{getTierIcon(tierKey)}</ThemedText>
          </View>
          <ThemedText type="title" style={styles.tierName}>{tier.name}</ThemedText>
          
          <View style={styles.priceContainer}>
            <ThemedText style={styles.price}>${tier.price}</ThemedText>
            {tier.price > 0 && (
              <ThemedText style={styles.period}>/month</ThemedText>
            )}
          </View>
          
          <ThemedText style={styles.description}>{tier.description}</ThemedText>
        </View>

        <View style={styles.featuresContainer}>
          {tier.features.map((feature: string, index: number) => (
            <View key={index} style={styles.featureRow}>
              <ThemedText style={styles.checkmark}>✓</ThemedText>
              <ThemedText style={styles.featureText}>{feature}</ThemedText>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.selectButton,
            isCurrent ? styles.currentButton : styles.upgradeButton,
            loading && styles.loadingButton,
          ]}
          onPress={() => handleSelectPlan(tierKey)}
          disabled={loading || isCurrent}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <ThemedText style={styles.buttonText}>
              {isCurrent ? 'Current Plan' : tierKey === 'free' ? 'Get Started' : 'Select Plan'}
            </ThemedText>
          )}
        </TouchableOpacity>
      </ThemedView>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <ThemedView style={styles.content}>
        <View style={styles.header}>
          {!isNewUser && (
            <TouchableOpacity onPress={() => router.back()}>
              <ThemedText style={styles.backButton}>← Back</ThemedText>
            </TouchableOpacity>
          )}
          <ThemedText type="title" style={styles.title}>
            {isNewUser ? 'Welcome! Choose Your Plan' : 'Choose Your Plan'}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {isNewUser 
              ? 'Get started with MerchTech by selecting the perfect plan for your needs'
              : 'Select the perfect plan for your QR code and media management needs'
            }
          </ThemedText>
        </View>

        <View style={styles.tiersContainer}>
          {Object.entries(SUBSCRIPTION_TIERS).map(([tierKey, tier]) =>
            renderTierCard(tierKey, tier)
          )}
        </View>

        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            All plans include customer support
          </ThemedText>
          <ThemedText style={styles.footerSubtext}>
            Cancel anytime • No hidden fees • 24/7 support
          </ThemedText>
        </View>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 32,
  },
  backButton: {
    color: '#007BFF',
    marginBottom: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
  },
  tiersContainer: {
    gap: 16,
  },
  tierCard: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  popularCard: {
    borderColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  currentCard: {
    borderColor: '#22c55e',
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: [{ translateX: -50 }],
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  popularText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 32,
  },
  tierName: {
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  price: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  period: {
    fontSize: 16,
    opacity: 0.7,
    marginLeft: 4,
  },
  description: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
  },
  featuresContainer: {
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkmark: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 12,
  },
  featureText: {
    fontSize: 16,
    flex: 1,
  },
  selectButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  upgradeButton: {
    backgroundColor: '#3b82f6',
  },
  currentButton: {
    backgroundColor: '#22c55e',
  },
  loadingButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 8,
  },
  footerSubtext: {
    fontSize: 12,
    opacity: 0.5,
    textAlign: 'center',
  },
});
