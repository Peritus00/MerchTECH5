
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';

const { width: screenWidth } = Dimensions.get('window');

interface SalesData {
  date: string;
  amount: number;
  count: number;
}

interface ProductSales {
  productId: number;
  productName: string;
  totalSales: number;
  unitsSold: number;
  revenue: number;
}

interface UserSales {
  userId: number;
  username: string;
  totalSales: number;
  commission: number;
  revenue: number;
}

export default function EnhancedSalesReportsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('7'); // days
  const [selectedTab, setSelectedTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);

  const periods = [
    { label: '7 Days', value: '7' },
    { label: '30 Days', value: '30' },
    { label: '90 Days', value: '90' },
    { label: '1 Year', value: '365' },
  ];

  const tabs = [
    { label: 'Overview', value: 'overview', icon: '📊' },
    { label: 'Products', value: 'products', icon: '📦' },
    { label: 'Users', value: 'users', icon: '👥' },
    { label: 'Trends', value: 'trends', icon: '📈' },
  ];

  // Mock data
  const [salesData] = useState<SalesData[]>([
    { date: '2024-01-15', amount: 1250.00, count: 15 },
    { date: '2024-01-16', amount: 890.50, count: 12 },
    { date: '2024-01-17', amount: 2100.75, count: 23 },
    { date: '2024-01-18', amount: 1750.25, count: 18 },
    { date: '2024-01-19', amount: 950.00, count: 10 },
    { date: '2024-01-20', amount: 1500.50, count: 16 },
    { date: '2024-01-21', amount: 1850.75, count: 20 },
  ]);

  const [productSales] = useState<ProductSales[]>([
    { productId: 1, productName: 'Premium Headphones', totalSales: 45, unitsSold: 45, revenue: 8997.75 },
    { productId: 2, productName: 'Artist T-Shirt', totalSales: 89, unitsSold: 89, revenue: 2222.11 },
    { productId: 3, productName: 'Digital Album', totalSales: 156, unitsSold: 156, revenue: 1558.44 },
    { productId: 4, productName: 'Vinyl Record', totalSales: 23, unitsSold: 23, revenue: 1149.77 },
    { productId: 5, productName: 'Poster Set', totalSales: 34, unitsSold: 34, revenue: 849.66 },
  ]);

  const [userSales] = useState<UserSales[]>([
    { userId: 1, username: 'djjetfuel', totalSales: 125, commission: 1250.00, revenue: 8750.00 },
    { userId: 2, username: 'artist_2', totalSales: 89, commission: 890.00, revenue: 6230.00 },
    { userId: 3, username: 'creator_3', totalSales: 67, commission: 670.00, revenue: 4690.00 },
    { userId: 4, username: 'musician_4', totalSales: 45, commission: 450.00, revenue: 3150.00 },
    { userId: 5, username: 'producer_5', totalSales: 23, commission: 230.00, revenue: 1610.00 },
  ]);

  // Check if user is admin
  useEffect(() => {
    if (!user || user.email !== 'djjetfuel@gmail.com') {
      Alert.alert('Access Denied', 'This page is only accessible to administrators.');
      router.back();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalRevenue = salesData.reduce((sum, day) => sum + day.amount, 0);
    const totalOrders = salesData.reduce((sum, day) => sum + day.count, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    
    return {
      revenue: totalRevenue,
      orders: totalOrders,
      averageOrderValue,
      topProduct: productSales[0]?.productName || 'N/A',
      topUser: userSales[0]?.username || 'N/A',
    };
  }, [salesData, productSales, userSales]);

  const renderOverview = () => (
    <ScrollView style={styles.tabContent}>
      {/* Summary Cards */}
      <ThemedView style={styles.summaryGrid}>
        <ThemedView style={styles.summaryCard}>
          <ThemedText style={styles.summaryIcon}>💰</ThemedText>
          <ThemedText style={styles.summaryAmount}>${totals.revenue.toFixed(2)}</ThemedText>
          <ThemedText style={styles.summaryLabel}>Total Revenue</ThemedText>
        </ThemedView>
        
        <ThemedView style={styles.summaryCard}>
          <ThemedText style={styles.summaryIcon}>🧾</ThemedText>
          <ThemedText style={styles.summaryAmount}>{totals.orders}</ThemedText>
          <ThemedText style={styles.summaryLabel}>Total Orders</ThemedText>
        </ThemedView>
        
        <ThemedView style={styles.summaryCard}>
          <ThemedText style={styles.summaryIcon}>📊</ThemedText>
          <ThemedText style={styles.summaryAmount}>${totals.averageOrderValue.toFixed(2)}</ThemedText>
          <ThemedText style={styles.summaryLabel}>Avg Order Value</ThemedText>
        </ThemedView>
        
        <ThemedView style={styles.summaryCard}>
          <ThemedText style={styles.summaryIcon}>⭐</ThemedText>
          <ThemedText style={styles.summaryAmount} numberOfLines={1}>{totals.topProduct}</ThemedText>
          <ThemedText style={styles.summaryLabel}>Top Product</ThemedText>
        </ThemedView>
      </ThemedView>

      {/* Recent Sales */}
      <ThemedView style={styles.chartContainer}>
        <ThemedText style={styles.chartTitle}>Recent Sales Activity</ThemedText>
        {salesData.map((sale, index) => (
          <ThemedView key={sale.date} style={styles.saleRow}>
            <ThemedView style={styles.saleDate}>
              <ThemedText style={styles.saleDateText}>{new Date(sale.date).toLocaleDateString()}</ThemedText>
            </ThemedView>
            <ThemedView style={styles.saleInfo}>
              <ThemedText style={styles.saleAmount}>${sale.amount.toFixed(2)}</ThemedText>
              <ThemedText style={styles.saleCount}>{sale.count} orders</ThemedText>
            </ThemedView>
          </ThemedView>
        ))}
      </ThemedView>

      {/* Growth Metrics */}
      <ThemedView style={styles.metricsContainer}>
        <ThemedText style={styles.metricsTitle}>Growth Metrics</ThemedText>
        
        <ThemedView style={styles.metricRow}>
          <ThemedText style={styles.metricLabel}>Period Growth</ThemedText>
          <ThemedText style={styles.metricValue}>+12.5%</ThemedText>
        </ThemedView>
        
        <ThemedView style={styles.metricRow}>
          <ThemedText style={styles.metricLabel}>Best Performing Day</ThemedText>
          <ThemedText style={styles.metricValue}>
            {new Date(salesData.reduce((best, current) => 
              current.amount > best.amount ? current : best
            ).date).toLocaleDateString()}
          </ThemedText>
        </ThemedView>
        
        <ThemedView style={styles.metricRow}>
          <ThemedText style={styles.metricLabel}>Total Products Sold</ThemedText>
          <ThemedText style={styles.metricValue}>
            {productSales.reduce((sum, product) => sum + product.unitsSold, 0)}
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );

  const renderProducts = () => (
    <ScrollView style={styles.tabContent}>
      <ThemedText style={styles.sectionTitle}>Top Products by Revenue</ThemedText>
      
      {productSales.map((product, index) => (
        <ThemedView key={product.productId} style={styles.itemCard}>
          <ThemedView style={styles.itemRank}>
            <ThemedText style={styles.rankNumber}>#{index + 1}</ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.itemInfo}>
            <ThemedText style={styles.itemName}>{product.productName}</ThemedText>
            <ThemedText style={styles.itemSubtext}>
              {product.unitsSold} units sold
            </ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.itemValue}>
            <ThemedText style={styles.itemAmount}>${product.revenue.toFixed(2)}</ThemedText>
          </ThemedView>
        </ThemedView>
      ))}
    </ScrollView>
  );

  const renderUsers = () => (
    <ScrollView style={styles.tabContent}>
      <ThemedText style={styles.sectionTitle}>Top Selling Users</ThemedText>
      
      {userSales.map((user, index) => (
        <ThemedView key={user.userId} style={styles.itemCard}>
          <ThemedView style={styles.itemRank}>
            <ThemedText style={styles.rankNumber}>#{index + 1}</ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.itemInfo}>
            <ThemedText style={styles.itemName}>{user.username}</ThemedText>
            <ThemedText style={styles.itemSubtext}>
              Commission: ${user.commission.toFixed(2)}
            </ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.itemValue}>
            <ThemedText style={styles.itemAmount}>${user.revenue.toFixed(2)}</ThemedText>
          </ThemedView>
        </ThemedView>
      ))}
    </ScrollView>
  );

  const renderTrends = () => (
    <ScrollView style={styles.tabContent}>
      <ThemedText style={styles.sectionTitle}>Sales Trends</ThemedText>
      
      {/* Daily Sales Visualization */}
      <ThemedView style={styles.chartContainer}>
        <ThemedText style={styles.chartTitle}>Daily Sales Volume</ThemedText>
        <ThemedView style={styles.barChart}>
          {salesData.map((sale, index) => {
            const maxAmount = Math.max(...salesData.map(s => s.amount));
            const height = (sale.amount / maxAmount) * 100;
            return (
              <ThemedView key={sale.date} style={styles.barContainer}>
                <ThemedView style={[styles.bar, { height: `${height}%` }]} />
                <ThemedText style={styles.barLabel}>
                  {new Date(sale.date).getDate()}
                </ThemedText>
              </ThemedView>
            );
          })}
        </ThemedView>
      </ThemedView>

      {/* Trend Analysis */}
      <ThemedView style={styles.analysisContainer}>
        <ThemedText style={styles.analysisTitle}>Trend Analysis</ThemedText>
        
        <ThemedView style={styles.trendItem}>
          <ThemedText style={styles.trendIcon}>📈</ThemedText>
          <ThemedView style={styles.trendContent}>
            <ThemedText style={styles.trendLabel}>Revenue Trend</ThemedText>
            <ThemedText style={styles.trendDescription}>
              Steady growth with peak on {new Date(salesData[2].date).toLocaleDateString()}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.trendItem}>
          <ThemedText style={styles.trendIcon}>🛍️</ThemedText>
          <ThemedView style={styles.trendContent}>
            <ThemedText style={styles.trendLabel}>Order Volume</ThemedText>
            <ThemedText style={styles.trendDescription}>
              Consistent order flow with {totals.orders} total orders
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.trendItem}>
          <ThemedText style={styles.trendIcon}>💎</ThemedText>
          <ThemedView style={styles.trendContent}>
            <ThemedText style={styles.trendLabel}>Best Sellers</ThemedText>
            <ThemedText style={styles.trendDescription}>
              {productSales[0].productName} leading with ${productSales[0].revenue.toFixed(2)} revenue
            </ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </ScrollView>
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading sales data...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ThemedText style={styles.backButtonText}>← Back</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.title}>Enhanced Sales Reports</ThemedText>
      </ThemedView>

      {/* Period Selector */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.periodSelector}
      >
        {periods.map((period) => (
          <TouchableOpacity
            key={period.value}
            onPress={() => setSelectedPeriod(period.value)}
            style={[
              styles.periodButton,
              selectedPeriod === period.value && styles.activePeriodButton
            ]}
          >
            <ThemedText style={[
              styles.periodButtonText,
              selectedPeriod === period.value && styles.activePeriodButtonText
            ]}>
              {period.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Navigation */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.tabNavigation}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.value}
            onPress={() => setSelectedTab(tab.value)}
            style={[
              styles.tabButton,
              selectedTab === tab.value && styles.activeTabButton
            ]}
          >
            <ThemedText style={styles.tabIcon}>{tab.icon}</ThemedText>
            <ThemedText style={[
              styles.tabButtonText,
              selectedTab === tab.value && styles.activeTabButtonText
            ]}>
              {tab.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Content */}
      {selectedTab === 'overview' && renderOverview()}
      {selectedTab === 'products' && renderProducts()}
      {selectedTab === 'users' && renderUsers()}
      {selectedTab === 'trends' && renderTrends()}
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
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  periodSelector: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  periodButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  activePeriodButton: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  periodButtonText: {
    fontSize: 14,
    opacity: 0.7,
    color: '#374151',
  },
  activePeriodButtonText: {
    color: '#ffffff',
    opacity: 1,
  },
  tabNavigation: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  activeTabButton: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  tabIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  tabButtonText: {
    fontSize: 14,
    opacity: 0.7,
    color: '#374151',
  },
  activeTabButtonText: {
    color: '#3b82f6',
    opacity: 1,
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
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
  summaryIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#1f2937',
  },
  summaryLabel: {
    fontSize: 12,
    opacity: 0.7,
    textAlign: 'center',
    color: '#374151',
  },
  chartContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#1f2937',
  },
  saleRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  saleDate: {
    width: 100,
  },
  saleDateText: {
    fontSize: 14,
    opacity: 0.7,
    color: '#6b7280',
  },
  saleInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  saleAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
  },
  saleCount: {
    fontSize: 14,
    opacity: 0.7,
    color: '#6b7280',
  },
  metricsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  metricsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#1f2937',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#1f2937',
  },
  itemCard: {
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
  itemRank: {
    width: 40,
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    opacity: 0.7,
    color: '#6b7280',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  itemSubtext: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
    color: '#6b7280',
  },
  itemValue: {
    alignItems: 'flex-end',
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  barChart: {
    flexDirection: 'row',
    height: 120,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  bar: {
    backgroundColor: '#3b82f6',
    width: 20,
    borderRadius: 2,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
    color: '#6b7280',
  },
  analysisContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#1f2937',
  },
  trendItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  trendIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  trendContent: {
    flex: 1,
  },
  trendLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: '#1f2937',
  },
  trendDescription: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
    color: '#6b7280',
  },
});
