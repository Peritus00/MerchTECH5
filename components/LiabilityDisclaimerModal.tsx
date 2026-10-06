import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const DISCLAIMER_TITLE = 'DISCLAIMER OF LIABILITY AND ASSUMPTION OF RISK';

const DISCLAIMER_BODY = `By purchasing, installing, or utilizing this product, you (the "User") acknowledge and agree that you are doing so entirely at your own risk.

This product is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.

To the maximum extent permitted by applicable law, the manufacturer, distributor, and retailers of this product shall not be held liable for any direct, indirect, incidental, consequential, or special damages, injuries, or property damage resulting from the use, misuse, or inability to use this product. The User assumes full responsibility for complying with all safety guidelines, local regulations, and proper operational procedures.`;

interface LiabilityDisclaimerModalProps {
  visible: boolean;
  onAccept: () => void;
}

export default function LiabilityDisclaimerModal({
  visible,
  onAccept,
}: LiabilityDisclaimerModalProps) {
  const [checked, setChecked] = useState(false);

  const handleAccept = () => {
    if (!checked) return;
    onAccept();
    setChecked(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="gavel" size={32} color="#8b5cf6" />
            </View>
          </View>

          <Text style={styles.title}>{DISCLAIMER_TITLE}</Text>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            <Text style={styles.bodyText}>{DISCLAIMER_BODY}</Text>
          </ScrollView>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setChecked((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked ? (
                <MaterialIcons name="check" size={18} color="#fff" />
              ) : null}
            </View>
            <Text style={styles.checkboxLabel}>
              I have read and accept the terms above
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.acceptButton, !checked && styles.acceptButtonDisabled]}
            onPress={handleAccept}
            disabled={!checked}
            activeOpacity={0.8}
          >
            <Text style={styles.acceptButtonText}>Accept and Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    marginBottom: 12,
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
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  scrollBody: {
    maxHeight: 220,
    marginBottom: 16,
  },
  scrollContent: {
    paddingRight: 4,
  },
  bodyText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  acceptButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
