import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAdminStaff } from '../src/utils/api';

export const AdminStaffScheduling = ({ navigation }) => {
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArtists = async () => {
      setLoading(true);
      const res = await getAdminStaff();
      if (res.success && res.data) {
        setArtists(res.data);
      }
      setLoading(false);
    };
    fetchArtists();
  }, []);

  return (
  <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color="white" />
      </TouchableOpacity>
      <View style={styles.headerTitleContainer}>
        <Ionicons name="people" size={24} color="#10b981" style={{ marginRight: 10 }} />
        <Text style={styles.headerTitle}>Staff Roster</Text>
      </View>
    </View>

    {loading ? (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    ) : (
      <ScrollView contentContainerStyle={styles.content}>
        {artists.length === 0 ? (
          <Text style={{color: '#9ca3af', textAlign: 'center', marginTop: 20}}>No staff found.</Text>
        ) : (
          artists.map(staff => (
            <View key={staff.id} style={styles.shiftCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{staff.name?.charAt(0) || 'U'}</Text>
              </View>
              <View style={styles.shiftInfo}>
                <Text style={styles.artistName}>{staff.name}</Text>
                <Text style={styles.shiftTime}>{staff.email}</Text>
              </View>
              <View style={styles.shiftMeta}>
                <View style={[styles.statusBadge, { backgroundColor: '#10b981' }]}>
                  <Text style={styles.statusText}>{staff.user_type?.toUpperCase()}</Text>
                </View>
                <Text style={styles.stationText} numberOfLines={1}>{staff.title || 'Staff'}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    )}
  </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: '#1f2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  backButton: { padding: 8, marginRight: 8 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  content: { padding: 20 },
  shiftCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  shiftInfo: { flex: 1 },
  artistName: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  shiftTime: { color: '#9ca3af', fontSize: 14 },
  shiftMeta: { alignItems: 'flex-end', width: 80 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 4 },
  statusText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  stationText: { color: '#6b7280', fontSize: 12 },
});
