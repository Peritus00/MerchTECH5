import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useUpload } from '@/contexts/UploadContext';
import * as Progress from 'react-native-progress';

const { width } = Dimensions.get('window');

export const UploadNotificationCenter: React.FC = () => {
  const {
    isUploading,
    uploadProgress,
    uploadError,
    notifications,
    currentFileName,
    estimatedTimeRemaining,
    removeNotification,
    clearNotifications,
  } = useUpload();

  const [slideAnim] = useState(new Animated.Value(-100));
  const [showNotifications, setShowNotifications] = useState(false);

  // Show/hide upload progress indicator
  useEffect(() => {
    if (isUploading) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isUploading, slideAnim]);

  // Auto-show notifications when there are new ones
  useEffect(() => {
    if (notifications.length > 0) {
      setShowNotifications(true);
    }
  }, [notifications]);

  const getStageMessage = () => {
    switch (uploadProgress.stage) {
      case 'selecting':
        return 'Selecting file...';
      case 'reading':
        return 'Preparing file...';
      case 'uploading':
        return `Uploading${currentFileName ? ` ${currentFileName}` : ''}...`;
      case 'verifying':
        return 'Upload complete. Verifying file...';
      case 'pending_scan':
        return 'Uploaded, awaiting security scan...';
      case 'creating':
        return 'Saving media record...';
      case 'complete':
        return 'Upload complete!';
      case 'error':
        return 'Upload failed';
      default:
        return 'Processing...';
    }
  };

  const getStageIcon = () => {
    switch (uploadProgress.stage) {
      case 'selecting':
        return <MaterialIcons name="folder-open" size={20} color="#3b82f6" />;
      case 'reading':
        return <MaterialIcons name="description" size={20} color="#3b82f6" />;
      case 'uploading':
        return <MaterialCommunityIcons name="cloud-upload" size={20} color="#3b82f6" />;
      case 'verifying':
        return <MaterialIcons name="verified" size={20} color="#3b82f6" />;
      case 'pending_scan':
        return <MaterialCommunityIcons name="shield-search" size={20} color="#f59e0b" />;
      case 'creating':
        return <MaterialIcons name="settings" size={20} color="#3b82f6" />;
      case 'complete':
        return <MaterialIcons name="check-circle" size={20} color="#10b981" />;
      case 'error':
        return <MaterialIcons name="error" size={20} color="#ef4444" />;
      default:
        return <ActivityIndicator size="small" color="#3b82f6" />;
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <MaterialIcons name="check-circle" size={24} color="#10b981" />;
      case 'error':
        return <MaterialIcons name="error" size={24} color="#ef4444" />;
      case 'warning':
        return <MaterialIcons name="warning" size={24} color="#f59e0b" />;
      case 'info':
        return <MaterialIcons name="info" size={24} color="#3b82f6" />;
      default:
        return <MaterialIcons name="notifications" size={24} color="#6b7280" />;
    }
  };

  const getNotificationColors = (type: string) => {
    switch (type) {
      case 'success':
        return { bg: '#f0fdf4', border: '#10b981' };
      case 'error':
        return { bg: '#fef2f2', border: '#ef4444' };
      case 'warning':
        return { bg: '#fffbeb', border: '#f59e0b' };
      case 'info':
        return { bg: '#eff6ff', border: '#3b82f6' };
      default:
        return { bg: '#f9fafb', border: '#6b7280' };
    }
  };

  const renderUploadProgress = () => {
    if (!isUploading) return null;

    return (
      <Animated.View
        style={[
          styles.progressContainer,
          {
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.progressHeader}>
          <View style={styles.progressInfo}>
            {getStageIcon()}
            <Text style={styles.progressTitle}>{getStageMessage()}</Text>
          </View>
          {uploadProgress.stage === 'uploading' && (
            <Text style={styles.progressPercentage}>{uploadProgress.percentage}%</Text>
          )}
        </View>

        {(uploadProgress.stage === 'uploading' ||
          uploadProgress.stage === 'verifying' ||
          uploadProgress.stage === 'pending_scan' ||
          uploadProgress.stage === 'creating') && (
          <View style={styles.progressDetails}>
            <Progress.Bar
              progress={uploadProgress.percentage / 100}
              width={width - 80}
              height={4}
              color="#3b82f6"
              unfilledColor="#e5e7eb"
              borderWidth={0}
              borderRadius={2}
            />
            <View style={styles.progressMeta}>
              <Text style={styles.progressText}>
                {uploadProgress.loaded > 0 && uploadProgress.total > 0
                  ? `${(uploadProgress.loaded / 1024 / 1024).toFixed(1)}MB / ${(uploadProgress.total / 1024 / 1024).toFixed(1)}MB`
                  : 'Calculating...'}
              </Text>
              {uploadProgress.stage === 'uploading' && estimatedTimeRemaining && (
                <Text style={styles.progressText}>
                  {formatTime(estimatedTimeRemaining)} remaining
                </Text>
              )}
            </View>
          </View>
        )}

        {uploadProgress.stage === 'error' && uploadError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{uploadError.message}</Text>
          </View>
        )}
      </Animated.View>
    );
  };

  const renderNotifications = () => {
    if (notifications.length === 0) return null;

    return (
      <Modal
        visible={showNotifications}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotifications(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.notificationsContainer}>
            <View style={styles.notificationsHeader}>
              <Text style={styles.notificationsTitle}>Upload Notifications</Text>
              <View style={styles.notificationsActions}>
                <TouchableOpacity
                  onPress={clearNotifications}
                  style={styles.clearButton}
                >
                  <MaterialIcons name="clear-all" size={20} color="#6b7280" />
                  <Text style={styles.clearButtonText}>Clear All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowNotifications(false)}
                  style={styles.closeButton}
                >
                  <MaterialIcons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.notificationsList}>
              {notifications.map((notification) => {
                const colors = getNotificationColors(notification.type);
                return (
                  <View
                    key={notification.id}
                    style={[
                      styles.notificationCard,
                      {
                        backgroundColor: colors.bg,
                        borderLeftColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.notificationHeader}>
                      {getNotificationIcon(notification.type)}
                      <View style={styles.notificationContent}>
                        <Text style={styles.notificationTitle}>
                          {notification.title}
                        </Text>
                        <Text style={styles.notificationMessage}>
                          {notification.message}
                        </Text>
                        <Text style={styles.notificationTime}>
                          {notification.timestamp.toLocaleTimeString()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => removeNotification(notification.id)}
                        style={styles.dismissButton}
                      >
                        <MaterialIcons name="close" size={18} color="#6b7280" />
                      </TouchableOpacity>
                    </View>

                    {notification.actions && notification.actions.length > 0 && (
                      <View style={styles.notificationActions}>
                        {notification.actions.map((action, index) => (
                          <TouchableOpacity
                            key={index}
                            onPress={action.onPress}
                            style={[
                              styles.actionButton,
                              action.style === 'primary' && styles.primaryActionButton,
                              action.style === 'danger' && styles.dangerActionButton,
                            ]}
                          >
                            <Text
                              style={[
                                styles.actionButtonText,
                                action.style === 'primary' && styles.primaryActionButtonText,
                                action.style === 'danger' && styles.dangerActionButtonText,
                              ]}
                            >
                              {action.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <>
      {renderUploadProgress()}
      {renderNotifications()}
    </>
  );
};

const styles = StyleSheet.create({
  progressContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    right: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
  progressDetails: {
    gap: 8,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: '#6b7280',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  notificationsContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingTop: 20,
  },
  notificationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  notificationsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  notificationsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  closeButton: {
    padding: 4,
  },
  notificationsList: {
    padding: 20,
    gap: 12,
  },
  notificationCard: {
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  dismissButton: {
    padding: 4,
  },
  notificationActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingLeft: 36,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  primaryActionButton: {
    backgroundColor: '#3b82f6',
  },
  dangerActionButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  primaryActionButtonText: {
    color: '#ffffff',
  },
  dangerActionButtonText: {
    color: '#ffffff',
  },
});

export default UploadNotificationCenter; 