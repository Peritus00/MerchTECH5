import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export type StripeCheckoutLaunchResult =
  | { status: 'opened'; method: 'web-tab' | 'native-browser' | 'native-linking' }
  | { status: 'blocked'; method: 'web-popup-blocked' };

const WEB_WINDOW_FEATURES = 'noopener,noreferrer';

export type PreparedCheckoutWindow = Window | null;

function prepareWindow(windowRef: Window) {
  try {
    windowRef.opener = null;
  } catch (error) {
    console.warn('Unable to clear checkout window opener:', error);
  }
}

export function prepareStripeCheckoutWindow(): PreparedCheckoutWindow {
  if (typeof window === 'undefined') {
    return null;
  }

  const preOpenedWindow = window.open('', '_blank', WEB_WINDOW_FEATURES);
  if (!preOpenedWindow) {
    return null;
  }

  prepareWindow(preOpenedWindow);
  try {
    preOpenedWindow.document.title = 'Opening checkout...';
  } catch (error) {
    console.warn('Unable to set checkout window title:', error);
  }

  return preOpenedWindow;
}

function openWebCheckoutTab(
  url: string,
  preparedWindow?: PreparedCheckoutWindow
): StripeCheckoutLaunchResult {
  if (typeof window === 'undefined') {
    throw new Error('Window is not available for web checkout');
  }

  const checkoutWindow = preparedWindow ?? window.open(url, '_blank', WEB_WINDOW_FEATURES);

  if (!checkoutWindow) {
    return { status: 'blocked', method: 'web-popup-blocked' };
  }

  prepareWindow(checkoutWindow);
  checkoutWindow.location.href = url;
  checkoutWindow.focus?.();
  return { status: 'opened', method: 'web-tab' };
}

export async function launchStripeCheckout(
  url: string,
  source: string,
  preparedWindow?: PreparedCheckoutWindow
): Promise<StripeCheckoutLaunchResult> {
  if (Platform.OS === 'web') {
    const result = openWebCheckoutTab(url, preparedWindow);
    console.log(`🔗 PAYMENT (${source}): Web checkout launch result:`, result);
    return result;
  }

  if (Platform.OS === 'ios') {
    try {
      const result = await WebBrowser.openBrowserAsync(url, {
        dismissButtonStyle: 'done',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        controlsColor: '#3b82f6',
      });
      console.log(`🔗 PAYMENT (${source}): Opened Stripe checkout in WebBrowser:`, result);
      return { status: 'opened', method: 'native-browser' };
    } catch (webBrowserError) {
      console.warn(`🔗 PAYMENT (${source}): WebBrowser failed, trying Linking API:`, webBrowserError);
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        throw new Error('Cannot open checkout URL on this device');
      }
      await Linking.openURL(url);
      console.log(`🔗 PAYMENT (${source}): Opened Stripe checkout with Linking API`);
      return { status: 'opened', method: 'native-linking' };
    }
  }

  const result = await WebBrowser.openBrowserAsync(url);
  console.log(`🔗 PAYMENT (${source}): Opened Stripe checkout in WebBrowser:`, result);
  return { status: 'opened', method: 'native-browser' };
}
