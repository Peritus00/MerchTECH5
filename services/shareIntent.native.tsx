import React from 'react';
import {
  ShareIntentProvider as ExpoShareIntentProvider,
  useShareIntentContext as useExpoShareIntentContext,
} from 'expo-share-intent';

export function ShareIntentProvider({ children }: { children: React.ReactNode }) {
  return <ExpoShareIntentProvider>{children}</ExpoShareIntentProvider>;
}

export const useShareIntentContext = useExpoShareIntentContext;
