import React, { createContext, useState, useContext, ReactNode } from 'react';

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  stage: 'selecting' | 'reading' | 'uploading' | 'processing' | 'complete' | 'error';
}

interface UploadError {
  message: string;
  code?: string;
  details?: any;
}

interface UploadNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  duration?: number; // Auto-dismiss after this many milliseconds
  actions?: Array<{
    label: string;
    onPress: () => void;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
}

interface UploadContextType {
  uploadProgress: UploadProgress;
  isUploading: boolean;
  uploadError: UploadError | null;
  notifications: UploadNotification[];
  currentFileName: string | null;
  estimatedTimeRemaining: number | null; // in seconds
  setUploadProgress: React.Dispatch<React.SetStateAction<UploadProgress>>;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
  setUploadError: React.Dispatch<React.SetStateAction<UploadError | null>>;
  setCurrentFileName: React.Dispatch<React.SetStateAction<string | null>>;
  setEstimatedTimeRemaining: React.Dispatch<React.SetStateAction<number | null>>;
  addNotification: (notification: Omit<UploadNotification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  showUploadError: (error: UploadError, fileName?: string) => void;
  showUploadSuccess: (fileName: string) => void;
  showUploadWarning: (message: string, fileName?: string) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const UploadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    loaded: 0,
    total: 0,
    percentage: 0,
    stage: 'selecting',
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [notifications, setNotifications] = useState<UploadNotification[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);

  const addNotification = (notification: Omit<UploadNotification, 'id' | 'timestamp'>) => {
    const newNotification: UploadNotification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    
    setNotifications(prev => [...prev, newNotification]);
    
    // Auto-dismiss after specified duration
    if (notification.duration) {
      setTimeout(() => {
        removeNotification(newNotification.id);
      }, notification.duration);
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const showUploadError = (error: UploadError, fileName?: string) => {
    setUploadError(error);
    setUploadProgress(prev => ({ ...prev, stage: 'error' }));
    
    // Create user-friendly error message
    let userMessage = error.message;
    let actions: UploadNotification['actions'] = [];
    
    if (error.code === 'BUFFER_TRUNCATED') {
      userMessage = 'The file was corrupted during upload. This might be due to network issues or the file being too large.';
      actions = [
        {
          label: 'Try Again',
          onPress: () => {
            // This will be handled by the upload component
            console.log('User chose to retry upload');
          },
          style: 'primary'
        },
        {
          label: 'Choose Different File',
          onPress: () => {
            // This will be handled by the upload component
            console.log('User chose to select different file');
          },
          style: 'secondary'
        }
      ];
    } else if (error.code === 'FILE_TOO_LARGE') {
      userMessage = 'The file is too large. Please choose a smaller file or compress it.';
    } else if (error.code === 'UPLOAD_INCOMPLETE') {
      userMessage = 'The upload was incomplete. Please check your internet connection and try again.';
      actions = [
        {
          label: 'Retry Upload',
          onPress: () => {
            console.log('User chose to retry incomplete upload');
          },
          style: 'primary'
        }
      ];
    } else if (error.code === 'FILE_SIZE_MISMATCH') {
      userMessage = 'The file size doesn\'t match what was expected. The file may be corrupted.';
    }
    
    addNotification({
      type: 'error',
      title: `Upload Failed${fileName ? `: ${fileName}` : ''}`,
      message: userMessage,
      actions,
    });
  };

  const showUploadSuccess = (fileName: string) => {
    addNotification({
      type: 'success',
      title: 'Upload Successful',
      message: `"${fileName}" has been uploaded successfully and is ready to use.`,
      duration: 5000, // Auto-dismiss after 5 seconds
    });
  };

  const showUploadWarning = (message: string, fileName?: string) => {
    addNotification({
      type: 'warning',
      title: `Upload Warning${fileName ? `: ${fileName}` : ''}`,
      message,
      duration: 8000, // Auto-dismiss after 8 seconds
    });
  };

  return (
    <UploadContext.Provider value={{ 
      uploadProgress, 
      setUploadProgress, 
      isUploading, 
      setIsUploading,
      uploadError,
      setUploadError,
      notifications,
      currentFileName,
      setCurrentFileName,
      estimatedTimeRemaining,
      setEstimatedTimeRemaining,
      addNotification,
      removeNotification,
      clearNotifications,
      showUploadError,
      showUploadSuccess,
      showUploadWarning,
    }}>
      {children}
    </UploadContext.Provider>
  );
};

export const useUpload = (): UploadContextType => {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
}; 