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

const GENDER_OPTIONS = [
  'Male',
  'Female',
  'Non-binary',
  'Prefer not to say',
  'Open-ended',
];

interface GenderPromptModalProps {
  visible: boolean;
  artistName?: string;
  onSubmit: (gender: string) => void;
}

export default function GenderPromptModal({
  visible,
  artistName,
  onSubmit,
}: GenderPromptModalProps) {
  const [selectedGender, setSelectedGender] = useState('');

  const handleSubmit = (gender: string) => {
    onSubmit(gender);
    setSelectedGender('');
  };

  const handleGenderSelect = (gender: string) => {
    setSelectedGender(gender);
    handleSubmit(gender);
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
              <MaterialIcons name="wc" size={32} color="#8b5cf6" />
            </View>
          </View>

          <Text style={styles.title}>
            Help {artistName || 'artists'} understand their audience!
          </Text>
          <Text style={styles.subtitle}>
            What is your gender identity?
          </Text>

          <View style={styles.form}>
            {/* Gender Button Grid */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gender Identity</Text>
              <View style={styles.optionGrid}>
                {GENDER_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.optionButton,
                      selectedGender === option && styles.optionButtonSelected,
                    ]}
                    onPress={() => handleGenderSelect(option)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selectedGender === option && styles.optionTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                    {selectedGender === option && (
                      <MaterialIcons name="check" size={18} color="#8b5cf6" style={styles.checkIcon} />
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
            <MaterialIcons name="info-outline" size={16} color="#8b5cf6" />
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
    backgroundColor: '#f3e8ff',
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
    backgroundColor: '#f3e8ff',
    borderColor: '#8b5cf6',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'center',
    flexShrink: 1,
  },
  optionTextSelected: {
    color: '#8b5cf6',
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
    backgroundColor: '#f3e8ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    gap: 8,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: '#6b21a8',
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
    backgroundColor: '#8b5cf6',
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

