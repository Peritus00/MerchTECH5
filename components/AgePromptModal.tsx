import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const AGE_RANGES = [
  'Under 18',
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55-64',
  '65+',
];

interface AgePromptModalProps {
  visible: boolean;
  artistName?: string;
  onSubmit: (ageRange: string) => void;
}

export default function AgePromptModal({
  visible,
  artistName,
  onSubmit,
}: AgePromptModalProps) {
  const [selectedAge, setSelectedAge] = useState('');
  const [showAgeList, setShowAgeList] = useState(false);

  const handleSubmit = () => {
    if (selectedAge) {
      onSubmit(selectedAge);
      // Reset form
      setSelectedAge('');
      setShowAgeList(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {}} // Prevent closing - mandatory survey
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="people" size={32} color="#3b82f6" />
            </View>
          </View>

          <Text style={styles.title}>
            Help {artistName || 'artists'} know their audience!
          </Text>
          <Text style={styles.subtitle}>
            What's your age range?
          </Text>

          <View style={styles.form}>
            {/* Age Range Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Age Range</Text>
              <TouchableOpacity
                style={styles.ageSelector}
                onPress={() => setShowAgeList(!showAgeList)}
              >
                <Text style={selectedAge ? styles.ageSelectorText : styles.ageSelectorPlaceholder}>
                  {selectedAge || 'Select your age range'}
                </Text>
                <MaterialIcons
                  name={showAgeList ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color="#6b7280"
                />
              </TouchableOpacity>

              {showAgeList && (
                <View style={styles.ageList}>
                  <ScrollView style={styles.ageScroll}>
                    {AGE_RANGES.map((range) => (
                      <TouchableOpacity
                        key={range}
                        style={styles.ageItem}
                        onPress={() => {
                          setSelectedAge(range);
                          setShowAgeList(false);
                        }}
                      >
                        <Text style={styles.ageItemText}>{range}</Text>
                        {selectedAge === range && (
                          <MaterialIcons name="check" size={20} color="#3b82f6" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          <View style={styles.benefit}>
            <MaterialIcons name="info-outline" size={16} color="#3b82f6" />
            <Text style={styles.benefitText}>
              This helps artists understand their audience demographics!
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                !selectedAge && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!selectedAge}
            >
              <Text style={styles.submitButtonText}>Continue</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
    lineHeight: 24,
  },
  form: {
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  ageSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ageSelectorText: {
    fontSize: 16,
    color: '#1f2937',
  },
  ageSelectorPlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
  },
  ageList: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    maxHeight: 300,
    overflow: 'hidden',
  },
  ageScroll: {
    maxHeight: 250,
  },
  ageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  ageItemText: {
    fontSize: 16,
    color: '#1f2937',
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    gap: 8,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

