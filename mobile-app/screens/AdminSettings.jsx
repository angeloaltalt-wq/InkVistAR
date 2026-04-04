import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAdminSettings, updateAdminSettings } from '../src/utils/api';

export const AdminSettings = ({ navigation }) => {
  const [settings, setSettings] = useState({
    studio_name: 'InkVistAR Studio',
    allow_registrations: true,
    maintenance_mode: false,
    push_notifications: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      const res = await getAdminSettings();
      if (res.success && res.data) {
        setSettings(prev => ({
          ...prev,
          ...res.data
        }));
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleToggle = async (key) => {
    const newVal = !settings[key];
    const newSettings = { ...settings, [key]: newVal };
    setSettings(newSettings);
    
    setSaving(true);
    const res = await updateAdminSettings({ [key === 'allow_registrations' ? 'allowGuests' : key]: newVal });
    if (!res.success) {
      // rever back
      Alert.alert('Error', 'Failed to update setting');
      setSettings(settings);
    }
    setSaving(false);
  };

  const renderSettingItem = (icon, title, key, type = 'arrow') => (
    <View style={styles.settingItem}>
      <View style={styles.settingLeft}>
        <Ionicons name={icon} size={24} color="#9ca3af" style={styles.settingIcon} />
        <Text style={styles.settingText}>{title}</Text>
      </View>
      {type === 'arrow' ? (
        <Ionicons name="chevron-forward" size={20} color="#6b7280" />
      ) : (
        <Switch 
           trackColor={{ false: "#374151", true: "#f59e0b" }} 
           thumbColor="white" 
           value={settings[key]} 
           onValueChange={() => handleToggle(key)} 
           disabled={saving}
        />
      )}
    </View>
  );

  return (
  <View style={styles.container}>
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color="white" />
      </TouchableOpacity>
      <View style={styles.headerTitleContainer}>
        <Ionicons name="settings" size={24} color="#f59e0b" style={{ marginRight: 10 }} />
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
    </View>
    {loading ? (
      <ActivityIndicator size="large" color="#f59e0b" style={{marginTop: 50}} />
    ) : (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>General</Text>
        <TouchableOpacity style={styles.settingItem}>
           <View style={styles.settingLeft}>
             <Ionicons name="business" size={24} color="#9ca3af" style={styles.settingIcon} />
             <Text style={styles.settingText}>{settings.studio_name}</Text>
           </View>
        </TouchableOpacity>
        
        <Text style={styles.sectionHeader}>App Configuration</Text>
        {renderSettingItem('notifications', 'Push Notifications', 'push_notifications', 'switch')}
        {renderSettingItem('lock-closed', 'Allow New Registrations', 'allow_registrations', 'switch')}
        {renderSettingItem('construct', 'Maintenance Mode', 'maintenance_mode', 'switch')}

        <Text style={styles.sectionHeader}>Account</Text>
        <TouchableOpacity style={styles.settingItem}>
           <View style={styles.settingLeft}>
             <Ionicons name="log-out" size={24} color="#ef4444" style={styles.settingIcon} />
             <Text style={[styles.settingText, {color: '#ef4444'}]}>Log Out</Text>
           </View>
        </TouchableOpacity>
      </ScrollView>
    )}
  </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: '#1f2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  backButton: { padding: 8, marginRight: 8 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  content: { padding: 20 },
  sectionHeader: { color: '#f59e0b', fontSize: 14, fontWeight: 'bold', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1f2937', padding: 16, borderRadius: 12, marginBottom: 8 },
  settingLeft: { flexDirection: 'row', alignItems: 'center' },
  settingIcon: { marginRight: 16 },
  settingText: { color: 'white', fontSize: 16 },
});
