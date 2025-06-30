import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useRouter } from 'expo-router';

export default function VerificationSuccessScreen() {
  const router = useRouter();
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Email Verified!</ThemedText>
      <ThemedText style={styles.subtitle}>Thank you for confirming your email address. You can now start using all features of the app.</ThemedText>
      <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)') }>
        <ThemedText style={styles.homeText}>Go to Home</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,justifyContent:'center',alignItems:'center',padding:24},
  title:{marginBottom:12,textAlign:'center'},
  subtitle:{textAlign:'center',opacity:0.8,marginBottom:32},
  homeBtn:{backgroundColor:'#2563eb',paddingHorizontal:24,paddingVertical:12,borderRadius:8},
  homeText:{color:'#fff',fontSize:16,fontWeight:'600'},
}); 