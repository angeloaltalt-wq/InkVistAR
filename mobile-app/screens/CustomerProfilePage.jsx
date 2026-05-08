import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, RefreshControl,
  Modal, TextInput, Alert, Animated, Switch, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import {
  LogOut, Edit3, X, Phone, MapPin, Palette, Heart, Users, Check,
  Lock, ShieldAlert, Activity, Eye, EyeOff
} from 'lucide-react-native';
import { colors, typography, borderRadius } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { getInitials } from '../src/utils/formatters';
import { getCustomerDashboard, updateCustomerProfile, getCustomerProfile } from '../src/utils/api';
import { changePassword, sendOtp, verifyOtp } from '../src/api/authAPI';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

const AnimatedTouch = Animated.createAnimatedComponent(TouchableOpacity);

const AnimatedTouchable = ({ children, onPress, style, activeOpacity = 0.9 }) => {
  const { hapticsEnabled } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
  };
  const pressOut = () => Animated.spring(scale, { toValue: 1, damping: 15, useNativeDriver: true }).start();
  return (
    <AnimatedTouch style={[style, { transform: [{ scale }] }]} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={activeOpacity}>
      {children}
    </AnimatedTouch>
  );
};

export function CustomerProfilePage({ userId, userName, userEmail, onLogout }) {
  const { theme, isDark, toggleTheme, hapticsEnabled, toggleHaptics } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [profile, setProfile] = useState({ name: userName || '', email: userEmail || '', phone: '', location: '' });
  const [stats, setStats] = useState({ tattoos: 0, designs: 0, artists: 0 });
  const [medicalNotes, setMedicalNotes] = useState({ allergies: '', skinConditions: '', emergencyContact: '' });

  const [isEditProfileVisible, setEditProfileVisible] = useState(false);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isMedicalVisible, setMedicalVisible] = useState(false);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);

  const [editForm, setEditForm] = useState({});
  const [medicalForm, setMedicalForm] = useState({});
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpMethod, setOtpMethod] = useState('email');
  
  const [alertModal, setAlertModal] = useState({ visible: false, title: '', message: '', buttons: [] });
  const customAlert = (title, message, buttons = []) => {
    setAlertModal({ visible: true, title, message, buttons });
  };

  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(1)).current;
  const styles = getStyles(theme);

  useEffect(() => { if (userId) fetchProfile(); }, [userId]);

  const fetchProfile = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await getCustomerDashboard(userId);
      if (res.success && res.customer) {
        setProfile({
          name: res.customer.name, email: res.customer.email,
          phone: res.customer.phone || '', location: res.customer.location || '',
          profile_image: res.customer.profile_image || '',
        });
        setStats({
          tattoos: res.stats?.total_tattoos || 0,
          designs: res.stats?.saved_designs || 0,
          artists: res.stats?.artists || 0,
        });
        if (res.customer.medicalNotes) setMedicalNotes(res.customer.medicalNotes);
      }
      // Also fetch profile endpoint to load medical notes from the 'notes' column
      const profileRes = await getCustomerProfile(userId);
      if (profileRes.success && profileRes.profile?.notes) {
        try {
          const parsed = JSON.parse(profileRes.profile.notes);
          if (parsed.medicalNotes) setMedicalNotes(parsed.medicalNotes);
          else if (parsed.allergies || parsed.skinConditions) setMedicalNotes(parsed);
        } catch (e) { /* notes is plain text, not medical JSON */ }
      }
    } catch (e) { console.error('Profile error:', e); }
    finally { setLoading(false); }
  };

  const handleEdit = () => { setEditForm({ ...profile }); setEditProfileVisible(true); };
  const handleMedicalEdit = () => { setMedicalForm({ ...medicalNotes }); setMedicalVisible(true); };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  };

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();
  };

  const handleProfileSave = async () => {
    setLoading(true);
    try {
      const res = await updateCustomerProfile(userId, editForm);
      if (res.success) {
        Alert.alert('Success', 'Profile updated successfully', [{ text: 'OK' }]);
        setProfile(editForm); setEditProfileVisible(false);
      } else {
        Alert.alert('Error', res.message || 'Failed to update');
      }
    } catch (e) { Alert.alert('Error', 'An error occurred'); }
    finally { setLoading(false); }
  };

  const handleMedicalSave = async () => {
    setLoading(true);
    try {
      // Serialize medical data as JSON into the 'notes' column
      const medicalJson = JSON.stringify({ medicalNotes: medicalForm });
      const payload = { notes: medicalJson };
      const res = await updateCustomerProfile(userId, payload);
      if (res.success) {
        setMedicalNotes(medicalForm); setMedicalVisible(false);
        Alert.alert('Saved', 'Health profile updated successfully.');
      } else {
        Alert.alert('Error', res.message || 'Failed to save health profile.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not save health profile.');
    }
    finally { setLoading(false); }
  };

  const handleOtpMethodSelect = (method) => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (method === 'sms') {
      customAlert('Coming Soon', 'We cant afford an SMS gateway right now. Please use Email for now.');
      setOtpMethod('email');
    } else {
      setOtpMethod('email');
    }
  };

  const handleAvatarPress = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.spring(avatarScale, { toValue: 1.15, useNativeDriver: true }),
      Animated.spring(avatarScale, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true })
    ]).start();

    // Use native Alert instead of custom Modal to avoid Android blocking the image picker
    Alert.alert('Profile Picture', 'Update your avatar?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose from Library', onPress: pickImage }
    ]);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      customAlert('Permission Denied', 'Sorry, we need camera roll permissions to update your profile picture.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setProfile(prev => ({ ...prev, profile_image: base64Img }));
      await updateCustomerProfile(userId, { profileImage: base64Img });
    }
  };

  const calculateCompletion = () => {
    let score = 0;
    if (profile.name) score += 20;
    if (profile.email) score += 20;
    if (profile.phone) score += 20;
    if (profile.location) score += 20;
    if (medicalNotes.allergies || medicalNotes.skinConditions) score += 20;
    return score;
  };
  const completionScore = calculateCompletion();

  const handlePasswordSave = async () => {
    setPasswordError('');
    if (!otpStep) {
      if (!passwordForm.current || !passwordForm.new || !passwordForm.confirm) {
        setPasswordError('All fields are required'); triggerShake(); return;
      }
      if (passwordForm.new.length < 8) {
        setPasswordError('New password must be at least 8 characters'); triggerShake(); return;
      }
      if (passwordForm.new !== passwordForm.confirm) {
        setPasswordError('New passwords do not match'); triggerShake(); return;
      }

      setLoading(true);
      try {
        const res = await sendOtp(profile.email, 'email');
        if (res.success) {
          setOtpStep(true);
        } else {
          setPasswordError(res.message || 'Failed to send OTP'); triggerShake();
        }
      } catch (e) {
        setPasswordError('Server error sending OTP'); triggerShake();
      } finally { setLoading(false); }
      return;
    }

    // OTP Verification Step
    if (!otp) {
      setPasswordError('Please enter the OTP'); triggerShake(); return;
    }

    setLoading(true);
    try {
      const verifyRes = await verifyOtp(profile.email, otp);
      if (verifyRes.success) {
        const res = await changePassword(passwordForm.current, passwordForm.new);
        if (res.success) {
          customAlert('Success', 'Password updated successfully');
          setPasswordVisible(false);
          setOtpStep(false);
          setOtp('');
          setPasswordForm({ current: '', new: '', confirm: '' });
        } else {
          setPasswordError(res.message || 'Failed to update password'); triggerShake();
        }
      } else {
        setPasswordError(verifyRes.message || 'Invalid OTP'); triggerShake();
      }
    } catch (e) {
      setPasswordError('Incorrect current password or server error'); triggerShake();
    } finally { setLoading(false); }
  };

  const togglePasswordVisibility = (field) => {
    setShowPassword(prev => ({ ...prev, [field]: !prev[field] }));
  };

  if (loading && !isEditProfileVisible && !isPasswordVisible && !isMedicalVisible) {
    return <SafeAreaView style={styles.container}><PremiumLoader message="Loading profile..." /></SafeAreaView>;
  }

  const statItems = [
    { Icon: Palette, label: 'Tattoos', value: stats.tattoos },
    { Icon: Heart, label: 'Designs', value: stats.designs },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.gold} />}>
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
                <Image source={{ uri: profile.profile_image }} style={{ width: 96, height: 96, borderRadius: 48 }} />
              ) : (
                <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
              )}
            </Animated.View>
          </AnimatedTouchable>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.email}>{profile.email}</Text>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <AnimatedTouchable style={styles.editBtn} onPress={handleEdit}>
              <Edit3 size={14} color={theme.gold} />
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </AnimatedTouchable>
          </View>

          {/* Profile Completion Bar */}
          <View style={styles.progressContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ ...typography.bodyXSmall, color: theme.textSecondary }}>Profile Strength</Text>
              <Text style={{ ...typography.bodyXSmall, color: completionScore === 100 ? theme.success : theme.gold, fontWeight: '700' }}>
                {completionScore}%
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: `${completionScore}%`, backgroundColor: completionScore === 100 ? theme.success : theme.gold }]} />
            </View>
          </View>
        </View>

        {/* Stats Bento */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity Overview</Text>
          <View style={styles.statsRow}>
            {statItems.map((s, i) => (
              <View key={i} style={styles.statItem}>
                <View style={styles.statIconWrap}>
                  <s.Icon size={20} color={theme.gold} />
                </View>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Medical & Safety Profile (NEW UX FEATURE) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Health & Safety Profile</Text>
          <View style={styles.detailsContainer}>
            <View style={styles.medicalHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={18} color={theme.warning} />
                <Text style={styles.medicalHeaderTitle}>Studio Medical Record</Text>
              </View>
              <TouchableOpacity onPress={handleMedicalEdit}>
                <Text style={{ color: theme.gold, ...typography.bodySmall, fontWeight: '700' }}>Update</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={styles.medicalLabel}>Known Allergies</Text>
              <Text style={styles.medicalValue}>{medicalNotes.allergies || 'None reported'}</Text>

              <Text style={[styles.medicalLabel, { marginTop: 12 }]}>Skin Conditions / Sensitivities</Text>
              <Text style={styles.medicalValue}>{medicalNotes.skinConditions || 'None reported'}</Text>
            </View>
          </View>
        </View>

        {/* App Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          <View style={styles.detailsContainer}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.statIconWrapSmall}><Palette size={16} color={theme.gold} /></View>
                <Text style={styles.rowLabel}>Dark Mode (Gilded Noir)</Text>
              </View>
              <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ false: theme.border, true: theme.gold }} thumbColor={'#fff'} />
            </View>

            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.statIconWrapSmall}><Activity size={16} color={theme.gold} /></View>
                <Text style={styles.rowLabel}>Haptic Feedback (Vibration)</Text>
              </View>
              <Switch value={hapticsEnabled} onValueChange={toggleHaptics} trackColor={{ false: theme.border, true: theme.gold }} thumbColor={'#fff'} />
            </View>
            
            <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={() => setPasswordVisible(true)}>
              <View style={styles.rowLeft}>
                <View style={styles.statIconWrapSmall}><Lock size={16} color={theme.gold} /></View>
                <Text style={styles.rowLabel}>Change Password</Text>
              </View>
              <Check size={16} color={theme.border} style={{ opacity: 0 }} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={isEditProfileVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditProfileVisible(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { label: 'Full Name', key: 'name', kb: 'default' },
                { label: 'Phone Number', key: 'phone', kb: 'phone-pad' },
                { label: 'Location', key: 'location', kb: 'default' },
              ].map(f => (
                <View key={f.key}>
                  <Text style={styles.inputLabel}>{f.label}</Text>
                  <TextInput
                    style={styles.input}
                    value={String(editForm[f.key] || '')}
                    onChangeText={t => setEditForm({ ...editForm, [f.key]: t })}
                    keyboardType={f.kb}
                    placeholderTextColor={theme.textTertiary}
                  />
                </View>
              ))}
              <AnimatedTouchable style={styles.saveBtn} onPress={handleProfileSave}>
                <Text style={styles.saveBtnText}>Save Changes</Text>
                <Check size={18} color={theme.backgroundDeep} style={{ marginLeft: 8 }} />
              </AnimatedTouchable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={isPasswordVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{otpStep ? 'Verify OTP' : 'Change Password'}</Text>
              <TouchableOpacity onPress={() => { setPasswordVisible(false); setPasswordError(''); setOtpStep(false); }}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Animated.View style={{ transform: [{ translateX: shakeAnimation }] }}>
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

              {!otpStep ? (
                <>
                  {[
                    { label: 'Current Password', key: 'current' },
                    { label: 'New Password', key: 'new' },
                    { label: 'Confirm New Password', key: 'confirm' },
                  ].map(f => (
                    <View key={f.key}>
                      <Text style={styles.inputLabel}>{f.label}</Text>
                      <View style={styles.passwordInputContainer}>
                        <TextInput
                          style={styles.passwordInput}
                          value={passwordForm[f.key]}
                          onChangeText={t => { setPasswordForm({ ...passwordForm, [f.key]: t }); setPasswordError(''); }}
                          secureTextEntry={!showPassword[f.key]}
                          placeholderTextColor={theme.textTertiary}
                        />
                        <TouchableOpacity onPress={() => togglePasswordVisibility(f.key)} style={styles.eyeBtn}>
                          {showPassword[f.key] ? <EyeOff size={20} color={theme.textSecondary} /> : <Eye size={20} color={theme.textSecondary} />}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}

                  <Text style={styles.inputLabel}>OTP Delivery Method</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <TouchableOpacity
                      style={[styles.deliveryBtn, otpMethod === 'email' && styles.deliveryBtnActive]}
                      onPress={() => handleOtpMethodSelect('email')}
                    >
                      <Text style={[styles.deliveryBtnText, otpMethod === 'email' && { color: theme.gold }]}>Email Address</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.deliveryBtn, otpMethod === 'sms' && styles.deliveryBtnActive]}
                      onPress={() => handleOtpMethodSelect('sms')}
                    >
                      <Text style={[styles.deliveryBtnText, otpMethod === 'sms' && { color: theme.gold }]}>SMS Text</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View>
                  <Text style={{ ...typography.bodySmall, color: theme.textSecondary, marginBottom: 16 }}>
                    We've sent a one-time password to your email. Enter it below to confirm your password change.
                  </Text>
                  <Text style={styles.inputLabel}>Enter OTP</Text>
                  <TextInput
                    style={styles.input}
                    value={otp}
                    onChangeText={t => { setOtp(t); setPasswordError(''); }}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                    placeholderTextColor={theme.textTertiary}
                  />
                  <TouchableOpacity onPress={() => sendOtp(profile.email, 'email')} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                    <Text style={{ color: theme.gold, ...typography.bodySmall, fontWeight: '700' }}>Resend OTP</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>

            <AnimatedTouchable style={styles.saveBtn} onPress={handlePasswordSave}>
              <Text style={styles.saveBtnText}>{otpStep ? 'Verify & Save' : 'Send Verification OTP'}</Text>
              <Lock size={18} color={theme.backgroundDeep} style={{ marginLeft: 8 }} />
            </AnimatedTouchable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Medical Notes Modal */}
      <Modal visible={isMedicalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Health & Safety</Text>
              <TouchableOpacity onPress={() => setMedicalVisible(false)}>
                <X size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{ ...typography.bodySmall, color: theme.textSecondary, marginBottom: 16 }}>
                Your safety is our priority. Please list any medical notes your artist should be aware of before your session.
              </Text>

              <Text style={styles.inputLabel}>Known Allergies (Latex, specific inks, etc.)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                multiline
                value={medicalForm.allergies || ''}
                onChangeText={t => setMedicalForm({ ...medicalForm, allergies: t })}
                placeholder="List any allergies..."
                placeholderTextColor={theme.textTertiary}
              />

              <Text style={styles.inputLabel}>Skin Conditions (Eczema, Keloids, etc.)</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                multiline
                value={medicalForm.skinConditions || ''}
                onChangeText={t => setMedicalForm({ ...medicalForm, skinConditions: t })}
                placeholder="List any skin conditions..."
                placeholderTextColor={theme.textTertiary}
              />

              <AnimatedTouchable style={styles.saveBtn} onPress={handleMedicalSave}>
                <Text style={styles.saveBtnText}>Securely Save</Text>
                <ShieldAlert size={18} color={theme.backgroundDeep} style={{ marginLeft: 8 }} />
              </AnimatedTouchable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal visible={alertModal.visible} animationType="fade" transparent>
        <View style={[styles.modalOverlay, { alignItems: 'center' }]}>
          <View style={[styles.modalCard, { alignItems: 'center', width: '90%' }]}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: `${theme.gold}20`, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <ShieldAlert size={24} color={theme.gold} />
            </View>
            <Text style={{ ...typography.h3, color: theme.textPrimary, marginBottom: 8, textAlign: 'center' }}>{alertModal.title}</Text>
            <Text style={{ ...typography.body, color: theme.textSecondary, marginBottom: 24, textAlign: 'center' }}>{alertModal.message}</Text>
            
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              {alertModal.buttons?.length > 0 ? (
                alertModal.buttons.map((btn, idx) => (
                  <AnimatedTouchable 
                    key={idx} 
                    style={[styles.saveBtn, { flex: 1, marginTop: 0, backgroundColor: btn.style === 'cancel' ? theme.surfaceLight : theme.gold }]}
                    onPress={() => {
                      setAlertModal({ ...alertModal, visible: false });
                      if (btn.onPress) btn.onPress();
                    }}
                  >
                    <Text style={[styles.saveBtnText, { color: btn.style === 'cancel' ? theme.textPrimary : theme.backgroundDeep }]}>{btn.text}</Text>
                  </AnimatedTouchable>
                ))
              ) : (
                <AnimatedTouchable 
                  style={[styles.saveBtn, { flex: 1, marginTop: 0 }]}
                  onPress={() => setAlertModal({ ...alertModal, visible: false })}
                >
                  <Text style={styles.saveBtnText}>OK</Text>
                </AnimatedTouchable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal visible={logoutConfirmVisible} animationType="fade" transparent>
        <View style={[styles.modalOverlay, { alignItems: 'center' }]}>
          <View style={[styles.modalCard, { alignItems: 'center', width: '90%' }]}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: `${theme.error}20`, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <LogOut size={24} color={theme.error} />
            </View>
            <Text style={{ ...typography.h3, color: theme.textPrimary, marginBottom: 8, textAlign: 'center' }}>Sign Out</Text>
            <Text style={{ ...typography.body, color: theme.textSecondary, marginBottom: 24, textAlign: 'center' }}>Are you sure you want to sign out of your account?</Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <AnimatedTouchable
                style={[styles.saveBtn, { flex: 1, marginTop: 0, backgroundColor: theme.surfaceLight }]}
                onPress={() => setLogoutConfirmVisible(false)}
              >
                <Text style={[styles.saveBtnText, { color: theme.textPrimary }]}>Cancel</Text>
              </AnimatedTouchable>
              <AnimatedTouchable
                style={[styles.saveBtn, { flex: 1, marginTop: 0, backgroundColor: theme.error }]}
                onPress={() => { setLogoutConfirmVisible(false); onLogout(); }}
              >
                <Text style={[styles.saveBtnText, { color: '#ffffff' }]}>Sign Out</Text>
              </AnimatedTouchable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  scrollContent: { paddingBottom: 100, paddingHorizontal: 16 },
  header: {
    paddingVertical: 16, paddingTop: Platform.OS === 'ios' ? 16 : 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: { ...typography.h1, color: theme.textPrimary },
  logoutBtn: { padding: 8, backgroundColor: 'transparent' }, // Removed square red background!

  profileCard: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20,
    backgroundColor: theme.surface, borderRadius: borderRadius.xl,
    borderWidth: 1, borderColor: theme.border, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4
  },
  avatarBox: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: theme.surfaceLight,
    borderWidth: 2, borderColor: theme.gold,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  avatarText: { fontSize: 36, color: theme.gold, fontWeight: '800' },
  name: { ...typography.h2, color: theme.textPrimary, marginBottom: 4 },
  email: { ...typography.body, color: theme.textSecondary, marginBottom: 20 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: `${theme.gold}15`,
    borderWidth: 1, borderColor: `${theme.gold}30`,
    borderRadius: borderRadius.round,
  },
  editBtnText: { ...typography.button, color: theme.gold, fontSize: 13 },

  section: { marginBottom: 16 },
  sectionTitle: { ...typography.h4, color: theme.textPrimary, marginBottom: 12, paddingLeft: 4 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  statItem: {
    flex: 1, alignItems: 'center', backgroundColor: theme.surface,
    borderRadius: borderRadius.lg, paddingVertical: 16,
    borderWidth: 1, borderColor: theme.border
  },
  statIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.surfaceLight, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statValue: { ...typography.h3, color: theme.textPrimary, fontWeight: '800', marginBottom: 2 },
  statLabel: { ...typography.bodyXSmall, color: theme.textSecondary },

  detailsContainer: {
    backgroundColor: theme.surface, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: theme.border,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statIconWrapSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  rowLabel: { ...typography.body, color: theme.textSecondary },

  medicalHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border,
    backgroundColor: `${theme.warning}10`, borderTopLeftRadius: borderRadius.lg, borderTopRightRadius: borderRadius.lg
  },
  medicalHeaderTitle: { ...typography.h4, color: theme.warning },
  medicalLabel: { ...typography.bodyXSmall, color: theme.textSecondary, marginBottom: 4 },
  medicalValue: { ...typography.body, color: theme.textPrimary, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,13,14,0.85)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: theme.surface, borderRadius: borderRadius.xl, padding: 24, maxHeight: '85%', borderWidth: 1, borderColor: theme.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { ...typography.h2, color: theme.textPrimary },
  inputLabel: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: theme.backgroundDeep, borderWidth: 1, borderColor: theme.border, borderRadius: borderRadius.md,
    padding: 14, ...typography.body, color: theme.textPrimary,
  },
  passwordInputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.backgroundDeep,
    borderWidth: 1, borderColor: theme.border, borderRadius: borderRadius.md,
  },
  passwordInput: {
    flex: 1, padding: 14, ...typography.body, color: theme.textPrimary,
  },
  eyeBtn: { padding: 14 },
  errorText: { color: theme.error, ...typography.bodySmall, fontWeight: '600', marginBottom: 8, textAlign: 'center' },

  saveBtn: {
    marginTop: 32, backgroundColor: theme.gold, paddingVertical: 16,
    borderRadius: borderRadius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
  },
  saveBtnText: { ...typography.button, color: theme.backgroundDeep, fontSize: 16 },

  progressContainer: { width: '100%', paddingHorizontal: 4, marginTop: 24 },
  progressBarBg: { height: 6, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },

  deliveryBtn: {
    flex: 1, padding: 12, borderRadius: borderRadius.md, borderWidth: 1, borderColor: theme.border, alignItems: 'center', backgroundColor: theme.backgroundDeep
  },
  deliveryBtnActive: {
    borderColor: theme.gold, backgroundColor: `${theme.gold}15`
  },
  deliveryBtnText: {
    ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600'
  }
});
