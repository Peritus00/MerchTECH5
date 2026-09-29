import { Platform } from 'react-native';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export function getMetaPixelId(): string {
  return process.env.EXPO_PUBLIC_META_PIXEL_ID?.trim() || '1403052175139220';
}

export function isMetaPixelEnabled(): boolean {
  return Platform.OS === 'web';
}

/** Fire a Meta Pixel standard/custom event (web only). */
export function trackMetaEvent(
  eventName: string,
  params?: Record<string, unknown>,
  eventId?: string
): void {
  if (!isMetaPixelEnabled() || typeof window === 'undefined') {
    return;
  }
  const fbq = window.fbq;
  if (!fbq) {
    return;
  }
  if (eventId) {
    fbq('track', eventName, params ?? {}, { eventID: eventId });
  } else if (params) {
    fbq('track', eventName, params);
  } else {
    fbq('track', eventName);
  }
}

export function trackMetaPageView(): void {
  if (!isMetaPixelEnabled() || typeof window === 'undefined' || !window.fbq) {
    return;
  }
  window.fbq('track', 'PageView');
}

export function trackMetaViewContent(content: {
  contentId: string;
  contentName?: string;
  contentType?: string;
}): void {
  trackMetaEvent('ViewContent', {
    content_ids: [content.contentId],
    content_name: content.contentName,
    content_type: content.contentType || 'product',
  });
}

export function trackMetaPurchase(options: {
  eventId: string;
  value?: number;
  currency?: string;
}): void {
  const params: Record<string, unknown> = {
    currency: (options.currency || 'USD').toUpperCase(),
  };
  if (typeof options.value === 'number' && !Number.isNaN(options.value) && options.value > 0) {
    params.value = options.value;
  }
  trackMetaEvent('Purchase', params, options.eventId);
}

export function trackMetaLead(eventId?: string): void {
  trackMetaEvent('Lead', undefined, eventId);
}
