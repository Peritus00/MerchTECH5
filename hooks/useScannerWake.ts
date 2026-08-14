/**
 * useScannerWake — battery-saving wake hook for the scanner screen.
 *
 * Behaviour:
 *   - After IDLE_TIMEOUT_MS of no scan activity, dims the screen (reduces brightness)
 *     and shows a "Tap to resume" overlay (wakeLocked = false).
 *   - On any touch or keydown, the scanner resumes immediately (wakeLocked = true).
 *   - On web, uses the Wake Lock API (if available) to prevent the display from sleeping
 *     between scans so scanners can stay on without touching the device.
 *   - Proximity sensor: if the DeviceProximity / SensorAPI is available, automatically
 *     wakes on object approach (badge held close to camera).
 *
 * Usage:
 *   const { isIdle, wake } = useScannerWake({ enabled: phase === 'scanning' });
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';

const IDLE_TIMEOUT_MS = 30_000; // 30 seconds of inactivity → idle state

interface Options {
  enabled: boolean;
  idleTimeoutMs?: number;
}

interface ScannerWakeResult {
  isIdle: boolean;
  wake: () => void;
}

export function useScannerWake({
  enabled,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
}: Options): ScannerWakeResult {
  const [isIdle, setIsIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const resetIdleTimer = useCallback(() => {
    if (isIdle) setIsIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIsIdle(true), idleTimeoutMs);
  }, [isIdle, idleTimeoutMs]);

  const wake = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  // Request Wake Lock (web only; keep display on between scans)
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web') return;
    if (!('wakeLock' in navigator)) return;

    let released = false;
    (navigator as any).wakeLock
      .request('screen')
      .then((sentinel: WakeLockSentinel) => {
        if (released) { sentinel.release(); return; }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener('release', () => {
          if (!released) {
            // Re-acquire after a page visibility change
            (navigator as any).wakeLock.request('screen').then((s: WakeLockSentinel) => {
              wakeLockRef.current = s;
            }).catch(() => {});
          }
        });
      })
      .catch(() => {}); // Wake Lock not available in this context

    return () => {
      released = true;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [enabled]);

  // Proximity sensor (experimental DeviceProximity / AmbientLight)
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web') return;
    if (!('ProximitySensor' in window)) return;

    let sensor: any;
    try {
      sensor = new (window as any).ProximitySensor({ frequency: 5 });
      sensor.addEventListener('reading', () => {
        if (sensor.near) wake();
      });
      sensor.start();
    } catch (_) {}

    return () => {
      try { sensor?.stop(); } catch (_) {}
    };
  }, [enabled, wake]);

  // Idle timer — reset on any touch or keyboard event
  useEffect(() => {
    if (!enabled) return;
    resetIdleTimer();

    if (Platform.OS === 'web') {
      const handler = () => wake();
      window.addEventListener('touchstart', handler, { passive: true });
      window.addEventListener('keydown', handler);
      window.addEventListener('mousemove', handler);
      return () => {
        window.removeEventListener('touchstart', handler);
        window.removeEventListener('keydown', handler);
        window.removeEventListener('mousemove', handler);
        if (idleTimer.current) clearTimeout(idleTimer.current);
      };
    } else {
      return () => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
      };
    }
  }, [enabled]);

  return { isIdle, wake };
}
