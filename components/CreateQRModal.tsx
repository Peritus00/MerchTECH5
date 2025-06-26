
import React, { useState } from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
  Picker,
} from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { QRCodeGenerator } from './QRCodeGenerator';
import { qrCodeService } from '../services/qrCodeService';
import { CreateQRCodeData } from '../types';
import { useEffect } from 'react';

interface CreateQRModalProps {
  visible: boolean;
  onClose: () => void;
  onQRCreated: () => void;
}

type ContentType = 'url' | 'email' | 'phone' | 'sms' | 'wifi' | 'vcard' | 'text' | 'playlist' | 'slideshow';

export function CreateQRModal({ visible, onClose, onQRCreated }: CreateQRModalProps) {
  const [activeTab, setActiveTab] = useState<'content' | 'style' | 'logo'>('content');

  useEffect(() => {
    if (visible && (contentType === 'playlist' || contentType === 'slideshow')) {
      loadContentData();
    }
  }, [visible, contentType]);

  const loadContentData = async () => {
    try {
      // Mock data for now - replace with actual API calls
      if (contentType === 'playlist') {
        setPlaylists([
          { id: '1', name: 'My Playlist 1', description: 'Sample playlist' },
          { id: '2', name: 'My Playlist 2', description: 'Another playlist' }
        ]);
      } else if (contentType === 'slideshow') {
        setSlideshows([
          { id: '1', title: 'My Slideshow 1', description: 'Sample slideshow' },
          { id: '2', title: 'My Slideshow 2', description: 'Another slideshow' }
        ]);
      }
    } catch (error) {
      console.error('Failed to load content:', error);
    }
  };
  const [contentType, setContentType] = useState<ContentType>('url');
  const [creating, setCreating] = useState(false);
  const [previewMode, setPreviewMode] = useState(true);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [selectedSlideshowId, setSelectedSlideshowId] = useState<string>('');
  const [requiresActivationCode, setRequiresActivationCode] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [slideshows, setSlideshows] = useState<any[]>([]);

  const [formData, setFormData] = useState<CreateQRCodeData>({
    name: '',
    url: '',
    description: '',
    options: {
      foregroundColor: '#000000',
      backgroundColor: '#FFFFFF',
      logo: null,
      logoSize: 40,
      logoBorderRadius: 8,
      logoBorderSize: 4,
      logoBorderColor: '#FFFFFF',
      errorCorrectionLevel: 'H',
      size: 240,
    },
  });

  const getContentPlaceholder = (type: ContentType): string => {
    switch (type) {
      case 'url': return 'https://example.com';
      case 'email': return 'mailto:contact@example.com';
      case 'phone': return 'tel:+1234567890';
      case 'sms': return 'sms:+1234567890';
      case 'wifi': return 'WIFI:T:WPA;S:NetworkName;P:Password;;';
      case 'vcard': return 'BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nORG:Company\nTEL:+1234567890\nEMAIL:john@example.com\nEND:VCARD';
      case 'text': return 'Enter your text here';
      case 'playlist': return 'Select a playlist from the dropdown below';
      case 'slideshow': return 'Select a slideshow from the dropdown below';
      default: return '';
    }
  };

  const handleContentTypeChange = (type: ContentType) => {
    setContentType(type);
    setSelectedPlaylistId('');
    setSelectedSlideshowId('');
    setRequiresActivationCode(false);
    
    if (type === 'playlist' || type === 'slideshow') {
      setFormData({
        ...formData,
        url: ''
      });
    } else {
      setFormData({
        ...formData,
        url: getContentPlaceholder(type)
      });
    }
  };

  const validateContent = (): boolean => {
    if (contentType === 'playlist') {
      return selectedPlaylistId.trim() !== '';
    }
    
    if (contentType === 'slideshow') {
      return selectedSlideshowId.trim() !== '';
    }
    
    if (!formData.url.trim()) return false;
    
    if (contentType === 'url') {
      try {
        new URL(formData.url);
        return true;
      } catch {
        return false;
      }
    }
    
    if (contentType === 'email') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.url);
    }
    
    return true;
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Please fill in the QR code name');
      return;
    }

    if (!validateContent()) {
      if (contentType === 'playlist') {
        Alert.alert('Error', 'Please select a playlist');
      } else if (contentType === 'slideshow') {
        Alert.alert('Error', 'Please select a slideshow');
      } else {
        Alert.alert('Error', 'Please enter valid content for the selected type');
      }
      return;
    }

    setCreating(true);
    try {
      let finalUrl = formData.url;
      
      // Generate URLs for playlist and slideshow content
      if (contentType === 'playlist') {
        const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId);
        if (requiresActivationCode) {
          finalUrl = `https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev/playlist-access/${selectedPlaylistId}`;
        } else {
          finalUrl = `https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev/media-player/${selectedPlaylistId}`;
        }
      } else if (contentType === 'slideshow') {
        const selectedSlideshow = slideshows.find(s => s.id === selectedSlideshowId);
        if (requiresActivationCode) {
          finalUrl = `https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev/slideshow-access/${selectedSlideshowId}`;
        } else {
          finalUrl = `https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev/slideshow-player/${selectedSlideshowId}`;
        }
      }

      const qrData = {
        ...formData,
        url: finalUrl,
        contentType,
        contentId: contentType === 'playlist' ? selectedPlaylistId : contentType === 'slideshow' ? selectedSlideshowId : null,
        requiresActivationCode: (contentType === 'playlist' || contentType === 'slideshow') ? requiresActivationCode : false
      };

      await qrCodeService.createQRCode(qrData);
      Alert.alert('Success', 'QR Code created successfully!');
      onQRCreated();
      resetForm();
    } catch (error) {
      Alert.alert('Error', 'Failed to create QR code');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      description: '',
      options: {
        foregroundColor: '#000000',
        backgroundColor: '#FFFFFF',
        logo: null,
        logoSize: 40,
        logoBorderRadius: 8,
        logoBorderSize: 4,
        logoBorderColor: '#FFFFFF',
        errorCorrectionLevel: 'H',
        size: 240,
      },
    });
    setContentType('url');
    setActiveTab('content');
    setPreviewMode(true);
    setSelectedPlaylistId('');
    setSelectedSlideshowId('');
    setRequiresActivationCode(false);
    setPlaylists([]);
    setSlideshows([]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const renderTabButton = (tab: 'content' | 'style' | 'logo', label: string) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === tab && styles.activeTab]}
      onPress={() => setActiveTab(tab)}
    >
      <ThemedText style={[styles.tabButtonText, activeTab === tab && styles.activeTabText]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );

  const renderContentTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.inputGroup}>
        <ThemedText style={styles.label}>QR Code Name *</ThemedText>
        <TextInput
          style={styles.input}
          value={formData.name}
          onChangeText={(text) => setFormData({ ...formData, name: text })}
          placeholder="Enter QR code name"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.inputGroup}>
        <ThemedText style={styles.label}>Content Type</ThemedText>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={contentType}
            onValueChange={(value) => handleContentTypeChange(value as ContentType)}
            style={styles.picker}
          >
            <Picker.Item label="Website URL" value="url" />
            <Picker.Item label="Email Address" value="email" />
            <Picker.Item label="Phone Number" value="phone" />
            <Picker.Item label="SMS Message" value="sms" />
            <Picker.Item label="WiFi Network" value="wifi" />
            <Picker.Item label="Contact Card" value="vcard" />
            <Picker.Item label="Plain Text" value="text" />
            <Picker.Item label="Playlist" value="playlist" />
            <Picker.Item label="Slideshow" value="slideshow" />
          </Picker>
        </View>
      </View>

      {/* Playlist Selection */}
      {contentType === 'playlist' && (
        <>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Select Playlist *</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedPlaylistId}
                onValueChange={(value) => setSelectedPlaylistId(value)}
                style={styles.picker}
              >
                <Picker.Item label="Choose a playlist..." value="" />
                {playlists.map((playlist) => (
                  <Picker.Item 
                    key={playlist.id} 
                    label={playlist.name} 
                    value={playlist.id} 
                  />
                ))}
              </Picker>
            </View>
          </View>
          
          <View style={styles.inputGroup}>
            <View style={styles.switchRow}>
              <ThemedText style={styles.label}>Requires Activation Code</ThemedText>
              <Switch
                value={requiresActivationCode}
                onValueChange={setRequiresActivationCode}
              />
            </View>
            <ThemedText style={styles.helperText}>
              {requiresActivationCode 
                ? 'Viewers will need an activation code or can preview for 30 seconds' 
                : 'Playlist will play immediately when QR code is scanned'
              }
            </ThemedText>
          </View>
        </>
      )}

      {/* Slideshow Selection */}
      {contentType === 'slideshow' && (
        <>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Select Slideshow *</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedSlideshowId}
                onValueChange={(value) => setSelectedSlideshowId(value)}
                style={styles.picker}
              >
                <Picker.Item label="Choose a slideshow..." value="" />
                {slideshows.map((slideshow) => (
                  <Picker.Item 
                    key={slideshow.id} 
                    label={slideshow.title} 
                    value={slideshow.id} 
                  />
                ))}
              </Picker>
            </View>
          </View>
          
          <View style={styles.inputGroup}>
            <View style={styles.switchRow}>
              <ThemedText style={styles.label}>Requires Activation Code</ThemedText>
              <Switch
                value={requiresActivationCode}
                onValueChange={setRequiresActivationCode}
              />
            </View>
            <ThemedText style={styles.helperText}>
              {requiresActivationCode 
                ? 'Viewers will need an activation code or can preview for 30 seconds' 
                : 'Slideshow will start immediately when QR code is scanned'
              }
            </ThemedText>
          </View>
        </>
      )}

      {/* Regular Content Input for other types */}
      {contentType !== 'playlist' && contentType !== 'slideshow' && (
        <View style={styles.inputGroup}>
          <ThemedText style={styles.label}>Content *</ThemedText>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.url}
            onChangeText={(text) => setFormData({ ...formData, url: text })}
            placeholder={getContentPlaceholder(contentType)}
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
          />
        </View>
      )}

      <View style={styles.inputGroup}>
        <ThemedText style={styles.label}>Description</ThemedText>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
          placeholder="Optional description"
          placeholderTextColor="#999"
          multiline
          numberOfLines={3}
        />
      </View>
    </View>
  );

  const renderStyleTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.inputGroup}>
        <ThemedText style={styles.label}>Size: {formData.options?.size || 240}px</ThemedText>
        <View style={styles.sliderContainer}>
          <TextInput
            style={styles.sliderInput}
            value={(formData.options?.size || 240).toString()}
            onChangeText={(text) => {
              const size = parseInt(text) || 240;
              setFormData({
                ...formData,
                options: { ...formData.options, size: Math.max(150, Math.min(500, size)) }
              });
            }}
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={styles.colorRow}>
        <View style={styles.colorGroup}>
          <ThemedText style={styles.label}>Foreground</ThemedText>
          <View style={styles.colorInputContainer}>
            <View 
              style={[styles.colorPreview, { backgroundColor: formData.options?.foregroundColor }]} 
            />
            <TextInput
              style={styles.colorInput}
              value={formData.options?.foregroundColor}
              onChangeText={(text) => setFormData({
                ...formData,
                options: { ...formData.options, foregroundColor: text }
              })}
              placeholder="#000000"
              placeholderTextColor="#999"
            />
          </View>
        </View>

        <View style={styles.colorGroup}>
          <ThemedText style={styles.label}>Background</ThemedText>
          <View style={styles.colorInputContainer}>
            <View 
              style={[styles.colorPreview, { backgroundColor: formData.options?.backgroundColor }]} 
            />
            <TextInput
              style={styles.colorInput}
              value={formData.options?.backgroundColor}
              onChangeText={(text) => setFormData({
                ...formData,
                options: { ...formData.options, backgroundColor: text }
              })}
              placeholder="#FFFFFF"
              placeholderTextColor="#999"
            />
          </View>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <ThemedText style={styles.label}>Error Correction Level</ThemedText>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={formData.options?.errorCorrectionLevel || 'H'}
            onValueChange={(value) => setFormData({
              ...formData,
              options: { ...formData.options, errorCorrectionLevel: value as 'L' | 'M' | 'Q' | 'H' }
            })}
            style={styles.picker}
          >
            <Picker.Item label="Low (L)" value="L" />
            <Picker.Item label="Medium (M)" value="M" />
            <Picker.Item label="Quartile (Q)" value="Q" />
            <Picker.Item label="High (H)" value="H" />
          </Picker>
        </View>
      </View>
    </View>
  );

  const renderLogoTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.inputGroup}>
        <ThemedText style={styles.label}>Logo URL</ThemedText>
        <TextInput
          style={styles.input}
          value={formData.options?.logo || ''}
          onChangeText={(text) => setFormData({
            ...formData,
            options: { ...formData.options, logo: text || null }
          })}
          placeholder="https://example.com/logo.png"
          placeholderTextColor="#999"
        />
      </View>

      {formData.options?.logo && (
        <>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Logo Size: {formData.options?.logoSize || 40}px</ThemedText>
            <TextInput
              style={styles.sliderInput}
              value={(formData.options?.logoSize || 40).toString()}
              onChangeText={(text) => {
                const size = parseInt(text) || 40;
                setFormData({
                  ...formData,
                  options: { ...formData.options, logoSize: Math.max(20, Math.min(100, size)) }
                });
              }}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Border Size: {formData.options?.logoBorderSize || 4}px</ThemedText>
            <TextInput
              style={styles.sliderInput}
              value={(formData.options?.logoBorderSize || 4).toString()}
              onChangeText={(text) => {
                const size = parseInt(text) || 4;
                setFormData({
                  ...formData,
                  options: { ...formData.options, logoBorderSize: Math.max(0, Math.min(20, size)) }
                });
              }}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Border Radius: {formData.options?.logoBorderRadius || 8}px</ThemedText>
            <TextInput
              style={styles.sliderInput}
              value={(formData.options?.logoBorderRadius || 8).toString()}
              onChangeText={(text) => {
                const radius = parseInt(text) || 8;
                setFormData({
                  ...formData,
                  options: { ...formData.options, logoBorderRadius: Math.max(0, Math.min(50, radius)) }
                });
              }}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Border Color</ThemedText>
            <View style={styles.colorInputContainer}>
              <View 
                style={[styles.colorPreview, { backgroundColor: formData.options?.logoBorderColor }]} 
              />
              <TextInput
                style={styles.colorInput}
                value={formData.options?.logoBorderColor || '#FFFFFF'}
                onChangeText={(text) => setFormData({
                  ...formData,
                  options: { ...formData.options, logoBorderColor: text }
                })}
                placeholder="#FFFFFF"
                placeholderTextColor="#999"
              />
            </View>
          </View>
        </>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <ThemedText style={styles.cancelButton}>Cancel</ThemedText>
          </TouchableOpacity>
          <ThemedText type="defaultSemiBold">Create QR Code</ThemedText>
          <TouchableOpacity onPress={handleCreate} disabled={creating}>
            <ThemedText style={[styles.createButton, creating && styles.disabled]}>
              {creating ? 'Creating...' : 'Create'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Preview Section */}
          <View style={styles.previewSection}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle">Preview</ThemedText>
              <View style={styles.previewToggle}>
                <ThemedText style={styles.previewLabel}>Show Preview</ThemedText>
                <Switch
                  value={previewMode}
                  onValueChange={setPreviewMode}
                />
              </View>
            </View>

            {previewMode && formData.url && (
              <View style={styles.previewContainer}>
                <QRCodeGenerator
                  value={formData.url}
                  size={formData.options?.size || 240}
                  options={formData.options}
                />
              </View>
            )}
          </View>

          {/* Tabs */}
          <View style={styles.tabContainer}>
            {renderTabButton('content', 'Content')}
            {renderTabButton('style', 'Style')}
            {renderTabButton('logo', 'Logo')}
          </View>

          {/* Tab Content */}
          {activeTab === 'content' && renderContentTab()}
          {activeTab === 'style' && renderStyleTab()}
          {activeTab === 'logo' && renderLogoTab()}

          {/* Tips Section */}
          <View style={styles.tipsSection}>
            <ThemedText type="subtitle">Tips for Great QR Codes</ThemedText>
            <View style={styles.tipItem}>
              <ThemedText style={styles.tipTitle}>High Contrast Colors</ThemedText>
              <ThemedText style={styles.tipText}>Use high contrast between foreground and background colors for better scanning reliability.</ThemedText>
            </View>
            <View style={styles.tipItem}>
              <ThemedText style={styles.tipTitle}>Logo Size Matters</ThemedText>
              <ThemedText style={styles.tipText}>Keep logos small enough to maintain QR code readability. Ideal size is 20-25% of the QR code.</ThemedText>
            </View>
            <View style={styles.tipItem}>
              <ThemedText style={styles.tipTitle}>Test Before Sharing</ThemedText>
              <ThemedText style={styles.tipText}>Always test scan your QR code with different devices before printing or sharing.</ThemedText>
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cancelButton: {
    color: '#007BFF',
  },
  createButton: {
    color: '#007BFF',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  previewSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewLabel: {
    marginRight: 8,
    fontSize: 14,
  },
  previewContainer: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#007BFF',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  tabContent: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  picker: {
    height: 50,
  },
  sliderContainer: {
    marginTop: 8,
  },
  sliderInput: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  colorGroup: {
    flex: 1,
  },
  colorInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingLeft: 12,
  },
  colorPreview: {
    width: 24,
    height: 24,
    borderRadius: 4,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  colorInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  tipsSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  tipItem: {
    marginTop: 16,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
});
