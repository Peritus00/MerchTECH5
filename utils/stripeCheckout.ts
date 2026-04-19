import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export type StripeCheckoutLaunchResult =
  | { status: 'opened'; method: 'web-tab' | 'native-browser' | 'native-linking' }
  | { status: 'blocked'; method: 'web-popup-blocked' };

export type PreparedCheckoutWindow = Window | null;

/**
 * Open a blank tab synchronously from the user's tap, before any await.
 * Do not pass windowFeatures with "noopener" here: on iOS/Android WebKit,
 * assigning location to Stripe after await often leaves a permanent white
 * about:blank when the opener relationship / navigation is restricted.
 */
export function prepareStripeCheckoutWindow(): PreparedCheckoutWindow {
  if (typeof window === 'undefined') {
    return null;
  }

  const w = window.open('about:blank', '_blank');
  if (!w) {
    return null;
  }

  try {
    w.document.title = 'Opening checkout…';
  } catch {
    // ignore
  }

  return w;
}

/**
 * Load Stripe inside a popup we own by writing a minimal HTML shell.
 * This survives mobile Safari/Chrome restrictions that block setting
 * popup.location to a cross-origin URL after an async gap.
 */
function injectStripeRedirect(checkoutWindow: Window, url: string): boolean {
  try {
    const jsonUrl = JSON.stringify(url);
    const doc = checkoutWindow.document;
    doc.open();
    doc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"/>' +
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
        '<title>Redirecting…</title></head>' +
        '<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;' +
        'background:#111827;color:#e5e7eb;display:flex;min-height:100vh;' +
        'align-items:center;justify-content:center;padding:1.25rem;text-align:center">' +
        '<div><p style="margin:0 0 0.75rem;font-size:1rem">Opening secure checkout…</p>' +
        '<p style="margin:0;font-size:0.9rem;opacity:0.85">If nothing happens, use the button below.</p>' +
        '<p style="margin:1rem 0 0"><a id="go" href="#" style="color:#60a5fa;font-weight:600">Continue to checkout</a></p></div>' +
        '<script>(function(){var u=' +
        jsonUrl +
        ";var a=document.getElementById('go');if(a){a.href=u;}try{location.replace(u);}catch(e){}})();<\/script>" +
        '</body></html>'
    );
    doc.close();
    return true;
  } catch (error) {
    console.warn('injectStripeRedirect failed:', error);
    return false;
  }
}

function openWebCheckoutTab(
  url: string,
  preparedWindow?: PreparedCheckoutWindow
): StripeCheckoutLaunchResult {
  if (typeof window === 'undefined') {
    throw new Error('Window is not available for web checkout');
  }

  if (preparedWindow) {
    if (injectStripeRedirect(preparedWindow, url)) {
      preparedWindow.focus?.();
      return { status: 'opened', method: 'web-tab' };
    }
    try {
      preparedWindow.location.replace(url);
    } catch (error) {
      console.warn('Prepared window location.replace failed:', error);
      try {
        preparedWindow.close();
      } catch {
        // ignore
      }
      return { status: 'blocked', method: 'web-popup-blocked' };
    }
    preparedWindow.focus?.();
    return { status: 'opened', method: 'web-tab' };
  }

  // No prepared window: single call after async — may be blocked on strict mobile;
  // omit windowFeatures so navigation is not tied to noopener quirks.
  const checkoutWindow = window.open(url, '_blank');
  if (!checkoutWindow) {
    return { status: 'blocked', method: 'web-popup-blocked' };
  }
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
