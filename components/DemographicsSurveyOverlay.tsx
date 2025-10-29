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

const GENDER_OPTIONS = [
  'Male',
  'Female',
  'Non-binary',
  'Prefer not to say',
  'Open-ended',
];

interface DemographicsSurveyOverlayProps {
  visible: boolean;
  artistName?: string;
  onSubmit: (demographics: { ageRange: string; gender: string }) => void;
}

export default function DemographicsSurveyOverlay({
  visible,
  artistName,
  onSubmit,
}: DemographicsSurveyOverlayProps) {
  const [selectedAge, setSelectedAge] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [showAgeList, setShowAgeList] = useState(false);
  const [showGenderList, setShowGenderList] = useState(false);

  const handleSubmit = () => {
    if (selectedAge && selectedGender) {
      onSubmit({ ageRange: selectedAge, gender: selectedGender });
      // Reset form
      setSelectedAge('');
      setSelectedGender('');
      setShowAgeList(false);
      setShowGenderList(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}} // Prevent closing - mandatory survey
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="people" size={32} color="#8b5cf6" />
            </View>
          </View>

          <Text style={styles.title}>
            Help {artistName || 'artists'} understand their audience!
          </Text>
          <Text style={styles.subtitle}>
            Quick 2-question survey to help artists know who enjoys their content
          </Text>

          <View style={styles.form}>
            {/* Age Range Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Age Range</Text>
              <TouchableOpacity
                style={styles.selector}
                onPress={() => {
                  setShowAgeList(!showAgeList);
                  setShowGenderList(false);
                }}
              >
                <Text style={selectedAge ? styles.selectorText : styles.selectorPlaceholder}>
                  {selectedAge || 'Select your age range'}
                </Text>
                <MaterialIcons
                  name={showAgeList ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color="#6b7280"
                />
              </TouchableOpacity>

              {showAgeList && (
                <View style={styles.dropdown}>
                  <ScrollView style={styles.dropdownScroll}>
                    {AGE_RANGES.map((range) => (
                      <TouchableOpacity
                        key={range}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setSelectedAge(range);
                          setShowAgeList(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{range}</Text>
                        {selectedAge === range && (
                          <MaterialIcons name="check" size={20} color="#8b5cf6" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Gender Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gender Identity</Text>
              <TouchableOpacity
                style={styles.selector}
                onPress={() => {
                  setShowGenderList(!showGenderList);
                  setShowAgeList(false);
                }}
              >
                <Text style={selectedGender ? styles.selectorText : styles.selectorPlaceholder}>
                  {selectedGender || 'Select your gender identity'}
                </Text>
                <MaterialIcons
                  name={showGenderList ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color="#6b7280"
                />
              </TouchableOpacity>

              {showGenderList && (
                <View style={styles.dropdown}>
                  <ScrollView style={styles.dropdownScroll}>
                    {GENDER_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setSelectedGender(option);
                          setShowGenderList(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{option}</Text>
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
                (!selectedAge || !selectedGender) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!selectedAge || !selectedGender}
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
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
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
    lineHeight: 20,
    textAlign: 'center',
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
  selector: {
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
  selectorText: {
    fontSize: 16,
    color: '#1f2937',
  },
  selectorPlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
  },
  dropdown: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    maxHeight: 200,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 180,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dropdownItemText: {
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

