import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { salesAPI } from '@/services/api';

interface SaleRow {
  id: number;
  product_id: number;
  user_id: number;
  quantity: number;
  total_cents: number;
  purchased_at: string;
}

export default function MasterSalesReports() {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchSales(); }, []);

  const fetchSales = async () => {
    try {
      const data = await salesAPI.getAllSales();
      setSales(data);
    } catch(e){ console.error(e); Alert.alert('Error','Could not load sales'); }
    finally{ setLoading(false);}  
  };

  const handleDownloadCsv = () => {
    const url = `${salesAPI.downloadAllCsv().request.href}`;
    Linking.openURL(url);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Master Sales Reports</ThemedText>
      <ThemedText style={styles.subtitle}>Download CSV reports for all products in the system.</ThemedText>
      <TouchableOpacity style={styles.button} onPress={handleDownloadCsv}>
        <ThemedText style={styles.buttonText}>Download CSV</ThemedText>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop:20 }} />
      ) : sales.length ===0 ? (
        <ThemedText style={{ marginTop:20 }}>No sales yet.</ThemedText>
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(item)=>item.id.toString()}
          style={{ marginTop:20, width:'100%'}}
          renderItem={({item})=>(
            <ThemedView style={styles.row}>
              <ThemedText>{new Date(item.purchased_at).toLocaleDateString()}</ThemedText>
              <ThemedText>Prod #{item.product_id}</ThemedText>
              <ThemedText>Qty {item.quantity}</ThemedText>
              <ThemedText>${(item.total_cents/100).toFixed(2)}</ThemedText>
            </ThemedView>
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  row:{
    flexDirection:'row',
    justifyContent:'space-between',
    paddingVertical:8,
    borderBottomWidth:1,
    borderColor:'#e5e7eb',
  },
}); 