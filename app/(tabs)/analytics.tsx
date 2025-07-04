import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { analyticsService } from '@/services/analyticsService';
import { useAuth } from '@/contexts/AuthContext';

const { width: screenWidth } = Dimensions.get('window');

interface SummaryData {
  totalCodes: number;
  totalScans: number;
  scansToday: number;
  mostPopular?: {
    id: number;
    name: string;
    scanCount: number;
  };
  personalized: boolean;
}

interface HistoryData {
  data: { date: string; count: number }[];
  personalized: boolean;
}

interface DeviceData {
  device: string;
  count: number;
}

interface GeographicData {
  level: string;
  data: {
    country: string;
    location_name: string;
    count: number;
  }[];
}

interface BrowserData {
  browser: string;
  count: number;
}

interface OSData {
  os: string;
  count: number;
}

interface TimePatternData {
  hour: number;
  count: number;
}

const AnalyticsCard = ({ title, value, icon, color, change }: {
  title: string;
  value: number;
  icon: string;
  color: string;
  change?: { value: number; type: 'increase' | 'decrease' };
}) => {
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <View style={[styles.card, { width: '48%' }]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
          <MaterialIcons name={icon as any} size={20} color={color} />
        </View>
        {change && (
          <View style={[
            styles.changeContainer,
            { backgroundColor: change.type === 'increase' ? '#dcfce7' : '#fef2f2' }
          ]}>
            <MaterialIcons
              name={change.type === 'increase' ? 'trending-up' : 'trending-down'}
              size={12}
              color={change.type === 'increase' ? '#16a34a' : '#dc2626'}
            />
            <Text style={[
              styles.changeText,
              { color: change.type === 'increase' ? '#16a34a' : '#dc2626' }
            ]}>
              {Math.abs(change.value)}%
            </Text>
          </View>
        )}
      </View>
      
      <Text style={styles.value}>{formatNumber(value)}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
};

const TimeRangeSelector = ({ selectedRange, onRangeChange }: {
  selectedRange: number;
  onRangeChange: (range: number) => void;
}) => {
  const timeRanges = [
    { value: 7, label: '7D' },
    { value: 30, label: '30D' },
    { value: 90, label: '90D' },
    { value: 365, label: '1Y' },
  ];

  return (
    <View style={styles.timeContainer}>
      <Text style={styles.timeLabel}>Time Range</Text>
      <View style={styles.selector}>
        {timeRanges.map((range) => (
          <TouchableOpacity
            key={range.value}
            style={[
              styles.option,
              selectedRange === range.value && styles.selectedOption,
            ]}
            onPress={() => onRangeChange(range.value)}
          >
            <Text
              style={[
                styles.optionText,
                selectedRange === range.value && styles.selectedOptionText,
              ]}
            >
              {range.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const ChartContainer = ({ title, children, subtitle }: {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
}) => {
  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        {subtitle && <Text style={styles.chartSubtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.chartContent}>
        {children}
      </View>
    </View>
  );
};

export default function AnalyticsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [deviceData, setDeviceData] = useState<DeviceData[]>([]);
  const [geoData, setGeoData] = useState<GeographicData | null>(null);
  const [browserData, setBrowserData] = useState<BrowserData[]>([]);
  const [osData, setOSData] = useState<OSData[]>([]);
  const [timePatternData, setTimePatternData] = useState<TimePatternData[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'geography' | 'behavior'>('overview');

  useEffect(() => {
    fetchAllAnalytics();
  }, [selectedTimeRange]);

  const fetchAllAnalytics = async () => {
    try {
      setIsLoading(true);
      
      // Fetch real analytics data
      const analytics = await analyticsService.getAnalyticsSummary();
      
      // Convert analytics data to match expected format
      setSummaryData({
        totalCodes: 0, // Will be populated from real QR codes count
        totalScans: analytics.totalScans || 0,
        scansToday: analytics.todayScans || 0,
        mostPopular: analytics.recentScans && analytics.recentScans.length > 0 ? {
          id: 1,
          name: analytics.recentScans[0].qrName || 'Unknown QR Code',
          scanCount: analytics.totalScans || 0,
        } : undefined,
        personalized: true,
      });

      // Set history data from real analytics
      setHistoryData({
        data: analytics.hourlyData ? analytics.hourlyData.map((count, hour) => ({
          date: new Date(Date.now() - (23 - hour) * 60 * 60 * 1000).toISOString(),
          count: count || 0,
        })) : [],
        personalized: true,
      });

      // Set device data from real analytics
      setDeviceData(analytics.topDevices || []);

      // Set geographic data from real analytics
      setGeoData({
        level: 'country',
        data: analytics.topCountries ? analytics.topCountries.map(country => ({
          country: country.country,
          location_name: country.country,
          count: country.count,
        })) : [],
      });

      // Clear browser and OS data (will be populated when real tracking is implemented)
      setBrowserData([]);
      setOSData([]);
      setTimePatternData([]);

      // If user is authenticated, fetch user-specific analytics
      if (user) {
        try {
          const userAnalytics = await analyticsService.getUserAnalytics(user.id);
          setSummaryData(prev => prev ? {
            ...prev,
            totalCodes: userAnalytics.totalQRCodes || 0,
          } : null);
        } catch (error) {
          console.error('Error fetching user analytics:', error);
        }
      }

    } catch (error) {
      console.error('Error fetching analytics:', error);
      // Set empty state instead of showing mock data
      setSummaryData({
        totalCodes: 0,
        totalScans: 0,
        scansToday: 0,
        personalized: false,
      });
      setHistoryData({ data: [], personalized: false });
      setDeviceData([]);
      setGeoData({ level: 'country', data: [] });
      setBrowserData([]);
      setOSData([]);
      setTimePatternData([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAllAnalytics();
  };

  const formatHistoryChartData = () => {
    if (!historyData?.data || historyData.data.length === 0) return null;
    
    const chartData = historyData.data.slice(-7);
    return {
      labels: chartData.map(item => {
        const date = new Date(item.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }),
      datasets: [{
        data: chartData.map(item => item.count),
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        strokeWidth: 2,
      }],
    };
  };

  const formatPieChartData = (data: any[], colorPalette: string[]) => {
    if (!data || data.length === 0) return [];
    
    return data.slice(0, 5).map((item, index) => ({
      name: item.device || item.browser || item.os || item.country || item.location_name,
      population: item.count,
      color: colorPalette[index % colorPalette.length],
      legendFontColor: '#6b7280',
      legendFontSize: 12,
    }));
  };

  const colorPalette = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

  const renderOverviewTab = () => (
    <>
      {/* Summary Cards */}
      <View style={styles.summaryGrid}>
        <AnalyticsCard
          title="Total QR Codes"
          value={summaryData?.totalCodes || 0}
          icon="qr-code"
          color="#3b82f6"
        />
        <AnalyticsCard
          title="Total Scans"
          value={summaryData?.totalScans || 0}
          icon="visibility"
          color="#10b981"
        />
        <AnalyticsCard
          title="Scans Today"
          value={summaryData?.scansToday || 0}
          icon="today"
          color="#f59e0b"
        />
        <AnalyticsCard
          title="Active Codes"
          value={summaryData?.totalCodes || 0}
          icon="check-circle"
          color="#8b5cf6"
        />
      </View>

      {/* Most Popular QR Code */}
      {summaryData?.mostPopular && (
        <ChartContainer title="Most Popular QR Code">
          <View style={styles.popularCard}>
            <MaterialIcons name="trending-up" size={24} color="#10b981" />
            <View style={styles.popularInfo}>
              <Text style={styles.popularName}>{summaryData.mostPopular.name}</Text>
              <Text style={styles.popularScans}>
                {summaryData.mostPopular.scanCount} scans
              </Text>
            </View>
          </View>
        </ChartContainer>
      )}

      {/* Scan History Chart */}
      {formatHistoryChartData() && (
        <ChartContainer title={`Scan History (Last ${selectedTimeRange} days)`}>
          <LineChart
            data={formatHistoryChartData()!}
            width={screenWidth - 64}
            height={220}
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: {
                r: '6',
                strokeWidth: '2',
                stroke: '#3b82f6',
              },
            }}
            bezier
            style={styles.chart}
          />
        </ChartContainer>
      )}
    </>
  );

  const renderDevicesTab = () => (
    <>
      {/* Device Distribution */}
      {deviceData.length > 0 && (
        <ChartContainer title="Device Distribution">
          <PieChart
            data={formatPieChartData(deviceData, colorPalette)}
            width={screenWidth - 64}
            height={220}
            chartConfig={{
              color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            }}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
        </ChartContainer>
      )}

      {/* Browser Distribution */}
      {browserData.length > 0 && (
        <ChartContainer title="Browser Distribution">
          <BarChart
            data={{
              labels: browserData.slice(0, 5).map(item => item.browser),
              datasets: [{
                data: browserData.slice(0, 5).map(item => item.count),
              }],
            }}
            width={screenWidth - 64}
            height={220}
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
              barPercentage: 0.7,
            }}
            style={styles.chart}
          />
        </ChartContainer>
      )}

      {/* Operating System Distribution */}
      {osData.length > 0 && (
        <ChartContainer title="Operating System Distribution">
          <PieChart
            data={formatPieChartData(osData, ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'])}
            width={screenWidth - 64}
            height={220}
            chartConfig={{
              color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            }}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
        </ChartContainer>
      )}
    </>
  );

  const renderGeographyTab = () => (
    <>
      {/* Top Countries */}
      {geoData?.data && geoData.data.length > 0 && (
        <ChartContainer title="Geographic Distribution">
          <View style={styles.geoList}>
            {geoData.data.slice(0, 10).map((country, index) => (
              <View key={country.country} style={styles.geoItem}>
                <View style={styles.geoRank}>
                  <Text style={styles.geoRankText}>{index + 1}</Text>
                </View>
                <Text style={styles.geoCountry}>{country.location_name}</Text>
                <Text style={styles.geoCount}>{country.count} scans</Text>
              </View>
            ))}
          </View>
        </ChartContainer>
      )}

      {/* Geographic Chart */}
      {geoData?.data && geoData.data.length > 0 && (
        <ChartContainer title="Top Countries by Scans">
          <BarChart
            data={{
              labels: geoData.data.slice(0, 5).map(item => item.country.substring(0, 3)),
              datasets: [{
                data: geoData.data.slice(0, 5).map(item => item.count),
              }],
            }}
            width={screenWidth - 64}
            height={220}
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
              barPercentage: 0.7,
            }}
            style={styles.chart}
          />
        </ChartContainer>
      )}
    </>
  );

  const renderBehaviorTab = () => (
    <>
      {/* Time Patterns */}
      {timePatternData.length > 0 && (
        <ChartContainer title="Scan Patterns by Hour">
          <LineChart
            data={{
              labels: timePatternData.filter((_, i) => i % 4 === 0).map(item => `${item.hour}:00`),
              datasets: [{
                data: timePatternData.map(item => item.count),
                color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`,
                strokeWidth: 2,
              }],
            }}
            width={screenWidth - 64}
            height={220}
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
                stroke: '#f59e0b',
              },
            }}
            bezier
            style={styles.chart}
          />
        </ChartContainer>
      )}

      {/* Peak Hours */}
      <ChartContainer title="Peak Activity Hours">
        <View style={styles.peakHours}>
          {timePatternData
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map((hour, index) => (
              <View key={hour.hour} style={styles.peakHourItem}>
                <MaterialIcons 
                  name={index === 0 ? "emoji-events" : "access-time"} 
                  size={20} 
                  color={index === 0 ? "#f59e0b" : "#6b7280"} 
                />
                <Text style={styles.peakHourText}>
                  {hour.hour}:00 - {hour.hour + 1}:00
                </Text>
                <Text style={styles.peakHourCount}>{hour.count} scans</Text>
              </View>
            ))}
        </View>
      </ChartContainer>
    </>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Analytics</Text>
        <TouchableOpacity onPress={onRefresh}>
          <MaterialIcons name="refresh" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Time Range Selector */}
      <TimeRangeSelector
        selectedRange={selectedTimeRange}
        onRangeChange={setSelectedTimeRange}
      />

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {[
          { key: 'overview', label: 'Overview', icon: 'dashboard' },
          { key: 'devices', label: 'Devices', icon: 'devices' },
          { key: 'geography', label: 'Geography', icon: 'public' },
          { key: 'behavior', label: 'Behavior', icon: 'schedule' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && styles.activeTab,
            ]}
            onPress={() => setActiveTab(tab.key as any)}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={18}
              color={activeTab === tab.key ? '#fff' : '#6b7280'}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.activeTabText,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'devices' && renderDevicesTab()}
        {activeTab === 'geography' && renderGeographyTab()}
        {activeTab === 'behavior' && renderBehaviorTab()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  timeContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  selector: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 2,
  },
  option: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  selectedOption: {
    backgroundColor: '#3b82f6',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  selectedOptionText: {
    color: '#fff',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 4,
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 2,
  },
  changeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  value: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  chartContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartHeader: {
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  chartContent: {
    alignItems: 'center',
  },
  popularCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  popularInfo: {
    flex: 1,
  },
  popularName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  popularScans: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '500',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  geoList: {
    gap: 8,
  },
  geoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  geoRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  geoRankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  geoCountry: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  geoCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  peakHours: {
    gap: 12,
  },
  peakHourItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  peakHourText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  peakHourCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#6b7280',
  },
});
