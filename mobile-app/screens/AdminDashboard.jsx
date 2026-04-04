import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAdminDashboard } from '../src/utils/api';

export const AdminDashboard = ({ onLogout, navigation }) => {
  const [stats, setStats] = useState({ users: 0, artists: 0, appointments: 0 });
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const result = await getAdminDashboard();
    if (result.success) {
      setStats(result.data || { users: 0, artists: 0, appointments: 0 });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>
      
      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor="#f59e0b" />}
      >
        <View style={styles.statsGrid}>
          <StatCard title="Total Users" value={stats.users} icon="people" color="#3b82f6" />
          <StatCard title="Artists" value={stats.artists} icon="brush" color="#8b5cf6" />
          <StatCard title="Appointments" value={stats.appointments} icon="calendar" color="#10b981" />
          <StatCard title="Revenue" value="$" icon="cash" color="#ef4444" />
        </View>

        <Text style={styles.sectionTitle}>Management</Text>
        <View style={styles.menuGrid}>
          <MenuButton title="Calendar" icon="calendar" color="#f59e0b" onPress={() => navigation.navigate('Bookings')} />
          <MenuButton title="Clients" icon="people" color="#3b82f6" onPress={() => navigation.navigate('Users')} />
          <MenuButton title="POS & Billing" icon="cash" color="#8b5cf6" onPress={() => navigation.navigate('admin-pos')} />
          <MenuButton title="Support Chat" icon="chatbubbles" color="#0ea5e9" onPress={() => navigation.navigate('admin-chat')} />
          <MenuButton title="Staff" icon="time" color="#10b981" onPress={() => navigation.navigate('admin-staff')} />
          <MenuButton title="Inventory" icon="cube" color="#ec4899" onPress={() => navigation.navigate('admin-inventory')} />
          <MenuButton title="Notifications" icon="notifications" color="#f43f5e" onPress={() => navigation.navigate('admin-notifications')} />
          <MenuButton title="Analytics" icon="bar-chart" color="#0ea5e9" onPress={() => navigation.navigate('admin-analytics')} />
          <MenuButton title="Settings" icon="settings" color="#64748b" onPress={() => navigation.navigate('admin-settings')} />
        </View>
      </ScrollView>
    </View>
  );
};

const StatCard = ({ title, value, icon, color }) => (
  <View style={styles.card}>
    <View style={[styles.iconContainer, { backgroundColor: color }]}>
      <Ionicons name={icon} size={24} color="white" />
    </View>
    <View>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
  </View>
);

const MenuButton = ({ title, icon, color, onPress }) => (
  <TouchableOpacity style={styles.menuButton} onPress={onPress}>
    <View style={[styles.menuIconContainer, { backgroundColor: color }]}>
      <Ionicons name={icon} size={24} color="white" />
    </View>
    <Text style={styles.menuText}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: '#1f2937' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  logoutButton: { padding: 8 },
  content: { padding: 20 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 30 },
  card: { width: '48%', backgroundColor: '#1f2937', padding: 15, borderRadius: 12, marginBottom: 15, flexDirection: 'row', alignItems: 'center' },
  iconContainer: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardValue: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  cardTitle: { fontSize: 12, color: '#9ca3af' },
  section: { backgroundColor: '#1f2937', padding: 20, borderRadius: 12 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: 'white', marginBottom: 10 },
  placeholderText: { color: '#9ca3af' },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 30 },
  menuButton: { width: '31%', backgroundColor: '#1f2937', padding: 15, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  menuIconContainer: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  menuText: { color: 'white', fontSize: 12, fontWeight: 'bold', textAlign: 'center' }
});