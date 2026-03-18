import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCustomerDashboard, updateCustomerProfile } from '../src/utils/api';

export function CustomerProfilePage({ userId, userName, userEmail, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    name: userName || '',
    email: userEmail || '',
    phone: '',
    location: ''
  });
  const [stats, setStats] = useState({
    tattoos: 0,
    designs: 0,
    artists: 0
  });

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    if (userId) fetchProfileData();
  }, [userId]);

  const fetchProfileData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await getCustomerDashboard(userId);
      if (response.success && response.customer) {
        setProfile({
          name: response.customer.name,
          email: response.customer.email,
          phone: response.customer.phone || '',
          location: response.customer.location || ''
        });
        setStats({
          tattoos: response.stats?.total_tattoos || 0,
          designs: response.stats?.saved_designs || 0,
          artists: response.stats?.artists || 0
        });
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setEditForm({ ...profile });
    setEditModalVisible(true);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const result = await updateCustomerProfile(userId, editForm);
      if (result.success) {
        Alert.alert('Success', 'Profile updated successfully');
        setProfile(editForm);
        setEditModalVisible(false);
      } else {
        Alert.alert('Error', result.message || 'Failed to update profile');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while saving.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !editModalVisible) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#daa520" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>

        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{profile.name ? profile.name.charAt(0).toUpperCase() : 'C'}</Text>
          </View>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.email}>{profile.email}</Text>
          <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          
          <View style={styles.row}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{profile.phone || 'Not set'}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Location</Text>
            <Text style={styles.value}>{profile.location || 'Not set'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stats</Text>
          <View style={styles.statsRow}>
             <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.tattoos}</Text>
                <Text style={styles.statLabel}>Tattoos</Text>
             </View>
             <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.designs}</Text>
                <Text style={styles.statLabel}>Designs</Text>
             </View>
             <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.artists}</Text>
                <Text style={styles.statLabel}>Artists</Text>
             </View>
          </View>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput 
                style={styles.input} 
                value={editForm.name} 
                onChangeText={(text) => setEditForm({...editForm, name: text})} 
              />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput 
                style={styles.input} 
                value={editForm.phone} 
                onChangeText={(text) => setEditForm({...editForm, phone: text})} 
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Location</Text>
              <TextInput 
                style={styles.input} 
                value={editForm.location} 
                onChangeText={(text) => setEditForm({...editForm, location: text})} 
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 40 },
  header: { padding: 20, paddingTop: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  logoutBtn: { padding: 5 },
  profileHeader: { alignItems: 'center', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#eee' },
  avatarContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#daa520', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  avatarText: { fontSize: 40, color: 'white', fontWeight: 'bold' },
  name: { fontSize: 22, fontWeight: 'bold', color: '#111' },
  email: { fontSize: 16, color: '#6b7280', marginBottom: 15 },
  editButton: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#f3f4f6', borderRadius: 20 },
  editButtonText: { color: '#374151', fontWeight: '600' },
  section: { marginTop: 20, backgroundColor: 'white', padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#111' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  label: { color: '#6b7280', fontSize: 16 },
  value: { color: '#111', fontSize: 16, fontWeight: '500' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#111' },
  statLabel: { fontSize: 14, color: '#6b7280' },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 12, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  inputLabel: { fontSize: 14, color: '#6b7280', marginBottom: 5, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 16 },
  saveButton: { marginTop: 25, backgroundColor: '#daa520', padding: 15, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
