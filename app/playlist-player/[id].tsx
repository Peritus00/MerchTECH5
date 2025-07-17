import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import PlaylistPlayer from '@/components/PlaylistPlayer';
import { api } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

export default function PlaylistPlayerScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  const [playlist, setPlaylist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    fetchPlaylist();
  }, [id]);

  const fetchPlaylist = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.get(`/playlist-access/${id}`);
      
      if (response.data) {
        setPlaylist(response.data);
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

  return (
    <PlaylistPlayer
      playlistId={id}
      playlist={playlist}
      autoPlay={false}
    />
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