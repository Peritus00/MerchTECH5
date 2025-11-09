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
import HeaderWithLogo from '@/components/HeaderWithLogo';

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
  const [cityList, setCityList] = useState<Array<{ key: string; label: string; count: number }>>([]);
  const [browserData, setBrowserData] = useState<BrowserData[]>([]);
  const [osData, setOSData] = useState<OSData[]>([]);
  const [timePatternData, setTimePatternData] = useState<TimePatternData[]>([]);
  const [ageData, setAgeData] = useState<Array<{ ageRange: string; count: number }>>([]);
  const [genderData, setGenderData] = useState<Array<{ gender: string; count: number }>>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'geography' | 'behavior' | 'demographics'>('overview');
  const [demographicsSubTab, setDemographicsSubTab] = useState<'age' | 'gender'>('age');
  
  // QR scan demographics data
  const [qrScanAgeData, setQrScanAgeData] = useState<Array<{ ageRange: string; count: number }>>([]);
  const [qrScanLocationData, setQrScanLocationData] = useState<{ topCountries: any[]; topCities: any[] } | null>(null);
  const [qrScanGenderData, setQrScanGenderData] = useState<Array<{ gender: string; count: number }>>([]);
  
  // New analytics state
  const [playStats, setPlayStats] = useState<any>(null);
  const [cartConversion, setCartConversion] = useState<any>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<number | null>(null);
  const [selectedMediaStats, setSelectedMediaStats] = useState<any>(null);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [mediaItemsStats, setMediaItemsStats] = useState<Array<{ id: number; title: string; type: string; url: string; totalPlays: number; uniquePlays: number }>>([]);

  useEffect(() => {
    fetchAllAnalytics();
  }, [selectedTimeRange]);

  // Fetch QR scan age demographics when Age tab is active
  useEffect(() => {
    if (activeTab === 'demographics' && demographicsSubTab === 'age') {
      fetchQRScanAgeDemographics();
    }
  }, [activeTab, demographicsSubTab, user, selectedTimeRange]);

  // Fetch QR scan location demographics when Geography tab is active
  useEffect(() => {
    if (activeTab === 'geography') {
      fetchQRScanLocationDemographics();
    }
  }, [activeTab, user, selectedTimeRange]);

  // Fetch QR scan gender demographics when Gender tab is active
  useEffect(() => {
    if (activeTab === 'demographics' && demographicsSubTab === 'gender') {
      fetchQRScanGenderDemographics();
    }
  }, [activeTab, demographicsSubTab, user, selectedTimeRange]);

  // Fetch media items stats when Behavior tab is active
  useEffect(() => {
    if (activeTab === 'behavior') {
      fetchMediaItemsStats();
    }
  }, [activeTab, user]);

  const fetchQRScanAgeDemographics = async () => {
    try {
      console.log('📊 FRONTEND: Fetching QR scan age demographics', { userId: user?.id, days: selectedTimeRange });
      const data = await analyticsService.getQRScanAgeDemographics(user?.id, selectedTimeRange);
      console.log('📊 FRONTEND: Received QR scan age demographics data:', data);
      if (data.success) {
        setQrScanAgeData(data.ageRanges || []);
        console.log('📊 FRONTEND: Set QR scan age data:', data.ageRanges?.length || 0, 'items');
      } else {
        console.warn('📊 FRONTEND: QR scan age demographics fetch returned success: false');
        setQrScanAgeData([]);
      }
    } catch (error) {
      console.error('📊 FRONTEND: Error fetching QR scan age demographics:', error);
      setQrScanAgeData([]);
    }
  };

  const fetchQRScanLocationDemographics = async () => {
    try {
      console.log('📊 FRONTEND: Fetching QR scan location demographics', { userId: user?.id, days: selectedTimeRange });
      const data = await analyticsService.getQRScanLocationDemographics(user?.id, selectedTimeRange);
      console.log('📊 FRONTEND: Received QR scan location demographics data:', data);
      if (data.success) {
        setQrScanLocationData({
          topCountries: data.topCountries || [],
          topCities: data.topCities || [],
        });
        console.log('📊 FRONTEND: Set QR scan location data:', data.topCountries?.length || 0, 'countries,', data.topCities?.length || 0, 'cities');
      } else {
        console.warn('📊 FRONTEND: QR scan location demographics fetch returned success: false');
        setQrScanLocationData(null);
      }
    } catch (error) {
      console.error('📊 FRONTEND: Error fetching QR scan location demographics:', error);
      setQrScanLocationData(null);
    }
  };

  const fetchQRScanGenderDemographics = async () => {
    try {
      console.log('📊 FRONTEND: Fetching QR scan gender demographics', { userId: user?.id, days: selectedTimeRange });
      const data = await analyticsService.getQRScanGenderDemographics(user?.id, selectedTimeRange);
      console.log('📊 FRONTEND: Received QR scan gender demographics data:', data);
      if (data.success) {
        setQrScanGenderData(data.genderDistribution || []);
        console.log('📊 FRONTEND: Set QR scan gender data:', data.genderDistribution?.length || 0, 'items');
      } else {
        console.warn('📊 FRONTEND: QR scan gender demographics fetch returned success: false');
        setQrScanGenderData([]);
      }
    } catch (error) {
      console.error('📊 FRONTEND: Error fetching QR scan gender demographics:', error);
      setQrScanGenderData([]);
    }
  };

  const fetchAllAnalytics = async () => {
    try {
      setIsLoading(true);
      
      // Fetch real analytics data with time-range filter
      const analytics = await analyticsService.getAnalyticsSummary({ days: selectedTimeRange });
      
      // Convert analytics data to match expected format
      setSummaryData({
        totalCodes: 0, // Will be populated from real QR codes count
        totalScans: analytics.totalScans || 0,
        scansToday: analytics.todayScans || 0,
        mostPopular: analytics.mostPopularQRCode ? {
          id: analytics.mostPopularQRCode.qrCodeId,
          name: analytics.mostPopularQRCode.qrName,
          scanCount: analytics.mostPopularQRCode.scanCount,
        } : undefined,
        personalized: true,
      });

      // Set history data from real analytics - use dailyScanHistory if available, otherwise fallback to empty
      setHistoryData({
        data: analytics.dailyScanHistory && analytics.dailyScanHistory.length > 0
          ? analytics.dailyScanHistory.map((item: { date: string; count: number }) => ({
              date: item.date,
              count: item.count || 0,
            }))
          : [],
        personalized: true,
      });

      // Set device data from real analytics
      setDeviceData(analytics.topDevices || []);

      // Set geographic data from real analytics (countries)
      setGeoData({
        level: 'country',
        data: analytics.topCountries ? analytics.topCountries.map(country => ({
          country: country.country,
          location_name: country.country,
          count: country.count,
        })) : [],
      });
      
      // Keep cities separately for a second list
      const topCities = (analytics as any).topCities || [];
      setCityList(topCities.map((c: any) => ({
        key: `${c.city}|${c.region}|${c.country}`,
        label: `${c.city}${c.region ? ', ' + c.region : ''}${c.country ? ' • ' + c.country : ''}`,
        count: c.count || 0,
      })));

      // Set age demographics from real analytics
      setAgeData((analytics as any).ageRanges || []);

      // Set gender demographics from real analytics
      setGenderData((analytics as any).genderDistribution || []);

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

          // Fetch play stats and cart conversion
          const [plays, conversion] = await Promise.all([
            analyticsService.getPlayStats(user.id),
            analyticsService.getCartConversionStats(user.id),
          ]);
          
          setPlayStats(plays);
          setCartConversion(conversion);
          
          // Extract media list from most played media for filtering
          if (plays?.mostPlayedMedia) {
            setMediaList(plays.mostPlayedMedia);
          }
          
          console.log('📊 ANALYTICS: Play stats and cart conversion loaded');
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
    setSelectedMediaId(null);
    setSelectedMediaStats(null);
    fetchAllAnalytics();
  };

  const handleMediaItemSelect = async (mediaId: number) => {
    setSelectedMediaId(mediaId);
    try {
      const stats = await analyticsService.getMediaStats(mediaId, user?.id);
      setSelectedMediaStats(stats);
    } catch (error) {
      console.error('Error fetching media stats:', error);
      setSelectedMediaStats(null);
    }
  };

  const handleClearMediaSelection = () => {
    setSelectedMediaId(null);
    setSelectedMediaStats(null);
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
          title="Last 24 Hours"
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

      {/* Media Engagement Section */}
      {playStats && (
        <>
          <Text style={styles.sectionTitle}>Media Engagement</Text>
          <View style={styles.summaryGrid}>
            <AnalyticsCard
              title="Total Media Plays"
              value={playStats.media?.totalPlays || 0}
              icon="play-circle-filled"
              color="#3b82f6"
            />
            <AnalyticsCard
              title="Unique Plays"
              value={playStats.media?.uniquePlays || 0}
              icon="people"
              color="#10b981"
            />
            <AnalyticsCard
              title="Playlists Created"
              value={playStats.playlists?.timesCreated || 0}
              icon="queue-music"
              color="#f59e0b"
            />
            <AnalyticsCard
              title="Slideshows Created"
              value={playStats.slideshows?.timesCreated || 0}
              icon="slideshow"
              color="#8b5cf6"
            />
          </View>

          {/* Media Item Filter */}
          {selectedMediaId && selectedMediaStats && (
            <ChartContainer title={`Stats for: ${selectedMediaStats.media?.title || 'Media Item'}`}>
              <TouchableOpacity 
                onPress={handleClearMediaSelection}
                style={styles.clearButton}
              >
                <MaterialIcons name="close" size={20} color="#6b7280" />
                <Text style={styles.clearButtonText}>View All Media</Text>
              </TouchableOpacity>
              <View style={styles.mediaStatsContainer}>
                <View style={styles.mediaStatItem}>
                  <Text style={styles.mediaStatLabel}>Total Plays</Text>
                  <Text style={styles.mediaStatValue}>{selectedMediaStats.totalPlays || 0}</Text>
                </View>
                <View style={styles.mediaStatItem}>
                  <Text style={styles.mediaStatLabel}>Unique Plays</Text>
                  <Text style={styles.mediaStatValue}>{selectedMediaStats.uniquePlays || 0}</Text>
                </View>
                <View style={styles.mediaStatItem}>
                  <Text style={styles.mediaStatLabel}>Avg Duration</Text>
                  <Text style={styles.mediaStatValue}>{selectedMediaStats.averageDuration || 0}s</Text>
                </View>
              </View>
            </ChartContainer>
          )}

          {/* Most Played Media */}
          {playStats.mostPlayedMedia && playStats.mostPlayedMedia.length > 0 ? (
            <ChartContainer title="Most Played Media">
              {playStats.mostPlayedMedia.slice(0, 10).map((item: any, index: number) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.listItem,
                    selectedMediaId === item.id && styles.selectedListItem
                  ]}
                  onPress={() => handleMediaItemSelect(item.id)}
                >
                  <View style={styles.listItemLeft}>
                    <Text style={styles.listItemRank}>{index + 1}</Text>
                    <Text style={styles.listItemName}>{item.title || 'Untitled'}</Text>
                  </View>
                  <View style={styles.listItemRight}>
                    <Text style={styles.listItemValue}>{parseInt(item.total_plays) || 0} plays</Text>
                    {selectedMediaId === item.id && (
                      <MaterialIcons name="check-circle" size={20} color="#3b82f6" style={{ marginLeft: 8 }} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ChartContainer>
          ) : (
            <ChartContainer title="Most Played Media">
              <View style={styles.emptyState}>
                <MaterialIcons name="info-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyText}>No play data yet</Text>
                <Text style={styles.emptySubtext}>
                  Plays are tracked when media is listened to for 30+ seconds. Start playing your media to see analytics here.
                </Text>
              </View>
            </ChartContainer>
          )}
        </>
      )}

      {/* Commerce Analytics Section */}
      {cartConversion && (
        <>
          <Text style={styles.sectionTitle}>Commerce Analytics</Text>
          <View style={styles.summaryGrid}>
            <AnalyticsCard
              title="Items Added to Cart"
              value={cartConversion.totalItemsAddedToCart || 0}
              icon="shopping-cart"
              color="#3b82f6"
            />
            <AnalyticsCard
              title="Items Purchased"
              value={cartConversion.totalItemsPurchased || 0}
              icon="shopping-bag"
              color="#10b981"
            />
            <AnalyticsCard
              title="Conversion Rate"
              value={Math.round(cartConversion.conversionRate || 0)}
              icon="percent"
              color="#f59e0b"
            />
            <AnalyticsCard
              title="Total Revenue"
              value={Math.round((cartConversion.totalRevenue || 0) / 100)}
              icon="attach-money"
              color="#8b5cf6"
            />
          </View>
        </>
      )}

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

  const renderGeographyTab = () => {
    const displayCountries = qrScanLocationData 
      ? qrScanLocationData.topCountries 
      : [];
    const displayCities = qrScanLocationData
      ? qrScanLocationData.topCities.map(c => ({
          key: `${c.city}|${c.region}|${c.country}`,
          label: `${c.city}${c.region ? ', ' + c.region : ''}${c.country ? ' • ' + c.country : ''}`,
          count: c.count,
        }))
      : [];

    return (
      <>
        {/* Top Countries */}
        {displayCountries.length > 0 && (
          <ChartContainer 
            title="Geographic Distribution" 
            subtitle="Locations of QR code scans"
          >
            <View style={styles.geoList}>
              {displayCountries.slice(0, 10).map((country, index) => (
                <View key={country.country || index} style={styles.geoItem}>
                  <View style={styles.geoRank}>
                    <Text style={styles.geoRankText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.geoCountry}>{country.location_name || country.country}</Text>
                  <Text style={styles.geoCount}>{country.count} scan{country.count !== 1 ? 's' : ''}</Text>
                </View>
              ))}
            </View>
          </ChartContainer>
        )}

        {/* Top Cities */}
        {displayCities.length > 0 && (
          <ChartContainer title="Top Cities by Scans">
            <View style={styles.geoList}>
              {displayCities.slice(0, 10).map((item, index) => (
                <View key={item.key || index} style={styles.geoItem}>
                  <View style={styles.geoRank}>
                    <Text style={styles.geoRankText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.geoCountry}>{item.label}</Text>
                  <Text style={styles.geoCount}>{item.count} scan{item.count !== 1 ? 's' : ''}</Text>
                </View>
              ))}
            </View>
          </ChartContainer>
        )}

        {/* Geographic Chart */}
        {displayCountries.length > 0 && (
          <ChartContainer title="Top Countries by Scans">
            <BarChart
              data={{
                labels: displayCountries.slice(0, 5).map(item => (item.country || item.location_name || '').substring(0, 3)),
                datasets: [{
                  data: displayCountries.slice(0, 5).map(item => item.count),
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

        {/* Empty State for Geography */}
        {displayCountries.length === 0 && displayCities.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name="public" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No location data available yet</Text>
            <Text style={styles.emptySubtext}>
              Location data from QR code scans will appear here once users start scanning your QR codes. Scans without location information will be shown as "Unknown".
            </Text>
          </View>
        )}
      </>
    );
  };

  const renderBehaviorTab = () => (
    <>
      {/* Media Play Statistics */}
      {mediaItemsStats.length > 0 && (
        <ChartContainer title="Media Play Statistics" subtitle="Total Plays and Unique Plays per media item">
          <View style={styles.mediaItemsList}>
            {mediaItemsStats.map((item) => (
              <View key={item.id} style={styles.mediaItemCard}>
                <View style={styles.mediaItemHeader}>
                  <MaterialIcons name="music-note" size={20} color="#3b82f6" />
                  <Text style={styles.mediaItemTitle} numberOfLines={1}>
                    {item.title || 'Untitled'}
                  </Text>
                </View>
                <View style={styles.mediaItemStats}>
                  <View style={styles.mediaItemStat}>
                    <Text style={styles.mediaItemStatLabel}>Total Plays</Text>
                    <Text style={styles.mediaItemStatValue}>{item.totalPlays}</Text>
                  </View>
                  <View style={styles.mediaItemStat}>
                    <Text style={styles.mediaItemStatLabel}>Unique Plays</Text>
                    <Text style={styles.mediaItemStatValue}>{item.uniquePlays}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ChartContainer>
      )}

      {/* Empty State for Media Items */}
      {mediaItemsStats.length === 0 && (
        <View style={styles.emptyState}>
          <MaterialIcons name="library-music" size={64} color="#d1d5db" />
          <Text style={styles.emptyText}>No media play data available yet</Text>
          <Text style={styles.emptySubtext}>
            Play statistics for your media items will appear here once users start playing them. Total Plays counts all plays, while Unique Plays counts plays longer than 30 seconds (one per user per media item).
          </Text>
        </View>
      )}

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
      {timePatternData.length > 0 && (
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
      )}
    </>
  );

  const renderDemographicsTab = () => (
    <>
      {/* Sub-tab Navigation */}
      <View style={styles.subTabContainer}>
        <TouchableOpacity
          style={[
            styles.subTab,
            demographicsSubTab === 'age' && styles.activeSubTab,
          ]}
          onPress={() => setDemographicsSubTab('age')}
        >
          <MaterialIcons 
            name="cake" 
            size={18} 
            color={demographicsSubTab === 'age' ? '#8b5cf6' : '#6b7280'} 
          />
          <Text style={[
            styles.subTabText,
            demographicsSubTab === 'age' && styles.activeSubTabText,
          ]}>
            Age
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.subTab,
            demographicsSubTab === 'gender' && styles.activeSubTab,
          ]}
          onPress={() => setDemographicsSubTab('gender')}
        >
          <MaterialIcons 
            name="wc" 
            size={18} 
            color={demographicsSubTab === 'gender' ? '#8b5cf6' : '#6b7280'} 
          />
          <Text style={[
            styles.subTabText,
            demographicsSubTab === 'gender' && styles.activeSubTabText,
          ]}>
            Gender
          </Text>
        </TouchableOpacity>
      </View>

      {/* Age Demographics */}
      {demographicsSubTab === 'age' && (
        <>
          {qrScanAgeData.length > 0 && (
            <ChartContainer 
              title="Age Distribution" 
              subtitle="Age ranges of QR code scan users"
            >
              <BarChart
                data={{
                  labels: qrScanAgeData.map(d => d.ageRange),
                  datasets: [{
                    data: qrScanAgeData.map(d => d.count),
                  }],
                }}
                width={screenWidth - 48}
                height={220}
                chartConfig={{
                  backgroundColor: '#fff',
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  style: {
                    borderRadius: 16,
                  },
                }}
                style={{
                  borderRadius: 16,
                }}
                yAxisLabel=""
                yAxisSuffix=""
                fromZero
              />
              
              {/* Age List */}
              <View style={styles.geoList}>
                {qrScanAgeData.map((age, index) => {
                  const total = qrScanAgeData.reduce((sum, item) => sum + item.count, 0);
                  const percentage = total > 0 ? Math.round((age.count / total) * 100) : 0;
                  
                  return (
                    <View key={index} style={styles.geoItem}>
                      <View style={styles.geoInfo}>
                        <MaterialIcons name="person" size={20} color="#8b5cf6" />
                        <Text style={styles.geoName}>{age.ageRange}</Text>
                      </View>
                      <View style={styles.geoStats}>
                        <Text style={styles.geoCount}>{age.count}</Text>
                        <Text style={styles.geoPercentage}>{percentage}%</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ChartContainer>
          )}
          
          {qrScanAgeData.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialIcons name="people-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No age data available yet</Text>
              <Text style={styles.emptySubtext}>
                Age demographics from QR code scans will appear here once users start scanning your QR codes and providing their age information. Scans without age information will be shown as "Unknown".
              </Text>
            </View>
          )}
        </>
      )}

      {/* Gender Demographics */}
      {demographicsSubTab === 'gender' && (
        <>
          {qrScanGenderData.length > 0 && (
            <ChartContainer 
              title="Gender Distribution" 
              subtitle="Gender identity of QR code scan users"
            >
              <BarChart
                data={{
                  labels: qrScanGenderData.map(d => d.gender),
                  datasets: [{
                    data: qrScanGenderData.map(d => d.count),
                  }],
                }}
                width={screenWidth - 48}
                height={220}
                chartConfig={{
                  backgroundColor: '#fff',
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(236, 72, 153, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  style: {
                    borderRadius: 16,
                  },
                }}
                style={{
                  borderRadius: 16,
                }}
                yAxisLabel=""
                yAxisSuffix=""
                fromZero
              />
              
              {/* Gender List */}
              <View style={styles.geoList}>
                {qrScanGenderData.map((gender, index) => {
                  const total = qrScanGenderData.reduce((sum, item) => sum + item.count, 0);
                  const percentage = total > 0 ? Math.round((gender.count / total) * 100) : 0;
                  
                  // Select icon based on gender
                  let iconName = 'person';
                  if (gender.gender === 'Male') iconName = 'male';
                  else if (gender.gender === 'Female') iconName = 'female';
                  else if (gender.gender === 'Non-binary') iconName = 'transgender';
                  else if (gender.gender === 'Prefer not to say') iconName = 'help-outline';
                  else if (gender.gender === 'Open-ended') iconName = 'more-horiz';
                  
                  return (
                    <View key={index} style={styles.geoItem}>
                      <View style={styles.geoInfo}>
                        <MaterialIcons name={iconName as any} size={20} color="#ec4899" />
                        <Text style={styles.geoName}>{gender.gender}</Text>
                      </View>
                      <View style={styles.geoStats}>
                        <Text style={styles.geoCount}>{gender.count}</Text>
                        <Text style={styles.geoPercentage}>{percentage}%</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ChartContainer>
          )}
          
          {qrScanGenderData.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialIcons name="wc" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>No gender data available yet</Text>
              <Text style={styles.emptySubtext}>
                Gender demographics from QR code scans will appear here once users start scanning your QR codes and providing their gender identity. Scans without gender information will be shown as "Unknown".
              </Text>
            </View>
          )}
        </>
      )}
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
      <HeaderWithLogo
        title="Analytics"
        onRightButtonPress={onRefresh}
        rightButtonIcon="refresh"
        rightButtonColor="#3b82f6"
      />

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
          { key: 'demographics', label: 'Demographics', icon: 'people' },
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
        {activeTab === 'demographics' && renderDemographicsTab()}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 8,
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  selectedListItem: {
    backgroundColor: '#eff6ff',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  listItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
  },
  listItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  listItemValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginBottom: 16,
    gap: 6,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  mediaStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    gap: 16,
  },
  mediaStatItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 16,
  },
  mediaStatLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  mediaStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
  },
  subTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  subTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    gap: 6,
  },
  activeSubTab: {
    backgroundColor: '#f3e8ff',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  subTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeSubTabText: {
    color: '#8b5cf6',
  },
  toggleContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  toggleButtons: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 2,
    gap: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#3b82f6',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  mediaItemsList: {
    marginTop: 8,
  },
  mediaItemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  mediaItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  mediaItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
    flex: 1,
  },
  mediaItemStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  mediaItemStat: {
    alignItems: 'center',
  },
  mediaItemStatLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  mediaItemStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
});
