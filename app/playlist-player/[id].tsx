import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import PlaylistPlayer from '@/components/PlaylistPlayer';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { analyticsService } from '@/services/analyticsService';
import DemographicsSurveyOverlay from '@/components/DemographicsSurveyOverlay';
import { saveUserAge } from '@/utils/ageStorage';
import { saveUserGender } from '@/utils/genderStorage';
import { shouldShowDemographicsSurvey, fetchUserDemographics, saveDemographics, getDemographicsForTracking } from '@/utils/demographicsHelper';

export default function PlaylistPlayerScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const [playlist, setPlaylist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, isAuthenticated } = useAuth();
  
  // Demographics survey state
  const [showDemographicsSurvey, setShowDemographicsSurvey] = useState(false);
  const [userDemographics, setUserDemographics] = useState<{ ageRange?: string; gender?: string } | null>(null);
  
  // Guard to prevent multiple scan tracking calls
  const hasTrackedScanRef = useRef<boolean>(false);

  useEffect(() => {
    fetchPlaylist();
  }, [id]);

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

  // Attempt geolocation on player too (some QR flows go straight here)
  useEffect(() => {
    const submitGeo = async () => {
      try {
        if (!('geolocation' in navigator)) return;
        const getPos = () => new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 60000, timeout: 4000 })
        );
        const pos = await getPos();
        const qrId = (playlist as any)?.qr_code_id || (playlist as any)?.qrCodeId;
        await analyticsService.submitBrowserGeo(
          qrId ? Number(qrId) : Number(id),
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy ? Math.round(pos.coords.accuracy) : undefined
        );
      } catch (_e) {
        // ignore
      }
    };
    if (playlist && !loading) {
      const t = setTimeout(submitGeo, 1200);
      return () => clearTimeout(t);
    }
  }, [playlist, loading, id]);

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
      if (!playlist || loading) {
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
  }, [playlist, loading, isAuthenticated, userDemographics]);

  const fetchPlaylist = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get(`/playlist-access/${id}`);
      
      if (response.data) {
        setPlaylist(response.data);
        
        // Track QR scan with demographics if available (only once per component mount)
        // Check and set ref synchronously to prevent race conditions
        const qrId = response.data?.qr_code_id || response.data?.qrCodeId;
        if (qrId && !hasTrackedScanRef.current) {
          hasTrackedScanRef.current = true; // Mark as tracked BEFORE async call to prevent race conditions
          try {
            // Get demographics from user profile or localStorage
            const demographics = getDemographicsForTracking(isAuthenticated, userDemographics);
            
            console.log('📊 PLAYER: Tracking scan with demographics:', demographics);
            
            await analyticsService.trackQRScan(Number(qrId), {
              // Send user demographics if available
              ...(demographics?.ageRange ? { userAge: demographics.ageRange } : {}),
              ...(demographics?.gender ? { userGender: demographics.gender } : {}),
            });
          } catch (e) {
            console.warn('Analytics track scan failed (playlist-player):', e);
            // Reset ref on error so it can retry
            hasTrackedScanRef.current = false;
          }
        } else if (qrId && hasTrackedScanRef.current) {
          console.log('📊 PLAYER: Skipping duplicate scan tracking (already tracked)');
        }
      } else {
        setError('Playlist not found');
      }
    } catch (err: any) {
      console.error('Failed to fetch playlist:', err);
      
      if (err.response?.status === 403) {
        setError('Access denied. Please check your activation code.');
      } else if (err.response?.status === 404) {
        setError('Playlist not found');
      } else {
        setError(err.response?.data?.message || 'Failed to load playlist');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading playlist...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="error-outline" size={60} color="#ff5555" />
        <Text style={styles.errorText}>{error}</Text>
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