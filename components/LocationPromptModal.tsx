import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

interface LocationPromptModalProps {
  visible: boolean;
  artistName?: string;
  onSubmit: (location: { city: string; state: string; zip?: string }) => void;
  onSkip: () => void;
}

export default function LocationPromptModal({
  visible,
  artistName,
  onSubmit,
  onSkip,
}: LocationPromptModalProps) {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [showStateList, setShowStateList] = useState(false);
  const [stateSearch, setStateSearch] = useState('');

  const handleSubmit = () => {
    if (city.trim() && state) {
      onSubmit({
        city: city.trim(),
        state,
        zip: zip.trim() || undefined,
      });
      // Reset form
      setCity('');
      setState('');
      setZip('');
    }
  };

  const filteredStates = US_STATES.filter(
    (s) =>
      s.name.toLowerCase().includes(stateSearch.toLowerCase()) ||
      s.code.toLowerCase().includes(stateSearch.toLowerCase())
  );

  const selectedState = US_STATES.find((s) => s.code === state);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onSkip}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="place" size={32} color="#3b82f6" />
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onSkip}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>
            Help {artistName || 'artists'} find their fans!
          </Text>
          <Text style={styles.subtitle}>
            Where do you usually go for live music or entertainment?
          </Text>

          <View style={styles.form}>
            {/* City Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>City</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Los Angeles"
                placeholderTextColor="#9ca3af"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            {/* State Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>State</Text>
              <TouchableOpacity
                style={styles.stateSelector}
                onPress={() => setShowStateList(!showStateList)}
              >
                <Text style={selectedState ? styles.stateSelectorText : styles.stateSelectorPlaceholder}>
                  {selectedState ? selectedState.name : 'Select a state'}
                </Text>
                <MaterialIcons
                  name={showStateList ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color="#6b7280"
                />
              </TouchableOpacity>

              {showStateList && (
                <View style={styles.stateList}>
                  <TextInput
                    style={styles.stateSearch}
                    placeholder="Search states..."
                    placeholderTextColor="#9ca3af"
                    value={stateSearch}
                    onChangeText={setStateSearch}
                    autoCapitalize="none"
                  />
                  <ScrollView style={styles.stateScroll}>
                    {filteredStates.map((s) => (
                      <TouchableOpacity
                        key={s.code}
                        style={styles.stateItem}
                        onPress={() => {
                          setState(s.code);
                          setShowStateList(false);
                          setStateSearch('');
                        }}
                      >
                        <Text style={styles.stateItemText}>{s.name}</Text>
                        <Text style={styles.stateItemCode}>{s.code}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Zip Code (Optional) */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Zip Code <Text style={styles.optional}>(optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="12345"
                placeholderTextColor="#9ca3af"
                value={zip}
                onChangeText={setZip}
                keyboardType="number-pad"
                maxLength={5}
                returnKeyType="done"
              />
            </View>
          </View>

          <View style={styles.benefit}>
            <MaterialIcons name="info-outline" size={16} color="#3b82f6" />
            <Text style={styles.benefitText}>
              This helps artists know where to perform next!
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={onSkip}
            >
              <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!city.trim() || !state) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!city.trim() || !state}
            >
              <Text style={styles.submitButtonText}>Save & Continue</Text>
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
    justifyContent: 'space-between',
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
  closeButton: {
    padding: 4,
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
  optional: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9ca3af',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1f2937',
  },
  stateSelector: {
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
  stateSelectorText: {
    fontSize: 16,
    color: '#1f2937',
  },
  stateSelectorPlaceholder: {
    fontSize: 16,
    color: '#9ca3af',
  },
  stateList: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    maxHeight: 300,
    overflow: 'hidden',
  },
  stateSearch: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1f2937',
  },
  stateScroll: {
    maxHeight: 250,
  },
  stateItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  stateItemText: {
    fontSize: 16,
    color: '#1f2937',
  },
  stateItemCode: {
    fontSize: 14,
    color: '#6b7280',
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
    gap: 12,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  submitButton: {
    flex: 2,
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

