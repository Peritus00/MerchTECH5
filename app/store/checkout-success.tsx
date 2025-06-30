import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useRouter } from 'expo-router';
import { useCart } from '@/contexts/CartContext';

export default function CheckoutSuccess() {
  const router = useRouter();
  const { clearCart } = useCart();

  React.useEffect(() => {
    clearCart();
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Thank you for your purchase!</ThemedText>
      <ThemedText style={styles.subtitle}>Your payment was successful.</ThemedText>
      <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)/store')}>
        <ThemedText style={styles.homeText}>Continue Shopping</ThemedText>
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