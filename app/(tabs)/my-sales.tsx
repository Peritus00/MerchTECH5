
import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  Share,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';

const { width: screenWidth } = Dimensions.get('window');

interface SalesDataItem {
  orderId: number;
  paypalOrderId: string;
  orderDate: string;
  status: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: string;
  totalAmount: string;
  productName: string;
  productPrice: string;
  quantity: number;
  itemSubtotal: string;
  size: string;
  productDetails: string;
  sellerId: number;
  sellerName: string;
}

export default function MySalesScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'analytics' },
    { id: 'products', label: 'Products', icon: 'cube' },
    { id: 'orders', label: 'Orders', icon: 'receipt' },
    { id: 'customers', label: 'Customers', icon: 'people' },
  ];

  // Mock sales data - replace with actual API call
  const [salesData] = useState<SalesDataItem[]>([
    {
      orderId: 1001,
      paypalOrderId: 'PAY-123456789',
      orderDate: '2024-01-15',
      status: 'completed',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      shippingAddress: '123 Main St, City, State',
      totalAmount: '$89.99',
      productName: 'Premium Headphones',
      productPrice: '$79.99',
      quantity: 1,
      itemSubtotal: '$79.99',
      size: 'Medium',
      productDetails: 'High-quality wireless headphones',
      sellerId: user?.id || 1,
      sellerName: user?.name || 'djjetfuel',
    },
    {
      orderId: 1002,
      paypalOrderId: 'PAY-987654321',
      orderDate: '2024-01-14',
      status: 'pending',
      customerName: 'Jane Smith',
      customerEmail: 'jane@example.com',
      shippingAddress: '456 Oak Ave, City, State',
      totalAmount: '$45.99',
      productName: 'Artist T-Shirt',
      productPrice: '$39.99',
      quantity: 1,
      itemSubtotal: '$39.99',
      size: 'Large',
      productDetails: 'Limited edition artist merchandise',
      sellerId: user?.id || 1,
      sellerName: user?.name || 'djjetfuel',
    },
    {
      orderId: 1003,
      paypalOrderId: 'PAY-456789123',
      orderDate: '2024-01-13',
      status: 'completed',
      customerName: 'Mike Johnson',
      customerEmail: 'mike@example.com',
      shippingAddress: '789 Pine St, City, State',
      totalAmount: '$25.99',
      productName: 'Digital Album',
      productPrice: '$19.99',
      quantity: 1,
      itemSubtotal: '$19.99',
      size: 'N/A',
      productDetails: 'High-quality digital music download',
      sellerId: user?.id || 1,
      sellerName: user?.name || 'djjetfuel',
    },
  ]);

  // Filter data by date range
  const filteredSalesData = useMemo(() => {
    return salesData.filter((item) => {
      const orderDate = new Date(item.orderDate);
      return orderDate >= dateRange.from && orderDate <= dateRange.to;
    });
  }, [salesData, dateRange]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalSales = filteredSalesData.reduce((sum, item) => {
      return sum + parseFloat(item.totalAmount.replace('$', ''));
    }, 0);

    const totalOrders = new Set(filteredSalesData.map(item => item.orderId)).size;
    const totalCustomers = new Set(filteredSalesData.map(item => item.customerEmail)).size;
    const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    return {
      totalSales,
      totalOrders,
      totalCustomers,
      averageOrderValue,
    };
  }, [filteredSalesData]);

  // Product sales data
  const productSalesData = useMemo(() => {
    const productMap = filteredSalesData.reduce((acc, item) => {
      const productName = item.productName;
      if (!acc[productName]) {
        acc[productName] = { quantity: 0, revenue: 0 };
      }
      acc[productName].quantity += item.quantity;
      acc[productName].revenue += parseFloat(item.itemSubtotal.replace('$', ''));
      return acc;
    }, {} as Record<string, { quantity: number; revenue: number }>);

    return Object.entries(productMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredSalesData]);

  // Customer data
  const customerData = useMemo(() => {
    const customerMap = filteredSalesData.reduce((acc, item) => {
      const email = item.customerEmail;
      if (!acc[email]) {
        acc[email] = {
          name: item.customerName,
          email,
          orders: 0,
          totalSpent: 0,
        };
      }
      acc[email].orders++;
      acc[email].totalSpent += parseFloat(item.totalAmount.replace('$', ''));
      return acc;
    }, {} as Record<string, any>);

    return Object.values(customerMap).sort((a: any, b: any) => b.totalSpent - a.totalSpent);
  }, [filteredSalesData]);

  // Export data
  const exportData = async () => {
    try {
      const csvHeaders = [
        'Order ID', 'PayPal Order ID', 'Date', 'Status', 'Customer',
        'Email', 'Product', 'Price', 'Quantity', 'Total'
      ];

      const csvRows = filteredSalesData.map(item => [
        item.orderId,
        item.paypalOrderId,
        new Date(item.orderDate).toLocaleDateString(),
        item.status,
        item.customerName,
        item.customerEmail,
        item.productName,
        item.productPrice,
        item.quantity,
        item.itemSubtotal
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.join(','))
        .join('\n');

      await Share.share({
        message: csvContent,
        title: 'My Sales Data Export',
      });
    } catch (error) {
      Alert.alert('Export Error', 'Failed to export sales data');
    }
  };

  const renderOverview = () => (
    <ScrollView style={styles.tabContent}>
      {/* Metrics Cards */}
      <ThemedView style={styles.metricsGrid}>
        <ThemedView style={styles.metricCard}>
          <Ionicons name="cash" size={24} color="#059669" />
          <ThemedText style={styles.metricAmount}>${metrics.totalSales.toFixed(2)}</ThemedText>
          <ThemedText style={styles.metricLabel}>Total Sales</ThemedText>
        </ThemedView>

        <ThemedView style={styles.metricCard}>
          <Ionicons name="receipt" size={24} color="#3b82f6" />
          <ThemedText style={styles.metricAmount}>{metrics.totalOrders}</ThemedText>
          <ThemedText style={styles.metricLabel}>Orders</ThemedText>
        </ThemedView>

        <ThemedView style={styles.metricCard}>
          <Ionicons name="people" size={24} color="#8b5cf6" />
          <ThemedText style={styles.metricAmount}>{metrics.totalCustomers}</ThemedText>
          <ThemedText style={styles.metricLabel}>Customers</ThemedText>
        </ThemedView>

        <ThemedView style={styles.metricCard}>
          <Ionicons name="trending-up" size={24} color="#f59e0b" />
          <ThemedText style={styles.metricAmount}>${metrics.averageOrderValue.toFixed(2)}</ThemedText>
          <ThemedText style={styles.metricLabel}>Avg Order</ThemedText>
        </ThemedView>
      </ThemedView>

      {/* Top Products */}
      <ThemedView style={styles.topProductsContainer}>
        <ThemedText style={styles.sectionTitle}>Top Products</ThemedText>
        {productSalesData.slice(0, 5).map((product, index) => (
          <ThemedView key={product.name} style={styles.topProductItem}>
            <ThemedView style={styles.productRank}>
              <ThemedText style={styles.rankNumber}>#{index + 1}</ThemedText>
            </ThemedView>
            <ThemedView style={styles.productInfo}>
              <ThemedText style={styles.productName}>{product.name}</ThemedText>
              <ThemedText style={styles.productStats}>
                {product.quantity} units sold
              </ThemedText>
            </ThemedView>
            <ThemedText style={styles.productRevenue}>${product.revenue.toFixed(2)}</ThemedText>
          </ThemedView>
        ))}
      </ThemedView>
    </ScrollView>
  );

  const renderProducts = () => (
    <ScrollView style={styles.tabContent}>
      <ThemedText style={styles.sectionTitle}>Product Performance</ThemedText>
      
      {productSalesData.map((product, index) => (
        <ThemedView key={product.name} style={styles.productCard}>
          <ThemedView style={styles.productRank}>
            <ThemedText style={styles.rankNumber}>#{index + 1}</ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.productInfo}>
            <ThemedText style={styles.productName}>{product.name}</ThemedText>
            <ThemedText style={styles.productStats}>
              {product.quantity} units sold
            </ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.productRevenue}>
            <ThemedText style={styles.revenueAmount}>${product.revenue.toFixed(2)}</ThemedText>
          </ThemedView>
        </ThemedView>
      ))}
    </ScrollView>
  );

  const renderOrders = () => (
    <FlatList
      data={filteredSalesData}
      keyExtractor={(item) => `${item.orderId}-${item.productName}`}
      renderItem={({ item }) => (
        <ThemedView style={styles.orderCard}>
          <ThemedView style={styles.orderHeader}>
            <ThemedText style={styles.orderId}>Order #{item.orderId}</ThemedText>
            <ThemedText style={styles.orderDate}>
              {new Date(item.orderDate).toLocaleDateString()}
            </ThemedText>
          </ThemedView>
          
          <ThemedText style={styles.customerName}>{item.customerName}</ThemedText>
          <ThemedText style={styles.customerEmail}>{item.customerEmail}</ThemedText>
          
          <ThemedView style={styles.orderDetails}>
            <ThemedText style={styles.productName}>{item.productName}</ThemedText>
            <ThemedText style={styles.orderQuantity}>Qty: {item.quantity}</ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.orderFooter}>
            <ThemedView style={[styles.statusBadge, 
              item.status === 'completed' ? styles.statusCompleted : styles.statusPending
            ]}>
              <ThemedText style={styles.statusText}>{item.status}</ThemedText>
            </ThemedView>
            <ThemedText style={styles.orderTotal}>{item.totalAmount}</ThemedText>
          </ThemedView>
        </ThemedView>
      )}
      contentContainerStyle={styles.ordersList}
      showsVerticalScrollIndicator={false}
    />
  );

  const renderCustomers = () => {
    return (
      <FlatList
        data={customerData}
        keyExtractor={(item: any) => item.email}
        renderItem={({ item }: { item: any }) => (
          <ThemedView style={styles.customerCard}>
            <ThemedView style={styles.customerInfo}>
              <ThemedText style={styles.customerName}>{item.name}</ThemedText>
              <ThemedText style={styles.customerEmail}>{item.email}</ThemedText>
            </ThemedView>
            
            <ThemedView style={styles.customerStats}>
              <ThemedText style={styles.customerOrders}>{item.orders} orders</ThemedText>
              <ThemedText style={styles.customerSpent}>${item.totalSpent.toFixed(2)}</ThemedText>
            </ThemedView>
          </ThemedView>
        )}
        contentContainerStyle={styles.customersList}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading your sales data...</ThemedText>
      </ThemedView>
    );
  }

  if (salesData.length === 0) {
    return (
      <ThemedView style={styles.emptyContainer}>
        <Ionicons name="document-text" size={64} color="#9ca3af" />
        <ThemedText style={styles.emptyTitle}>No Sales Data</ThemedText>
        <ThemedText style={styles.emptyDescription}>
          You don't have any sales yet. When customers purchase your products, the data will appear here.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <ThemedText style={styles.title}>My Sales</ThemedText>
        <TouchableOpacity onPress={exportData} style={styles.exportButton}>
          <Ionicons name="download" size={20} color="#3b82f6" />
        </TouchableOpacity>
      </ThemedView>

      {/* Tab Navigation */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.tabNavigation}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            style={[
              styles.tabButton,
              activeTab === tab.id && styles.activeTabButton
            ]}
          >
            <Ionicons 
              name={tab.icon as any} 
              size={20} 
              color={activeTab === tab.id ? "#3b82f6" : "#6b7280"} 
            />
            <ThemedText style={[
              styles.tabButtonText,
              activeTab === tab.id && styles.activeTabButtonText
            ]}>
              {tab.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Content */}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'products' && renderProducts()}
      {activeTab === 'orders' && renderOrders()}
      {activeTab === 'customers' && renderCustomers()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  exportButton: {
    padding: 8,
  },
  tabNavigation: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  activeTabButton: {
    backgroundColor: '#dbeafe',
  },
  tabButtonText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  activeTabButtonText: {
    color: '#3b82f6',
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  topProductsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  topProductItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  productRank: {
    width: 40,
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  productInfo: {
    flex: 1,
    marginLeft: 16,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  productStats: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  productRevenue: {
    alignItems: 'flex-end',
  },
  revenueAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  ordersList: {
    padding: 16,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  orderDate: {
    fontSize: 14,
    color: '#6b7280',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  customerEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  orderDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderQuantity: {
    fontSize: 14,
    color: '#6b7280',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusCompleted: {
    backgroundColor: '#dcfce7',
  },
  statusPending: {
    backgroundColor: '#fef3c7',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  customersList: {
    padding: 16,
  },
  customerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  customerInfo: {
    flex: 1,
  },
  customerStats: {
    alignItems: 'flex-end',
  },
  customerOrders: {
    fontSize: 14,
    color: '#6b7280',
  },
  customerSpent: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
});
