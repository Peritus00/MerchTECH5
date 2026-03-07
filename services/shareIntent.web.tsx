import React from 'react';

type WebShareIntentFile = {
  mimeType?: string;
  fileName?: string;
  size?: number;
  path?: string | null;
};

type WebShareIntentContextValue = {
  hasShareIntent: boolean;
  isReady: boolean;
  shareIntent: { files: WebShareIntentFile[] };
  resetShareIntent: () => void;
  error: string | null;
};

const defaultContextValue: WebShareIntentContextValue = {
  hasShareIntent: false,
  isReady: true,
  shareIntent: { files: [] },
  resetShareIntent: () => {},
  error: null,
};

export function ShareIntentProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useShareIntentContext(): WebShareIntentContextValue {
  return defaultContextValue;
}
