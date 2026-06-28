import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, lockedAccessAPI, playlistAccessAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

type VerifySuccessPayload = {
  contentType: 'playlist' | 'slideshow';
  contentId: number;
  pollToken: string;
  leadId?: number;
  leadSource?: string;
};

function buildPreviewAccessPath({ contentType, contentId, pollToken }: VerifySuccessPayload): string {
  const q = `?previewVerified=1&previewToken=${encodeURIComponent(String(pollToken))}`;
  if (contentType === 'playlist') {
    return `/playlist-access/${contentId}${q}`;
  }
  return `/slideshow-access/${contentId}${q}`;
}

function buildOpenAccessPath({ contentType, contentId, leadId }: VerifySuccessPayload): string {
  const q = `?openAccessVerified=1&leadId=${encodeURIComponent(String(leadId || ''))}`;
  if (contentType === 'playlist') {
    return `/playlist-access/${contentId}${q}`;
  }
  return `/slideshow-access/${contentId}${q}`;
}

/**
 * Public route opened from SMS link. Verifies the lead, then redirects to the content access page to start preview.
 */
export default function PreviewVerifyScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLocalSearchParams<{ t?: string }>();
  const { acceptAuthResponse } = useAuth();
  const acceptAuthResponseRef = useRef(acceptAuthResponse);
  const [status, setStatus] = useState<'loading' | 'ok' | 'err'>('loading');
  const [message, setMessage] = useState('Verifying…');
  const [successPayload, setSuccessPayload] = useState<VerifySuccessPayload | null>(null);

  const goToPreview = useCallback((payload: VerifySuccessPayload) => {
    const path = buildPreviewAccessPath(payload);
    router.replace(path as any);
  }, []);

  useEffect(() => {
    acceptAuthResponseRef.current = acceptAuthResponse;
  }, [acceptAuthResponse]);

  useEffect(() => {
    const token = typeof t === 'string' ? t : Array.isArray(t) ? t[0] : '';
    if (!token) {
      setStatus('err');
      setMessage('Missing verification link. Please use the link from your text message.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post('/preview-leads/verify', { token });
        if (cancelled) return;
        if (res.data?.ok) {
          const contentType = res.data.contentType;
          const contentId = Number(res.data.contentId);
          const pollToken = res.data.pollToken != null ? String(res.data.pollToken) : '';
          const leadId = Number(res.data.leadId);
          const leadSource = res.data.leadSource ? String(res.data.leadSource) : '';
          if (pollToken) {
            let completion: Awaited<ReturnType<typeof lockedAccessAPI.status>> | null = null;
            try {
              completion = await lockedAccessAPI.status(pollToken);
            } catch (statusError) {
              if (res.data.leadSource === 'locked_access') {
                throw statusError;
              }
            }
            if (completion?.status === 'verified' && completion.user && completion.token) {
              await acceptAuthResponseRef.current({ user: completion.user, token: completion.token });
              if (contentType === 'playlist') {
                let playbackToken = completion.playbackToken;
                if (!playbackToken) {
                  try {
                    const issued = await playlistAccessAPI.issuePlaybackToken(String(contentId));
                    playbackToken = issued.playbackToken;
                  } catch {
                    // The player can still request access again if token creation is delayed.
                  }
                }
                if (playbackToken) {
                  await AsyncStorage.setItem(`playlist_playback_token_${contentId}`, playbackToken);
                }
                const playbackQuery = playbackToken ? `?playbackToken=${encodeURIComponent(playbackToken)}` : '';
                router.replace(`/playlist-player/${contentId}${playbackQuery}` as any);
              } else {
                router.replace(`/slideshow-player/${contentId}` as any);
              }
              setStatus('ok');
              setMessage('Verified. Your viewer account is ready.');
              return;
            }
          }
          if (
            (contentType === 'playlist' || contentType === 'slideshow') &&
            Number.isFinite(contentId) &&
            pollToken
          ) {
            const payload: VerifySuccessPayload = {
              contentType,
              contentId,
              pollToken,
              leadId: Number.isFinite(leadId) ? leadId : undefined,
              leadSource,
            };
            if (leadSource === 'open_access' && payload.leadId) {
              const path = buildOpenAccessPath(payload);
              setSuccessPayload(payload);
              setStatus('ok');
              setMessage('Verified. Starting your content...');
              router.replace(path as any);
              if (Platform.OS === 'web' && typeof window !== 'undefined') {
                window.setTimeout(() => {
                  if (!cancelled) router.replace(path as any);
                }, 400);
              }
              return;
            }
            setSuccessPayload(payload);
            setStatus('ok');
            setMessage('Verified. Starting your preview…');
            goToPreview(payload);
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.setTimeout(() => {
                if (!cancelled) goToPreview(payload);
              }, 400);
            }
          } else {
            setStatus('ok');
            setMessage(
              'Your phone is verified. Return to the preview tab in this browser to continue, or open the playlist or slideshow link again.'
            );
          }
        } else {
          setStatus('err');
          setMessage(res.data?.error || 'Verification failed.');
        }
      } catch (e: any) {
        if (cancelled) return;
        setStatus('err');
        setMessage(e.response?.data?.error || e.message || 'Verification failed.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t, goToPreview]);

  return (
    <ScrollView
      style={[styles.root, { paddingTop: insets.top + 24 }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.card}>
        {status === 'loading' && <ActivityIndicator size="large" color="#3b82f6" style={{ marginBottom: 16 }} />}
        <Text style={styles.title}>Phone verification</Text>
        <Text style={[styles.body, status === 'ok' && styles.ok, status === 'err' && styles.err]}>
          {message}
        </Text>
        {status === 'ok' && successPayload != null && (
          <TouchableOpacity style={styles.cta} onPress={() => goToPreview(successPayload)} activeOpacity={0.8}>
            <Text style={styles.ctaText}>Open preview</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12 },
  body: { fontSize: 16, color: '#4b5563', lineHeight: 24 },
  ok: { color: '#059669' },
  err: { color: '#b91c1c' },
  cta: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
