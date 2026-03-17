// Route incoming share intents to the handle-share screen
// https://docs.expo.dev/router/advanced/native-intent/

export async function redirectSystemPath(intent: {
  path: string;
  initial: boolean;
}): Promise<string> {
  try {
    const url = new URL(intent.path, 'merchtechapp://');
    if (url.hostname === 'expo-sharing') {
      return '/handle-share';
    }
    return intent.path;
  } catch {
    return intent.path;
  }
}
