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
  const [showGenderList, setShowGenderList] = useState(false);

  const handleSubmit = () => {
    if (selectedGender) {
      onSubmit(selectedGender);
      // Reset form
      setSelectedGender('');
      setShowGenderList(false);
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
            {/* Gender Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gender Identity</Text>
              <TouchableOpacity
                style={styles.genderSelector}
                onPress={() => setShowGenderList(!showGenderList)}
              >
                <Text style={selectedGender ? styles.genderSelectorText : styles.genderSelectorPlaceholder}>
                  {selectedGender || 'Select your gender identity'}
                </Text>
                <MaterialIcons
                  name={showGenderList ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color="#6b7280"
                />
              </TouchableOpacity>

              {showGenderList && (
                <View style={styles.genderList}>
                  <ScrollView style={styles.genderScroll}>
                    {GENDER_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={styles.genderItem}
                        onPress={() => {
                          setSelectedGender(option);
                          setShowGenderList(false);
                        }}
                      >
                        <Text style={styles.genderItemText}>{option}</Text>
                        {selectedGender === option && (
                          <MaterialIcons name="check" size={20} color="#8b5cf6" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          <View style={styles.benefit}>
            <MaterialIcons name="info-outline" size={16} color="#8b5cf6" />
            <Text style={styles.benefitText}>
              This helps artists understand their audience demographics!
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                !selectedGender && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!selectedGender}
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
    marginBottom: 8,
  },
  genderSelector: {
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
  genderSelectorText: {
    fontSize: 16,
    color: '#1f2937',
  },
  genderSelectorPlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
  },
  genderList: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    maxHeight: 250,
    overflow: 'hidden',
  },
  genderScroll: {
    maxHeight: 200,
  },
  genderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  genderItemText: {
    fontSize: 16,
    color: '#1f2937',
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

