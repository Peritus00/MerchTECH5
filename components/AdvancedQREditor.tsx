import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  Platform,
  Text,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { AdvancedQRCodeGenerator } from './AdvancedQRCodeGenerator';
import { aiColorService, ColorPalette, ColorSuggestionRequest } from '@/services/aiColorService';
import { qrCodeService } from '@/services/qrCodeService';
import { playlistAPI, slideshowAPI } from '@/services/api';
import { Playlist, Slideshow } from '@/shared/media-schema';
import { MaterialIcons } from '@expo/vector-icons';
import { downloadAdvancedQRCode, QRCodeFormat } from '@/services/qrUtils';
import { captureRef } from 'react-native-view-shot';

interface AdvancedQREditorProps {
  visible: boolean;
  onClose: () => void;
  onQRCreated: () => void;
}

type ContentType = 'url' | 'text' | 'email' | 'phone' | 'playlist' | 'slideshow' | 'store';
type TabType = 'content' | 'design' | 'ai-colors';

interface QROptions {
  size: number;
  foregroundColor: string;
  backgroundColor: string;
  cornerRadius: number;
  gradientColors?: {
    startColor: string;
    endColor: string;
    type: 'linear' | 'radial';
    angle?: number;
  };
  logo?: {
    imageData?: string;
    size: number;
    borderRadius: number;
    borderSize: number;
    borderColor: string;
    opacity: number;
    position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    padding: number;
    // New scanning optimization properties
    whiteBackground?: boolean;
    contrastBorder?: boolean;
    maxSizePercent?: number;
    quietZone?: boolean;
  };
}

export const AdvancedQREditor: React.FC<AdvancedQREditorProps> = ({
  visible,
  onClose,
  onQRCreated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('content');
  const [name, setName] = useState('');
  const [contentType, setContentType] = useState<ContentType>('url');
  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  
  // Add validation state
  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    content?: string;
    playlist?: string;
    slideshow?: string;
  }>({});

  // Add scannability warnings
  const [scannabilityWarnings, setScannabilityWarnings] = useState<{
    logoTooLarge?: boolean;
    lowContrast?: boolean;
    complexGradient?: boolean;
    cornerPosition?: boolean;
    smallQRSize?: boolean;
    lowErrorCorrection?: boolean;
  }>({});

  // QR Options
  const [options, setOptions] = useState<QROptions>({
    size: 240,
    foregroundColor: '#000000',
    backgroundColor: '#FFFFFF',
    cornerRadius: 0,
  });

  // AI Color Suggestions
  const [colorSuggestions, setColorSuggestions] = useState<ColorPalette[]>([]);
  const [selectedColorIndex, setSelectedColorIndex] = useState<number | null>(null);

  // Gradient options
  const [useGradient, setUseGradient] = useState(false);
  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
  const [gradientAngle, setGradientAngle] = useState(0);

  // Playlist and Slideshow data
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [selectedSlideshow, setSelectedSlideshow] = useState<Slideshow | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // Content type options
  const contentTypes = [
    { value: 'url', label: 'Website URL', icon: 'language' },
    { value: 'text', label: 'Plain Text', icon: 'text-fields' },
    { value: 'email', label: 'Email Address', icon: 'email' },
    { value: 'phone', label: 'Phone Number', icon: 'phone' },
    { value: 'playlist', label: 'Playlist', icon: 'library-music' },
    { value: 'slideshow', label: 'Slideshow', icon: 'slideshow' },
    { value: 'store', label: 'Store Link', icon: 'store' },
  ] as const;

  // Download functionality
  const qrRef = useRef(null);
  const [downloadDropdownVisible, setDownloadDropdownVisible] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);

  useEffect(() => {
    console.log('🎨 AdvancedQREditor: visibility changed', visible);
    if (visible) {
      console.log('🎨 AdvancedQREditor: mounting and initializing');
      console.log('🎨 AdvancedQREditor: Current state:', {
        name,
        contentType,
        content,
        description,
        loading,
        activeTab
      });
      resetForm();
      loadInitialColorSuggestions();
      loadContent();
    }
  }, [visible]);

  // Reset selections when content type changes (but preserve current type's selection)
  useEffect(() => {
    if (contentType !== 'playlist') {
      setSelectedPlaylist(null);
    }
    if (contentType !== 'slideshow') {
      setSelectedSlideshow(null);
    }
    if (contentType !== 'playlist' && contentType !== 'slideshow') {
      setContent('');
    }
  }, [contentType]);

  // Validate scannability when options change
  useEffect(() => {
    if (visible) {
      validateScannability();
    }
  }, [options, useGradient, visible]);

  // Debug selectedPlaylist changes
  useEffect(() => {
    console.log('🎵 selectedPlaylist state changed:', selectedPlaylist);
  }, [selectedPlaylist]);

  const loadContent = async () => {
    setContentLoading(true);
    try {
      console.log('📚 Loading playlists and slideshows...');
      const [playlistsData, slideshowsData] = await Promise.all([
        playlistAPI.getAll().catch((err) => {
          console.log('📚 Playlist API error:', err);
          return [];
        }),
        slideshowAPI.getAll().catch((err) => {
          console.log('📚 Slideshow API error:', err);
          return [];
        })
      ]);
      console.log('📚 Loaded playlists:', playlistsData?.length || 0, playlistsData);
      console.log('📚 Loaded slideshows:', slideshowsData?.length || 0, slideshowsData);
      setPlaylists(playlistsData || []);
      setSlideshows(slideshowsData || []);
    } catch (error) {
      console.error('📚 Error loading content:', error);
    } finally {
      setContentLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setContentType('url');
    setContent('');
    setDescription('');
    setActiveTab('content');
    setOptions({
      size: 240,
      foregroundColor: '#000000',
      backgroundColor: '#FFFFFF',
      cornerRadius: 0,
    });
    setUseGradient(false);
    setSelectedColorIndex(null);
    setSelectedPlaylist(null);
    setSelectedSlideshow(null);
    setDownloadDropdownVisible(false);
    setValidationErrors({});
    setScannabilityWarnings({});
  };

  // Calculate luminance for contrast checking
  const getLuminance = (color: string): number => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    
    const rsRGB = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
    const gsRGB = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
    const bsRGB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    
    return 0.2126 * rsRGB + 0.7152 * gsRGB + 0.0722 * bsRGB;
  };

  // Calculate contrast ratio
  const getContrastRatio = (color1: string, color2: string): number => {
    const lum1 = getLuminance(color1);
    const lum2 = getLuminance(color2);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  };

  // Validate scannability in real-time
  const validateScannability = () => {
    const warnings: typeof scannabilityWarnings = {};

    // Check logo size
    if (options.logo?.imageData) {
      const logoPercent = (options.logo.size / options.size) * 100;
      const maxRecommended = 25; // 25% is generally safe
      const maxAbsolute = 30; // 30% is absolute maximum with high error correction
      
      if (logoPercent > maxAbsolute) {
        warnings.logoTooLarge = true;
      }
    }

    // Check contrast ratio
    const contrastRatio = getContrastRatio(options.foregroundColor, options.backgroundColor);
    if (contrastRatio < 3) { // WCAG minimum for large text
      warnings.lowContrast = true;
    }

    // Check gradient complexity
    if (useGradient) {
      const gradientContrast = getContrastRatio(options.foregroundColor, options.backgroundColor);
      if (gradientContrast < 4.5) {
        warnings.complexGradient = true;
      }
    }

    // Check corner logo position with larger logos
    if (options.logo?.imageData && options.logo.position !== 'center') {
      const logoPercent = (options.logo.size / options.size) * 100;
      if (logoPercent > 15) { // Corner logos should be smaller
        warnings.cornerPosition = true;
      }
    }

    // Check QR code size
    if (options.size < 200) {
      warnings.smallQRSize = true;
    }

    setScannabilityWarnings(warnings);
    return Object.keys(warnings).length === 0; // Returns true if no warnings
  };

  // Auto-fix scannability issues
  const autoFixScannability = () => {
    let newOptions = { ...options };
    let fixed = false;

    // Fix logo size if too large
    if (scannabilityWarnings.logoTooLarge && newOptions.logo) {
      const maxSize = Math.floor(newOptions.size * 0.25); // 25% max
      newOptions.logo.size = Math.min(newOptions.logo.size, maxSize);
      fixed = true;
    }

    // Fix corner position with large logo
    if (scannabilityWarnings.cornerPosition && newOptions.logo) {
      newOptions.logo.position = 'center';
      fixed = true;
    }

    // Fix small QR size
    if (scannabilityWarnings.smallQRSize) {
      newOptions.size = 240; // Minimum recommended size
      fixed = true;
    }

    // Fix low contrast by adjusting to high contrast defaults
    if (scannabilityWarnings.lowContrast) {
      newOptions.foregroundColor = '#000000';
      newOptions.backgroundColor = '#FFFFFF';
      setUseGradient(false);
      fixed = true;
    }

    if (fixed) {
      setOptions(newOptions);
      // Re-validate after fixes
      setTimeout(validateScannability, 100);
      return true;
    }
    return false;
  };

  // Get scannability score (0-100)
  const getScannabilityScore = (): number => {
    let score = 100;
    
    if (scannabilityWarnings.logoTooLarge) score -= 30;
    if (scannabilityWarnings.lowContrast) score -= 25;
    if (scannabilityWarnings.complexGradient) score -= 15;
    if (scannabilityWarnings.cornerPosition) score -= 10;
    if (scannabilityWarnings.smallQRSize) score -= 15;
    if (scannabilityWarnings.lowErrorCorrection) score -= 5;
    
    return Math.max(0, score);
  };

  const loadInitialColorSuggestions = async () => {
    console.log('🎨 Loading initial color suggestions...');
    setAiLoading(true);
    try {
      const suggestions = await aiColorService.generateColorSuggestions({
        contentType: 'url',
        style: 'professional',
      });
      console.log('🎨 Color suggestions loaded:', suggestions.length);
      setColorSuggestions(suggestions);
    } catch (error) {
      console.error('🎨 Error loading initial color suggestions:', error);
      // Ensure we always have some color suggestions, even if AI fails
      try {
        const fallbackSuggestions = await aiColorService.generateColorSuggestions({
          contentType: 'url',
          style: 'professional',
        });
        setColorSuggestions(fallbackSuggestions);
        console.log('🎨 Fallback color suggestions loaded:', fallbackSuggestions.length);
      } catch (fallbackError) {
        console.error('🎨 Even fallback colors failed:', fallbackError);
        // Provide hardcoded colors as last resort
        setColorSuggestions([
          {
            name: 'Classic Blue',
            foregroundColor: '#000080',
            backgroundColor: '#FFFFFF',
            description: 'Professional blue and white combination',
            category: 'professional',
          },
          {
            name: 'Modern Black',
            foregroundColor: '#000000',
            backgroundColor: '#F5F5F5',
            description: 'Clean black on light gray',
            category: 'minimal',
          },
        ]);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const generateAIColors = async () => {
    setAiLoading(true);
    try {
      const request: ColorSuggestionRequest = {
        contentType,
        content: content || undefined,
        style: 'professional',
      };
      
      const suggestions = await aiColorService.generateColorSuggestions(request);
      setColorSuggestions(suggestions);
      setSelectedColorIndex(null);
      
      // Check if we got fallback colors (when AI is unavailable)
      if (suggestions.length > 0 && suggestions[0].name.includes('Fallback')) {
        Alert.alert(
          'AI Service Unavailable',
          'AI color generation is temporarily unavailable (quota exceeded). Using curated color suggestions instead.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('❌ Error generating AI colors:', error);
      
      // Don't show error alert - the service will provide fallback colors
      // Just log the error and continue with fallback colors
      const fallbackSuggestions = await aiColorService.generateColorSuggestions({
        contentType,
        content: content || undefined,
        style: 'professional',
      });
      
      setColorSuggestions(fallbackSuggestions);
      setSelectedColorIndex(null);
      
      Alert.alert(
        'Using Curated Colors',
        'AI color generation is temporarily unavailable. Using our curated color suggestions instead.',
        [{ text: 'OK' }]
      );
    } finally {
      setAiLoading(false);
    }
  };

  const selectColorSuggestion = (index: number) => {
    const suggestion = colorSuggestions[index];
    if (suggestion) {
      setOptions(prev => ({
        ...prev,
        foregroundColor: suggestion.foregroundColor,
        backgroundColor: suggestion.backgroundColor,
      }));
      setSelectedColorIndex(index);
      setUseGradient(false); // Reset gradient when selecting AI color
    }
  };

  const handleLogoUpload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        
        setOptions(prev => ({
          ...prev,
          logo: {
            imageData: imageUri,
            size: 40,
            borderRadius: 8,
            borderSize: 4,
            borderColor: '#FFFFFF',
            opacity: 1,
            position: 'center',
            padding: 10,
          },
        }));
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
      Alert.alert('Error', 'Failed to upload logo');
    }
  };

  const handleDownload = async (format: QRCodeFormat) => {
    if (!qrRef.current) {
      Alert.alert('Error', 'QR code not ready for download');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name for your QR code before downloading');
      return;
    }

    setDownloadLoading(true);
    setDownloadDropdownVisible(false);

    try {
      const qrData = {
        name: name.trim(),
        content: getFinalContent(),
        options,
      };

      await downloadAdvancedQRCode(qrRef.current, qrData, format);
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download QR code');
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleCreate = async () => {
    console.log('🚀 AdvancedQREditor: CREATE BUTTON PRESSED!');
    console.log('🚀 Current form data:', {
      name: name.trim(),
      contentType,
      content,
      description,
      selectedPlaylist: selectedPlaylist?.id,
      selectedSlideshow: selectedSlideshow?.id,
      options
    });

    // Clear previous validation errors
    setValidationErrors({});

    // Validate required fields
    const errors: typeof validationErrors = {};

    if (!name.trim()) {
      console.log('❌ Validation failed: No name provided');
      errors.name = 'QR code name is required';
    }

    // Validate content based on type
    let finalContent = content.trim();
    
    // For playlist and slideshow, generate the final content from selection
    if (contentType === 'playlist') {
      console.log('🔍 DEBUG: selectedPlaylist =', selectedPlaylist);
      console.log('🔍 DEBUG: selectedPlaylist type =', typeof selectedPlaylist);
      console.log('🔍 DEBUG: selectedPlaylist?.id =', selectedPlaylist?.id);
      if (!selectedPlaylist) {
        console.log('❌ Validation failed: No playlist selected');
        errors.playlist = 'Please select a playlist';
      } else {
        // Use web URL that works for both browser users and app users
        finalContent = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/playlist-access/${selectedPlaylist.id}`;
        console.log('✅ Playlist web URL generated:', finalContent);
      }
    } else if (contentType === 'slideshow') {
      if (!selectedSlideshow) {
        console.log('❌ Validation failed: No slideshow selected');
        errors.slideshow = 'Please select a slideshow';
      } else {
        // Use web URL that works for both browser users and app users
        finalContent = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/slideshow-access/${selectedSlideshow.id}`;
        console.log('✅ Slideshow web URL generated:', finalContent);
      }
    } else if (!finalContent) {
      console.log('❌ Validation failed: No content provided for type:', contentType);
      errors.content = 'Content is required';
    }

    // If there are validation errors, show them and return
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      const errorMessages = Object.values(errors).join('\n');
      Alert.alert('Validation Error', errorMessages);
      return;
    }

    // Validate scannability and show warnings if needed
    const scannabilityScore = getScannabilityScore();
    const hasWarnings = Object.keys(scannabilityWarnings).length > 0;
    
    if (hasWarnings) {
      const warningMessages = [];
      if (scannabilityWarnings.logoTooLarge) warningMessages.push('• Logo is too large (>30% of QR size)');
      if (scannabilityWarnings.lowContrast) warningMessages.push('• Poor color contrast detected');
      if (scannabilityWarnings.complexGradient) warningMessages.push('• Gradient may reduce scannability');
      if (scannabilityWarnings.cornerPosition) warningMessages.push('• Large logo in corner position');
      if (scannabilityWarnings.smallQRSize) warningMessages.push('• QR code size too small (<200px)');
      
      // Critical issues that prevent creation (score < 60)
      if (scannabilityScore < 60) {
        const criticalText = `🚫 Critical Scannability Issues (Score: ${scannabilityScore}/100)\n\n${warningMessages.join('\n')}\n\nThis QR code will likely NOT scan properly. You must fix these issues before creating.`;
        
        Alert.alert(
          'Cannot Create QR Code',
          criticalText,
          [
            {
              text: 'Auto-Fix Required Issues',
              onPress: () => {
                const wasFixed = autoFixScannability();
                if (wasFixed) {
                  Alert.alert(
                    '✅ Issues Fixed!', 
                    'Critical scannability issues have been corrected. You can now create your QR code.',
                    [
                      {
                        text: 'Create QR Code',
                        onPress: () => proceedWithCreation(),
                      },
                      {
                        text: 'Review Changes',
                        style: 'cancel',
                      },
                    ]
                  );
                }
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ]
        );
        return;
      }
      
      // Minor issues (score 60-79) - allow with warning
      const warningText = `⚠️ Scannability Issues Detected (Score: ${scannabilityScore}/100)\n\n${warningMessages.join('\n')}\n\nThis QR code may have scanning difficulties. Would you like to:`;
      
      Alert.alert(
        'Scannability Warning',
        warningText,
        [
          {
            text: 'Auto-Fix Issues',
            onPress: () => {
              const wasFixed = autoFixScannability();
              if (wasFixed) {
                Alert.alert('✅ Fixed!', 'Scannability issues have been automatically corrected. You can now create your QR code.');
              }
            },
          },
          {
            text: 'Create Anyway',
            style: 'destructive',
            onPress: () => proceedWithCreation(),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    await proceedWithCreation();

    async function proceedWithCreation() {
      console.log('✅ All validations passed, proceeding with QR creation');
      console.log('📝 Final content:', finalContent);

      setLoading(true);
      try {
        const finalOptions = {
          ...options,
          ...(useGradient && {
            gradientColors: {
              startColor: options.foregroundColor,
              endColor: options.backgroundColor,
              type: gradientType,
              angle: gradientAngle,
            },
          }),
        };

        const qrData = {
          name: name.trim(),
          url: finalContent,
          description: description.trim(),
          contentType,
          options: finalOptions,
        };

        console.log('📤 Sending QR data to service:', JSON.stringify(qrData, null, 2));
        console.log('📤 About to call qrCodeService.createQRCode...');

        const result = await qrCodeService.createQRCode(qrData);
        
        console.log('✅ QR code service returned successfully:', result);
        Alert.alert('Success', 'Advanced QR code created successfully!');
        resetForm();
        onQRCreated();
        onClose();
      } catch (error: any) {
        console.error('❌ AdvancedQREditor: Error creating QR code:', error);
        console.error('❌ Error type:', typeof error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        
        if (error.response) {
          console.error('❌ API Error response:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            headers: error.response.headers
          });
        }
        
        Alert.alert('Error', `Failed to create QR code: ${error.message || 'Unknown error'}`);
      } finally {
        console.log('🏁 Setting loading to false');
        setLoading(false);
      }
    }
  };

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      {[
        { key: 'content', label: 'Content', icon: 'create' },
        { key: 'design', label: 'Design', icon: 'palette' },
        { key: 'ai-colors', label: 'AI Colors', icon: 'auto-awesome' },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, activeTab === tab.key && styles.activeTab]}
          onPress={() => setActiveTab(tab.key as TabType)}
        >
          <MaterialIcons
            name={tab.icon as any}
            size={20}
            color={activeTab === tab.key ? '#2563eb' : '#6b7280'}
          />
          <ThemedText
            style={[
              styles.tabText,
              activeTab === tab.key && styles.activeTabText,
            ]}
          >
            {tab.label}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderContentTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <ThemedText style={styles.label}>QR Code Name</ThemedText>
        <TextInput
          style={[styles.input, validationErrors.name && styles.errorInput]}
          value={name}
          onChangeText={(text) => {
            console.log('📝 QR Code name changed:', text);
            setName(text);
            // Clear error when user starts typing
            if (validationErrors.name) {
              setValidationErrors(prev => ({ ...prev, name: undefined }));
            }
          }}
          placeholder="Enter QR code name"
          placeholderTextColor="#9ca3af"
        />
        {validationErrors.name && (
          <ThemedText style={styles.errorText}>{validationErrors.name}</ThemedText>
        )}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.label}>Content Type</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.contentTypeScroll}>
          {contentTypes.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.contentTypeButton,
                contentType === type.value && styles.selectedContentType,
              ]}
              onPress={() => {
                console.log('📝 Content type changed to:', type.value);
                setContentType(type.value);
              }}
            >
              <MaterialIcons
                name={type.icon as any}
                size={20}
                color={contentType === type.value ? '#2563eb' : '#6b7280'}
              />
              <ThemedText
                style={[
                  styles.contentTypeText,
                  contentType === type.value && styles.selectedContentTypeText,
                ]}
              >
                {type.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Playlist Selector */}
      {contentType === 'playlist' && (
        <View style={styles.section}>
          <ThemedText style={styles.label}>Select Playlist</ThemedText>
          {contentLoading ? (
            <View style={styles.loadingContainer}>
              <ThemedText style={styles.loadingText}>Loading playlists...</ThemedText>
            </View>
          ) : playlists.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="library-music" size={48} color="#9ca3af" />
              <ThemedText style={styles.emptyText}>No playlists found</ThemedText>
              <ThemedText style={styles.emptySubtext}>Create a playlist first to use this feature</ThemedText>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.contentScroll}>
              {playlists.map((playlist) => (
                <TouchableOpacity
                  key={playlist.id}
                  style={[
                    styles.contentCard,
                    selectedPlaylist?.id === playlist.id && styles.selectedContentCard,
                  ]}
                  onPress={() => {
                    console.log('🎵 Playlist selected:', playlist);
                    setSelectedPlaylist(playlist);
                  }}
                >
                  <MaterialIcons
                    name="library-music"
                    size={24}
                    color={selectedPlaylist?.id === playlist.id ? '#2563eb' : '#6b7280'}
                  />
                  <ThemedText
                    style={[
                      styles.contentCardText,
                      selectedPlaylist?.id === playlist.id && styles.selectedContentCardText,
                    ]}
                    numberOfLines={2}
                  >
                    {playlist.name}
                  </ThemedText>
                  {playlist.mediaFiles && (
                    <ThemedText style={styles.contentCardSubtext}>
                      {playlist.mediaFiles.length} media files
                    </ThemedText>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Slideshow Selector */}
      {contentType === 'slideshow' && (
        <View style={styles.section}>
          <ThemedText style={styles.label}>Select Slideshow</ThemedText>
          {contentLoading ? (
            <View style={styles.loadingContainer}>
              <ThemedText style={styles.loadingText}>Loading slideshows...</ThemedText>
            </View>
          ) : slideshows.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="slideshow" size={48} color="#9ca3af" />
              <ThemedText style={styles.emptyText}>No slideshows found</ThemedText>
              <ThemedText style={styles.emptySubtext}>Create a slideshow first to use this feature</ThemedText>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.contentScroll}>
              {slideshows.map((slideshow) => (
                <TouchableOpacity
                  key={slideshow.id}
                  style={[
                    styles.contentCard,
                    selectedSlideshow?.id === slideshow.id && styles.selectedContentCard,
                  ]}
                  onPress={() => setSelectedSlideshow(slideshow)}
                >
                  <MaterialIcons
                    name="slideshow"
                    size={24}
                    color={selectedSlideshow?.id === slideshow.id ? '#2563eb' : '#6b7280'}
                  />
                  <ThemedText
                    style={[
                      styles.contentCardText,
                      selectedSlideshow?.id === slideshow.id && styles.selectedContentCardText,
                    ]}
                    numberOfLines={2}
                  >
                    {slideshow.name}
                  </ThemedText>
                  {slideshow.images && (
                    <ThemedText style={styles.contentCardSubtext}>
                      {slideshow.images.length} images
                    </ThemedText>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Regular Content Input for other types */}
      {contentType !== 'playlist' && contentType !== 'slideshow' && (
        <View style={styles.section}>
          <ThemedText style={styles.label}>Content</ThemedText>
          <TextInput
            style={[styles.input, styles.textArea, validationErrors.content && styles.errorInput]}
            value={content}
            onChangeText={setContent}
            placeholder={getContentPlaceholder()}
            placeholderTextColor="#9ca3af"
            multiline={contentType === 'text'}
            keyboardType={contentType === 'email' ? 'email-address' : contentType === 'phone' ? 'phone-pad' : 'default'}
          />
          {validationErrors.content && (
            <ThemedText style={styles.errorText}>{validationErrors.content}</ThemedText>
          )}
        </View>
      )}

      <View style={styles.section}>
        <ThemedText style={styles.label}>Description (Optional)</ThemedText>
        <TextInput
          style={[styles.input, validationErrors.description && styles.errorInput]}
          value={description}
          onChangeText={setDescription}
          placeholder="Brief description of this QR code"
          placeholderTextColor="#9ca3af"
        />
      </View>
    </ScrollView>
  );

  const renderDesignTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <ThemedText style={styles.label}>QR Code Size: {options.size}px</ThemedText>
        <View style={styles.sliderContainer}>
          <ThemedText style={styles.sliderLabel}>150px</ThemedText>
          <View style={styles.sliderTrack}>
            <View 
              style={[
                styles.sliderFill, 
                { width: `${((options.size - 150) / (500 - 150)) * 100}%` }
              ]} 
            />
            <View 
              style={[
                styles.sliderThumb, 
                { left: `${((options.size - 150) / (500 - 150)) * 100}%` }
              ]} 
            />
          </View>
          <ThemedText style={styles.sliderLabel}>500px</ThemedText>
        </View>
        <View style={styles.sizeButtons}>
          {[150, 200, 240, 300, 400, 500].map((size) => (
            <TouchableOpacity
              key={size}
              style={[
                styles.sizeButton,
                options.size === size && styles.activeSizeButton,
              ]}
              onPress={() => setOptions(prev => ({ ...prev, size }))}
            >
              <ThemedText
                style={[
                  styles.sizeButtonText,
                  options.size === size && styles.activeSizeButtonText,
                ]}
              >
                {size}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.colorSection}>
            <ThemedText style={styles.label}>Foreground</ThemedText>
            <View style={styles.colorInputContainer}>
              <View
                style={[styles.colorPreview, { backgroundColor: options.foregroundColor }]}
              />
              <TextInput
                style={[styles.colorInput, validationErrors.foregroundColor && styles.errorInput]}
                value={options.foregroundColor}
                onChangeText={(color) => setOptions(prev => ({ ...prev, foregroundColor: color }))}
                placeholder="#000000"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
          
          <View style={styles.colorSection}>
            <ThemedText style={styles.label}>Background</ThemedText>
            <View style={styles.colorInputContainer}>
              <View
                style={[styles.colorPreview, { backgroundColor: options.backgroundColor }]}
              />
              <TextInput
                style={[styles.colorInput, validationErrors.backgroundColor && styles.errorInput]}
                value={options.backgroundColor}
                onChangeText={(color) => setOptions(prev => ({ ...prev, backgroundColor: color }))}
                placeholder="#FFFFFF"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.label}>Corner Radius: {options.cornerRadius}px</ThemedText>
        <View style={styles.sliderContainer}>
          <ThemedText style={styles.sliderLabel}>0px</ThemedText>
          <View style={styles.sliderTrack}>
            <View 
              style={[
                styles.sliderFill, 
                { width: `${(options.cornerRadius / 50) * 100}%` }
              ]} 
            />
            <View 
              style={[
                styles.sliderThumb, 
                { left: `${(options.cornerRadius / 50) * 100}%` }
              ]} 
            />
          </View>
          <ThemedText style={styles.sliderLabel}>50px</ThemedText>
        </View>
        <View style={styles.sizeButtons}>
          {[0, 5, 10, 15, 20, 30, 50].map((radius) => (
            <TouchableOpacity
              key={radius}
              style={[
                styles.sizeButton,
                options.cornerRadius === radius && styles.activeSizeButton,
              ]}
              onPress={() => setOptions(prev => ({ ...prev, cornerRadius: radius }))}
            >
              <ThemedText
                style={[
                  styles.sizeButtonText,
                  options.cornerRadius === radius && styles.activeSizeButtonText,
                ]}
              >
                {radius}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.switchRow}>
          <ThemedText style={styles.label}>Use Gradient</ThemedText>
          <Switch
            value={useGradient}
            onValueChange={setUseGradient}
          />
        </View>
        
        {useGradient && (
          <View style={styles.gradientOptions}>
            <View style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.gradientTypeButton,
                  gradientType === 'linear' && styles.selectedGradientType,
                ]}
                onPress={() => setGradientType('linear')}
              >
                <ThemedText>Linear</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.gradientTypeButton,
                  gradientType === 'radial' && styles.selectedGradientType,
                ]}
                onPress={() => setGradientType('radial')}
              >
                <ThemedText>Radial</ThemedText>
              </TouchableOpacity>
            </View>
            
            {gradientType === 'linear' && (
              <View>
                <ThemedText style={styles.label}>Angle: {gradientAngle}°</ThemedText>
                <TextInput
                  style={styles.sliderInput}
                  value={gradientAngle.toString()}
                  onChangeText={(text) => {
                    const angle = parseInt(text) || 0;
                    setGradientAngle(angle % 360);
                  }}
                  keyboardType="numeric"
                />
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.label}>Logo</ThemedText>
        <TouchableOpacity style={styles.logoUploadButton} onPress={handleLogoUpload}>
          <MaterialIcons name="upload" size={24} color="#6b7280" />
          <ThemedText style={styles.logoUploadText}>
            {options.logo?.imageData ? 'Change Logo' : 'Upload Logo'}
          </ThemedText>
        </TouchableOpacity>
        
        {options.logo?.imageData && (
          <View style={styles.logoOptions}>
            <View style={styles.logoSizeSection}>
              <ThemedText style={styles.logoOptionLabel}>Logo Size: {options.logo.size}px</ThemedText>
              <View style={styles.logoSizeContainer}>
                <ThemedText style={styles.sliderLabel}>20px</ThemedText>
                <View style={styles.sliderTrack}>
                  <View 
                    style={[
                      styles.sliderFill, 
                      { width: `${((options.logo.size - 20) / (100 - 20)) * 100}%` }
                    ]} 
                  />
                  <View 
                    style={[
                      styles.sliderThumb, 
                      { left: `${((options.logo.size - 20) / (100 - 20)) * 100}%` }
                    ]} 
                  />
                </View>
                <ThemedText style={styles.sliderLabel}>100px</ThemedText>
              </View>
              <View style={styles.logoSizeButtons}>
                {[20, 30, 40, 50, 60, 80, 100].map((size) => (
                  <TouchableOpacity
                    key={size}
                    style={[
                      styles.logoSizeButton,
                      options.logo?.size === size && styles.activeLogoSizeButton,
                    ]}
                    onPress={() => {
                      setOptions(prev => ({
                        ...prev,
                        logo: prev.logo ? { ...prev.logo, size } : undefined,
                      }));
                    }}
                  >
                    <ThemedText
                      style={[
                        styles.logoSizeButtonText,
                        options.logo?.size === size && styles.activeLogoSizeButtonText,
                      ]}
                    >
                      {size}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <View style={styles.logoPositionGrid}>
              <ThemedText style={styles.label}>Position</ThemedText>
              <View style={styles.positionGrid}>
                {[
                  { key: 'top-left', label: 'TL' },
                  { key: 'top-right', label: 'TR' },
                  { key: 'center', label: 'C' },
                  { key: 'bottom-left', label: 'BL' },
                  { key: 'bottom-right', label: 'BR' },
                ].map((pos) => (
                  <TouchableOpacity
                    key={pos.key}
                    style={[
                      styles.positionButton,
                      options.logo?.position === pos.key && styles.selectedPosition,
                    ]}
                    onPress={() => {
                      setOptions(prev => ({
                        ...prev,
                        logo: prev.logo ? { ...prev.logo, position: pos.key as any } : undefined,
                      }));
                    }}
                  >
                    <ThemedText style={styles.positionText}>{pos.label}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Scanning Optimization Section */}
            <View style={styles.scanOptimizationSection}>
              <View style={styles.scanOptimizationHeader}>
                <MaterialIcons name="qr-code-scanner" size={20} color="#10B981" />
                <ThemedText style={styles.scanOptimizationTitle}>📱 Scan Optimization</ThemedText>
              </View>
              <ThemedText style={styles.scanOptimizationDescription}>
                Enhance QR code scannability while preserving your branding
              </ThemedText>
              
              <View style={styles.optimizationOptions}>
                <TouchableOpacity
                  style={[
                    styles.optimizationOption,
                    options.logo?.whiteBackground !== false && styles.selectedOptimization,
                  ]}
                  onPress={() => {
                    setOptions(prev => ({
                      ...prev,
                      logo: prev.logo ? { 
                        ...prev.logo, 
                        whiteBackground: prev.logo.whiteBackground === false ? true : false 
                      } : undefined,
                    }));
                  }}
                >
                  <MaterialIcons 
                    name="brightness-7" 
                    size={18} 
                    color={options.logo?.whiteBackground !== false ? '#10B981' : '#6b7280'} 
                  />
                  <View style={styles.optimizationTextContainer}>
                    <ThemedText style={styles.optimizationOptionText}>White Background</ThemedText>
                    <ThemedText style={styles.optimizationOptionDesc}>Improves contrast</ThemedText>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.optimizationOption,
                    options.logo?.contrastBorder && styles.selectedOptimization,
                  ]}
                  onPress={() => {
                    setOptions(prev => ({
                      ...prev,
                      logo: prev.logo ? { 
                        ...prev.logo, 
                        contrastBorder: !prev.logo.contrastBorder 
                      } : undefined,
                    }));
                  }}
                >
                  <MaterialIcons 
                    name="border-outer" 
                    size={18} 
                    color={options.logo?.contrastBorder ? '#10B981' : '#6b7280'} 
                  />
                  <View style={styles.optimizationTextContainer}>
                    <ThemedText style={styles.optimizationOptionText}>Enhanced Border</ThemedText>
                    <ThemedText style={styles.optimizationOptionDesc}>Better definition</ThemedText>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.optimizationOption,
                    options.logo?.quietZone && styles.selectedOptimization,
                  ]}
                  onPress={() => {
                    setOptions(prev => ({
                      ...prev,
                      logo: prev.logo ? { 
                        ...prev.logo, 
                        quietZone: !prev.logo.quietZone 
                      } : undefined,
                    }));
                  }}
                >
                  <MaterialIcons 
                    name="crop-free" 
                    size={18} 
                    color={options.logo?.quietZone ? '#10B981' : '#6b7280'} 
                  />
                  <View style={styles.optimizationTextContainer}>
                    <ThemedText style={styles.optimizationOptionText}>Quiet Zone</ThemedText>
                    <ThemedText style={styles.optimizationOptionDesc}>Extra border space</ThemedText>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.scanTip}>
                <MaterialIcons name="lightbulb" size={16} color="#f59e0b" />
                <ThemedText style={styles.scanTipText}>
                  💡 Tip: Center position with white background works best for scanning
                </ThemedText>
              </View>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderAIColorsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <View style={styles.aiHeader}>
          <ThemedText style={styles.sectionTitle}>AI Color Suggestions</ThemedText>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateAIColors}
            disabled={aiLoading}
          >
            <MaterialIcons
              name="auto-awesome"
              size={20}
              color="#fff"
            />
            <ThemedText style={styles.generateButtonText}>
              {aiLoading ? 'Generating...' : 'Generate'}
            </ThemedText>
          </TouchableOpacity>
        </View>
        
        <ThemedText style={styles.aiDescription}>
          AI-powered color combinations optimized for your content type and readability.
        </ThemedText>
        
        {/* Status message for quota exceeded */}
        {colorSuggestions.length > 0 && colorSuggestions[0].name.includes('Fallback') && (
          <View style={styles.quotaWarning}>
            <MaterialIcons name="info" size={16} color="#f59e0b" />
            <ThemedText style={styles.quotaWarningText}>
              ⏰ AI quota exceeded. Using curated color suggestions.
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.colorSuggestions}>
        {colorSuggestions.map((suggestion, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.colorSuggestion,
              selectedColorIndex === index && styles.selectedColorSuggestion,
            ]}
            onPress={() => selectColorSuggestion(index)}
          >
            <View style={styles.colorPreviewRow}>
              <View
                style={[
                  styles.colorSwatch,
                  { backgroundColor: suggestion.foregroundColor },
                ]}
              />
              <View
                style={[
                  styles.colorSwatch,
                  { backgroundColor: suggestion.backgroundColor },
                ]}
              />
            </View>
            <View style={styles.colorInfo}>
              <Text style={styles.colorName}>{suggestion.name}</Text>
              <Text style={styles.colorDescription}>
                {suggestion.description}
              </Text>
              <View style={styles.colorCategory}>
                <Text style={styles.categoryText}>
                  {suggestion.category}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const getContentPlaceholder = () => {
    switch (contentType) {
      case 'url': return 'https://example.com';
      case 'email': return 'user@example.com';
      case 'phone': return '+1234567890';
      case 'text': return 'Enter your text here';
      default: return 'Enter content';
    }
  };

  const getFinalContent = () => {
    let finalContent = content;
    
    // Handle playlist and slideshow selections
    if (contentType === 'playlist' && selectedPlaylist) {
      finalContent = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/playlist-access/${selectedPlaylist.id}`;
    } else if (contentType === 'slideshow' && selectedSlideshow) {
      finalContent = `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/slideshow-access/${selectedSlideshow.id}`;
    }

    if (useGradient) {
      return {
        content: finalContent,
        ...options,
        gradientColors: {
          startColor: options.foregroundColor,
          endColor: options.backgroundColor,
          type: gradientType,
          angle: gradientAngle,
        },
      };
    }
    return {
      content: finalContent,
      ...options,
    };
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>
          <ThemedText style={styles.title}>Advanced QR Designer</ThemedText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: '#dc2626' }]}
              onPress={() => {
                console.log('🧪 DEBUG BUTTON PRESSED!');
                console.log('🧪 Current state:', { name, contentType, content, loading });
                Alert.alert('Debug', `Name: "${name}", Type: "${contentType}", Content: "${content}"`);
              }}
            >
              <ThemedText style={styles.createButtonText}>Debug</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: '#16a34a' }]}
              onPress={async () => {
                console.log('🚀 QUICK TEST BUTTON PRESSED!');
                setLoading(true);
                try {
                  const testQrData = {
                    name: 'Test QR Code',
                    url: 'https://google.com',
                    description: 'Quick test QR code',
                    contentType: 'url' as ContentType,
                    options: {
                      size: 200,
                      foregroundColor: '#000000',
                      backgroundColor: '#FFFFFF',
                      cornerRadius: 0,
                      errorCorrectionLevel: 'H' as const,
                    },
                  };
                  console.log('🚀 Creating test QR with data:', testQrData);
                  const result = await qrCodeService.createQRCode(testQrData);
                  console.log('✅ Test QR created successfully:', result);
                  Alert.alert('Success', 'Test QR code created successfully!');
                  onQRCreated();
                  onClose();
                } catch (error: any) {
                  console.error('❌ Test QR creation failed:', error);
                  Alert.alert('Error', `Test QR creation failed: ${error.message}`);
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              <ThemedText style={styles.createButtonText}>Quick Test</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.createButton, 
                (loading || getScannabilityScore() < 60) && styles.disabledButton,
                getScannabilityScore() < 60 && styles.criticalButton
              ]}
              onPress={() => {
                console.log('🔘 CREATE BUTTON TOUCHED!');
                console.log('🔘 Loading state:', loading);
                console.log('🔘 Scannability score:', getScannabilityScore());
                console.log('🔘 Button disabled:', loading || getScannabilityScore() < 60);
                handleCreate();
              }}
              disabled={loading || getScannabilityScore() < 60}
            >
              <ThemedText style={[
                styles.createButtonText,
                getScannabilityScore() < 60 && styles.criticalButtonText
              ]}>
                {loading ? 'Creating...' : 
                 getScannabilityScore() < 60 ? 'Fix Issues to Create' : 
                 'Create'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.previewSection}>
            <ThemedText style={styles.previewTitle}>Preview</ThemedText>
            <View style={styles.previewContainer}>
              <View ref={qrRef} style={styles.qrWrapper}>
                <AdvancedQRCodeGenerator
                  value={(() => {
                    if (contentType === 'playlist' && selectedPlaylist) {
                      return `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/playlist-access/${selectedPlaylist.id}`;
                    } else if (contentType === 'slideshow' && selectedSlideshow) {
                      return `${process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001'}/slideshow-access/${selectedSlideshow.id}`;
                    }
                    return content || 'https://example.com';
                  })()}
                  size={options.size}
                  fgColor={options.foregroundColor}
                  bgColor={options.backgroundColor}
                  cornerRadius={options.cornerRadius}
                  logoOptions={options.logo}
                  gradientColors={useGradient ? {
                    startColor: options.foregroundColor,
                    endColor: options.backgroundColor,
                    type: gradientType,
                    angle: gradientAngle,
                  } : undefined}
                  optimizeForScanning={true}
                  level="H"
                />
              </View>
              
              {/* Scannability Indicator */}
              <View style={styles.scannabilityIndicator}>
                <View style={styles.scannabilityHeader}>
                  <MaterialIcons 
                    name="qr-code-scanner" 
                    size={16} 
                    color={getScannabilityScore() >= 80 ? '#10b981' : getScannabilityScore() >= 60 ? '#f59e0b' : '#ef4444'} 
                  />
                  <ThemedText style={[
                    styles.scannabilityTitle,
                    { color: getScannabilityScore() >= 80 ? '#10b981' : getScannabilityScore() >= 60 ? '#f59e0b' : '#ef4444' }
                  ]}>
                    Scannability: {getScannabilityScore()}/100
                  </ThemedText>
                  {Object.keys(scannabilityWarnings).length > 0 && (
                    <TouchableOpacity
                      style={styles.autoFixButton}
                      onPress={autoFixScannability}
                    >
                      <MaterialIcons name="auto-fix-high" size={14} color="#2563eb" />
                      <ThemedText style={styles.autoFixButtonText}>Auto-Fix</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
                
                {/* Progress Bar */}
                <View style={styles.scannabilityBar}>
                  <View 
                    style={[
                      styles.scannabilityProgress,
                      { 
                        width: `${getScannabilityScore()}%`,
                        backgroundColor: getScannabilityScore() >= 80 ? '#10b981' : getScannabilityScore() >= 60 ? '#f59e0b' : '#ef4444'
                      }
                    ]} 
                  />
                </View>

                {/* Warning Messages */}
                {Object.keys(scannabilityWarnings).length > 0 && (
                  <View style={styles.warningsList}>
                    {scannabilityWarnings.logoTooLarge && (
                      <View style={styles.warningItem}>
                        <MaterialIcons name="warning" size={12} color="#f59e0b" />
                        <ThemedText style={styles.warningText}>Logo too large (reduce size)</ThemedText>
                      </View>
                    )}
                    {scannabilityWarnings.lowContrast && (
                      <View style={styles.warningItem}>
                        <MaterialIcons name="contrast" size={12} color="#f59e0b" />
                        <ThemedText style={styles.warningText}>Low contrast colors</ThemedText>
                      </View>
                    )}
                    {scannabilityWarnings.complexGradient && (
                      <View style={styles.warningItem}>
                        <MaterialIcons name="gradient" size={12} color="#f59e0b" />
                        <ThemedText style={styles.warningText}>Complex gradient</ThemedText>
                      </View>
                    )}
                    {scannabilityWarnings.cornerPosition && (
                      <View style={styles.warningItem}>
                        <MaterialIcons name="crop-free" size={12} color="#f59e0b" />
                        <ThemedText style={styles.warningText}>Large corner logo</ThemedText>
                      </View>
                    )}
                    {scannabilityWarnings.smallQRSize && (
                      <View style={styles.warningItem}>
                        <MaterialIcons name="photo-size-select-small" size={12} color="#f59e0b" />
                        <ThemedText style={styles.warningText}>QR code too small</ThemedText>
                      </View>
                    )}
                  </View>
                )}
                
                {Object.keys(scannabilityWarnings).length === 0 && (
                  <View style={styles.successMessage}>
                    <MaterialIcons name="check-circle" size={12} color="#10b981" />
                    <ThemedText style={styles.successText}>Optimized for scanning</ThemedText>
                  </View>
                )}

                {/* Critical Warning Banner */}
                {getScannabilityScore() < 60 && (
                  <View style={styles.criticalWarningBanner}>
                    <MaterialIcons name="error" size={16} color="#dc2626" />
                    <View style={styles.criticalWarningContent}>
                      <ThemedText style={styles.criticalWarningTitle}>
                        🚫 Cannot Create - Critical Issues
                      </ThemedText>
                      <ThemedText style={styles.criticalWarningText}>
                        This QR code will NOT scan properly. Fix the issues above to proceed.
                      </ThemedText>
                    </View>
                  </View>
                )}
              </View>
              
              {/* Download Section */}
              <View style={styles.downloadSection}>
                <TouchableOpacity 
                  style={[styles.downloadButton, downloadLoading && styles.disabledButton]}
                  onPress={() => setDownloadDropdownVisible(!downloadDropdownVisible)}
                  disabled={downloadLoading}
                >
                  <MaterialIcons 
                    name="file-download" 
                    size={20} 
                    color="#2563eb" 
                  />
                  <ThemedText style={styles.downloadButtonText}>
                    {downloadLoading ? 'Downloading...' : 'Download'}
                  </ThemedText>
                  <MaterialIcons 
                    name={downloadDropdownVisible ? "expand-less" : "expand-more"} 
                    size={20} 
                    color="#2563eb" 
                  />
                </TouchableOpacity>

                {downloadDropdownVisible && (
                  <View style={styles.downloadDropdown}>
                    <TouchableOpacity 
                      style={styles.downloadOption}
                      onPress={() => handleDownload(QRCodeFormat.PNG)}
                    >
                      <MaterialIcons name="image" size={18} color="#059669" />
                      <ThemedText style={styles.downloadOptionText}>PNG</ThemedText>
                      <ThemedText style={styles.downloadOptionDesc}>High quality image</ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.downloadOption}
                      onPress={() => handleDownload(QRCodeFormat.SVG)}
                    >
                      <MaterialIcons name="vector-square" size={18} color="#7c3aed" />
                      <ThemedText style={styles.downloadOptionText}>SVG</ThemedText>
                      <ThemedText style={styles.downloadOptionDesc}>Vector format</ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.downloadOption}
                      onPress={() => handleDownload(QRCodeFormat.PDF)}
                    >
                      <MaterialIcons name="picture-as-pdf" size={18} color="#dc2626" />
                      <ThemedText style={styles.downloadOptionText}>PDF</ThemedText>
                      <ThemedText style={styles.downloadOptionDesc}>Document format</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.editorSection}>
            {renderTabBar()}
            {activeTab === 'content' && renderContentTab()}
            {activeTab === 'design' && renderDesignTab()}
            {activeTab === 'ai-colors' && renderAIColorsTab()}
          </View>
        </View>
      </ThemedView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  previewSection: {
    flex: 1,
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  previewContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 20,
  },
  editorSection: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    color: '#6b7280',
  },
  activeTabText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#ffffff',
    backgroundColor: '#374151',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  contentTypeScroll: {
    marginTop: 8,
  },
  contentTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    gap: 6,
  },
  selectedContentType: {
    backgroundColor: '#dbeafe',
  },
  contentTypeText: {
    fontSize: 14,
    color: '#6b7280',
  },
  selectedContentTypeText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sliderTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    top: -6,
    width: 18,
    height: 18,
    backgroundColor: '#2563eb',
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    marginLeft: -9,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#6b7280',
    minWidth: 40,
  },
  sizeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sizeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  activeSizeButton: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  sizeButtonText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  activeSizeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  colorSection: {
    flex: 1,
  },
  colorInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorPreview: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  colorInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 8,
    color: '#1f2937',
    backgroundColor: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gradientOptions: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  gradientTypeButton: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  selectedGradientType: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  logoUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 8,
    gap: 8,
  },
  logoUploadText: {
    color: '#6b7280',
  },
  logoOptions: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  logoSizeSection: {
    marginBottom: 16,
  },
  logoOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  logoSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  logoSizeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  logoSizeButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  activeLogoSizeButton: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  logoSizeButtonText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  activeLogoSizeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  logoPositionGrid: {
    marginTop: 8,
  },
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  positionButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPosition: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  positionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  aiDescription: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 16,
  },
  colorSuggestions: {
    gap: 12,
  },
  colorSuggestion: {
    flexDirection: 'row',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    gap: 12,
  },
  selectedColorSuggestion: {
    borderColor: '#2563eb',
    backgroundColor: '#f0f9ff',
  },
  colorPreviewRow: {
    flexDirection: 'row',
    gap: 4,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  colorInfo: {
    flex: 1,
  },
  colorName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
    color: '#1f2937',
  },
  colorDescription: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  colorCategory: {
    alignSelf: 'flex-start',
  },
  categoryText: {
    fontSize: 10,
    color: '#2563eb',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  // Content selection styles
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
  contentScroll: {
    marginTop: 8,
  },
  contentCard: {
    width: 120,
    padding: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  selectedContentCard: {
    borderColor: '#2563eb',
    backgroundColor: '#f0f9ff',
  },
  contentCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  selectedContentCardText: {
    color: '#2563eb',
  },
  contentCardSubtext: {
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'center',
  },
  errorInput: {
    borderColor: '#dc2626',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 12,
    marginTop: 4,
  },
  qrWrapper: {
    flex: 1,
  },
  downloadSection: {
    width: '100%',
    position: 'relative',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    gap: 8,
  },
  downloadButtonText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
  downloadDropdown: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1000,
  },
  downloadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  downloadOptionText: {
    color: '#1f2937',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  downloadOptionDesc: {
    color: '#6b7280',
    fontSize: 12,
  },
  // Scanning optimization styles
  scanOptimizationSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  scanOptimizationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  scanOptimizationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  scanOptimizationDescription: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
  },
  optimizationOptions: {
    gap: 8,
  },
  optimizationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    gap: 10,
  },
  selectedOptimization: {
    borderColor: '#10B981',
    backgroundColor: '#ecfdf5',
  },
  optimizationTextContainer: {
    flex: 1,
  },
  optimizationOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  optimizationOptionDesc: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
  },
  scanTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  scanTipText: {
    fontSize: 11,
    color: '#92400e',
    flex: 1,
  },
  scannabilityIndicator: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  scannabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  scannabilityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  autoFixButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  autoFixButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  scannabilityBar: {
    height: 20,
    backgroundColor: '#e5e7eb',
    borderRadius: 10,
    marginBottom: 12,
  },
  scannabilityProgress: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 10,
  },
  warningsList: {
    marginTop: 8,
  },
  warningItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  warningText: {
    color: '#6b7280',
    fontSize: 12,
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  successText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  criticalButton: {
    backgroundColor: '#dc2626',
  },
  criticalButtonText: {
    color: '#fff',
  },
  criticalWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  criticalWarningContent: {
    flex: 1,
  },
  criticalWarningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  criticalWarningText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  quotaWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    padding: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  quotaWarningText: {
    color: '#854d0e',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default AdvancedQREditor; 