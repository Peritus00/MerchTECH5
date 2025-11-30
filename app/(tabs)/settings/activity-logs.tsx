import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Text,
  Modal
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { activityLogsAPI } from '@/services/api';
import { ActivityLog, ActivityLogFilters, ActivityLogStats } from '@/types';

const ActivityLogsScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<ActivityLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState<ActivityLogFilters>({
    page: 1,
    limit: 50
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  const loadLogs = async () => {
    try {
      setLoading(true);
      const activeFilters: ActivityLogFilters = {
        ...filters,
        search: searchQuery || undefined,
        actionType: actionTypeFilter || undefined,
        resourceType: resourceTypeFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };
      
      const response = await activityLogsAPI.getLogs(activeFilters);
      setLogs(response.logs || []);
      setPagination(response.pagination || pagination);
    } catch (error: any) {
      console.error('Error loading activity logs:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to load activity logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await activityLogsAPI.getStats(
        startDate || undefined,
        endDate || undefined
      );
      setStats(statsData);
    } catch (error: any) {
      console.error('Error loading stats:', error);
    }
  };

  useEffect(() => {
    loadLogs();
    loadStats();
  }, [filters.page]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadLogs();
    loadStats();
  };

  const handleSearch = () => {
    setFilters({ ...filters, page: 1 });
    loadLogs();
  };

  const handleApplyFilters = () => {
    setFilters({ ...filters, page: 1 });
    setShowFilters(false);
    loadLogs();
    loadStats();
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setActionTypeFilter('');
    setResourceTypeFilter('');
    setStartDate('');
    setEndDate('');
    setFilters({ page: 1, limit: 50 });
    loadLogs();
    loadStats();
  };

  const getStatusColor = (statusCode: number) => {
    if (statusCode >= 500) return '#ef4444';
    if (statusCode >= 400) return '#f59e0b';
    if (statusCode >= 300) return '#3b82f6';
    return '#10b981';
  };

  const getStatusText = (statusCode: number) => {
    if (statusCode >= 500) return 'Error';
    if (statusCode >= 400) return 'Failed';
    if (statusCode >= 300) return 'Redirect';
    return 'Success';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const handleLogPress = (log: ActivityLog) => {
    setSelectedLog(log);
    setShowDetailsModal(true);
  };

  const actionTypes = [
    'LOGIN', 'REGISTER', 'CREATE_PRODUCT', 'UPDATE_PRODUCT', 'DELETE_PRODUCT',
    'CREATE_QR_CODE', 'UPDATE_QR_CODE', 'DELETE_QR_CODE',
    'CREATE_PLAYLIST', 'UPDATE_PLAYLIST', 'DELETE_PLAYLIST',
    'UPLOAD_MEDIA', 'DELETE_MEDIA', 'CREATE_SLIDESHOW', 'UPDATE_SLIDESHOW',
    'CREATE_ACTIVATION_CODE', 'UPDATE_ACTIVATION_CODE', 'DELETE_ACTIVATION_CODE'
  ];

  const resourceTypes = ['product', 'qr_code', 'playlist', 'media', 'slideshow', 'activation_code', 'user', 'auth'];

  if (loading && logs.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#3b82f6" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Activity Logs</ThemedText>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <ThemedText style={styles.loadingText}>Loading activity logs...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity 
          onPress={() => router.push('/(tabs)/settings')} 
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#3b82f6" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Activity Logs</ThemedText>
        <TouchableOpacity
          onPress={() => setShowFilters(!showFilters)}
          style={styles.filterButton}
        >
          <MaterialIcons name="filter-list" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Stats Summary */}
      {stats && (
        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <ThemedText style={styles.statValue}>{stats.summary.totalActions}</ThemedText>
              <ThemedText style={styles.statLabel}>Total Actions</ThemedText>
            </View>
            <View style={styles.statCard}>
              <ThemedText style={styles.statValue}>{stats.summary.uniqueUsers}</ThemedText>
              <ThemedText style={styles.statLabel}>Unique Users</ThemedText>
            </View>
            <View style={styles.statCard}>
              <ThemedText style={[styles.statValue, { color: '#ef4444' }]}>
                {stats.summary.errorCount}
              </ThemedText>
              <ThemedText style={styles.statLabel}>Errors</ThemedText>
            </View>
          </View>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search logs..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity onPress={handleSearch} style={styles.searchButton}>
          <MaterialIcons name="search" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      {showFilters && (
        <View style={styles.filtersContainer}>
          <ThemedText style={styles.filtersTitle}>Filters</ThemedText>
          
          <View style={styles.filterRow}>
            <ThemedText style={styles.filterLabel}>Action Type:</ThemedText>
            <ScrollView horizontal style={styles.filterScroll}>
              <TouchableOpacity
                style={[styles.filterChip, !actionTypeFilter && styles.filterChipActive]}
                onPress={() => setActionTypeFilter('')}
              >
                <ThemedText>All</ThemedText>
              </TouchableOpacity>
              {actionTypes.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.filterChip, actionTypeFilter === type && styles.filterChipActive]}
                  onPress={() => setActionTypeFilter(type)}
                >
                  <ThemedText>{type}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.filterRow}>
            <ThemedText style={styles.filterLabel}>Resource Type:</ThemedText>
            <ScrollView horizontal style={styles.filterScroll}>
              <TouchableOpacity
                style={[styles.filterChip, !resourceTypeFilter && styles.filterChipActive]}
                onPress={() => setResourceTypeFilter('')}
              >
                <ThemedText>All</ThemedText>
              </TouchableOpacity>
              {resourceTypes.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.filterChip, resourceTypeFilter === type && styles.filterChipActive]}
                  onPress={() => setResourceTypeFilter(type)}
                >
                  <ThemedText>{type}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.filterActions}>
            <TouchableOpacity onPress={handleClearFilters} style={styles.clearButton}>
              <ThemedText style={styles.clearButtonText}>Clear All</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleApplyFilters} style={styles.applyButton}>
              <ThemedText style={styles.applyButtonText}>Apply Filters</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Logs List */}
      <ScrollView
        style={styles.logsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {logs.map(log => (
          <TouchableOpacity
            key={log.id}
            style={styles.logCard}
            onPress={() => handleLogPress(log)}
          >
            <View style={styles.logHeader}>
              <View style={styles.logInfo}>
                <ThemedText style={styles.logAction}>{log.actionType}</ThemedText>
                <ThemedText style={styles.logUser}>
                  {log.userEmail || log.username || 'Anonymous'}
                </ThemedText>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(log.statusCode) }]}>
                <ThemedText style={styles.statusText}>{getStatusText(log.statusCode)}</ThemedText>
              </View>
            </View>
            
            <View style={styles.logDetails}>
              <ThemedText style={styles.logEndpoint}>{log.endpoint}</ThemedText>
              <ThemedText style={styles.logDate}>{formatDate(log.createdAt)}</ThemedText>
              {log.resourceType && (
                <ThemedText style={styles.logResource}>
                  {log.resourceType} #{log.resourceId}
                </ThemedText>
              )}
            </View>

            {log.errorMessage && (
              <View style={styles.errorContainer}>
                <ThemedText style={styles.errorText}>{log.errorMessage}</ThemedText>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {logs.length === 0 && !loading && (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="description" size={64} color="#9ca3af" />
            <ThemedText style={styles.emptyText}>No activity logs found</ThemedText>
          </View>
        )}
      </ScrollView>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <View style={styles.pagination}>
          <TouchableOpacity
            onPress={() => setFilters({ ...filters, page: Math.max(1, filters.page! - 1) })}
            disabled={filters.page === 1}
            style={[styles.pageButton, filters.page === 1 && styles.pageButtonDisabled]}
          >
            <MaterialIcons name="chevron-left" size={24} color={filters.page === 1 ? "#9ca3af" : "#3b82f6"} />
          </TouchableOpacity>
          <ThemedText style={styles.pageInfo}>
            Page {pagination.page} of {pagination.totalPages}
          </ThemedText>
          <TouchableOpacity
            onPress={() => setFilters({ ...filters, page: Math.min(pagination.totalPages, filters.page! + 1) })}
            disabled={filters.page === pagination.totalPages}
            style={[styles.pageButton, filters.page === pagination.totalPages && styles.pageButtonDisabled]}
          >
            <MaterialIcons name="chevron-right" size={24} color={filters.page === pagination.totalPages ? "#9ca3af" : "#3b82f6"} />
          </TouchableOpacity>
        </View>
      )}

      {/* Details Modal */}
      <Modal
        visible={showDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Log Details</ThemedText>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                <MaterialIcons name="close" size={24} color="#3b82f6" />
              </TouchableOpacity>
            </View>

            {selectedLog && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Action:</ThemedText>
                  <ThemedText style={styles.detailValue}>{selectedLog.actionType}</ThemedText>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>User:</ThemedText>
                  <ThemedText style={styles.detailValue}>
                    {selectedLog.userEmail || selectedLog.username || 'Anonymous'}
                  </ThemedText>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Endpoint:</ThemedText>
                  <ThemedText style={styles.detailValue}>{selectedLog.endpoint}</ThemedText>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Method:</ThemedText>
                  <ThemedText style={styles.detailValue}>{selectedLog.requestMethod}</ThemedText>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Status:</ThemedText>
                  <ThemedText style={[styles.detailValue, { color: getStatusColor(selectedLog.statusCode) }]}>
                    {selectedLog.statusCode} - {getStatusText(selectedLog.statusCode)}
                  </ThemedText>
                </View>
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Timestamp:</ThemedText>
                  <ThemedText style={styles.detailValue}>{formatDate(selectedLog.createdAt)}</ThemedText>
                </View>
                {selectedLog.resourceType && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>Resource:</ThemedText>
                    <ThemedText style={styles.detailValue}>
                      {selectedLog.resourceType} #{selectedLog.resourceId}
                    </ThemedText>
                  </View>
                )}
                {selectedLog.ipAddress && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>IP Address:</ThemedText>
                    <ThemedText style={styles.detailValue}>{selectedLog.ipAddress}</ThemedText>
                  </View>
                )}
                {selectedLog.userAgent && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>User Agent:</ThemedText>
                    <ThemedText style={styles.detailValue}>{selectedLog.userAgent}</ThemedText>
                  </View>
                )}
                {selectedLog.errorMessage && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>Error:</ThemedText>
                    <ThemedText style={[styles.detailValue, { color: '#ef4444' }]}>
                      {selectedLog.errorMessage}
                    </ThemedText>
                  </View>
                )}
                {selectedLog.metadata && (
                  <View style={styles.detailRow}>
                    <ThemedText style={styles.detailLabel}>Metadata:</ThemedText>
                    <ThemedText style={styles.detailValue}>
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </ThemedText>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  filterButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#9ca3af',
  },
  statsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statCard: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  statLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    color: '#000',
  },
  searchButton: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  filtersContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filtersTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  filterRow: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  filterScroll: {
    maxHeight: 100,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  filterActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  clearButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#6b7280',
  },
  applyButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  logsList: {
    flex: 1,
  },
  logCard: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  logInfo: {
    flex: 1,
  },
  logAction: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  logUser: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  logDetails: {
    marginTop: 8,
  },
  logEndpoint: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  logDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  logResource: {
    fontSize: 12,
    color: '#3b82f6',
    marginTop: 4,
  },
  errorContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 4,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    color: '#9ca3af',
    fontSize: 16,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  pageButton: {
    padding: 8,
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageInfo: {
    fontSize: 14,
    color: '#6b7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 16,
  },
  detailRow: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 4,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: '#000',
  },
});

export default ActivityLogsScreen;

