import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import SlideshowPlayer from '@/components/SlideshowPlayer';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

export default function SlideshowPlayerScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const [slideshow, setSlideshow] = useState<any>(null);
  const [presignedAudioUrl, setPresignedAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchSlideshow();
  }, [id]);

  useEffect(() => {
    if (slideshow?.audio_url) {
      // Use the signed URL directly from the slideshow data
      setPresignedAudioUrl(slideshow.audio_url);
    }
  }, [slideshow]);

  const fetchSlideshow = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get(`/slideshow-access/${id}`);
      
      if (response.data) {
        setSlideshow(response.data);
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

  return (
    <SlideshowPlayer
      slideshowId={id}
      slideshow={{ ...slideshow, audioUrl: presignedAudioUrl }}
      autoPlay={false}
    />
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