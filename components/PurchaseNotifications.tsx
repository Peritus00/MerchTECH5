import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Share,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNotifications } from '@/contexts/NotificationContext';
import { activationCodesAPI } from '@/services/api';
import * as Linking from 'expo-linking';

interface PurchaseNotificationCardProps {
  notification: any;
  onShareCode: (notification: any) => void;
}

const PurchaseNotificationCard: React.FC<PurchaseNotificationCardProps> = ({ 
  notification, 
  onShareCode 
}) => {
  return (
    <View style={[
      styles.notificationCard,
      notification.activationCodeShared && styles.completedCard
    ]}>
      <View style={styles.cardHeader}>
        <View style={styles.customerInfo}>
          <MaterialIcons 
            name="shopping-cart" 
            size={24} 
            color={notification.activationCodeShared ? "#4CAF50" : "#007AFF"} 
          />
          <View style={styles.customerDetails}>
            <Text style={styles.customerEmail}>
              {notification.customerEmail || 'Customer'}
            </Text>
            <Text style={styles.purchaseAmount}>
              ${(notification.total / 100).toFixed(2)}
            </Text>
            {notification.customerPhone && (
              <Text style={styles.customerPhone}>📱 {notification.customerPhone}</Text>
            )}
          </View>
        </View>
        
        {notification.activationCodeShared ? (
          <View style={styles.sharedBadge}>
            <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.sharedText}>Code Shared</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => onShareCode(notification)}
          >
            <MaterialIcons name="share" size={20} color="#fff" />
            <Text style={styles.shareButtonText}>Share Code</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Text Code Button */}
      {!notification.activationCodeShared && notification.customerPhone && (
        <TouchableOpacity
          style={styles.textButton}
          onPress={() => {
            const sms = `sms:${notification.customerPhone}`;
            Linking.openURL(sms);
          }}
        >
          <MaterialIcons name="sms" size={20} color="#fff" />
          <Text style={styles.textButtonText}>Text Code</Text>
        </TouchableOpacity>
      )}

      <View style={styles.productsSection}>
        <Text style={styles.productsTitle}>Items purchased:</Text>
        {notification.products.map((product: any, index: number) => (
          <Text key={index} style={styles.productItem}>
            • {product.name} (${(product.price / 100).toFixed(2)} x {product.quantity})
          </Text>
        ))}
      </View>

      <Text style={styles.timestamp}>
        {new Date(notification.timestamp).toLocaleDateString()} at{' '}
        {new Date(notification.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );
};

const PurchaseNotifications: React.FC = () => {
  console.log('🔔 PURCHASE NOTIFICATIONS COMPONENT: Component rendering');
  
  const { notifications, markActivationCodeShared, clearNotifications, addNotification } = useNotifications();
  console.log('🔔 PURCHASE NOTIFICATIONS COMPONENT: Notifications from context:', notifications);
  console.log('🔔 PURCHASE NOTIFICATIONS COMPONENT: Notifications count:', notifications?.length || 0);
  
  const [showModal, setShowModal] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const [availableCodes, setAvailableCodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  console.log('🔔 PURCHASE NOTIFICATIONS COMPONENT: Component state initialized');

  const addTestNotification = () => {
    const testNotification = {
      id: `test-${Date.now()}`,
      customerId: 'test-customer',
      customerEmail: 'customer@example.com',
      customerName: 'Test Customer',
      products: [
        {
          id: '1',
          name: 'Premium Playlist Access',
          price: 999, // $9.99 in cents
          quantity: 1,
        },
        {
          id: '2',
          name: 'Exclusive Track Bundle',
          price: 499, // $4.99 in cents
          quantity: 2,
        }
      ],
      total: 1997, // $19.97 in cents
      timestamp: new Date().toISOString(),
      activationCodeShared: false,
    };
    
    addNotification(testNotification);
  };

  const handleShareCode = async (notification: any) => {
    setSelectedNotification(notification);
    setIsLoading(true);
    
    try {
      // Load available activation codes
      const codes = await activationCodesAPI.getGenerated();
      setAvailableCodes(codes.filter(code => code.is_active && code.uses_count < (code.max_uses || Infinity)));
      setShowModal(true);
    } catch (error) {
      console.error('Error loading activation codes:', error);
      Alert.alert('Error', 'Failed to load activation codes');
    } finally {
      setIsLoading(false);
    }
  };

  const shareCodeWithCustomer = async (code: any) => {
    if (!selectedNotification) return;

    const message = `🎵 Thank you for your purchase!\n\nHere's your exclusive activation code: ${code.code}\n\nUse this code to access: ${code.content_type === 'playlist' ? code.playlist_name : code.slideshow_name}\n\nEnjoy your content!`;

    try {
      const result = await Share.share({
        message: message,
        title: 'Your Activation Code',
      });

      if (result.action === Share.sharedAction) {
        // Mark as shared
        markActivationCodeShared(selectedNotification.id);
        Alert.alert('Success!', 'Activation code shared with customer');
        setShowModal(false);
      }
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert('Error', 'Failed to share activation code');
    }
  };

  if (notifications.length === 0) {
    return (
      <View style={styles.emptyState}>
        <MaterialIcons name="notifications-none" size={48} color="#ccc" />
        <Text style={styles.emptyText}>No purchase notifications</Text>
        <Text style={styles.emptySubtext}>
          When customers make purchases, you'll see them here and can share activation codes
        </Text>
        
        {/* Test Buttons for Demo */}
        <TouchableOpacity
          style={styles.testButton}
          onPress={addTestNotification}
        >
          <MaterialIcons name="add-shopping-cart" size={20} color="#fff" />
          <Text style={styles.testButtonText}>Add Test Purchase (Demo)</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.testPushButton}
          onPress={async () => {
            try {
              const pushService = await import('@/services/pushNotificationService');
              const success = await pushService.default.sendTestNotification();
              if (success) {
                Alert.alert('📱 Test Notification Sent!', 'Check your device for the test notification.');
              } else {
                Alert.alert('❌ Failed to Send', 'Test notification failed. Make sure notifications are enabled in settings.');
              }
            } catch (error) {
              console.error('Error sending test push notification:', error);
              Alert.alert('❌ Error', 'Failed to send test notification.');
            }
          }}
        >
          <MaterialIcons name="notifications" size={20} color="#fff" />
          <Text style={styles.testButtonText}>Send Test Push Notification</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Purchase Notifications</Text>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={() => {
            Alert.alert(
              'Clear Notifications',
              'Are you sure you want to clear all notifications?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: clearNotifications }
              ]
            );
          }}
        >
          <MaterialIcons name="clear-all" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {notifications.map((notification) => (
          <PurchaseNotificationCard
            key={notification.id}
            notification={notification}
            onShareCode={handleShareCode}
          />
        ))}
      </ScrollView>

      {/* Share Code Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Share Activation Code</Text>
            
            {selectedNotification && (
              <View style={styles.customerSection}>
                <Text style={styles.modalLabel}>Customer:</Text>
                <Text style={styles.customerText}>
                  {selectedNotification.customerEmail || 'Unknown Customer'}
                </Text>
                <Text style={styles.modalLabel}>Purchase Total:</Text>
                <Text style={styles.totalText}>
                  ${(selectedNotification.total / 100).toFixed(2)}
                </Text>
              </View>
            )}

            <Text style={styles.modalLabel}>Select an activation code to share:</Text>
            <ScrollView style={styles.codesSelector}>
              {availableCodes.length === 0 ? (
                <Text style={styles.noCodesText}>
                  No active codes available. Create some activation codes first.
                </Text>
              ) : (
                availableCodes.map((code) => (
                  <TouchableOpacity
                    key={code.id}
                    style={styles.codeOption}
                    onPress={() => shareCodeWithCustomer(code)}
                  >
                    <View style={styles.codeInfo}>
                      <Text style={styles.codeText}>{code.code}</Text>
                      <Text style={styles.codeContentText}>
                        {code.content_type === 'playlist' ? code.playlist_name : code.slideshow_name}
                      </Text>
                      <Text style={styles.codeUsageText}>
                        Uses: {code.uses_count}{code.max_uses ? `/${code.max_uses}` : ' (unlimited)'}
                      </Text>
                    </View>
                    <MaterialIcons name="share" size={20} color="#007AFF" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  clearButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  completedCard: {
    backgroundColor: '#f8fff8',
    borderColor: '#4CAF50',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerDetails: {
    marginLeft: 12,
  },
  customerEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  purchaseAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  customerPhone: {
    fontSize: 14,
    color: '#999',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  sharedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  sharedText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  productsSection: {
    marginBottom: 12,
  },
  productsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  productItem: {
    fontSize: 14,
    color: '#333',
    marginBottom: 2,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 16,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  testPushButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    maxWidth: '90%',
    maxHeight: '80%',
    minWidth: 300,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  customerSection: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  customerText: {
    fontSize: 16,
    color: '#007AFF',
    marginBottom: 8,
  },
  totalText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  codesSelector: {
    maxHeight: 300,
    marginBottom: 20,
  },
  noCodesText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    padding: 20,
  },
  codeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  codeInfo: {
    flex: 1,
  },
  codeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'monospace',
  },
  codeContentText: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  codeUsageText: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  closeButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  textButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
});

export default PurchaseNotifications; 