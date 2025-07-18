// Example: How to integrate the Upload Notification Center into your app

import React from 'react';
import { View } from 'react-native';
import { UploadProvider } from '@/contexts/UploadContext';
import UploadNotificationCenter from '@/components/UploadNotificationCenter';
import YourExistingComponent from '@/components/YourExistingComponent';

// 1. Wrap your app (or the screens that use uploads) with UploadProvider
export default function App() {
  return (
    <UploadProvider>
      <View style={{ flex: 1 }}>
        {/* Your existing app content */}
        <YourExistingComponent />
        
        {/* Add the notification center - it will handle its own visibility */}
        <UploadNotificationCenter />
      </View>
    </UploadProvider>
  );
}

// 2. In any component that needs to upload files, use the enhanced hook
import { useMediaUpload } from '@/hooks/useMediaUpload';

function MediaUploadComponent() {
  const { selectAndUploadFile } = useMediaUpload();
  
  const handleUpload = async () => {
    try {
      // The hook now automatically handles all notifications
      const uploadedFile = await selectAndUploadFile();
      console.log('Upload completed:', uploadedFile);
    } catch (error) {
      // Error notifications are automatically shown
      console.log('Upload was cancelled or failed');
    }
  };
  
  return (
    <TouchableOpacity onPress={handleUpload}>
      <Text>Upload File</Text>
    </TouchableOpacity>
  );
}

// 3. The system will automatically show:
// - Progress indicators during upload
// - Success notifications when upload completes
// - Error notifications with retry options when upload fails
// - Warning notifications for large files
// - All notifications are user-friendly and actionable! 