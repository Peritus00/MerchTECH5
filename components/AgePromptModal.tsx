import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
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

  const handleSubmit = (ageRange: string) => {
    onSubmit(ageRange);
    setSelectedAge('');
  };

  const handleAgeSelect = (ageRange: string) => {
    setSelectedAge(ageRange);
    handleSubmit(ageRange);
  };

  const handleSkip = () => {
    handleSubmit('Prefer not to say');
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
            {/* Age Range Button Grid */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Age Range</Text>
              <View style={styles.optionGrid}>
                {AGE_RANGES.map((range) => (
                  <TouchableOpacity
                    key={range}
                    style={[
                      styles.optionButton,
                      selectedAge === range && styles.optionButtonSelected,
                    ]}
                    onPress={() => handleAgeSelect(range)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selectedAge === range && styles.optionTextSelected,
                      ]}
                    >
                      {range}
                    </Text>
                    {selectedAge === range && (
                      <MaterialIcons name="check" size={18} color="#3b82f6" style={styles.checkIcon} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.benefit}>
            <MaterialIcons name="info-outline" size={16} color="#3b82f6" />
            <Text style={styles.benefitText}>
              This helps artists understand their audience demographics!
            </Text>
          </View>

          <View style={styles.actions} />
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
    marginBottom: 12,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '47%',
    flex: 1,
    flexBasis: '47%',
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    gap: 6,
  },
  optionButtonSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'center',
    flexShrink: 1,
  },
  optionTextSelected: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  checkIcon: {
    marginLeft: 2,
  },
  skipButton: {
    marginTop: 12,
    alignSelf: 'center',
  },
  skipText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
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

