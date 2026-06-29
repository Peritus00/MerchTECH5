import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PlaylistPlayer from '@/components/PlaylistPlayer';
import { useAuth } from '@/contexts/AuthContext';
import { analyticsService } from '@/services/analyticsService';
import DemographicsSurveyOverlay from '@/components/DemographicsSurveyOverlay';
import LocationOptInPrompt from '@/components/LocationOptInPrompt';
import { saveUserAge } from '@/utils/ageStorage';
import { saveUserGender } from '@/utils/genderStorage';
import { shouldShowDemographicsSurvey, fetchUserDemographics, saveDemographics, getDemographicsForTracking } from '@/utils/demographicsHelper';
import { usePlaylistAccess } from '@/hooks/usePlaylistAccess';

export default function PlaylistPlayerScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const params = useLocalSearchParams<{ playbackToken?: string | string[]; leadId?: string | string[] }>();
  const routePlaybackToken = Array.isArray(params.playbackToken) ? params.playbackToken[0] : params.playbackToken;
  const routeLeadIdParam = Array.isArray(params.leadId) ? params.leadId[0] : params.leadId;
  const { isAuthenticated } = useAuth();
  
  // Demographics survey state
  const [showDemographicsSurvey, setShowDemographicsSurvey] = useState(false);
  const [userDemographics, setUserDemographics] = useState<{ ageRange?: string; gender?: string } | null>(null);
  const [playbackToken, setPlaybackToken] = useState<string | null>(null);
  const [previewPhoneLeadId, setPreviewPhoneLeadId] = useState<number | null>(null);
  const [hasCheckedStoredLeadId, setHasCheckedStoredLeadId] = useState(false);
  const [hasCheckedStoredPlaybackToken, setHasCheckedStoredPlaybackToken] = useState(false);
  const queryPlaybackToken = playbackToken || routePlaybackToken || null;
  const { data: playlist, isLoading: loading, isFetching, isError, error, refetch } = usePlaylistAccess(id, queryPlaybackToken);
  
  // Guard to prevent multiple scan tracking calls
  const hasTrackedScanRef = useRef<boolean>(false);

  // Fetch user demographics if authenticated
  useEffect(() => {
    const loadUserDemographics = async () => {
      if (isAuthenticated) {
        const demographics = await fetchUserDemographics();
        console.log('🔍 PLAYER_DEMOGRAPHICS: Loaded user demographics:', demographics);
        setUserDemographics(demographics);
      }
    };
    loadUserDemographics();
  }, [isAuthenticated]);

  // Store playback token when playlist has it; load from storage when not in response (e.g. after protected access)
  useEffect(() => {
    let isActive = true;

    const loadPlaybackToken = async () => {
      setHasCheckedStoredPlaybackToken(false);

      if (routePlaybackToken && id) {
        await AsyncStorage.setItem(`playlist_playback_token_${id}`, routePlaybackToken);
        if (isActive) {
          setPlaybackToken(routePlaybackToken);
          setHasCheckedStoredPlaybackToken(true);
        }
        router.replace(`/playlist-player/${id}`);
        return;
      }

      const token = (playlist as any)?.playbackToken;
      if (token && id) {
        await AsyncStorage.setItem(`playlist_playback_token_${id}`, token);
        if (isActive) {
          setPlaybackToken(token);
          setHasCheckedStoredPlaybackToken(true);
        }
        return;
      }

      if (!id) {
        if (isActive) setHasCheckedStoredPlaybackToken(true);
        return;
      }

      try {
        const storedToken = await AsyncStorage.getItem(`playlist_playback_token_${id}`);
        if (isActive) {
          setPlaybackToken(storedToken);
        }
      } finally {
        if (isActive) {
          setHasCheckedStoredPlaybackToken(true);
        }
      }
    };

    loadPlaybackToken();

    return () => {
      isActive = false;
    };
  }, [playlist, id, routePlaybackToken]);

  useEffect(() => {
    let isActive = true;
    const loadLeadId = async () => {
      setHasCheckedStoredLeadId(false);
      const routeLeadId = routeLeadIdParam ? Number(routeLeadIdParam) : null;
      if (routeLeadId && Number.isFinite(routeLeadId)) {
        await AsyncStorage.setItem(`open_access_lead_playlist_${id}`, String(routeLeadId));
        if (isActive) {
          setPreviewPhoneLeadId(routeLeadId);
          setHasCheckedStoredLeadId(true);
        }
        return;
      }
      const storedLeadId = await AsyncStorage.getItem(`open_access_lead_playlist_${id}`);
      const parsed = storedLeadId ? Number(storedLeadId) : null;
      if (isActive) {
        setPreviewPhoneLeadId(parsed && Number.isFinite(parsed) ? parsed : null);
        setHasCheckedStoredLeadId(true);
      }
    };
    if (id) {
      void loadLeadId();
    }
    return () => {
      isActive = false;
    };
  }, [id, routeLeadIdParam]);

  const accessRestricted = Boolean((playlist as any)?.accessRestricted);
  const hasPlaybackToken = Boolean(queryPlaybackToken || (playlist as any)?.playbackToken);
  const hasLoadedPlayableMedia = Array.isArray((playlist as any)?.mediaFiles) && (playlist as any).mediaFiles.length > 0;
  const requiresOpenAccessLead = Boolean((playlist as any)?.requirePhoneForOpenAccess);
  const shouldRedirectForOpenAccessLead =
    Boolean(playlist) &&
    requiresOpenAccessLead &&
    hasCheckedStoredLeadId &&
    !previewPhoneLeadId &&
    !loading &&
    !isFetching;
  const canAccessPlaylist =
    Boolean(playlist) &&
    !shouldRedirectForOpenAccessLead &&
    (!accessRestricted || (hasPlaybackToken && hasLoadedPlayableMedia));
  const awaitingAccessDecision =
    Boolean(playlist) &&
    accessRestricted &&
    (!hasCheckedStoredPlaybackToken || (hasPlaybackToken && !hasLoadedPlayableMedia && (loading || isFetching)));
  const shouldRedirectForActivation =
    Boolean(playlist) &&
    accessRestricted &&
    hasCheckedStoredPlaybackToken &&
    (!hasPlaybackToken || (hasPlaybackToken && !hasLoadedPlayableMedia && !loading && !isFetching));

  useEffect(() => {
    if (shouldRedirectForActivation) {
      router.replace(`/playlist-access/${id}`);
    }
  }, [shouldRedirectForActivation, id]);

  useEffect(() => {
    if (shouldRedirectForOpenAccessLead) {
      router.replace(`/playlist-access/${id}`);
    }
  }, [shouldRedirectForOpenAccessLead, id]);

  // Show demographics survey after content starts playing
  useEffect(() => {
    const checkAndShowSurvey = async () => {
      console.log('🔍 PLAYER_DEMOGRAPHICS: Checking if survey needed...', {
        hasPlaylist: !!playlist,
        loading,
        isAuthenticated,
        userDemographics,
      });
      
      // Only show survey after content is loaded
      if (!playlist || loading || !canAccessPlaylist) {
        console.log('🔍 PLAYER_DEMOGRAPHICS: Skipping - playlist not loaded');
        return;
      }
      
      // Check if survey is needed
      const needsSurvey = await shouldShowDemographicsSurvey(isAuthenticated, userDemographics);
      console.log('🔍 PLAYER_DEMOGRAPHICS: Survey needed?', needsSurvey);
      
      if (needsSurvey) {
        console.log('🔍 PLAYER_DEMOGRAPHICS: Setting 5-second timer for survey...');
        // Show survey after 5 seconds of playback
        const timer = setTimeout(() => {
          console.log('✅ PLAYER_DEMOGRAPHICS: Showing survey now!');
          setShowDemographicsSurvey(true);
        }, 5000);
        return () => clearTimeout(timer);
      } else {
        console.log('🔍 PLAYER_DEMOGRAPHICS: Survey not needed - user already has demographics');
      }
    };
    
    checkAndShowSurvey();
  }, [playlist, loading, isAuthenticated, userDemographics, canAccessPlaylist]);

  // Track QR scan when playlist loads (only once per mount)
  useEffect(() => {
    if (!canAccessPlaylist || !playlist || hasTrackedScanRef.current) return;
    if ((playlist as any).requirePhoneForOpenAccess && !previewPhoneLeadId) return;
    const qrId = playlist?.qr_code_id || playlist?.qrCodeId;
    if (!qrId) return;
    hasTrackedScanRef.current = true;
    const demographics = getDemographicsForTracking(isAuthenticated, userDemographics);
    analyticsService.trackQRScan(Number(qrId), {
      ...(demographics?.ageRange ? { userAge: demographics.ageRange } : {}),
      ...(demographics?.gender ? { userGender: demographics.gender } : {}),
      ...(previewPhoneLeadId ? { previewPhoneLeadId } : {}),
    }).catch((e) => {
      console.warn('Analytics track scan failed (playlist-player):', e);
      hasTrackedScanRef.current = false;
    });
  }, [canAccessPlaylist, playlist, isAuthenticated, previewPhoneLeadId, userDemographics]);

  const errorMessage = isError && error
    ? (error as any)?.response?.status === 403
      ? 'Access denied. Please check your activation code.'
      : (error as any)?.response?.status === 404
        ? 'Playlist not found'
        : (error as any)?.response?.data?.message || 'Failed to load playlist'
    : null;

  if (loading && !playlist) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading playlist...</Text>
      </View>
    );
  }

  if (errorMessage && !playlist) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error-outline" size={60} color="#ff5555" />
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity onPress={() => refetch()} style={{ marginTop: 16 }}>
          <MaterialIcons name="refresh" size={32} color="#3b82f6" />
        </TouchableOpacity>
      </View>
    );
  }

  if (!playlist) {
    return null;
  }

  if (awaitingAccessDecision || shouldRedirectForActivation || shouldRedirectForOpenAccessLead) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>
          {shouldRedirectForActivation || shouldRedirectForOpenAccessLead
            ? 'Opening access screen...'
            : 'Checking playlist access...'}
        </Text>
      </View>
    );
  }

  // Demographics survey handler
  const handleDemographicsSubmit = async (demographics: { ageRange: string; gender: string }) => {
    console.log('👤 PLAYER_DEMOGRAPHICS: User provided demographics:', demographics);
    
    try {
      // Save demographics (to profile if authenticated, localStorage if anonymous)
      const success = await saveDemographics(
        demographics,
        isAuthenticated,
        (ageRange, gender) => {
          console.log('💾 PLAYER_DEMOGRAPHICS: Saving to localStorage:', { ageRange, gender });
          saveUserAge(ageRange);
          saveUserGender(gender);
        }
      );
      
      console.log('👤 PLAYER_DEMOGRAPHICS: Save result:', success);
      
      // Update local state if authenticated
      if (isAuthenticated) {
        setUserDemographics(demographics);
      }
      
      // Re-track the scan with the new demographics
      try {
        const qrId = playlist?.qr_code_id || playlist?.qrCodeId;
        if (qrId) {
          console.log('📊 PLAYER_DEMOGRAPHICS: Re-tracking scan with new demographics...');
          await analyticsService.trackQRScan(Number(qrId), {
            userAge: demographics.ageRange,
            userGender: demographics.gender,
            ...(previewPhoneLeadId ? { previewPhoneLeadId } : {}),
          });
          console.log('✅ PLAYER_DEMOGRAPHICS: Scan re-tracked with demographics!');
        }
      } catch (e) {
        console.warn('Failed to re-track scan with demographics:', e);
      }
      
      console.log('👤 PLAYER_DEMOGRAPHICS: Closing survey...');
      setShowDemographicsSurvey(false);
    } catch (error) {
      console.error('❌ PLAYER_DEMOGRAPHICS: Error saving demographics:', error);
      // Still close the survey even if save failed
      setShowDemographicsSurvey(false);
    }
  };

  return (
    <>
      <PlaylistPlayer
        playlistId={id}
        playlist={playlist}
        playbackToken={playbackToken || (playlist as any)?.playbackToken}
        previewPhoneLeadId={previewPhoneLeadId || undefined}
        autoPlay={false}
      />

      <LocationOptInPrompt
        enabled={canAccessPlaylist && !loading}
        scope={{ contentType: 'playlist', contentId: id, leadId: previewPhoneLeadId }}
        qrCodeId={(playlist as any)?.qr_code_id || (playlist as any)?.qrCodeId || Number(id)}
      />
      
      {/* Demographics Survey Overlay */}
      <DemographicsSurveyOverlay
        visible={showDemographicsSurvey}
        artistName={playlist?.creatorName || playlist?.username}
        onSubmit={handleDemographicsSubmit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ccc',
  },
  errorText: {
    color: '#ff5555',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
  },
}); 