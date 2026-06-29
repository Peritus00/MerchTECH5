import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import SlideshowPlayer from '@/components/SlideshowPlayer';
import { useAuth } from '@/contexts/AuthContext';
import { analyticsService } from '@/services/analyticsService';
import DemographicsSurveyOverlay from '@/components/DemographicsSurveyOverlay';
import LocationOptInPrompt from '@/components/LocationOptInPrompt';
import { saveUserAge } from '@/utils/ageStorage';
import { saveUserGender } from '@/utils/genderStorage';
import { shouldShowDemographicsSurvey, fetchUserDemographics, saveDemographics, getDemographicsForTracking } from '@/utils/demographicsHelper';
import { useSlideshowAccess } from '@/hooks/useSlideshowAccess';

export default function SlideshowPlayerScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const params = useLocalSearchParams<{ leadId?: string | string[] }>();
  const routeLeadIdParam = Array.isArray(params.leadId) ? params.leadId[0] : params.leadId;
  const { data: slideshow, isLoading: loading, isError, error, refetch } = useSlideshowAccess(id);
  const [presignedAudioUrl, setPresignedAudioUrl] = useState<string | null>(null);
  const [previewPhoneLeadId, setPreviewPhoneLeadId] = useState<number | null>(null);
  const [hasCheckedStoredLeadId, setHasCheckedStoredLeadId] = useState(false);
  const { isAuthenticated } = useAuth();
  
  // Demographics survey state
  const [showDemographicsSurvey, setShowDemographicsSurvey] = useState(false);
  const [userDemographics, setUserDemographics] = useState<{ ageRange?: string; gender?: string } | null>(null);
  
  // Guard to prevent multiple scan tracking calls
  const hasTrackedScanRef = useRef<boolean>(false);

  useEffect(() => {
    if (slideshow?.audio_url) {
      setPresignedAudioUrl(slideshow.audio_url);
    }
  }, [slideshow]);

  useEffect(() => {
    let isActive = true;
    const loadLeadId = async () => {
      setHasCheckedStoredLeadId(false);
      const routeLeadId = routeLeadIdParam ? Number(routeLeadIdParam) : null;
      if (routeLeadId && Number.isFinite(routeLeadId)) {
        await AsyncStorage.setItem(`open_access_lead_slideshow_${id}`, String(routeLeadId));
        if (isActive) {
          setPreviewPhoneLeadId(routeLeadId);
          setHasCheckedStoredLeadId(true);
        }
        return;
      }
      const storedLeadId = await AsyncStorage.getItem(`open_access_lead_slideshow_${id}`);
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

  const shouldRedirectForOpenAccessLead =
    Boolean(slideshow) &&
    Boolean((slideshow as any)?.requirePhoneForOpenAccess) &&
    hasCheckedStoredLeadId &&
    !previewPhoneLeadId &&
    !loading;

  useEffect(() => {
    if (shouldRedirectForOpenAccessLead) {
      router.replace(`/slideshow-access/${id}` as any);
    }
  }, [shouldRedirectForOpenAccessLead, id]);

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
      if (!slideshow || loading || shouldRedirectForOpenAccessLead) {
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
  }, [slideshow, loading, isAuthenticated, shouldRedirectForOpenAccessLead, userDemographics]);

  // Track QR scan when slideshow loads (only once per mount)
  useEffect(() => {
    if (!slideshow || hasTrackedScanRef.current) return;
    if ((slideshow as any).requirePhoneForOpenAccess && !previewPhoneLeadId) return;
    const qrId = slideshow?.qr_code_id || slideshow?.qrCodeId;
    if (!qrId) return;
    hasTrackedScanRef.current = true;
    const demographics = getDemographicsForTracking(isAuthenticated, userDemographics);
    analyticsService.trackQRScan(Number(qrId), {
      ...(demographics?.ageRange ? { userAge: demographics.ageRange } : {}),
      ...(demographics?.gender ? { userGender: demographics.gender } : {}),
      ...(previewPhoneLeadId ? { previewPhoneLeadId } : {}),
    }).catch((e) => {
      console.warn('Analytics track scan failed (slideshow-player):', e);
      hasTrackedScanRef.current = false;
    });
  }, [slideshow, isAuthenticated, previewPhoneLeadId, userDemographics]);

  const errorMessage = isError && error
    ? (error as any)?.response?.status === 403
      ? 'Access denied. Please check your activation code.'
      : (error as any)?.response?.status === 404
        ? 'Slideshow not found'
        : (error as any)?.response?.data?.message || 'Failed to load slideshow'
    : null;

  if (loading && !slideshow) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading slideshow...</Text>
      </View>
    );
  }

  if (errorMessage && !slideshow) {
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

  if (!slideshow) {
    return null;
  }

  if (shouldRedirectForOpenAccessLead) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Opening access screen...</Text>
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
            ...(previewPhoneLeadId ? { previewPhoneLeadId } : {}),
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

      <LocationOptInPrompt
        enabled={Boolean(slideshow) && !loading && !shouldRedirectForOpenAccessLead}
        scope={{ contentType: 'slideshow', contentId: id, leadId: previewPhoneLeadId }}
        qrCodeId={(slideshow as any)?.qr_code_id || (slideshow as any)?.qrCodeId || Number(id)}
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