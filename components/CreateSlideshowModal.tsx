
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface CreateSlideshowModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateSlideshow: (slideshowData: {
    name: string;
    description?: string;
    autoplayInterval: number;
    transition: string;
    requiresActivationCode: boolean;
  }) => void;
}

const CreateSlideshowModal: React.FC<CreateSlideshowModalProps> = ({
  visible,
  onClose,
  onCreateSlideshow,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [autoplayInterval, setAutoplayInterval] = useState(5000);
  const [transition, setTransition] = useState('fade');
  const [requiresActivationCode, setRequiresActivationCode] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const transitionOptions = [
    { value: 'fade', label: 'Fade' },
    { value: 'slide', label: 'Slide' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'none', label: 'None' },
  ];

  const intervalOptions = [
    { value: 2000, label: '2 seconds' },
    { value: 3000, label: '3 seconds' },
    { value: 5000, label: '5 seconds' },
    { value: 8000, label: '8 seconds' },
    { value: 10000, label: '10 seconds' },
  ];

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};
    if (!name.trim()) {
      newErrors.name = 'Slideshow name is required';
    } else if (name.trim().length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = () => {
    if (!validateForm()) {
      return;
    }
    onCreateSlideshow({
      name: name.trim(),
      description: description.trim() || undefined,
      autoplayInterval,
      transition,
      requiresActivationCode,
    });
    resetForm();
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setAutoplayInterval(5000);
    setTransition('fade');
    setRequiresActivationCode(false);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Slideshow</Text>
          <TouchableOpacity onPress={handleCreate}>
            <Text style={styles.createButton}>Create</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* Slideshow Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Slideshow Name *</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Product Gallery, Event Photos"
              placeholderTextColor="#9ca3af"
              maxLength={100}
            />
            {errors.name && (
              <Text style={styles.errorText}>{errors.name}</Text>
            )}
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description of your slideshow"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>

          {/* Autoplay Interval */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Slide Duration</Text>
            <View style={styles.optionsGrid}>
              {intervalOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    autoplayInterval === option.value && styles.selectedOption,
                  ]}
                  onPress={() => setAutoplayInterval(option.value)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      autoplayInterval === option.value && styles.selectedOptionText,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Transition Effect */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Transition Effect</Text>
            <View style={styles.optionsGrid}>
              {transitionOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.optionButton,
                    transition === option.value && styles.selectedOption,
                  ]}
                  onPress={() => setTransition(option.value)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      transition === option.value && styles.selectedOptionText,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Access Control */}
          <View style={styles.inputGroup}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.label}>Require Access Code</Text>
                <Text style={styles.sublabel}>
                  Users will need an activation code to view this slideshow
                </Text>
              </View>
              <Switch
                value={requiresActivationCode}
                onValueChange={setRequiresActivationCode}
                trackColor={{ false: '#e5e7eb', true: '#bfdbfe' }}
                thumbColor={requiresActivationCode ? '#3b82f6' : '#9ca3af'}
              />
            </View>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <MaterialIcons name="info" size={16} color="#3b82f6" />
            <Text style={styles.infoText}>
              After creating your slideshow, you can add images and customize the presentation.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  sublabel: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#1f2937',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 4,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  selectedOption: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  optionText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  selectedOptionText: {
    color: '#3b82f6',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  switchLabel: {
    flex: 1,
    marginRight: 16,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
});

export default CreateSlideshowModal;
