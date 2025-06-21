
import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export default function PrivacyPolicyScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <ThemedText type="title" style={styles.title}>PRIVACY POLICY</ThemedText>
          <ThemedText style={styles.lastUpdated}>Last updated June 19, 2025</ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>SUMMARY OF KEY POINTS</ThemedText>
          <ThemedText style={styles.bodyText}>
            This summary provides key points from our Privacy Notice, but you can find out more details about any of these topics by reviewing the complete policy below.
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            <ThemedText style={styles.bold}>What personal information do we process?</ThemedText> When you visit, use, or navigate our Services, we may process personal information depending on how you interact with us and the Services, the choices you make, and the products and features you use.
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            <ThemedText style={styles.bold}>Do we process any sensitive personal information?</ThemedText> We do not process sensitive personal information.
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            <ThemedText style={styles.bold}>Do we collect any information from third parties?</ThemedText> We do not collect any information from third parties.
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            <ThemedText style={styles.bold}>How do we process your information?</ThemedText> We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law.
          </ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>1. WHAT INFORMATION DO WE COLLECT?</ThemedText>
          
          <ThemedText style={styles.subheading}>Personal information you disclose to us</ThemedText>
          <ThemedText style={styles.bodyText}>
            We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            <ThemedText style={styles.bold}>Personal Information Provided by You.</ThemedText> The personal information that we collect depends on the context of your interactions with us and the Services. The personal information we collect may include the following:
          </ThemedText>

          <View style={styles.list}>
            <ThemedText style={styles.listItem}>• Names</ThemedText>
            <ThemedText style={styles.listItem}>• Phone numbers</ThemedText>
            <ThemedText style={styles.listItem}>• Email addresses</ThemedText>
            <ThemedText style={styles.listItem}>• Mailing addresses</ThemedText>
            <ThemedText style={styles.listItem}>• Usernames</ThemedText>
            <ThemedText style={styles.listItem}>• Passwords</ThemedText>
            <ThemedText style={styles.listItem}>• Contact preferences</ThemedText>
            <ThemedText style={styles.listItem}>• Billing addresses</ThemedText>
            <ThemedText style={styles.listItem}>• Debit/credit card numbers</ThemedText>
          </View>

          <ThemedText style={styles.bodyText}>
            <ThemedText style={styles.bold}>Payment Data.</ThemedText> We may collect data necessary to process your payment if you choose to make purchases, such as your payment instrument number, and the security code associated with your payment instrument. All payment data is handled and stored by Stripe.
          </ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>2. HOW DO WE PROCESS YOUR INFORMATION?</ThemedText>
          <ThemedText style={styles.bodyText}>
            We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes with your consent.
          </ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>CONTACT US</ThemedText>
          <ThemedText style={styles.bodyText}>
            If you have questions or comments about your privacy rights, you may email us at help@merchtech.net.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  lastUpdated: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 12,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  bold: {
    fontWeight: '600',
  },
  list: {
    marginLeft: 16,
    marginBottom: 12,
  },
  listItem: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
});
