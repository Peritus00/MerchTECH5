import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import SlideshowPlayer from '@/components/SlideshowPlayer';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { analyticsService } from '@/services/analyticsService';
import DemographicsSurveyOverlay from '@/components/DemographicsSurveyOverlay';
import { saveUserAge } from '@/utils/ageStorage';
import { saveUserGender } from '@/utils/genderStorage';
import { shouldShowDemographicsSurvey, fetchUserDemographics, saveDemographics, getDemographicsForTracking } from '@/utils/demographicsHelper';

export default function SlideshowPlayerScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const [slideshow, setSlideshow] = useState<any>(null);
  const [presignedAudioUrl, setPresignedAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, isAuthenticated } = useAuth();
  
  // Demographics survey state
  const [showDemographicsSurvey, setShowDemographicsSurvey] = useState(false);
  const [userDemographics, setUserDemographics] = useState<{ ageRange?: string; gender?: string } | null>(null);
  
  // Guard to prevent multiple scan tracking calls
  const hasTrackedScanRef = useRef<boolean>(false);

  useEffect(() => {
    fetchSlideshow();
  }, [id]);

  useEffect(() => {
    if (slideshow?.audio_url) {
      // Use the signed URL directly from the slideshow data
      setPresignedAudioUrl(slideshow.audio_url);
    }
  }, [slideshow]);

  // Fetch user demographics if authenticated
  useEffect(() => {
    const loadUserDemographics = async () => {
      if (isAuthenticated) {
        const demographics = await fetchUserDemographics();
        console.log('🔍 SLIDESHOW_PLAYER_DEMOGRAPHICS: Loaded user demographics:', demographics);
        setUserDemographics(demographics);
      }
    };
    loadUserDemographics();
  }, [isAuthenticated]);

  // Attempt geolocation on player as well
  useEffect(() => {
    const submitGeo = async () => {
      try {
        if (!('geolocation' in navigator)) return;
        
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
        const qrId = (slideshow as any)?.qr_code_id || (slideshow as any)?.qrCodeId;
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
    if (slideshow && !loading) {
      const t = setTimeout(submitGeo, 1200);
      return () => clearTimeout(t);
    }
  }, [slideshow, loading, id]);

  // Show demographics survey after content starts playing
  useEffect(() => {
    const checkAndShowSurvey = async () => {
      console.log('🔍 SLIDESHOW_PLAYER_DEMOGRAPHICS: Checking if survey needed...', {
        hasSlideshow: !!slideshow,
        loading,
        isAuthenticated,
        userDemographics,
      });
      
      // Only show survey after content is loaded
      if (!slideshow || loading) {
        console.log('🔍 SLIDESHOW_PLAYER_DEMOGRAPHICS: Skipping - slideshow not loaded');
        return;
      }
      
      // Check if survey is needed
      const needsSurvey = await shouldShowDemographicsSurvey(isAuthenticated, userDemographics);
      console.log('🔍 SLIDESHOW_PLAYER_DEMOGRAPHICS: Survey needed?', needsSurvey);
      
      if (needsSurvey) {
        console.log('🔍 SLIDESHOW_PLAYER_DEMOGRAPHICS: Setting 5-second timer for survey...');
        // Show survey after 5 seconds of playback
        const timer = setTimeout(() => {
          console.log('✅ SLIDESHOW_PLAYER_DEMOGRAPHICS: Showing survey now!');
          setShowDemographicsSurvey(true);
        }, 5000);
        return () => clearTimeout(timer);
      } else {
        console.log('🔍 SLIDESHOW_PLAYER_DEMOGRAPHICS: Survey not needed - user already has demographics');
      }
    };
    
    checkAndShowSurvey();
  }, [slideshow, loading, isAuthenticated, userDemographics]);

  const fetchSlideshow = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get(`/slideshow-access/${id}`);
      
      if (response.data) {
        setSlideshow(response.data);
        
        // Track QR scan with demographics if available (only once per component mount)
        // Check and set ref synchronously to prevent race conditions
        const qrId = response.data?.qr_code_id || response.data?.qrCodeId;
        if (qrId && !hasTrackedScanRef.current) {
          hasTrackedScanRef.current = true; // Mark as tracked BEFORE async call to prevent race conditions
          try {
            // Get demographics from user profile or localStorage
            const demographics = getDemographicsForTracking(isAuthenticated, userDemographics);
            
            console.log('📊 SLIDESHOW_PLAYER: Tracking scan with demographics:', demographics);
            
            await analyticsService.trackQRScan(Number(qrId), {
              // Send user demographics if available
              ...(demographics?.ageRange ? { userAge: demographics.ageRange } : {}),
              ...(demographics?.gender ? { userGender: demographics.gender } : {}),
            });
          } catch (e) {
            console.warn('Analytics track scan failed (slideshow-player):', e);
            // Reset ref on error so it can retry
            hasTrackedScanRef.current = false;
          }
        } else if (qrId && hasTrackedScanRef.current) {
          console.log('📊 SLIDESHOW_PLAYER: Skipping duplicate scan tracking (already tracked)');
        }
      } else {
        setError('Slideshow not found');
      }
    } catch (err: any) {
      console.error('Failed to fetch slideshow:', err);
      
      if (err.response?.status === 403) {
        setError('Access denied. Please check your activation code.');
      } else if (err.response?.status === 404) {
        setError('Slideshow not found');
      } else {
        setError(err.response?.data?.message || 'Failed to load slideshow');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading slideshow...</Text>
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
    console.log('👤 SLIDESHOW_PLAYER_DEMOGRAPHICS: User provided demographics:', demographics);
    
    try {
      // Save demographics (to profile if authenticated, localStorage if anonymous)
      const success = await saveDemographics(
        demographics,
        isAuthenticated,
        (ageRange, gender) => {
          console.log('💾 SLIDESHOW_PLAYER_DEMOGRAPHICS: Saving to localStorage:', { ageRange, gender });
          saveUserAge(ageRange);
          saveUserGender(gender);
        }
      );
      
      console.log('👤 SLIDESHOW_PLAYER_DEMOGRAPHICS: Save result:', success);
      
      // Update local state if authenticated
      if (isAuthenticated) {
        setUserDemographics(demographics);
      }
      
      // Re-track the scan with the new demographics
      try {
        const qrId = slideshow?.qr_code_id || slideshow?.qrCodeId;
        if (qrId) {
          console.log('📊 SLIDESHOW_PLAYER_DEMOGRAPHICS: Re-tracking scan with new demographics...');
          await analyticsService.trackQRScan(Number(qrId), {
            userAge: demographics.ageRange,
            userGender: demographics.gender,
          });
          console.log('✅ SLIDESHOW_PLAYER_DEMOGRAPHICS: Scan re-tracked with demographics!');
        }
      } catch (e) {
        console.warn('Failed to re-track scan with demographics:', e);
      }
      
      console.log('👤 SLIDESHOW_PLAYER_DEMOGRAPHICS: Closing survey...');
      setShowDemographicsSurvey(false);
    } catch (error) {
      console.error('❌ SLIDESHOW_PLAYER_DEMOGRAPHICS: Error saving demographics:', error);
      // Still close the survey even if save failed
      setShowDemographicsSurvey(false);
    }
  };

  return (
    <>
      <SlideshowPlayer
        slideshowId={id}
        slideshow={{ ...slideshow, audioUrl: presignedAudioUrl }}
        autoPlay={false}
      />
      
      {/* Demographics Survey Overlay */}
      <DemographicsSurveyOverlay
        visible={showDemographicsSurvey}
        artistName={slideshow?.creatorName || slideshow?.username}
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
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorText: {
    color: '#ff5555',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
  },
}); 