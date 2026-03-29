import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getArtistAppointments } from '../src/utils/api';
import { LinearGradient } from 'expo-linear-gradient';

export const ArtistSessions = ({ artistId, onBack, navigation }) => {
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

  const getStatusInfo = (status) => {
    switch (status?.toLowerCase()) {
      case 'in_progress': return { color: '#daa520', bg: '#fef3c7', icon: 'play-circle' };
      case 'completed': return { color: '#10b981', bg: '#d1fae5', icon: 'checkmark-circle' };
      case 'confirmed': return { color: '#3b82f6', bg: '#dbeafe', icon: 'calendar' };
      case 'cancelled': return { color: '#ef4444', bg: '#fee2e2', icon: 'close-circle' };
      default: return { color: '#6b7280', bg: '#f3f4f6', icon: 'help-circle' };
    }
  };

  const renderSessionItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.timeContainer}>
          <Ionicons name="time-outline" size={16} color="#6b7280" />
          <Text style={styles.timeText}>{item.start_time?.substring(0, 5) || '00:00'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusInfo(item.status).bg }]}>
          <Ionicons name={getStatusInfo(item.status).icon} size={14} color={getStatusInfo(item.status).color} />
          <Text style={[styles.statusBadgeText, { color: getStatusInfo(item.status).color }]}>
            {item.status?.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.clientSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.client_name?.charAt(0) || '?'}</Text>
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.client_name || 'Unknown Client'}</Text>
            <Text style={styles.designTitle} numberOfLines={1}>{item.design_title || 'No design specified'}</Text>
          </View>
        </View>
        
        <View style={styles.priceSection}>
          <Text style={styles.priceLabel}>Earnings</Text>
          <Text style={styles.priceValue}>₱{Number((item.price || 0) * (item.commission_rate || 0.6)).toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        {(item.status === 'confirmed' || item.status === 'in_progress') && (
          <TouchableOpacity 
            style={styles.primaryAction}
            onPress={() => navigation.navigate('artist-active-session', { appointment: item })}
          >
            <LinearGradient
              colors={['#000000', '#daa520']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryActionGradient}
            >
              <Ionicons name="flash" size={16} color="white" />
              <Text style={styles.primaryActionText}>Manage Session</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#000000', '#1f2937']} style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Session Manager</Text>
            <Text style={styles.dateText}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh" size={24} color="#daa520" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#daa520" />
        </View>
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSessionItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#daa520" />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
              <Text style={styles.emptyText}>Your board is clear for today</Text>
              <Text style={styles.emptySubtext}>Check your full schedule for upcoming bookings.</Text>
              <TouchableOpacity 
                style={styles.scheduleLink}
                onPress={() => navigation.navigate('Schedule')}
              >
                <Text style={styles.scheduleLinkText}>View Full Schedule</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 24, paddingTop: 60, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
  dateText: { fontSize: 14, color: '#ffffff', opacity: 0.7, marginTop: 4 },
  refreshButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  timeContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 16, fontWeight: '700', color: '#111' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  clientSection: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 20, fontWeight: 'bold', color: '#daa520' },
  clientInfo: { flex: 1 },
  clientName: { fontSize: 17, fontWeight: '700', color: '#1f2937' },
  designTitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  priceSection: { alignItems: 'flex-end' },
  priceLabel: { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600' },
  priceValue: { fontSize: 16, fontWeight: '800', color: '#111827' },
  cardActions: { flexDirection: 'row', gap: 12 },
  secondaryAction: { flex: 1, height: 48, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  secondaryActionText: { color: '#4b5563', fontWeight: '600', fontSize: 14 },
  primaryAction: { flex: 2, height: 48, borderRadius: 12, overflow: 'hidden' },
  primaryActionGradient: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  primaryActionText: { color: 'white', fontWeight: '700', fontSize: 14 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyText: { marginTop: 20, color: '#111827', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtext: { marginTop: 8, color: '#6b7280', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  scheduleLink: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, backgroundColor: '#f3f4f6' },
  scheduleLinkText: { color: '#daa520', fontWeight: '700', fontSize: 15 }
});
