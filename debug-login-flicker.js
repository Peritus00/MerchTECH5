/**
 * Debug script to help identify login screen flickering issues
 * 
 * Usage:
 * 1. Add this to your login screen temporarily
 * 2. Monitor console output during login
 * 3. Look for patterns in re-renders
 */

// Add this to app/auth/login.tsx temporarily for debugging

import { useEffect, useRef } from 'react';

// Performance monitoring hook
export function useLoginPerformanceMonitor() {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(Date.now());
  const renderLog = useRef([]);

  useEffect(() => {
    renderCount.current += 1;
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTime.current;
    lastRenderTime.current = now;

    const logEntry = {
      count: renderCount.current,
      timestamp: now,
      timeSinceLastRender,
    };

    renderLog.current.push(logEntry);

    // Log if render happens too quickly (potential flickering)
    if (timeSinceLastRender < 100 && renderCount.current > 1) {
      console.warn('⚠️ Rapid re-render detected:', {
        renderCount: renderCount.current,
        timeSinceLastRender,
        logEntry,
      });
    }

    // Keep only last 20 renders
    if (renderLog.current.length > 20) {
      renderLog.current.shift();
    }

    return () => {
      // Log summary on unmount
      if (renderCount.current > 10) {
        console.log('📊 Login Screen Render Summary:', {
          totalRenders: renderCount.current,
          averageTimeBetweenRenders: 
            renderLog.current.reduce((sum, entry) => sum + entry.timeSinceLastRender, 0) / 
            renderLog.current.length,
          rapidRenders: renderLog.current.filter(e => e.timeSinceLastRender < 100).length,
        });
      }
    };
  });
}

// State change tracker
export function useStateChangeTracker(stateName, value) {
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value) {
      console.log(`🔄 State change [${stateName}]:`, {
        from: prevValue.current,
        to: value,
        timestamp: Date.now(),
      });
      prevValue.current = value;
    }
  }, [stateName, value]);
}

// Example usage in login screen:
/*
import { useLoginPerformanceMonitor, useStateChangeTracker } from '@/debug-login-flicker';

export default function LoginScreen() {
  useLoginPerformanceMonitor();
  
  const { login, isLoading } = useAuth();
  useStateChangeTracker('isLoading', isLoading);
  useStateChangeTracker('isSubmitting', isSubmitting);
  
  // ... rest of component
}
*/

