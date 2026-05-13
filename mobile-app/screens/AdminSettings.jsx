/**
 * AdminSettings.jsx -- App Settings with toggles
 * Themed upgrade matching web's AdminSettings controls.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, SafeAreaView,
  TextInput, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import {
  ArrowLeft, Settings, Bell, Lock, Building2, Save, FileText, FileCode2, Clock,
  AlertTriangle, Plus, Trash2, RotateCcw, MapPin, Phone, Tag, Image, Edit2, X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import { typography, borderRadius, shadows } from '../src/theme';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import {
  getAdminSettings, updateAdminSettings,
  getAdminBranches, createAdminBranch, updateAdminBranch, deleteAdminBranch, restoreAdminBranch,
  getGalleryCategories, fetchAPI,
} from '../src/utils/api';

export const AdminSettings = ({ navigation }) => {
  const { theme, hapticsEnabled } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(theme, insets);

  const [settings, setSettings] = useState({
    studio_name: 'InkVistAR Studio',
    allow_registrations: true,
    maintenance_mode: false,
    push_notifications: true,
    terms_of_service: '',
    cancellation_policy: '',
    reminder_template: '',
    business_hours: {
      monday:    { open: '09:00', close: '18:00', enabled: true },
      tuesday:   { open: '09:00', close: '18:00', enabled: true },
      wednesday: { open: '09:00', close: '18:00', enabled: true },
      thursday:  { open: '09:00', close: '18:00', enabled: true },
      friday:    { open: '09:00', close: '18:00', enabled: true },
      saturday:  { open: '10:00', close: '16:00', enabled: true },
      sunday:    { open: '10:00', close: '14:00', enabled: false },
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Branch management state
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [showArchivedBranches, setShowArchivedBranches] = useState(false);
  const [branchModal, setBranchModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', operating_hours: '', capacity: '' });
  const [branchSaving, setBranchSaving] = useState(false);

  // Gallery categories state
  const [categories, setCategories] = useState([]);
  const [catLoading, setCatLoading] = useState(false);
  const [newCat, setNewCat] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      const res = await getAdminSettings();
      if (res.success && res.data) {
        setSettings(prev => ({ ...prev, ...res.data }));
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true);
    const res = await getAdminBranches(showArchivedBranches);
    if (res.success) setBranches(res.data || []);
    setBranchesLoading(false);
  }, [showArchivedBranches]);

  useEffect(() => { if (activeTab === 'branches') loadBranches(); }, [activeTab, showArchivedBranches]);

  const loadCategories = useCallback(async () => {
    setCatLoading(true);
    const res = await getGalleryCategories();
    if (res.success) setCategories((res.categories || []).filter(c => c !== 'All'));
    setCatLoading(false);
  }, []);

  useEffect(() => { if (activeTab === 'gallery') loadCategories(); }, [activeTab]);

  const openBranchModal = (branch = null) => {
    setEditingBranch(branch);
    setBranchForm(branch
      ? { name: branch.name || '', address: branch.address || '', phone: branch.phone || '', operating_hours: branch.operating_hours || '', capacity: String(branch.capacity || '') }
      : { name: '', address: '', phone: '', operating_hours: '', capacity: '' }
    );
    setBranchModal(true);
  };

  const handleSaveBranch = async () => {
    if (!branchForm.name.trim()) { Alert.alert('Validation', 'Branch name is required.'); return; }
    setBranchSaving(true);
    const payload = { ...branchForm, capacity: branchForm.capacity ? parseInt(branchForm.capacity) : null };
    const res = editingBranch
      ? await updateAdminBranch(editingBranch.id, payload)
      : await createAdminBranch(payload);
    setBranchSaving(false);
    if (res.success) { setBranchModal(false); loadBranches(); }
    else Alert.alert('Error', res.message || 'Failed to save branch.');
  };

  const handleDeleteBranch = (branch) => {
    Alert.alert('Archive Branch', `Archive "${branch.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: async () => {
        const res = await deleteAdminBranch(branch.id);
        if (res.success) loadBranches();
        else Alert.alert('Error', res.message || 'Failed.');
      }},
    ]);
  };

  const handleRestoreBranch = async (branch) => {
    const res = await restoreAdminBranch(branch.id);
    if (res.success) loadBranches();
    else Alert.alert('Error', res.message || 'Failed.');
  };

  const handleAddCategory = async () => {
    const trimmed = newCat.trim();
    if (!trimmed) { Alert.alert('Validation', 'Category name cannot be empty.'); return; }
    const updated = [...categories.filter(c => c !== 'All'), trimmed];
    // Save to app_settings via admin settings endpoint
    const res = await fetchAPI('/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ gallery_categories: updated.join(',') }),
    });
    if (res.success) { setNewCat(''); loadCategories(); }
    else Alert.alert('Error', res.message || 'Failed to save.');
  };

  const handleDeleteCategory = async (cat) => {
    const updated = categories.filter(c => c !== cat);
    const res = await fetchAPI('/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ gallery_categories: updated.join(',') }),
    });
    if (res.success) setCategories(updated);
    else Alert.alert('Error', res.message || 'Failed.');
  };

  const handleToggle = async (key) => {
    const prev = settings;
    const newVal = !settings[key];
    setSettings({ ...settings, [key]: newVal });
    setSaving(true);
    const res = await updateAdminSettings({ [key === 'allow_registrations' ? 'allowGuests' : key]: newVal });
    if (!res.success) {
      Alert.alert('Error', 'Failed to update setting');
      setSettings(prev);
    }
    setSaving(false);
  };

  const handleTextSave = async (key) => {
    setSaving(true);
    const res = await updateAdminSettings({ [key]: settings[key] });
    setSaving(false);
    if (res.success) {
      Alert.alert('Success', 'Settings updated successfully.');
    } else {
      Alert.alert('Error', 'Failed to save changes.');
    }
  };

  if (loading) return <View style={styles.loadingContainer}><PremiumLoader message="Loading settings..." /></View>;

  return (
    <>
      <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AnimatedTouchable onPress={() => navigation?.goBack?.()} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.textPrimary} />
        </AnimatedTouchable>
        <Text style={styles.headerTitle}>System Settings</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <View style={styles.tabContainer}>
          {[
            { key: 'general', icon: Settings, label: 'General' },
            { key: 'branches', icon: Building2, label: 'Branches' },
            { key: 'gallery', icon: Image, label: 'Gallery' },
            { key: 'policies', icon: FileText, label: 'Policies' },
            { key: 'templates', icon: FileCode2, label: 'Templates' },
          ].map(({ key, icon: Icon, label }) => (
            <TouchableOpacity key={key} style={[styles.tab, activeTab === key && styles.activeTab]} onPress={() => setActiveTab(key)}>
              <Icon size={16} color={activeTab === key ? theme.gold : theme.textSecondary} />
              <Text style={[styles.tabText, activeTab === key && styles.activeTabText]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          {activeTab === 'general' && (
            <>
              <Text style={styles.sectionHeader}>Studio Info</Text>
              <View style={styles.settingCard}>
                <View style={styles.settingLeft}>
                  <Building2 size={20} color={theme.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingTitle}>Studio Name</Text>
                    <TextInput 
                      style={styles.textInput} 
                      value={settings.studio_name} 
                      onChangeText={t => setSettings({...settings, studio_name: t})} 
                    />
                  </View>
                </View>
                <AnimatedTouchable style={styles.saveIconBtn} onPress={() => handleTextSave('studio_name')} title="Save studio name">
                  <Save size={18} color={theme.gold} />
                </AnimatedTouchable>
              </View>

              <Text style={styles.sectionHeader}>App Configuration</Text>
              <SettingToggle theme={theme} icon={Bell} title="Push Notifications" subtitle="Send alerts to mobile devices" value={settings.push_notifications} onToggle={() => handleToggle('push_notifications')} disabled={saving} />
              <SettingToggle theme={theme} icon={Lock} title="Allow New Registrations" subtitle="Let new users create accounts" value={settings.allow_registrations} onToggle={() => handleToggle('allow_registrations')} disabled={saving} />

              <Text style={styles.sectionHeader}>Maintenance</Text>
              <SettingToggle theme={theme} icon={AlertTriangle} title="Maintenance Mode" subtitle="Temporarily disables the app for all users" value={settings.maintenance_mode} onToggle={() => handleToggle('maintenance_mode')} disabled={saving} destructive />

              <Text style={styles.sectionHeader}>Business Hours</Text>
              {Object.entries(settings.business_hours).map(([day, cfg]) => (
                <View key={day} style={[styles.settingCard, { flexDirection: 'column', alignItems: 'flex-start', gap: 12 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                      <Clock size={18} color={theme.textSecondary} />
                      <Text style={[styles.settingTitle, { textTransform: 'capitalize' }]}>{day}</Text>
                    </View>
                    <Switch
                      trackColor={{ false: theme.surfaceLight, true: theme.primary }}
                      thumbColor="#ffffff"
                      value={cfg.enabled}
                      onValueChange={v => setSettings(prev => ({
                        ...prev,
                        business_hours: { ...prev.business_hours, [day]: { ...cfg, enabled: v } }
                      }))}
                    />
                  </View>
                  {cfg.enabled && (
                    <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.bodyXSmall, color: theme.textTertiary, marginBottom: 4 }}>Open</Text>
                        <TextInput
                          style={[styles.textInput, { borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 8, color: theme.textPrimary }]}
                          value={cfg.open}
                          placeholder="09:00"
                          placeholderTextColor={theme.textTertiary}
                          onChangeText={t => setSettings(prev => ({
                            ...prev,
                            business_hours: { ...prev.business_hours, [day]: { ...cfg, open: t } }
                          }))}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.bodyXSmall, color: theme.textTertiary, marginBottom: 4 }}>Close</Text>
                        <TextInput
                          style={[styles.textInput, { borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 8, color: theme.textPrimary }]}
                          value={cfg.close}
                          placeholder="18:00"
                          placeholderTextColor={theme.textTertiary}
                          onChangeText={t => setSettings(prev => ({
                            ...prev,
                            business_hours: { ...prev.business_hours, [day]: { ...cfg, close: t } }
                          }))}
                        />
                      </View>
                    </View>
                  )}
                </View>
              ))}
              <AnimatedTouchable
                style={{ backgroundColor: theme.gold, padding: 14, borderRadius: borderRadius.lg, alignItems: 'center', marginTop: 12 }}
                onPress={() => handleTextSave('business_hours')}
                title="Save business hours"
              >
                <Text style={{ ...typography.button, color: theme.backgroundDeep }}>Save Business Hours</Text>
              </AnimatedTouchable>
            </>
          )}

          {activeTab === 'branches' && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={styles.sectionHeader}>Studio Branches</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <AnimatedTouchable
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: showArchivedBranches ? theme.surfaceLight : 'transparent' }}
                    onPress={() => setShowArchivedBranches(v => !v)}
                  >
                    <Text style={{ ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700' }}>{showArchivedBranches ? 'Active' : 'Archived'}</Text>
                  </AnimatedTouchable>
                  <AnimatedTouchable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.gold }}
                    onPress={() => openBranchModal()}
                    title="Add new branch"
                  >
                    <Plus size={14} color={theme.backgroundDeep} />
                    <Text style={{ ...typography.bodyXSmall, color: theme.backgroundDeep, fontWeight: '700' }}>Add</Text>
                  </AnimatedTouchable>
                </View>
              </View>

              {branchesLoading ? (
                <PremiumLoader message="Loading branches..." />
              ) : branches.length === 0 ? (
                <View style={styles.emptyState}>
                  <Building2 size={32} color={theme.textTertiary} />
                  <Text style={styles.emptyText}>{showArchivedBranches ? 'No archived branches.' : 'No branches added yet.'}</Text>
                </View>
              ) : (
                branches.map(branch => (
                  <View key={branch.id} style={styles.branchCard}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Text style={styles.settingTitle}>{branch.name}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: branch.status === 'Open' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }]}>
                          <Text style={{ ...typography.bodyXSmall, color: branch.status === 'Open' ? theme.success : theme.error, fontWeight: '700' }}>{branch.status || 'Closed'}</Text>
                        </View>
                      </View>
                      {branch.address ? <Text style={styles.branchMeta}><MapPin size={11} color={theme.textTertiary} /> {branch.address}</Text> : null}
                      {branch.phone ? <Text style={styles.branchMeta}><Phone size={11} color={theme.textTertiary} /> {branch.phone}</Text> : null}
                      {branch.operating_hours ? <Text style={styles.branchMeta}><Clock size={11} color={theme.textTertiary} /> {branch.operating_hours}</Text> : null}
                      {branch.capacity ? <Text style={styles.branchMeta}>Capacity: {branch.capacity}</Text> : null}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {showArchivedBranches ? (
                        <AnimatedTouchable onPress={() => handleRestoreBranch(branch)} style={styles.iconBtn} title="Restore branch">
                          <RotateCcw size={16} color={theme.success} />
                        </AnimatedTouchable>
                      ) : (
                        <>
                          <AnimatedTouchable onPress={() => openBranchModal(branch)} style={styles.iconBtn} title="Edit branch">
                            <Edit2 size={16} color={theme.gold} />
                          </AnimatedTouchable>
                          <AnimatedTouchable onPress={() => handleDeleteBranch(branch)} style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]} title="Archive branch">
                            <Trash2 size={16} color={theme.error} />
                          </AnimatedTouchable>
                        </>
                      )}
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {activeTab === 'gallery' && (
            <>
              <Text style={styles.sectionHeader}>Gallery Categories</Text>
              <Text style={styles.helperText}>Manage the tattoo style categories displayed in the gallery and booking flow.</Text>

              <View style={[styles.settingCard, { marginBottom: 16 }]}>
                <TextInput
                  style={[styles.textInput, { flex: 1, color: theme.textPrimary, padding: 4 }]}
                  placeholder="New category name..."
                  placeholderTextColor={theme.textTertiary}
                  value={newCat}
                  onChangeText={setNewCat}
                  onSubmitEditing={handleAddCategory}
                  returnKeyType="done"
                />
                <AnimatedTouchable style={[styles.saveIconBtn, { backgroundColor: theme.gold }]} onPress={handleAddCategory} title="Add category">
                  <Plus size={18} color={theme.backgroundDeep} />
                </AnimatedTouchable>
              </View>

              {catLoading ? (
                <PremiumLoader message="Loading categories..." />
              ) : categories.length === 0 ? (
                <View style={styles.emptyState}>
                  <Tag size={32} color={theme.textTertiary} />
                  <Text style={styles.emptyText}>No categories yet. Add one above.</Text>
                </View>
              ) : (
                categories.map((cat, i) => (
                  <View key={i} style={[styles.settingCard, { marginBottom: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Tag size={16} color={theme.gold} />
                      <Text style={styles.settingTitle}>{cat}</Text>
                    </View>
                    <AnimatedTouchable
                      onPress={() => Alert.alert('Delete Category', `Remove "${cat}" from gallery categories?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteCategory(cat) },
                      ])}
                      style={[styles.iconBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}
                      title="Delete category"
                    >
                      <Trash2 size={16} color={theme.error} />
                    </AnimatedTouchable>
                  </View>
                ))
              )}
            </>
          )}

          {activeTab === 'policies' && (
            <>
              <Text style={styles.sectionHeader}>Terms of Service</Text>
              <View style={styles.textAreaContainer}>
                <TextInput 
                  style={styles.textArea} 
                  multiline 
                  numberOfLines={6} 
                  value={settings.terms_of_service} 
                  onChangeText={t => setSettings({...settings, terms_of_service: t})} 
                  placeholder="Enter studio terms of service..."
                  placeholderTextColor={theme.textTertiary}
                />
                <AnimatedTouchable style={styles.saveBtn} onPress={() => handleTextSave('terms_of_service')}>
                  <Text style={styles.saveBtnText}>Save Terms</Text>
                </AnimatedTouchable>
              </View>

              <Text style={styles.sectionHeader}>Cancellation Policy</Text>
              <View style={styles.textAreaContainer}>
                <TextInput 
                  style={styles.textArea} 
                  multiline 
                  numberOfLines={6} 
                  value={settings.cancellation_policy} 
                  onChangeText={t => setSettings({...settings, cancellation_policy: t})} 
                  placeholder="Enter cancellation policy..."
                  placeholderTextColor={theme.textTertiary}
                />
                <AnimatedTouchable style={styles.saveBtn} onPress={() => handleTextSave('cancellation_policy')}>
                  <Text style={styles.saveBtnText}>Save Policy</Text>
                </AnimatedTouchable>
              </View>
            </>
          )}

          {activeTab === 'templates' && (
            <>
              <Text style={styles.sectionHeader}>Appointment Reminder Template</Text>
              <Text style={styles.helperText}>Use {'{client_name}'}, {'{date}'}, {'{time}'} as placeholders.</Text>
              <View style={styles.textAreaContainer}>
                <TextInput 
                  style={styles.textArea} 
                  multiline 
                  numberOfLines={6} 
                  value={settings.reminder_template} 
                  onChangeText={t => setSettings({...settings, reminder_template: t})} 
                  placeholder="Hi {client_name}, this is a reminder for your appointment on {date} at {time}..."
                  placeholderTextColor={theme.textTertiary}
                />
                <AnimatedTouchable style={styles.saveBtn} onPress={() => handleTextSave('reminder_template')}>
                  <Text style={styles.saveBtnText}>Save Template</Text>
                </AnimatedTouchable>
              </View>
            </>
          )}

          <View style={{height: 40}} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>

    {/* Branch Add/Edit Modal */}
    <Modal visible={branchModal} transparent animationType="slide" onRequestClose={() => setBranchModal(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,13,14,0.65)', justifyContent: 'flex-end' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, { padding: 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ ...typography.h3, color: theme.textPrimary }}>{editingBranch ? 'Edit Branch' : 'Add Branch'}</Text>
              <AnimatedTouchable onPress={() => setBranchModal(false)} style={{ padding: 6, backgroundColor: theme.surfaceLight, borderRadius: 16 }}>
                <X size={18} color={theme.textSecondary} />
              </AnimatedTouchable>
            </View>

            {[['name', 'Branch Name *', false], ['address', 'Address', false], ['phone', 'Phone Number', true], ['operating_hours', 'Operating Hours (e.g. 9AM-6PM)', false], ['capacity', 'Capacity', true]].map(([field, placeholder, isNumeric]) => (
              <TextInput
                key={field}
                style={[styles.textInput, { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, color: theme.textPrimary, marginBottom: 10 }]}
                placeholder={placeholder}
                placeholderTextColor={theme.textTertiary}
                value={branchForm[field]}
                onChangeText={t => setBranchForm(f => ({ ...f, [field]: t }))}
                keyboardType={isNumeric ? 'numeric' : 'default'}
              />
            ))}

            <AnimatedTouchable
              style={{ backgroundColor: theme.gold, padding: 14, borderRadius: borderRadius.lg, alignItems: 'center', marginTop: 4 }}
              onPress={handleSaveBranch}
              disabled={branchSaving}
              title="Save branch"
            >
              <Text style={{ ...typography.button, color: theme.backgroundDeep }}>{branchSaving ? 'Saving...' : editingBranch ? 'Save Changes' : 'Add Branch'}</Text>
            </AnimatedTouchable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
    </>
  );
};

const SettingToggle = ({ theme, icon: Icon, title, subtitle, value, onToggle, disabled, destructive }) => (
  <View style={getStyles(theme).settingCard}>
    <View style={getStyles(theme).settingLeft}>
      <Icon size={20} color={destructive ? theme.error : theme.textSecondary} />
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={[getStyles(theme).settingTitle, destructive && { color: theme.error }]}>{title}</Text>
        {subtitle && <Text style={getStyles(theme).settingSub}>{subtitle}</Text>}
      </View>
    </View>
    <Switch
      trackColor={{ false: theme.surfaceLight, true: destructive ? theme.error : theme.primary }}
      thumbColor="#ffffff"
      value={value}
      onValueChange={onToggle}
      disabled={disabled}
    />
  </View>
);

const getStyles = (theme, insets) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: (insets?.top || 0) + 12, paddingBottom: 16,
    backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { ...typography.h2, color: theme.textPrimary },
  tabContainer: { flexDirection: 'row' },
  tab: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: theme.gold },
  tabText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '600' },
  activeTabText: { color: theme.gold },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionHeader: { ...typography.label, color: theme.gold, marginTop: 16, marginBottom: 8 },
  helperText: { ...typography.bodyXSmall, color: theme.textTertiary, marginBottom: 8 },
  settingCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.surface, padding: 16, borderRadius: borderRadius.xl,
    marginBottom: 8, borderWidth: 1, borderColor: theme.border,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingTitle: { ...typography.body, fontWeight: '600', color: theme.textPrimary },
  textInput: { ...typography.bodySmall, color: theme.textSecondary, marginTop: 4, padding: 0 },
  settingSub: { ...typography.bodyXSmall, color: theme.textTertiary, marginTop: 2 },
  saveIconBtn: { padding: 8, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md },
  textAreaContainer: { backgroundColor: theme.surface, borderRadius: borderRadius.xl, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
  textArea: { ...typography.body, color: theme.textPrimary, padding: 16, minHeight: 120, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: theme.surfaceLight, padding: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.border },
  saveBtnText: { ...typography.bodySmall, color: theme.gold, fontWeight: '700' },
  // Branch styles
  branchCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: theme.surface, padding: 16, borderRadius: borderRadius.xl,
    marginBottom: 10, borderWidth: 1, borderColor: theme.borderLight, ...shadows.subtle,
  },
  branchMeta: { ...typography.bodyXSmall, color: theme.textTertiary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  iconBtn: { padding: 8, backgroundColor: theme.surfaceLight, borderRadius: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { ...typography.bodySmall, color: theme.textTertiary },
  // Modal
  modalCard: {
    backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: theme.borderLight, ...shadows.cardStrong,
  },
});

