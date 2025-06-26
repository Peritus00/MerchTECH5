
import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { qrCodeService } from '@/services/qrCodeService';

interface CreateQRModalProps {
  visible: boolean;
  onClose: () => void;
  onQRCreated: () => void;
}

type ContentType = 'url' | 'text' | 'email' | 'phone' | 'playlist' | 'slideshow';

export const CreateQRModal: React.FC<CreateQRModalProps> = ({
  visible,
  onClose,
  onQRCreated,
}) => {
  const [name, setName] = useState('');
  const [contentType, setContentType] = useState<ContentType>('url');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [foregroundColor, setForegroundColor] = useState('#000000');
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');
  const [loading, setLoading] = useState(false);
  
  // Playlist/Slideshow specific states
  const [selectedPlaylist, setSelectedPlaylist] = useState<any>(null);
  const [selectedSlideshow, setSelectedSlideshow] = useState<any>(null);
  const [requiresActivationCode, setRequiresActivationCode] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  
  // Mock data - replace with actual data from your services
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [slideshows, setSlideshows] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (visible) {
      // Load playlists, slideshows, and products when modal opens
      loadData();
    }
  }, [visible]);

  const loadData = async () => {
    try {
      // Replace with actual API calls
      // const playlistData = await playlistService.getPlaylists();
      // const slideshowData = await slideshowService.getSlideshows();
      // const productData = await productService.getProducts();
      
      // Mock data for now
      setPlaylists([
        { id: 1, name: 'Chill Vibes', trackCount: 12 },
        { id: 2, name: 'Workout Mix', trackCount: 8 },
      ]);
      
      setSlideshows([
        { id: 1, name: 'Product Showcase', imageCount: 15 },
        { id: 2, name: 'Brand Story', imageCount: 10 },
      ]);
      
      setProducts([
        { id: 1, name: 'Premium Headphones', price: 299.99 },
        { id: 2, name: 'Wireless Speaker', price: 149.99 },
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const resetForm = () => {
    setName('');
    setContentType('url');
    setContent('');
    setDescription('');
    setForegroundColor('#000000');
    setBackgroundColor('#FFFFFF');
    setSelectedPlaylist(null);
    setSelectedSlideshow(null);
    setRequiresActivationCode(false);
    setSelectedProducts([]);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name for your QR code');
      return;
    }

    let finalContent = content;
    
    // Handle playlist/slideshow content generation
    if (contentType === 'playlist' && selectedPlaylist) {
      if (requiresActivationCode) {
        finalContent = `https://your-domain.com/playlist-access/${selectedPlaylist.id}`;
      } else {
        finalContent = `https://your-domain.com/media-player/${selectedPlaylist.id}`;
      }
    } else if (contentType === 'slideshow' && selectedSlideshow) {
      if (requiresActivationCode) {
        finalContent = `https://your-domain.com/slideshow-access/${selectedSlideshow.id}`;
      } else {
        finalContent = `https://your-domain.com/media-player/${selectedSlideshow.id}`;
      }
    } else if (!finalContent.trim()) {
      Alert.alert('Error', 'Please enter content for your QR code');
      return;
    }

    setLoading(true);
    try {
      const qrData = {
        name: name.trim(),
        url: finalContent,
        description: description.trim(),
        contentType,
        requiresActivationCode,
        selectedProducts: selectedProducts.map(p => p.id),
        options: {
          foregroundColor,
          backgroundColor,
          size: 200,
          errorCorrectionLevel: 'H' as const,
        },
      };

      await qrCodeService.createQRCode(qrData);
      Alert.alert('Success', 'QR code created successfully!');
      resetForm();
      onQRCreated();
      onClose();
    } catch (error) {
      console.error('Error creating QR code:', error);
      Alert.alert('Error', 'Failed to create QR code');
    } finally {
      setLoading(false);
    }
  };

  const contentTypes = [
    { value: 'url', label: 'Website URL' },
    { value: 'text', label: 'Plain Text' },
    { value: 'email', label: 'Email Address' },
    { value: 'phone', label: 'Phone Number' },
    { value: 'playlist', label: 'Playlist' },
    { value: 'slideshow', label: 'Slideshow' },
  ];

  const renderContentInput = () => {
    if (contentType === 'playlist') {
      return (
        <View>
          <ThemedText style={styles.label}>Select Playlist</ThemedText>
          <ScrollView style={styles.selectionList} showsVerticalScrollIndicator={false}>
            {playlists.map((playlist) => (
              <TouchableOpacity
                key={playlist.id}
                style={[
                  styles.selectionItem,
                  selectedPlaylist?.id === playlist.id && styles.selectedItem
                ]}
                onPress={() => setSelectedPlaylist(playlist)}
              >
                <ThemedText style={styles.selectionItemText}>
                  {playlist.name} ({playlist.trackCount} tracks)
                </ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          <View style={styles.switchContainer}>
            <ThemedText style={styles.label}>Requires Activation Code</ThemedText>
            <Switch
              value={requiresActivationCode}
              onValueChange={setRequiresActivationCode}
            />
          </View>
        </View>
      );
    }

    if (contentType === 'slideshow') {
      return (
        <View>
          <ThemedText style={styles.label}>Select Slideshow</ThemedText>
          <ScrollView style={styles.selectionList} showsVerticalScrollIndicator={false}>
            {slideshows.map((slideshow) => (
              <TouchableOpacity
                key={slideshow.id}
                style={[
                  styles.selectionItem,
                  selectedSlideshow?.id === slideshow.id && styles.selectedItem
                ]}
                onPress={() => setSelectedSlideshow(slideshow)}
              >
                <ThemedText style={styles.selectionItemText}>
                  {slideshow.name} ({slideshow.imageCount} images)
                </ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          <View style={styles.switchContainer}>
            <ThemedText style={styles.label}>Requires Activation Code</ThemedText>
            <Switch
              value={requiresActivationCode}
              onValueChange={setRequiresActivationCode}
            />
          </View>
        </View>
      );
    }

    return (
      <View>
        <ThemedText style={styles.label}>Content</ThemedText>
        <TextInput
          style={[styles.input, styles.contentInput]}
          value={content}
          onChangeText={setContent}
          placeholder={getContentPlaceholder()}
          multiline={contentType === 'text'}
          keyboardType={contentType === 'email' ? 'email-address' : contentType === 'phone' ? 'phone-pad' : 'default'}
        />
      </View>
    );
  };

  const getContentPlaceholder = () => {
    switch (contentType) {
      case 'url': return 'https://example.com';
      case 'email': return 'contact@example.com';
      case 'phone': return '+1234567890';
      case 'text': return 'Enter your text here...';
      default: return 'Enter content...';
    }
  };

  const renderProductSelection = () => {
    if (contentType !== 'playlist' && contentType !== 'slideshow') {
      return null;
    }

    return (
      <View style={styles.section}>
        <ThemedText style={styles.label}>Associated Products (Optional)</ThemedText>
        <ScrollView style={styles.productList} showsVerticalScrollIndicator={false}>
          {products.map((product) => (
            <TouchableOpacity
              key={product.id}
              style={[
                styles.productItem,
                selectedProducts.some(p => p.id === product.id) && styles.selectedItem
              ]}
              onPress={() => {
                if (selectedProducts.some(p => p.id === product.id)) {
                  setSelectedProducts(selectedProducts.filter(p => p.id !== product.id));
                } else {
                  setSelectedProducts([...selectedProducts, product]);
                }
              }}
            >
              <ThemedText style={styles.productItemText}>
                {product.name} - ${product.price}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title">Create QR Code</ThemedText>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <ThemedText style={styles.closeButtonText}>✕</ThemedText>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <ThemedText style={styles.label}>Name</ThemedText>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter QR code name"
            />
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.label}>Content Type</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeSelector}>
              {contentTypes.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeButton,
                    contentType === type.value && styles.activeTypeButton
                  ]}
                  onPress={() => setContentType(type.value as ContentType)}
                >
                  <ThemedText
                    style={[
                      styles.typeButtonText,
                      contentType === type.value && styles.activeTypeButtonText
                    ]}
                  >
                    {type.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            {renderContentInput()}
          </View>

          {renderProductSelection()}

          <View style={styles.section}>
            <ThemedText style={styles.label}>Description (Optional)</ThemedText>
            <TextInput
              style={[styles.input, styles.descriptionInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Enter description"
              multiline
            />
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.label}>Customization</ThemedText>
            <View style={styles.colorRow}>
              <View style={styles.colorSection}>
                <ThemedText style={styles.colorLabel}>Foreground</ThemedText>
                <View style={styles.colorInputContainer}>
                  <View style={[styles.colorPreview, { backgroundColor: foregroundColor }]} />
                  <TextInput
                    style={styles.colorInput}
                    value={foregroundColor}
                    onChangeText={setForegroundColor}
                    placeholder="#000000"
                  />
                </View>
              </View>
              <View style={styles.colorSection}>
                <ThemedText style={styles.colorLabel}>Background</ThemedText>
                <View style={styles.colorInputContainer}>
                  <View style={[styles.colorPreview, { backgroundColor: backgroundColor }]} />
                  <TextInput
                    style={styles.colorInput}
                    value={backgroundColor}
                    onChangeText={setBackgroundColor}
                    placeholder="#FFFFFF"
                  />
                </View>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onClose}
          >
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.createButton, loading && styles.disabledButton]}
            onPress={handleCreate}
            disabled={loading}
          >
            <ThemedText style={styles.createButtonText}>
              {loading ? 'Creating...' : 'Create QR Code'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  contentInput: {
    minHeight: 100,
  },
  descriptionInput: {
    minHeight: 80,
  },
  typeSelector: {
    marginBottom: 10,
  },
  typeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f5f5f5',
  },
  activeTypeButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#333',
  },
  activeTypeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  selectionList: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 10,
  },
  selectionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedItem: {
    backgroundColor: '#e3f2fd',
  },
  selectionItemText: {
    fontSize: 14,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  productList: {
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  productItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  productItemText: {
    fontSize: 14,
  },
  colorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  colorSection: {
    flex: 1,
    marginHorizontal: 5,
  },
  colorLabel: {
    fontSize: 14,
    marginBottom: 5,
  },
  colorInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  colorPreview: {
    width: 30,
    height: 30,
    margin: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  colorInput: {
    flex: 1,
    padding: 8,
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    marginRight: 10,
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#007AFF',
    marginLeft: 10,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
