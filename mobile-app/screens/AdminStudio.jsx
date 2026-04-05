import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export function AdminStudio({ navigation }) {
  const adminModules = [
    { id: 'admin-services', title: 'Services', icon: 'cut', color: '#ec4899', desc: 'Manage tattoo types & prices' },
    { id: 'admin-staff', title: 'Staff', icon: 'people', color: '#10b981', desc: 'Artist scheduling & roles' },
    { id: 'admin-inventory', title: 'Inventory', icon: 'cube', color: '#3b82f6', desc: 'Session supplies tracking' },
    { id: 'admin-tasks', title: 'Tasks', icon: 'checkmark-circle', color: '#f59e0b', desc: 'Studio maintenance' },
    { id: 'admin-pos', title: 'Point of Sale', icon: 'cash', color: '#14b8a6', desc: 'Manual billing entry' },
    { id: 'admin-chat', title: 'Live Chat', icon: 'chatbubbles', color: '#6366f1', desc: 'Active customer support' },
    { id: 'admin-analytics', title: 'Analytics', icon: 'bar-chart', color: '#8b5cf6', desc: 'Studio performance' },
    { id: 'admin-settings', title: 'Settings', icon: 'settings', color: '#6b7280', desc: 'System configuration' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1f2937', '#111827']} style={styles.header}>
        <Text style={styles.headerTitle}>Studio Command Center</Text>
        <Text style={styles.headerSubtitle}>Manage all operational modules</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {adminModules.map((module) => (
            <TouchableOpacity 
              key={module.id} 
              style={styles.card}
              onPress={() => navigation.navigate(module.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.iconBox, { backgroundColor: `${module.color}15` }]}>
                <Ionicons name={module.icon} size={28} color={module.color} />
              </View>
              <Text style={styles.cardTitle}>{module.title}</Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{module.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: {
    padding: 24,
    paddingTop: 50,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginBottom: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 4 },
  headerSubtitle: { fontSize: 14, color: '#9ca3af' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, shadowOffset: { width: 0, height: 4 }
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  cardDesc: { fontSize: 12, color: '#6b7280', lineHeight: 16 }
});
