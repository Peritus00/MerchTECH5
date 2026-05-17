import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PlaylistPlayer from '@/components/PlaylistPlayer';
import { useAuth } from '@/contexts/AuthContext';
import { analyticsService } from '@/services/analyticsService';
import DemographicsSurveyOverlay from '@/components/DemographicsSurveyOverlay';
import { saveUserAge } from '@/utils/ageStorage';
import { saveUserGender } from '@/utils/genderStorage';
import { shouldShowDemographicsSurvey, fetchUserDemographics, saveDemographics, getDemographicsForTracking } from '@/utils/demographicsHelper';
import { usePlaylistAccess } from '@/hooks/usePlaylistAccess';

export default function PlaylistPlayerScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const { data: playlist, isLoading: loading, isError, error, refetch } = usePlaylistAccess(id);
  const { isAuthenticated } = useAuth();
  
  // Demographics survey state
  const [showDemographicsSurvey, setShowDemographicsSurvey] = useState(false);
  const [userDemographics, setUserDemographics] = useState<{ ageRange?: string; gender?: string } | null>(null);
  const [playbackToken, setPlaybackToken] = useState<string | null>(null);
  const [hasCheckedStoredPlaybackToken, setHasCheckedStoredPlaybackToken] = useState(false);
  
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
  }, [playlist, id]);

  const accessRestricted = Boolean((playlist as any)?.accessRestricted);
  const hasPlaybackToken = Boolean(playbackToken || (playlist as any)?.playbackToken);
  const canAccessPlaylist = Boolean(playlist) && (!accessRestricted || hasPlaybackToken);
  const awaitingAccessDecision = Boolean(playlist) && accessRestricted && !hasCheckedStoredPlaybackToken;
  const shouldRedirectForActivation =
    Boolean(playlist) && accessRestricted && hasCheckedStoredPlaybackToken && !hasPlaybackToken;

  useEffect(() => {
    if (shouldRedirectForActivation) {
      router.replace(`/playlist-access/${id}`);
    }
  }, [shouldRedirectForActivation, id]);

  // Attempt geolocation on player too (some QR flows go straight here)
  useEffect(() => {
    const submitGeo = async () => {
      try {
        if (!('geolocation' in navigator)) return;
        
        // Check if geolocation is allowed via Permissions API (avoids Permissions-Policy violation logs)
        try {
          if ('permissions' in navigator) {
            const permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            if (permissionStatus.state === 'denied') {
              // Permission explicitly denied, don't attempt geolocation
              return;
            }
          }
        } catch {
          // Permissions API not available or blocked, continue to try geolocation anyway
        }
        
        // Check if geolocation is allowed (may be blocked by Permissions-Policy)
        const getPos = () => new Promise<GeolocationPosition>((resolve, reject) => {
          // Set a timeout to prevent hanging
          const timeoutId = setTimeout(() => {
            reject(new Error('Geolocation timeout'));
          }, 3000);
          
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timeoutId);
              resolve(pos);
            },
            (err) => {
              clearTimeout(timeoutId);
              reject(err);
            },
            { enableHighAccuracy: false, maximumAge: 60000, timeout: 3000 }
          );
        });
        
        const pos = await getPos();
        const qrId = (playlist as any)?.qr_code_id || (playlist as any)?.qrCodeId;
        await analyticsService.submitBrowserGeo(
          qrId ? Number(qrId) : Number(id),
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined
        );
      } catch (error: any) {
        // Silently ignore geolocation errors (permissions policy, user denial, timeout, etc.)
        // Don't log or throw - geolocation is optional
        if (process.env.NODE_ENV === 'development') {
          console.debug('Geolocation not available:', error?.message || 'unknown error');
        }
      }
    };
    if (canAccessPlaylist && !loading) {
      const t = setTimeout(submitGeo, 1200);
      return () => clearTimeout(t);
    }
  }, [canAccessPlaylist, playlist, loading, id]);

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
    const qrId = playlist?.qr_code_id || playlist?.qrCodeId;
    if (!qrId) return;
    hasTrackedScanRef.current = true;
    const demographics = getDemographicsForTracking(isAuthenticated, userDemographics);
    analyticsService.trackQRScan(Number(qrId), {
      ...(demographics?.ageRange ? { userAge: demographics.ageRange } : {}),
      ...(demographics?.gender ? { userGender: demographics.gender } : {}),
    }).catch((e) => {
      console.warn('Analytics track scan failed (playlist-player):', e);
      hasTrackedScanRef.current = false;
    });
  }, [canAccessPlaylist, playlist, isAuthenticated, userDemographics]);

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

  if (awaitingAccessDecision || shouldRedirectForActivation) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>
          {shouldRedirectForActivation ? 'Opening activation code screen...' : 'Checking playlist access...'}
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
        autoPlay={false}
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