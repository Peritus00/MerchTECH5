import React, { createContext, useState, useContext, ReactNode } from 'react';

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  stage: 'selecting' | 'reading' | 'uploading' | 'processing' | 'complete';
}

interface UploadContextType {
  uploadProgress: UploadProgress;
  isUploading: boolean;
  setUploadProgress: React.Dispatch<React.SetStateAction<UploadProgress>>;
  setIsUploading: React.Dispatch<React.SetStateAction<boolean>>;
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

  return (
    <UploadContext.Provider value={{ uploadProgress, setUploadProgress, isUploading, setIsUploading }}>
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