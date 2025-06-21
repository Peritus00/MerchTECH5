
import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export default function TermsOfServiceScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <ThemedText type="title" style={styles.title}>TERMS OF USE</ThemedText>
          <ThemedText style={styles.lastUpdated}>Last updated June 19, 2025</ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>AGREEMENT TO OUR LEGAL TERMS</ThemedText>
          <ThemedText style={styles.bodyText}>
            We are Samona Technologies, a company registered in Louisiana, United States at 46 Robert Road, Westwego, LA 70094.
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            We operate the website http://www.merchtech.net (the "Site"), the mobile application MerchTech (the "App"), as well as any other related products and services that refer or link to these legal terms (the "Legal Terms") (collectively, the "Services").
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            We provide a design platform that lets you make branded QR codes. We also provide a marketplace for products with enhanced QR code features.
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            You can contact us by phone at 7577695882, email at help@samona.io, or by mail to 46 Robert Road, Westwego, LA 70094, United States.
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            These Legal Terms constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you"), and Samona Technologies, concerning your access to and use of the Services. You agree that by accessing the Services, you have read, understood, and agreed to be bound by all of these Legal Terms. IF YOU DO NOT AGREE WITH ALL OF THESE LEGAL TERMS, THEN YOU ARE EXPRESSLY PROHIBITED FROM USING THE SERVICES AND YOU MUST DISCONTINUE USE IMMEDIATELY.
          </ThemedText>

          <ThemedText style={styles.bodyText}>
            The Services are intended for users who are at least 18 years old. Persons under the age of 18 are not permitted to use or register for the Services.
          </ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>1. OUR SERVICES</ThemedText>
          <ThemedText style={styles.bodyText}>
            The information provided when using the Services is not intended for distribution to or use by any person or entity in any jurisdiction or country where such distribution or use would be contrary to law or regulation or which would subject us to any registration requirement within such jurisdiction or country.
          </ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>2. INTELLECTUAL PROPERTY RIGHTS</ThemedText>
          <ThemedText style={styles.bodyText}>
            We are the owner or the licensee of all intellectual property rights in our Services, including all source code, databases, functionality, software, website designs, audio, video, text, photographs, and graphics in the Services (collectively, the "Content"), as well as the trademarks, service marks, and logos contained therein (the "Marks").
          </ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>3. USER REPRESENTATIONS</ThemedText>
          <ThemedText style={styles.bodyText}>
            By using the Services, you represent and warrant that: (1) all registration information you submit will be true, accurate, current, and complete; (2) you will maintain the accuracy of such information and promptly update such registration information as necessary; (3) you have the legal capacity and you agree to comply with these Legal Terms; (4) you are not a minor in the jurisdiction in which you reside; (5) you will not access the Services through automated or non-human means, whether through a bot, script or otherwise; (6) you will not use the Services for any illegal or unauthorized purpose; and (7) your use of the Services will not violate any applicable law or regulation.
          </ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>4. PROHIBITED ACTIVITIES</ThemedText>
          <ThemedText style={styles.bodyText}>
            You may not access or use the Services for any purpose other than that for which we make the Services available. The Services may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us.
          </ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>CONTACT US</ThemedText>
          <ThemedText style={styles.bodyText}>
            In order to resolve a complaint regarding the Services or to receive further information regarding use of the Services, please contact us at:
          </ThemedText>
          <ThemedText style={styles.bodyText}>
            Samona Technologies{'\n'}
            46 Robert Road{'\n'}
            Westwego, LA 70094{'\n'}
            United States{'\n'}
            Phone: 7577695882{'\n'}
            Email: help@samona.io
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
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
});
