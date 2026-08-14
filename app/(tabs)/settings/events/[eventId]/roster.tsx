/**
 * Roster screen — wraps RosterTable for the event management tree.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { RosterTable } from '@/components/events/RosterTable';

export default function RosterScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  return (
    <View style={styles.container}>
      <RosterTable
        eventId={parseInt(eventId, 10)}
        role="event_manager"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
});
