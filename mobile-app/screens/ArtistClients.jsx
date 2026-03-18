// c:\Users\Ella\Desktop\InkVistAR\mobile-app\screens\ArtistClients.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getArtistAppointments } from '../src/utils/api';

export const ArtistClients = ({ artistId, onBack, navigation }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTodaySessions = async () => {
    try {
      setLoading(true);
      // Format today's date as YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch appointments specifically for today
      const response = await getArtistAppointments(artistId, '', today);
      if (response.success) {
        setSessions(response.appointments || []);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTodaySessions();
  }, [artistId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTodaySessions();
  };

  const renderSessionItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => navigation.navigate('artist-client-details', { session: item })}
    >
      <View style={styles.timeContainer}>
        <Text style={styles.timeText}>{item.start_time ? item.start_time.substring(0, 5) : '00:00'}</Text>
        <View style={[styles.statusDot, { backgroundColor: item.status === 'confirmed' ? '#10b981' : '#f59e0b' }]} />
      </View>
      
      <View style={styles.infoContainer}>
        <Text style={styles.clientName}>{item.client_name || 'Unknown Client'}</Text>
        <Text style={styles.designTitle}>{item.design_title || 'No design specified'}</Text>
        <Text style={styles.statusText}>{item.status}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Today's Sessions</Text>
        <Text style={styles.dateText}>{new Date().toDateString()}</Text>
      </View>

      {sessions.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>No sessions scheduled for today.</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSessionItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { padding: 20, paddingTop: 50, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  dateText: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  listContent: { padding: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  timeContainer: { alignItems: 'center', marginRight: 16, paddingRight: 16, borderRightWidth: 1, borderRightColor: '#f3f4f6' },
  timeText: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  infoContainer: { flex: 1 },
  clientName: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
  designTitle: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  statusText: { fontSize: 12, color: '#9ca3af', marginTop: 4, textTransform: 'capitalize' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 50 },
  emptyText: { marginTop: 10, color: '#9ca3af', fontSize: 16 }
});
