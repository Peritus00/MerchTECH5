
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

interface CreateCodeModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateCode: (codeData: {
    maxUses?: number | null;
    expiresAt?: Date | null;
  }) => void;
  playlistName: string;
}

const CreateCodeModal: React.FC<CreateCodeModalProps> = ({
  visible,
  onClose,
  onCreateCode,
  playlistName,
}) => {
  const [hasUsageLimit, setHasUsageLimit] = useState(false);
  const [maxUses, setMaxUses] = useState('1');
  const [hasExpiration, setHasExpiration] = useState(false);
  const [expirationDate, setExpirationDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleCreate = () => {
    const codeData: {
      maxUses?: number | null;
      expiresAt?: Date | null;
    } = {};

    if (hasUsageLimit) {
      const parsedMaxUses = parseInt(maxUses);
      if (isNaN(parsedMaxUses) || parsedMaxUses <= 0) {
        Alert.alert('Error', 'Please enter a valid number for max uses');
        return;
      }
      codeData.maxUses = parsedMaxUses;
    } else {
      codeData.maxUses = null;
    }

    if (hasExpiration) {
      if (expirationDate <= new Date()) {
        Alert.alert('Error', 'Expiration date must be in the future');
        return;
      }
      codeData.expiresAt = expirationDate;
    } else {
      codeData.expiresAt = null;
    }

    onCreateCode(codeData);
    resetForm();
  };

  const resetForm = () => {
    setHasUsageLimit(false);
    setMaxUses('1');
    setHasExpiration(false);
    setExpirationDate(new Date());
    setShowDatePicker(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Activation Code</Text>
          <TouchableOpacity onPress={handleCreate}>
            <Text style={styles.createButton}>Create</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* Playlist Info */}
          <View style={styles.playlistInfo}>
            <MaterialIcons name="queue-music" size={20} color="#3b82f6" />
            <Text style={styles.playlistName} numberOfLines={1}>
              {playlistName}
            </Text>
          </View>

          {/* Usage Limit Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Usage Limit</Text>
              <Switch
                value={hasUsageLimit}
                onValueChange={setHasUsageLimit}
                trackColor={{ false: '#e5e7eb', true: '#bfdbfe' }}
                thumbColor={hasUsageLimit ? '#3b82f6' : '#9ca3af'}
              />
            </View>
            
            {hasUsageLimit && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Maximum Uses</Text>
                <TextInput
                  style={styles.numberInput}
                  value={maxUses}
                  onChangeText={setMaxUses}
                  placeholder="Enter number"
                  keyboardType="number-pad"
                  placeholderTextColor="#9ca3af"
                />
                <Text style={styles.inputHelp}>
                  How many times this code can be used before it becomes invalid
                </Text>
              </View>
            )}
            
            {!hasUsageLimit && (
              <Text style={styles.sectionDescription}>
                This code can be used unlimited times
              </Text>
            )}
          </View>

          {/* Expiration Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Expiration Date</Text>
              <Switch
                value={hasExpiration}
                onValueChange={setHasExpiration}
                trackColor={{ false: '#e5e7eb', true: '#bfdbfe' }}
                thumbColor={hasExpiration ? '#3b82f6' : '#9ca3af'}
              />
            </View>
            
            {hasExpiration && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Expires On</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <MaterialIcons name="event" size={20} color="#6b7280" />
                  <Text style={styles.dateButtonText}>
                    {formatDate(expirationDate)}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color="#6b7280" />
                </TouchableOpacity>
                <Text style={styles.inputHelp}>
                  The code will automatically become invalid after this date
                </Text>
              </View>
            )}
            
            {!hasExpiration && (
              <Text style={styles.sectionDescription}>
                This code will never expire
              </Text>
            )}
          </View>

          {/* Summary */}
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Code Summary</Text>
            <View style={styles.summaryItem}>
              <MaterialIcons name="analytics" size={16} color="#6b7280" />
              <Text style={styles.summaryText}>
                {hasUsageLimit ? `Can be used ${maxUses} times` : 'Unlimited usage'}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <MaterialIcons name="schedule" size={16} color="#6b7280" />
              <Text style={styles.summaryText}>
                {hasExpiration ? `Expires ${formatDate(expirationDate)}` : 'Never expires'}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Date Picker */}
        {showDatePicker && (
          <DateTimePicker
            value={expirationDate}
            mode="datetime"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) {
                setExpirationDate(selectedDate);
              }
            }}
            minimumDate={new Date()}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
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
  createButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  playlistInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    gap: 8,
  },
  playlistName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  inputContainer: {
    marginTop: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#fff',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    gap: 8,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  inputHelp: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    lineHeight: 16,
  },
  summary: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#6b7280',
  },
});

export default CreateCodeModal;
