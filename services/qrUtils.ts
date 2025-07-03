import { Alert, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';

export enum QRCodeFormat {
  PNG = 'png',
  JPG = 'jpg',
  SVG = 'svg',
  PDF = 'pdf'
}

// Web-specific download function
const downloadForWeb = async (
  qrRef: any,
  filename: string,
  format: QRCodeFormat
): Promise<void> => {
  try {
    console.log('🌐 Web platform detected - using browser download');
    console.log('📋 Download params:', { filename, format, qrRef: !!qrRef });
    
    if (!qrRef) {
      console.error('❌ QR ref is null or undefined');
      Alert.alert('Error', 'QR code reference not found');
      return;
    }

    // Get the QR code element
    const qrElement = qrRef;
    console.log('🎯 QR Element:', qrElement);
    
    // Try to find the SVG element within the ref
    const svgElement = qrElement.querySelector('svg');
    console.log('📊 SVG Element found:', !!svgElement);
    
    if (svgElement) {
      console.log('✅ Found SVG element, processing download...');
      
      // Get the computed styles and size
      const rect = qrElement.getBoundingClientRect();
      console.log('📏 Element dimensions:', rect.width, 'x', rect.height);
      
      // Clone the SVG to avoid modifying the original
      const svgClone = svgElement.cloneNode(true) as SVGElement;
      
      // Find any logo images in the QR element
      const logoImages = qrElement.querySelectorAll('img');
      console.log('🖼️ Found logo images:', logoImages.length);
      
      // Process logo images and embed them as data URIs
      const logoPromises = Array.from(logoImages).map(async (img: HTMLImageElement) => {
        try {
          console.log('🔄 Processing logo image:', img.src);
          
          // If it's already a data URI, use it directly
          if (img.src.startsWith('data:')) {
            console.log('✅ Logo is already a data URI');
            return { element: img, dataUri: img.src };
          }
          
          // Convert image to data URI
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) return null;
          
          return new Promise<{ element: HTMLImageElement; dataUri: string } | null>((resolve) => {
            const tempImg = new Image();
            tempImg.crossOrigin = 'anonymous';
            
            tempImg.onload = () => {
              canvas.width = tempImg.width;
              canvas.height = tempImg.height;
              ctx.drawImage(tempImg, 0, 0);
              
              try {
                const dataUri = canvas.toDataURL('image/png');
                console.log('✅ Logo converted to data URI');
                resolve({ element: img, dataUri });
              } catch (error) {
                console.error('❌ Failed to convert logo to data URI:', error);
                resolve(null);
              }
            };
            
            tempImg.onerror = () => {
              console.error('❌ Failed to load logo image');
              resolve(null);
            };
            
            tempImg.src = img.src;
          });
        } catch (error) {
          console.error('❌ Error processing logo:', error);
          return null;
        }
      });
      
      // Wait for all logos to be processed
      const logoResults = await Promise.all(logoPromises);
      const validLogos = logoResults.filter(result => result !== null);
      console.log('✅ Processed logos:', validLogos.length);
      
      // Ensure SVG has proper dimensions
      const svgWidth = svgElement.getAttribute('width') || rect.width || 300;
      const svgHeight = svgElement.getAttribute('height') || rect.height || 300;
      
      svgClone.setAttribute('width', svgWidth.toString());
      svgClone.setAttribute('height', svgHeight.toString());
      svgClone.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
      
      // Get SVG data with all styles
      let svgData = new XMLSerializer().serializeToString(svgClone);
      console.log('📄 SVG data length:', svgData.length);
      
      if (format === QRCodeFormat.SVG) {
        console.log('🎨 Processing SVG download...');
        // For SVG, download the styled SVG data
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QRCode_${filename}_${Date.now()}.svg`;
        
        console.log('📥 Triggering SVG download:', a.download);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('✅ SVG download completed');
        Alert.alert('Success', `QR code downloaded as ${a.download}`);
        return;
      }
      
      // For PNG/PDF, create enhanced canvas with logos
      console.log('🖼️ Converting to image with logos for', format, 'download...');
      
      // Create a canvas with higher resolution
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('❌ Could not get canvas context');
        Alert.alert('Error', 'Canvas not supported in this browser');
        return;
      }
      
      // Set high resolution
      const scale = 4;
      const outputSize = 1200;
      canvas.width = outputSize;
      canvas.height = outputSize;
      
      // Create an enhanced SVG with embedded styles
      const enhancedSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" 
             xmlns:xlink="http://www.w3.org/1999/xlink"
             width="${outputSize}" 
             height="${outputSize}" 
             viewBox="0 0 ${svgWidth} ${svgHeight}">
          <defs>
            <style type="text/css">
              <![CDATA[
                svg { background: white; }
                .qr-code { width: 100%; height: 100%; }
              ]]>
            </style>
          </defs>
          <rect width="100%" height="100%" fill="white"/>
          ${svgClone.innerHTML}
        </svg>
      `;
      
      console.log('🎨 Enhanced SVG created');
      
      // Create blob and object URL
      const svgBlob = new Blob([enhancedSvg], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = async () => {
        console.log('🖼️ SVG image loaded, drawing to canvas...');
        
        // Clear canvas with white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, outputSize, outputSize);
        
        // Draw the QR code SVG
        ctx.drawImage(img, 0, 0, outputSize, outputSize);
        
        // Now draw the logos on top
        for (const logoResult of validLogos) {
          if (!logoResult) continue;
          
          try {
            console.log('🖼️ Drawing logo on canvas...');
            
            const logoImg = new Image();
            logoImg.crossOrigin = 'anonymous';
            
            await new Promise<void>((resolve, reject) => {
              logoImg.onload = () => {
                // Get logo position and size from the original element
                const logoElement = logoResult.element;
                const logoRect = logoElement.getBoundingClientRect();
                const qrRect = qrElement.getBoundingClientRect();
                
                // Calculate relative position and size
                const relativeX = (logoRect.left - qrRect.left) / qrRect.width;
                const relativeY = (logoRect.top - qrRect.top) / qrRect.height;
                const relativeWidth = logoRect.width / qrRect.width;
                const relativeHeight = logoRect.height / qrRect.height;
                
                // Scale to canvas size
                const canvasX = relativeX * outputSize;
                const canvasY = relativeY * outputSize;
                const canvasWidth = relativeWidth * outputSize;
                const canvasHeight = relativeHeight * outputSize;
                
                console.log('🎯 Drawing logo at:', { canvasX, canvasY, canvasWidth, canvasHeight });
                
                // Draw the logo
                ctx.drawImage(logoImg, canvasX, canvasY, canvasWidth, canvasHeight);
                resolve();
              };
              
              logoImg.onerror = () => {
                console.error('❌ Failed to load logo for drawing');
                resolve(); // Continue even if logo fails
              };
              
              logoImg.src = logoResult.dataUri;
            });
          } catch (error) {
            console.error('❌ Error drawing logo:', error);
          }
        }
        
        console.log('✅ All logos drawn, finalizing download...');
        
        // Convert to blob and download
        let mimeType = 'image/png';
        let fileExtension = 'png';
        
        if (format === QRCodeFormat.PDF) {
          mimeType = 'image/png';
          fileExtension = 'png';
          console.log('📄 PDF format - downloading as high-quality PNG');
        } else if (format === QRCodeFormat.JPG) {
          mimeType = 'image/jpeg';
          fileExtension = 'jpg';
        }
        
        console.log('💾 Converting canvas to blob...', { mimeType, fileExtension });
        
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('✅ Blob created, size:', blob.size, 'bytes');
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `QRCode_${filename}_${Date.now()}.${fileExtension}`;
            
            console.log('📥 Triggering download:', a.download);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('✅ Web download completed with logos');
            Alert.alert('Success', `QR code downloaded as ${a.download}`);
          } else {
            console.error('❌ Failed to create blob from canvas');
            Alert.alert('Error', 'Failed to create download file');
          }
        }, mimeType, 0.95);
        
        URL.revokeObjectURL(svgUrl);
      };
      
      img.onerror = (error) => {
        console.error('❌ Failed to load SVG image:', error);
        URL.revokeObjectURL(svgUrl);
        
        // Fallback: try to use the original approach
        console.log('🔄 Trying fallback approach...');
        fallbackDownload(qrElement, filename, format);
      };
      
      console.log('🔄 Loading enhanced SVG as image...');
      img.src = svgUrl;
    } else {
      console.error('❌ No SVG element found in QR code ref');
      console.log('🔍 Available elements in ref:', qrElement.children);
      
      // Try fallback approach
      fallbackDownload(qrElement, filename, format);
    }
    
  } catch (error) {
    console.error('❌ Web download failed:', error);
    Alert.alert('Error', `Failed to download QR code: ${error.message || 'Unknown error'}`);
  }
};

// Fallback download function using different approach
const fallbackDownload = async (qrElement: any, filename: string, format: QRCodeFormat) => {
  try {
    console.log('🔄 Using fallback download approach...');
    
    // Try to capture the entire QR element as is
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      Alert.alert('Error', 'Canvas not supported');
      return;
    }
    
    const rect = qrElement.getBoundingClientRect();
    const scale = 3; // High resolution
    
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    ctx.scale(scale, scale);
    
    // Fill with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, rect.width, rect.height);
    
    // Try to render the element content
    const html = qrElement.outerHTML;
    const svgMatch = html.match(/<svg[^>]*>[\s\S]*?<\/svg>/);
    
    if (svgMatch) {
      const svgString = svgMatch[0];
      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `QRCode_${filename}_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
            
            Alert.alert('Success', `QR code downloaded as ${a.download}`);
          }
        }, 'image/png', 0.95);
        
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
    } else {
      Alert.alert('Error', 'Could not extract QR code for download');
    }
    
  } catch (error) {
    console.error('❌ Fallback download failed:', error);
    Alert.alert('Error', 'All download methods failed');
  }
};

export const downloadQRCode = async (
  qrRef: any,
  filename: string,
  format: QRCodeFormat = QRCodeFormat.PNG
): Promise<void> => {
  try {
    console.log('🔽 Starting QR code download:', { filename, format, platform: Platform.OS });
    
    if (!qrRef) {
      console.error('❌ QR ref is null or undefined');
      Alert.alert('Error', 'QR code reference not found');
      return;
    }

    // Handle web platform differently
    if (Platform.OS === 'web') {
      await downloadForWeb(qrRef, filename, format);
      return;
    }

    // Mobile platform code (iOS/Android)
    console.log('📱 Requesting media library permissions...');
    const { status } = await MediaLibrary.requestPermissionsAsync();
    console.log('📱 Permission status:', status);
    
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Media library permission is required to save QR codes');
      return;
    }

    let uri: string;
    let finalFilename: string;

    if (format === QRCodeFormat.SVG) {
      console.log('🎨 Converting SVG to PNG for compatibility');
      Alert.alert('SVG Export', 'SVG export will be saved as high-quality PNG for compatibility');
      format = QRCodeFormat.PNG;
    }

    console.log('📸 Capturing QR code image...');
    // Capture the QR code as image
    uri = await captureRef(qrRef, {
      format: format === QRCodeFormat.PDF ? 'png' : format,
      quality: 1.0,
      width: 1200, // High resolution
      height: 1200,
    });

    console.log('✅ QR code captured successfully, URI:', uri);
    finalFilename = `QRCode_${filename}_${Date.now()}.${format}`;

    if (format === QRCodeFormat.PDF) {
      console.log('📄 Handling PDF export via sharing...');
      // For PDF, we'll share the high-quality PNG with PDF extension
      await shareQRCode(uri, `${filename}.pdf`);
      Alert.alert('PDF Export', 'QR code exported as high-quality image for PDF compatibility');
    } else {
      console.log('💾 Saving to media library...');
      // Save to media library
      const asset = await MediaLibrary.createAssetAsync(uri);
      console.log('✅ Asset created:', asset.id);
      
      // Try to create album, but don't fail if it doesn't work
      try {
        await MediaLibrary.createAlbumAsync('QR Codes', asset, false);
        console.log('📁 Album created/updated successfully');
      } catch (albumError) {
        console.log('⚠️ Album creation failed, but file saved:', albumError);
      }
      
      Alert.alert('Success', `QR code saved to Photos as ${finalFilename}`);
    }
    
    console.log('🎉 Download completed successfully');
  } catch (error) {
    console.error('❌ Download failed:', error);
    Alert.alert('Error', `Failed to save QR code: ${error.message || 'Unknown error'}`);
  }
};

export const shareQRCode = async (uri: string, filename: string): Promise<void> => {
  try {
    console.log('📤 Starting share process:', { uri, filename });
    
    const isAvailable = await Sharing.isAvailableAsync();
    console.log('📤 Sharing available:', isAvailable);
    
    if (!isAvailable) {
      Alert.alert('Error', 'Sharing is not available on this device');
      return;
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: 'Share QR Code',
    });
    
    console.log('✅ Share completed successfully');
  } catch (error) {
    console.error('❌ Share failed:', error);
    Alert.alert('Error', `Failed to share QR code: ${error.message || 'Unknown error'}`);
  }
};

// Enhanced download function that works with the AdvancedQRCodeGenerator
export const downloadAdvancedQRCode = async (
  qrRef: any,
  qrData: {
    name: string;
    content: string;
    options: any;
  },
  format: QRCodeFormat = QRCodeFormat.PNG
): Promise<void> => {
  try {
    console.log('🚀 Advanced QR download starting:', { name: qrData.name, format });
    
    if (!qrData.name || qrData.name.trim() === '') {
      Alert.alert('Error', 'QR code name is required for download');
      return;
    }
    
    const filename = qrData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    console.log('📝 Sanitized filename:', filename);
    
    await downloadQRCode(qrRef, filename, format);
  } catch (error) {
    console.error('❌ Advanced download failed:', error);
    Alert.alert('Error', `Failed to download QR code: ${error.message || 'Unknown error'}`);
  }
};

export const isValidUrl = (string: string): boolean => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

export const formatContentForType = (content: string, type: string): string => {
  switch (type) {
    case 'email':
      return content.startsWith('mailto:') ? content : `mailto:${content}`;
    case 'phone':
      return content.startsWith('tel:') ? content : `tel:${content}`;
    case 'sms':
      return content.startsWith('sms:') ? content : `sms:${content}`;
    case 'url':
      if (!content.startsWith('http://') && !content.startsWith('https://')) {
        return `https://${content}`;
      }
      return content;
    default:
      return content;
  }
};

export const generateVCard = (contact: {
  name: string;
  organization?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}): string => {
  let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';
  
  if (contact.name) vcard += `FN:${contact.name}\n`;
  if (contact.organization) vcard += `ORG:${contact.organization}\n`;
  if (contact.phone) vcard += `TEL:${contact.phone}\n`;
  if (contact.email) vcard += `EMAIL:${contact.email}\n`;
  if (contact.website) vcard += `URL:${contact.website}\n`;
  if (contact.address) vcard += `ADR:;;${contact.address};;;;\n`;
  
  vcard += 'END:VCARD';
  return vcard;
};

export const generateWiFiQR = (config: {
  ssid: string;
  password: string;
  security: 'WPA' | 'WEP' | 'nopass';
  hidden?: boolean;
}): string => {
  return `WIFI:T:${config.security};S:${config.ssid};P:${config.password};H:${config.hidden ? 'true' : 'false'};;`;
};
