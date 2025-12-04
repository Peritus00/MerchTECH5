import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { slideshowChatAPI } from '@/services/api';
import { ChatMessage } from '@/shared/media-schema';

interface SlideshowChatProps {
  slideshowId: string;
  slideshowName: string;
}

export default function SlideshowChat({ slideshowId, slideshowName }: SlideshowChatProps) {
  const { user, isAuthenticated } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (slideshowId) {
      loadMessages();
      
      // Set up auto-refresh for real-time feel (every 5 seconds)
      refreshIntervalRef.current = setInterval(() => {
        if (!isSending) {
          refreshMessages();
        }
      }, 5000);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [slideshowId]);

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      console.log('🎬 SLIDESHOW_CHAT: Loading messages for slideshow:', slideshowId);
      const response = await slideshowChatAPI.getMessages(slideshowId);
      const fetchedMessages = response.messages || [];
      console.log('🎬 SLIDESHOW_CHAT: Loaded', fetchedMessages.length, 'messages');
      setMessages(fetchedMessages);
      
      // Scroll to bottom after loading
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error('Error loading slideshow messages:', error);
      // Don't show error for chat loading failure - just show empty state
    } finally {
      setIsLoading(false);
    }
  };

  const refreshMessages = async () => {
    try {
      // Don't set loading state to avoid UI flickering
      const response = await slideshowChatAPI.getMessages(slideshowId);
      const fetchedMessages = response.messages || [];
      
      // Only update if we have new messages
      if (fetchedMessages.length !== messages.length || 
          (fetchedMessages.length > 0 && messages.length > 0 && 
           fetchedMessages[fetchedMessages.length - 1].id !== messages[messages.length - 1].id)) {
        setMessages(fetchedMessages);
      }
    } catch (error) {
      // Silent fail for polling
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !isAuthenticated || isSending) {
      return;
    }

    const messageText = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    try {
      console.log('🎬 SLIDESHOW_CHAT: Sending message:', messageText);
      const response = await slideshowChatAPI.sendMessage(slideshowId, messageText);
      const sentMessage = response.message;
      console.log('🎬 SLIDESHOW_CHAT: Message sent:', sentMessage);
      
      // Add the new message to the list
      setMessages(prev => [...prev, sentMessage]);
      
      // Scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      console.error('Error sending slideshow message:', error);
      const errorMessage = error.response?.data?.error || 'Failed to send message';
      Alert.alert('Error', errorMessage);
      
      // Restore the message text if sending failed
      setNewMessage(messageText);
    } finally {
      setIsSending(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      console.log('🎬 SLIDESHOW_CHAT: Deleting message:', messageId);
      await slideshowChatAPI.deleteMessage(slideshowId, messageId);
      
      // Remove the message from the list
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (error: any) {
      console.error('Error deleting slideshow message:', error);
      const errorMessage = error.response?.data?.error || 'Failed to delete message';
      Alert.alert('Error', errorMessage);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (message: ChatMessage) => {
    const isOwnMessage = user?.id === message.userId;
    const canDelete = isOwnMessage || user?.isAdmin;

    return (
      <View key={message.id} style={[
        styles.messageContainer,
        isOwnMessage && styles.ownMessageContainer
      ]}>
        <View style={[
          styles.messageBubble,
          isOwnMessage ? styles.ownMessageBubble : styles.otherMessageBubble
        ]}>
          {!isOwnMessage && (
            <Text style={styles.username}>{message.username}</Text>
          )}
          <Text style={[
            styles.messageText,
            isOwnMessage && styles.ownMessageText
          ]}>
            {message.message}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[
              styles.timestamp,
              isOwnMessage && styles.ownTimestamp
            ]}>
              {formatTime(message.createdAt)}
            </Text>
            {canDelete && (
              <TouchableOpacity
                onPress={() => deleteMessage(message.id)}
                style={styles.deleteButton}
              >
                <MaterialIcons name="delete" size={14} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <MaterialIcons name="chat" size={20} color="#6b7280" />
          <Text style={styles.headerTitle}>Slideshow Discussion</Text>
        </View>
        <View style={styles.unauthenticatedContainer}>
          <MaterialIcons name="lock" size={48} color="#9ca3af" />
          <Text style={styles.unauthenticatedText}>Sign in to join the conversation</Text>
          <Text style={styles.unauthenticatedSubtext}>
            Connect with other viewers and share your thoughts about this slideshow
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <MaterialIcons name="chat" size={20} color="#3b82f6" />
        <Text style={styles.headerTitle}>Slideshow Discussion</Text>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="chat-bubble-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              Be the first to start the conversation about "{slideshowName}"
            </Text>
          </View>
        ) : (
          Array.isArray(messages) ? messages.map(renderMessage) : []
        )}
      </ScrollView>

      {/* Message Input */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
      >
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Share your thoughts..."
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={1000}
            editable={!isSending}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!newMessage.trim() || isSending) && styles.sendButtonDisabled
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <MaterialIcons name="send" size={20} color="#ffffff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
    flex: 1,
  },
  unauthenticatedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  unauthenticatedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginTop: 16,
  },
  unauthenticatedSubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  messageContainer: {
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  ownMessageContainer: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  otherMessageBubble: {
    backgroundColor: '#f3f4f6',
    borderBottomLeftRadius: 4,
  },
  ownMessageBubble: {
    backgroundColor: '#3b82f6',
    borderBottomRightRadius: 4,
  },
  username: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#1f2937',
    lineHeight: 18,
  },
  ownMessageText: {
    color: '#ffffff',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timestamp: {
    fontSize: 11,
    color: '#9ca3af',
  },
  ownTimestamp: {
    color: '#e5e7eb',
  },
  deleteButton: {
    marginLeft: 8,
    padding: 2,
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    gap: 12,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    maxHeight: 100,
    color: '#1f2937',
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
}); 