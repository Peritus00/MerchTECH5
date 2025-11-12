import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, ScrollView, View, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { logStorage, type LogEntry } from '@/utils/debugLogger';

export default function DebugLogsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'log' | 'warn' | 'error' | 'info'>('all');
  const scrollViewRef = useRef<ScrollView>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const isAdmin = user && (user.email === 'djjetfuel@gmail.com' || user.username === 'djjetfuel');

  useEffect(() => {
    // Update logs every second
    const interval = setInterval(() => {
      setLogs([...logStorage]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    const matchesFilter = !filter || log.message.toLowerCase().includes(filter.toLowerCase());
    const matchesLevel = filterLevel === 'all' || log.level === filterLevel;
    return matchesFilter && matchesLevel;
  });

  const clearLogs = () => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to clear all logs?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            logStorage.length = 0;
            setLogs([]);
          },
        },
      ]
    );
  };

  const copyLogs = async () => {
    const logText = filteredLogs
      .map(log => {
        const time = log.timestamp.toLocaleTimeString();
        const level = log.level.toUpperCase().padEnd(5);
        return `[${time}] ${level} ${log.message}`;
      })
      .join('\n');

    await Clipboard.setStringAsync(logText);
    Alert.alert('Copied', 'Logs copied to clipboard');
  };

  const exportLogs = () => {
    const logText = filteredLogs
      .map(log => {
        const time = log.timestamp.toISOString();
        const level = log.level.toUpperCase();
        return `[${time}] ${level}: ${log.message}${log.data ? '\n' + JSON.stringify(log.data, null, 2) : ''}`;
      })
      .join('\n\n');

    Alert.alert(
      'Export Logs',
      `Total logs: ${filteredLogs.length}\n\nCopy to clipboard?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Copy',
          onPress: async () => {
            await Clipboard.setStringAsync(logText);
            Alert.alert('Copied', 'Logs copied to clipboard');
          },
        },
      ]
    );
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return '#ef4444';
      case 'warn': return '#f59e0b';
      case 'info': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getLevelIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return 'error';
      case 'warn': return 'warning';
      case 'info': return 'info';
      default: return 'circle';
    }
  };

  if (!isAdmin) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>Access Denied</ThemedText>
        <ThemedText>This screen is only available to administrators.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#2563eb" />
            <ThemedText style={styles.backButtonText}>Back</ThemedText>
          </TouchableOpacity>
        </View>
        <View style={styles.headerBottom}>
          <ThemedText type="title" style={styles.title}>Debug Logs</ThemedText>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={clearLogs} style={styles.iconButton}>
              <MaterialIcons name="delete-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
            <TouchableOpacity onPress={copyLogs} style={styles.iconButton}>
              <MaterialIcons name="content-copy" size={24} color="#3b82f6" />
            </TouchableOpacity>
            <TouchableOpacity onPress={exportLogs} style={styles.iconButton}>
              <MaterialIcons name="download" size={24} color="#10b981" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search logs..."
          placeholderTextColor="#9ca3af"
          value={filter}
          onChangeText={setFilter}
        />
        <View style={styles.levelFilters}>
          {(['all', 'error', 'warn', 'info', 'log'] as const).map(level => (
            <TouchableOpacity
              key={level}
              style={[
                styles.levelButton,
                filterLevel === level && styles.levelButtonActive,
              ]}
              onPress={() => setFilterLevel(level)}
            >
              <ThemedText
                style={[
                  styles.levelButtonText,
                  filterLevel === level && styles.levelButtonTextActive,
                ]}
              >
                {level.toUpperCase()}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.toggleButton, autoScroll && styles.toggleButtonActive]}
          onPress={() => setAutoScroll(!autoScroll)}
        >
          <MaterialIcons
            name={autoScroll ? 'pause' : 'play-arrow'}
            size={16}
            color={autoScroll ? '#10b981' : '#6b7280'}
          />
          <ThemedText style={styles.toggleButtonText}>
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Logs */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.logsContainer}
        contentContainerStyle={styles.logsContent}
      >
        {filteredLogs.length === 0 ? (
          <ThemedText style={styles.emptyText}>No logs found</ThemedText>
        ) : (
          filteredLogs.map(log => (
            <View key={log.id} style={styles.logEntry}>
              <View style={styles.logHeader}>
                <MaterialIcons
                  name={getLevelIcon(log.level)}
                  size={16}
                  color={getLevelColor(log.level)}
                />
                <ThemedText style={styles.logTime}>
                  {log.timestamp.toLocaleTimeString()}
                </ThemedText>
                <ThemedText
                  style={[styles.logLevel, { color: getLevelColor(log.level) }]}
                >
                  {log.level.toUpperCase()}
                </ThemedText>
              </View>
              <ThemedText style={styles.logMessage}>{log.message}</ThemedText>
              {log.data && log.data.length > 0 && (
                <View style={styles.logData}>
                  <ThemedText style={styles.logDataText}>
                    {JSON.stringify(log.data, null, 2)}
                  </ThemedText>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Footer Stats */}
      <View style={styles.footer}>
        <ThemedText style={styles.footerText}>
          {filteredLogs.length} / {logs.length} logs
          {filter && ` (filtered)`}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  headerTop: {
    marginBottom: 12,
  },
  headerBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  backButtonText: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    padding: 8,
  },
  filters: {
    marginBottom: 16,
    gap: 12,
  },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  levelFilters: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  levelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  levelButtonActive: {
    backgroundColor: '#3b82f6',
  },
  levelButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  levelButtonTextActive: {
    color: '#ffffff',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
  },
  toggleButtonActive: {
    backgroundColor: '#d1fae5',
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  logsContainer: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 8,
  },
  logsContent: {
    paddingBottom: 16,
  },
  logEntry: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#e5e7eb',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  logTime: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  logLevel: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  logMessage: {
    fontSize: 13,
    color: '#1f2937',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 18,
  },
  logData: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
  },
  logDataText: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 40,
    fontSize: 16,
  },
  footer: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 8,
  },
});

