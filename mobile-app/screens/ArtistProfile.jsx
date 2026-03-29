// c:\Users\Ella\Desktop\InkVistAR\mobile-app\screens\ArtistProfile.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getArtistDashboard, updateArtistProfile, changeArtistPassword } from '../src/utils/api';

export const ArtistProfile = ({ userId, userName, userEmail, onLogout }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    name: userName || '',
    email: userEmail || '',
    phone: '',
    experience_years: 0,
    specialization: 'General',
    hourly_rate: 0,
    commission_rate: 0.60
  });

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  useEffect(() => {
    fetchProfileData();
  }, [userId]);

  const fetchProfileData = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await getArtistDashboard(userId);
      if (response.success && response.artist) {
        setProfile({
          name: response.artist.name,
          email: response.artist.email,
          phone: response.artist.phone || '', 
          experience_years: response.artist.experience_years,
          specialization: response.artist.specialization,
          hourly_rate: response.artist.hourly_rate,
          commission_rate: response.artist.commission_rate
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
    setShowPasswordSection(false);
    setPasswordForm({ current: '', new: '', confirm: '' });
    setEditModalVisible(true);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Handle Password Change if section is visible and current password is provided
      if (showPasswordSection && passwordForm.current) {
        if (passwordForm.new !== passwordForm.confirm) {
          Alert.alert('Error', 'New passwords do not match.');
          setLoading(false);
          return;
        }
        const pwdResult = await changeArtistPassword(userId, passwordForm.current, passwordForm.new);
        if (!pwdResult.success) {
          Alert.alert('Security Error', pwdResult.message || 'Failed to change password.');
          setLoading(false);
          return;
        }
      }

      const result = await updateArtistProfile(userId, editForm);
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
            <Text style={styles.avatarText}>{profile.name ? profile.name.charAt(0).toUpperCase() : 'A'}</Text>
          </View>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.email}>{profile.email}</Text>
          <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Professional Details</Text>
          
          <View style={styles.row}>
            <Text style={styles.label}>Specialization</Text>
            <Text style={styles.value}>{profile.specialization}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Experience</Text>
            <Text style={styles.value}>{profile.experience_years} Years</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Hourly Rate</Text>
            <Text style={styles.value}>${profile.hourly_rate}/hr</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Commission</Text>
            <Text style={styles.value}>{(profile.commission_rate * 100).toFixed(0)}%</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{profile.phone || 'Not set'}</Text>
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

              <Text style={styles.inputLabel}>Specialization</Text>
              <TextInput 
                style={styles.input} 
                value={editForm.specialization} 
                onChangeText={(text) => setEditForm({...editForm, specialization: text})} 
              />

              <Text style={styles.inputLabel}>Experience (Years)</Text>
              <TextInput 
                style={styles.input} 
                value={String(editForm.experience_years)} 
                onChangeText={(text) => setEditForm({...editForm, experience_years: text})} 
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Hourly Rate ($)</Text>
              <TextInput 
                style={styles.input} 
                value={String(editForm.hourly_rate)} 
                onChangeText={(text) => setEditForm({...editForm, hourly_rate: text})} 
                keyboardType="numeric"
              />

              <TouchableOpacity 
                style={styles.passwordToggle} 
                onPress={() => setShowPasswordSection(!showPasswordSection)}
              >
                <Text style={styles.passwordToggleText}>
                  {showPasswordSection ? 'Hide Password Settings' : 'Change Password'}
                </Text>
                <Ionicons name={showPasswordSection ? "chevron-up" : "chevron-down"} size={16} color="#daa520" />
              </TouchableOpacity>

              {showPasswordSection && (
                <View style={styles.passwordSection}>
                  <Text style={styles.inputLabel}>Current Password</Text>
                  <TextInput 
                    style={styles.input} 
                    secureTextEntry
                    value={passwordForm.current}
                    onChangeText={(text) => setPasswordForm({...passwordForm, current: text})}
                    placeholder="Required to change password"
                  />

                  <Text style={styles.inputLabel}>New Password</Text>
                  <TextInput 
                    style={styles.input} 
                    secureTextEntry
                    value={passwordForm.new}
                    onChangeText={(text) => setPasswordForm({...passwordForm, new: text})}
                    placeholder="At least 6 characters"
                  />

                  <Text style={styles.inputLabel}>Confirm New Password</Text>
                  <TextInput 
                    style={[
                      styles.input, 
                      passwordForm.new !== passwordForm.confirm && passwordForm.confirm !== '' ? { borderColor: '#ef4444' } : null
                    ]} 
                    secureTextEntry
                    value={passwordForm.confirm}
                    onChangeText={(text) => setPasswordForm({...passwordForm, confirm: text})}
                  />
                </View>
              )}

              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 12, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  inputLabel: { fontSize: 14, color: '#6b7280', marginBottom: 5, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 16 },
  passwordToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, padding: 10, borderTopWidth: 1, borderTopColor: '#eee' },
  passwordToggleText: { color: '#daa520', fontWeight: 'bold', marginRight: 5 },
  passwordSection: { backgroundColor: '#f9fafb', padding: 10, borderRadius: 8, marginTop: 5 },
  saveButton: { marginTop: 25, backgroundColor: '#daa520', padding: 15, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
