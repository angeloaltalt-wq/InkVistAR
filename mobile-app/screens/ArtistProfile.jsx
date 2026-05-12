/**
 * ArtistProfile.jsx -- Premium Artist Profile & Settings (Gilded Noir v2)
 * Full theme support, animated interactions, haptic feedback, custom modals.
 */
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView,
  Modal, TextInput, RefreshControl, Image, Animated, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import {
  LogOut, Edit3, X, ChevronDown, ChevronUp, Lock, User, Phone, Briefcase,
  Clock, DollarSign, Percent, ShieldAlert, Palette, Activity, Check, Eye, EyeOff, Camera,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { typography, shadows } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { getInitials, formatCurrency } from '../src/utils/formatters';
import { getArtistDashboard, updateArtistProfile, changeArtistPassword } from '../src/utils/api';

export const ArtistProfile = ({ userId, userName, userEmail, onLogout }) => {
  const { theme, isDark, toggleTheme, hapticsEnabled, toggleHaptics } = useTheme();
  const styles = getStyles(theme);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState({
    name: userName || '', email: userEmail || '', phone: '',
    experience_years: 0, specialization: 'General', commission_rate: 0.30,
    profile_image: '',
  });
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [showPwd, setShowPwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', new: '', confirm: '' });
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);
  const [alertModal, setAlertModal] = useState({ visible: false, title: '', message: '' });
  const [specDropdownOpen, setSpecDropdownOpen] = useState(false);

  const avatarScale = useRef(new Animated.Value(1)).current;

  useEffect(() => { fetchProfile(); }, [userId]);

  const fetchProfile = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await getArtistDashboard(userId);
      if (res.success && res.artist) {
        setProfile({
          name: res.artist.name, email: res.artist.email, phone: res.artist.phone || '',
          experience_years: res.artist.experience_years, specialization: res.artist.specialization,
          commission_rate: res.artist.commission_rate,
          profile_image: res.artist.profile_image || '',
        });
      }
    } catch (e) { console.error('Profile load error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = () => { setRefreshing(true); fetchProfile(); };

  const handleEdit = () => {
    setEditForm({ ...profile }); setShowPwd(false);
    setPwdForm({ current: '', new: '', confirm: '' }); setEditModalVisible(true);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (showPwd && pwdForm.current) {
        if (pwdForm.new !== pwdForm.confirm) {
          setAlertModal({ visible: true, title: 'Error', message: 'New passwords do not match.' }); setLoading(false); return;
        }
        const pwdRes = await changeArtistPassword(userId, pwdForm.current, pwdForm.new);
        if (!pwdRes.success) {
          setAlertModal({ visible: true, title: 'Security Error', message: pwdRes.message || 'Failed to change password.' }); setLoading(false); return;
        }
      }
      const res = await updateArtistProfile(userId, editForm);
      if (res.success) {
        setAlertModal({ visible: true, title: 'Success', message: 'Profile updated successfully' });
        setProfile(editForm); setEditModalVisible(false);
      } else {
        setAlertModal({ visible: true, title: 'Error', message: res.message || 'Failed to update profile' });
      }
    } catch (e) { setAlertModal({ visible: true, title: 'Error', message: 'An error occurred' }); }
    finally { setLoading(false); }
  };

  const handleAvatarPress = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(avatarScale, { toValue: 1.15, useNativeDriver: true }),
      Animated.spring(avatarScale, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true })
    ]).start();
    // Use native alert for avatar to avoid modal conflict with image picker
    const { Alert } = require('react-native');
    Alert.alert('Profile Picture', 'Update your avatar?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose from Library', onPress: pickImage }
    ]);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setAlertModal({ visible: true, title: 'Permission Denied', message: 'Camera roll permission is needed.' });
      return;
    }
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setProfile(prev => ({ ...prev, profile_image: base64Img }));
      await updateArtistProfile(userId, { profileImage: base64Img });
    }
  };

  if (loading && !editModalVisible && !refreshing) return <SafeAreaView style={styles.container}><PremiumLoader message="Loading profile..." /></SafeAreaView>;

  const SPECIALIZATIONS = ['General', 'Realism', 'Traditional', 'Japanese', 'Tribal', 'Fine Line', 'Watercolor', 'Minimalist', 'Blackwork', 'Neo-Traditional', 'Geometric', 'Dotwork'];

  const details = [
    { Icon: Briefcase, label: 'Specialization', value: profile.specialization },
    { Icon: Clock, label: 'Experience', value: `${profile.experience_years} Years` },
    { Icon: Phone, label: 'Phone', value: profile.phone || 'Not set' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.gold} />}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <AnimatedTouchable onPress={() => setLogoutConfirmVisible(true)} style={styles.logoutBtn}>
            <LogOut size={22} color={theme.error} />
          </AnimatedTouchable>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <AnimatedTouchable onPress={handleAvatarPress} activeOpacity={1}>
            <Animated.View style={[styles.avatarBox, { transform: [{ scale: avatarScale }] }]}>
              {profile.profile_image ? (
                <Image source={{ uri: profile.profile_image }} style={{ width: 90, height: 90, borderRadius: 45 }} />
              ) : (
                <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
              )}
              <View style={styles.cameraBadge}>
                <Camera size={12} color="#fff" />
              </View>
            </Animated.View>
          </AnimatedTouchable>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.email}>{profile.email}</Text>
          <TouchableOpacity style={styles.editBtn} onPress={handleEdit} activeOpacity={0.8}>
            <View style={{ marginRight: 6 }}><Edit3 size={14} color={theme.gold} /></View>
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Professional Details</Text>
          <View style={styles.detailsContainer}>
            {details.map((d, i) => (
              <View key={i} style={[styles.row, i === details.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.rowLeft}>
                  <View style={styles.iconWrap}><d.Icon size={16} color={theme.gold} /></View>
                  <Text style={styles.rowLabel}>{d.label}</Text>
                </View>
                <Text style={styles.rowValue}>{d.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* App Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          <View style={styles.detailsContainer}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconWrap}><Palette size={16} color={theme.gold} /></View>
                <Text style={styles.rowLabel}>Dark Mode (Gilded Noir)</Text>
              </View>
              <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ false: theme.border, true: theme.gold }} thumbColor={'#fff'} />
            </View>
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <View style={styles.rowLeft}>
                <View style={styles.iconWrap}><Activity size={16} color={theme.gold} /></View>
                <Text style={styles.rowLabel}>Haptic Feedback</Text>
              </View>
              <Switch value={hapticsEnabled} onValueChange={toggleHaptics} trackColor={{ false: theme.border, true: theme.gold }} thumbColor={'#fff'} />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <X size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { label: 'Full Name', key: 'name', kb: 'default' },
                { label: 'Phone Number (+63)', key: 'phone', kb: 'number-pad' },
                { label: 'Experience (Years)', key: 'experience_years', kb: 'numeric' },
              ].map(field => (
                <View key={field.key}>
                  <Text style={styles.inputLabel}>{field.label}</Text>
                  <TextInput
                    style={styles.input}
                    value={String(editForm[field.key] || '')}
                    onChangeText={t => {
                      if (field.key === 'phone') {
                        const digits = t.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
                        setEditForm({ ...editForm, [field.key]: digits });
                      } else {
                        setEditForm({ ...editForm, [field.key]: t });
                      }
                    }}
                    keyboardType={field.kb}
                    placeholderTextColor={theme.textTertiary}
                    placeholder={field.key === 'phone' ? '9XXXXXXXXX' : ''}
                    maxLength={field.key === 'phone' ? 10 : undefined}
                  />
                </View>
              ))}

              {/* Specialization Multi-Select */}
              <Text style={styles.inputLabel}>Specialization</Text>
              <TouchableOpacity style={styles.specDropdownBtn} onPress={() => setSpecDropdownOpen(!specDropdownOpen)} activeOpacity={0.8}>
                <Text style={styles.specDropdownValue} numberOfLines={1}>{editForm.specialization || 'Select specializations...'}</Text>
                {specDropdownOpen ? <ChevronUp size={16} color={theme.gold} /> : <ChevronDown size={16} color={theme.gold} />}
              </TouchableOpacity>
              {specDropdownOpen && (
                <View style={styles.specDropdownList}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
                    {SPECIALIZATIONS.map(spec => {
                      const currentSpecs = (editForm.specialization || '').split(',').map(s => s.trim()).filter(Boolean);
                      const isSelected = currentSpecs.includes(spec);
                      return (
                        <TouchableOpacity key={spec} style={styles.specDropdownItem} onPress={() => {
                          let updated;
                          if (isSelected) {
                            updated = currentSpecs.filter(s => s !== spec);
                          } else {
                            updated = [...currentSpecs, spec];
                          }
                          setEditForm({ ...editForm, specialization: updated.join(', ') });
                        }}>
                          <Text style={[styles.specDropdownItemText, isSelected && { color: theme.gold, fontWeight: '700' }]}>{spec}</Text>
                          <View style={[styles.specCheckbox, isSelected && styles.specCheckboxActive]}>
                            {isSelected && <Check size={12} color={theme.backgroundDeep} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <TouchableOpacity style={styles.pwdToggle} onPress={() => setShowPwd(!showPwd)} activeOpacity={0.8}>
                <View style={{ marginRight: 6 }}><Lock size={16} color={theme.gold} /></View>
                <Text style={styles.pwdToggleText}>{showPwd ? 'Hide Password Settings' : 'Change Password'}</Text>
                <View style={{ marginLeft: 6 }}>{showPwd ? <ChevronUp size={16} color={theme.gold} /> : <ChevronDown size={16} color={theme.gold} />}</View>
              </TouchableOpacity>

              {showPwd && (
                <View style={styles.pwdSection}>
                  {[
                    { label: 'Current Password', key: 'current' },
                    { label: 'New Password', key: 'new' },
                    { label: 'Confirm Password', key: 'confirm' },
                  ].map(f => (
                    <View key={f.key}>
                      <Text style={styles.inputLabel}>{f.label}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          secureTextEntry={!showPassword[f.key]}
                          value={pwdForm[f.key]}
                          onChangeText={t => setPwdForm({ ...pwdForm, [f.key]: t })}
                          placeholderTextColor={theme.textTertiary}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(p => ({ ...p, [f.key]: !p[f.key] }))} style={{ position: 'absolute', right: 12 }}>
                          {showPassword[f.key] ? <EyeOff size={18} color={theme.textTertiary} /> : <Eye size={18} color={theme.textTertiary} />}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
                <Text style={styles.saveBtnText}>Save Changes</Text>
                <View style={{ marginLeft: 8 }}><Check size={18} color={theme.backgroundDeep} /></View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Alert Modal */}
      <Modal visible={alertModal.visible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: 'center', width: '85%' }]}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: `${theme.gold}20`, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <ShieldAlert size={24} color={theme.gold} />
            </View>
            <Text style={{ ...typography.h3, color: theme.textPrimary, marginBottom: 8, textAlign: 'center' }}>{alertModal.title}</Text>
            <Text style={{ ...typography.body, color: theme.textSecondary, marginBottom: 24, textAlign: 'center' }}>{alertModal.message}</Text>
            <AnimatedTouchable style={[styles.saveBtn, { width: '100%' }]} onPress={() => setAlertModal({ ...alertModal, visible: false })}>
              <Text style={styles.saveBtnText}>OK</Text>
            </AnimatedTouchable>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal visible={logoutConfirmVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: 'center', width: '85%' }]}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: `${theme.error}20`, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <LogOut size={24} color={theme.error} />
            </View>
            <Text style={{ ...typography.h3, color: theme.textPrimary, marginBottom: 8, textAlign: 'center' }}>Sign Out</Text>
            <Text style={{ ...typography.body, color: theme.textSecondary, marginBottom: 24, textAlign: 'center' }}>Are you sure you want to sign out?</Text>
            <View style={{ flexDirection: 'row', width: '100%' }}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: theme.surfaceLight, marginRight: 6 }]} onPress={() => setLogoutConfirmVisible(false)} activeOpacity={0.8}>
                <Text style={[styles.saveBtnText, { color: theme.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: theme.error, marginLeft: 6 }]} onPress={() => { setLogoutConfirmVisible(false); onLogout(); }} activeOpacity={0.8}>
                <Text style={[styles.saveBtnText, { color: '#ffffff' }]}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const getStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  scrollContent: { paddingBottom: 40 },
  header: {
    padding: 16, paddingTop: Platform.OS === 'ios' ? 20 : 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { ...typography.h2, color: theme.textPrimary },
  logoutBtn: { padding: 8 },
  profileCard: {
    alignItems: 'center', paddingVertical: 24,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  avatarBox: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: theme.surface,
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
    borderWidth: 3, borderColor: theme.gold,
  },
  avatarText: { fontSize: 34, color: theme.gold, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.gold, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: theme.background,
  },
  name: { ...typography.h2, color: theme.textPrimary, marginBottom: 4 },
  email: { ...typography.body, color: theme.textSecondary, marginBottom: 14 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 8, backgroundColor: theme.surface,
    borderRadius: 20, borderWidth: 1, borderColor: theme.borderGold,
  },
  editBtnText: { ...typography.bodySmall, color: theme.gold, fontWeight: '600' },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionTitle: { ...typography.h4, color: theme.textPrimary, marginBottom: 12 },
  detailsContainer: {
    backgroundColor: theme.surface, borderRadius: 16,
    borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.iconGoldBg, justifyContent: 'center', alignItems: 'center' },
  rowLabel: { ...typography.body, color: theme.textSecondary },
  rowValue: { ...typography.body, color: theme.textPrimary, fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 20, maxHeight: '85%', width: '100%', borderWidth: 1, borderColor: theme.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { ...typography.h3, color: theme.textPrimary },
  inputLabel: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '600', marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    padding: 12, ...typography.body, color: theme.textPrimary,
    backgroundColor: theme.surfaceLight,
  },
  specDropdownBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: theme.border, borderRadius: 12,
    padding: 12, backgroundColor: theme.surfaceLight,
  },
  specDropdownValue: { ...typography.body, color: theme.textPrimary },
  specDropdownList: {
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
    borderRadius: 12, marginTop: 4, overflow: 'hidden',
  },
  specDropdownItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  specDropdownItemText: { ...typography.body, color: theme.textSecondary },
  specCheckbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.border,
    justifyContent: 'center', alignItems: 'center',
  },
  specCheckboxActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  pwdToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border,
  },
  pwdToggleText: { ...typography.bodySmall, color: theme.gold, fontWeight: '700' },
  pwdSection: { backgroundColor: theme.surfaceLight, padding: 12, borderRadius: 12, marginTop: 6 },
  saveBtn: {
    marginTop: 24, backgroundColor: theme.gold, paddingVertical: 14,
    borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
  },
  saveBtnText: { ...typography.button, color: theme.backgroundDeep, fontSize: 16 },
});
