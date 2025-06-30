import React, { useState } from 'react';
import { 
  View, 
  TouchableOpacity, 
  Alert, 
  Platform, 
  StyleSheet,
  ActionSheetIOS,
  Linking,
  Modal
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

// Conditional import for react-native-share to avoid web compatibility issues
let Share: any = null;
try {
  if (Platform.OS !== 'web') {
    Share = require('react-native-share').default;
  }
} catch (error) {
  console.log('react-native-share not available:', error);
}

interface ShareButtonProps {
  url: string;
  title: string;
  description?: string;
  type?: 'store' | 'product' | 'general';
  style?: any;
  compact?: boolean;
}

export default function ShareButton({ 
  url, 
  title, 
  description, 
  type = 'general',
  style,
  compact = false 
}: ShareButtonProps) {
  
  const [showModal, setShowModal] = useState(false);
  
  const getShareText = () => {
    switch (type) {
      case 'store':
        return `Check out ${title}! ${description || 'Browse amazing products'} ${url}`;
      case 'product':
        return `Check out this product: ${title}! ${description || ''} ${url}`;
      default:
        return `${title} ${description ? '- ' + description : ''} ${url}`;
    }
  };

  const copyToClipboard = async () => {
    try {
      await Clipboard.setStringAsync(url);
      setShowModal(false);
      Alert.alert('Copied!', 'Link copied to clipboard');
    } catch (error) {
      console.error('Copy error:', error);
      Alert.alert('Error', 'Failed to copy link');
    }
  };

  const openNativeShare = async () => {
    try {
      setShowModal(false);
      
      // Try react-native-share first (mobile only)
      if (Share && Platform.OS !== 'web') {
        const shareOptions = {
          title: `Share ${title}`,
          message: getShareText(),
          url: url,
        };
        
        await Share.open(shareOptions);
        return;
      }

      // Fallback to Expo sharing
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url, {
          mimeType: 'text/plain',
          dialogTitle: `Share ${title}`,
        });
      } else {
        // Web fallback using Web Share API
        if (Platform.OS === 'web' && navigator.share) {
          await navigator.share({
            title: title,
            text: getShareText(),
            url: url,
          });
        } else {
          // Final fallback to clipboard
          copyToClipboard();
        }
      }
    } catch (error) {
      console.error('Share error:', error);
      // Don't show error if user just cancelled
      if (error.message !== 'User did not share' && error.name !== 'AbortError') {
        copyToClipboard();
      }
    }
  };

  const openSMSShare = () => {
    setShowModal(false);
    const message = encodeURIComponent(getShareText());
    const smsUrl = Platform.OS === 'ios' 
      ? `sms:&body=${message}`
      : `sms:?body=${message}`;
    
    Linking.openURL(smsUrl).catch(() => {
      Alert.alert('Error', 'Could not open messaging app');
    });
  };

  const openEmailShare = () => {
    setShowModal(false);
    const subject = encodeURIComponent(`Check out ${title}`);
    const body = encodeURIComponent(getShareText());
    const emailUrl = `mailto:?subject=${subject}&body=${body}`;
    
    Linking.openURL(emailUrl).catch(() => {
      Alert.alert('Error', 'Could not open email app');
    });
  };

  const openWhatsAppShare = () => {
    setShowModal(false);
    const message = encodeURIComponent(getShareText());
    const whatsappUrl = `whatsapp://send?text=${message}`;
    
    Linking.openURL(whatsappUrl).catch(() => {
      Alert.alert('WhatsApp not installed', 'WhatsApp is not installed on this device');
    });
  };

  const showShareOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Copy Link', 'Messages', 'Email', 'WhatsApp', 'More Options'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          switch (buttonIndex) {
            case 1: copyToClipboard(); break;
            case 2: openSMSShare(); break;
            case 3: openEmailShare(); break;
            case 4: openWhatsAppShare(); break;
            case 5: openNativeShare(); break;
          }
        }
      );
    } else {
      // Use custom modal for Android/Web since Alert.alert doesn't work reliably
      setShowModal(true);
    }
  };

  const ShareModal = () => (
    <Modal
      visible={showModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowModal(false)}
    >
      <View style={modalStyles.overlay}>
        <ThemedView style={modalStyles.modal}>
          <ThemedText style={modalStyles.title}>Share {title}</ThemedText>
          <ThemedText style={modalStyles.subtitle}>Choose how to share:</ThemedText>
          
          <View style={modalStyles.buttonContainer}>
            <TouchableOpacity style={modalStyles.option} onPress={copyToClipboard}>
              <ThemedText style={modalStyles.optionText}>📋 Copy Link</ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity style={modalStyles.option} onPress={openSMSShare}>
              <ThemedText style={modalStyles.optionText}>💬 Messages</ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity style={modalStyles.option} onPress={openEmailShare}>
              <ThemedText style={modalStyles.optionText}>📧 Email</ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity style={modalStyles.option} onPress={openWhatsAppShare}>
              <ThemedText style={modalStyles.optionText}>📱 WhatsApp</ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity style={modalStyles.option} onPress={openNativeShare}>
              <ThemedText style={modalStyles.optionText}>🔗 More Options</ThemedText>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={modalStyles.cancelButton} 
            onPress={() => setShowModal(false)}
          >
            <ThemedText style={modalStyles.cancelText}>Cancel</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </View>
    </Modal>
  );

  if (compact) {
    return (
      <>
        <TouchableOpacity 
          style={[styles.compactButton, style]} 
          onPress={showShareOptions}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.shareIcon}>📤</ThemedText>
        </TouchableOpacity>
        <ShareModal />
      </>
    );
  }

  return (
    <>
      <View style={[styles.shareContainer, style]}>
        <TouchableOpacity 
          style={styles.shareButton} 
          onPress={showShareOptions}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.shareIcon}>📤</ThemedText>
          <ThemedText style={styles.shareText}>Share</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.copyButton} 
          onPress={copyToClipboard}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.copyText}>Copy Link</ThemedText>
        </TouchableOpacity>
      </View>
      <ShareModal />
    </>
  );
}

const styles = StyleSheet.create({
  shareContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  shareIcon: {
    fontSize: 16,
  },
  shareText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  copyButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: 'transparent',
  },
  copyText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  compactButton: {
    backgroundColor: '#007AFF',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    minWidth: 320,
    maxWidth: 400,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#4a4a4a',
    marginBottom: 24,
  },
  buttonContainer: {
    gap: 12,
  },
  option: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cancelText: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '700',
  },
}); 