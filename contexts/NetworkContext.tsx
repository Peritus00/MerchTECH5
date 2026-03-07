/**
 * Network state context - detects offline/online and wires to React Query's onlineManager.
 * Enables pause of non-essential refetches while offline and refetch on reconnect.
 */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';

interface NetworkContextType {
  isOnline: boolean;
  isReconnecting: boolean;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  isReconnecting: false,
});

function useNetworkStateNative() {
  const [isOnline, setIsOnline] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        const NetInfo = await import('@react-native-community/netinfo');
        const unsubscribe = NetInfo.default.addEventListener(async (state) => {
          if (!mounted) return;
          const online = state.isConnected ?? true;
          if (wasOfflineRef.current && online) {
            setIsReconnecting(true);
            try {
              const { flushQueue } = await import('@/services/pendingActionsQueue');
              const flushed = await flushQueue();
              if (flushed > 0) {
                console.log(`Reconnected: replayed ${flushed} queued actions`);
              }
            } catch (e) {
              console.warn('Failed to flush pending actions:', e);
            }
            setTimeout(() => setIsReconnecting(false), 3000);
          }
          wasOfflineRef.current = !online;
          setIsOnline(online);
          onlineManager.setOnline(online);
        });

        const state = await NetInfo.default.fetch();
        const online = state.isConnected ?? true;
        wasOfflineRef.current = !online;
        if (mounted) {
          setIsOnline(online);
          onlineManager.setOnline(online);
        }

        return () => {
          mounted = false;
          unsubscribe();
        };
      } catch (err) {
        if (mounted) {
          onlineManager.setOnline(true);
        }
        return () => {
          mounted = false;
        };
      }
    };

    const cleanup = setup();
    return () => {
      if (typeof cleanup?.then === 'function') {
        cleanup.then((fn) => fn?.());
      }
    };
  }, []);

  return { isOnline, isReconnecting };
}

function useNetworkStateWeb() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setIsReconnecting(true);
      onlineManager.setOnline(true);
      try {
        const { flushQueue } = await import('@/services/pendingActionsQueue');
        const flushed = await flushQueue();
        if (flushed > 0) {
          console.log(`Reconnected: replayed ${flushed} queued actions`);
        }
      } catch (e) {
        console.warn('Failed to flush pending actions:', e);
      }
      setTimeout(() => setIsReconnecting(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      onlineManager.setOnline(false);
    };

    onlineManager.setOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, isReconnecting };
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const state = Platform.OS === 'web' ? useNetworkStateWeb() : useNetworkStateNative();

  return (
    <NetworkContext.Provider value={state}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
