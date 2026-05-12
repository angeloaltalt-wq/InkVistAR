/**
 * RegisterPage.jsx -- Gilded Noir Account Creation
 * Validation mirrors web-app/src/pages/Register.js exactly:
 * - firstName, lastName (required), suffix (optional, letters/dots/spaces, max 5)
 * - email: no spaces, max 254, regex validated
 * - phone: digits only, no leading 0, max 10, must start with 9 for PH (+63)
 * - password: min 8, uppercase, lowercase, number, symbol (@$!%*?&#)
 * - confirmPassword: must match
 * Animated tattoo background slideshow, no divider under INKVICTUS.
 */

import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Animated, StatusBar, Dimensions, Keyboard,
} from 'react-native';
import { Eye, EyeOff, Check, User, Mail, Phone, Lock, Shield, ArrowRight, Pencil, Sun, Moon, AlertCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, shadows } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { useToast } from '../src/context/ToastContext';
import { useShakeAnimation } from '../src/utils/animations';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const BG_IMAGES = [
  require('../assets/bg_tattoo_1.png'),
  require('../assets/bg_tattoo_2.png'),
  require('../assets/bg_tattoo_3.png'),
];

// --- Sanitizers (mirroring web filterName / filterDigits) ---
const filterName = (value) => value.replace(/[^a-zA-Z\s.'-]/g, '');
const filterDigits = (value) => value.replace(/\D/g, '');

// Password strength feedback (same 4-step logic as web)
const getPasswordFeedback = (pw) => ({
  hasMinLength: pw.length >= 8,
  hasUppercase: /[A-Z]/.test(pw),
  hasLowercase: /[a-z]/.test(pw),
  hasNumber: /[0-9]/.test(pw),
  hasSymbol: /[@$!%*?&#]/.test(pw),
});

const STRENGTH_STEPS = [
  { key: 'hasMinLength', hint: 'At least 8 characters' },
  { key: 'hasNumber', hint: 'Add a number' },
  { key: (f) => f.hasUppercase && f.hasLowercase, hint: 'Add upper & lowercase letters' },
  { key: 'hasSymbol', hint: 'Add a special character: !@#$%^&*()_+' },
];

export function RegisterPage({ onRegister, onSwitchToLogin }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', suffix: '',
    email: '', phone: '', phoneCode: '+63', password: '', confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [passwordFeedback, setPasswordFeedback] = useState(getPasswordFeedback(''));
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  // Health info (optional, collapsible)
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [selectedConditions, setSelectedConditions] = useState([]);
  const [selectedAllergens, setSelectedAllergens] = useState([]);

  const PRESET_CONDITIONS = ['Diabetes','Hypertension','Heart Condition','Epilepsy','Keloid-prone Skin','Psoriasis','Eczema','Hemophilia','Pregnancy','Immunocompromised','Blood Thinners Medication'];
  const PRESET_ALLERGENS  = ['Latex','Nickel','Tattoo Ink','Penicillin','Aspirin','Ibuprofen','Adhesive/Bandage'];
  const toggleTag = (setArr, tag) => setArr(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);
  const countryCodes = [
    { code: '+63', label: '🇵🇭 Philippines (+63)' },
    { code: '+1', label: '🇺🇸 US/Canada (+1)' },
    { code: '+44', label: '🇬🇧 UK (+44)' },
    { code: '+61', label: '🇦🇺 Australia (+61)' },
    { code: '+81', label: '🇯🇵 Japan (+81)' },
  ];

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const { shakeAnim, triggerShake } = useShakeAnimation();
  const strengthAnim = useRef(new Animated.Value(0)).current;
  const [bgIndex, setBgIndex] = useState(0);
  const bgOpacity = useRef(new Animated.Value(1)).current;

  // Global Theme State
  const { isDark, theme, toggleTheme } = useTheme();
  const overlayColor = isDark ? 'rgba(15,13,14,0.88)' : 'rgba(248,250,252,0.88)';
  const { showToast } = useToast();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, damping: 18, useNativeDriver: true }),
    ]).start();

    const bgInterval = setInterval(() => {
      Animated.timing(bgOpacity, { toValue: 0, duration: 800, useNativeDriver: true }).start(() => {
        setBgIndex(i => (i + 1) % BG_IMAGES.length);
        Animated.timing(bgOpacity, { toValue: 1, duration: 800, useNativeDriver: true }).start();
      });
    }, 5000);
    return () => clearInterval(bgInterval);
  }, []);

  // --- Field-level validation (matches web validateField) ---
  const validateField = (name, value) => {
    let errorMsg = '';
    if (name === 'firstName' && !value.trim()) errorMsg = 'First name is required';
    if (name === 'lastName' && !value.trim()) errorMsg = 'Last name is required';
    if (name === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!value) errorMsg = 'Email is required';
      else if (!emailRegex.test(value)) errorMsg = 'Invalid email format';
    }
    if (name === 'password') {
      const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
      if (!value) errorMsg = 'Password is required';
      else if (value.length < 8) errorMsg = 'Password must be at least 8 characters';
      else if (!strongRegex.test(value)) errorMsg = 'Needs uppercase, lowercase, number & symbol';
    }
    if (name === 'confirmPassword') {
      if (value !== form.password) errorMsg = 'Passwords do not match';
    }
    if (name === 'phone') {
      if (!value) errorMsg = 'Phone number is required';
      else if (form.phoneCode === '+63' && !value.startsWith('9')) errorMsg = 'PH numbers must start with 9 (e.g. 9171234567)';
      else if (form.phoneCode === '+63' && value.length !== 10) errorMsg = 'Phone number must be exactly 10 digits (e.g. 9171234567)';
      else if (form.phoneCode !== '+63' && value.length < 7) errorMsg = 'Phone number is too short';
    }
    setErrors(prev => ({ ...prev, [name]: errorMsg }));
    return errorMsg === '';
  };

  // --- Sanitized change handler (mirrors web handleChange) ---
  const handleChange = (name, raw) => {
    let value = raw;
    if (name === 'firstName' || name === 'lastName') {
      value = filterName(raw).replace(/^\s+/, '').slice(0, 50);
    } else if (name === 'suffix') {
      value = raw.replace(/[^a-zA-Z.\s]/g, '').replace(/^\s+/, '').slice(0, 5);
    } else if (name === 'email') {
      value = raw.replace(/\s/g, '').slice(0, 254);
    } else if (name === 'phone') {
      value = filterDigits(raw).replace(/^0+/, '').slice(0, 10);
    } else if (name === 'password' || name === 'confirmPassword') {
      value = raw.slice(0, 128);
    }

    setForm(prev => ({ ...prev, [name]: value }));

    if (name === 'password') {
      const fb = getPasswordFeedback(value);
      setPasswordFeedback(fb);
      const score = Object.values(fb).filter(Boolean).length;
      Animated.timing(strengthAnim, { toValue: score, duration: 300, useNativeDriver: false }).start();
    }

    validateField(name, value);
  };

  const handleBlur = (name) => {
    setFocusedField(null);
    setPasswordFocused(false);
    validateField(name, form[name]);
  };

  // --- Full form validation before submit ---
  const validate = () => {
    const checks = [
      validateField('firstName', form.firstName),
      validateField('lastName', form.lastName),
      validateField('email', form.email),
      validateField('phone', form.phone),
      validateField('password', form.password),
      validateField('confirmPassword', form.confirmPassword),
    ];
    if (!agreedToTerms) {
      setErrors(prev => ({ ...prev, terms: 'You must accept the Terms of Service' }));
      checks.push(false);
    }
    return checks.every(Boolean);
  };

  const isPasswordFullyValid = () =>
    passwordFeedback.hasMinLength && passwordFeedback.hasUppercase &&
    passwordFeedback.hasLowercase && passwordFeedback.hasNumber && passwordFeedback.hasSymbol;

  const handleSubmit = async () => {
    if (!validate()) { triggerShake(); return; }
    try {
      setSubmitted(true);
      const orphanStr = await AsyncStorage.getItem('orphanAppointmentId');
      const orphanId = orphanStr ? parseInt(orphanStr, 10) : null;
      let rawPhone = form.phone.trim();
      if (rawPhone.length === 10 && form.phoneCode === '+63' && rawPhone.startsWith('9')) {
        // Standard PH format
      }
      const fullPhone = `${form.phoneCode} ${rawPhone}`;
      const fullName = [form.firstName.trim(), form.lastName.trim(), form.suffix.trim()].filter(Boolean).join(' ');
      const result = await onRegister(
        fullName, form.email.toLowerCase().trim(), form.password, fullPhone, 'customer', orphanId,
        selectedConditions, selectedAllergens
      );
      if (result && !result.success) setSubmitted(false);
    } catch (e) { showToast(e.message || 'Registration Failed', 'error'); setSubmitted(false); }
  };

  const handleButtonPressIn = () => { Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start(); };
  const handleButtonPressOut = () => { Animated.spring(buttonScale, { toValue: 1, damping: 15, useNativeDriver: true }).start(); };

  // Password strength bar config
  const strengthScore = Object.values(passwordFeedback).filter(Boolean).length;
  const strengthColors = ['#3A3A3A', '#EF4444', '#F59E0B', '#3B82F6', '#22C55E', '#22C55E'];
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Strong'];
  const nextHint = STRENGTH_STEPS.find(s =>
    typeof s.key === 'function' ? !s.key(passwordFeedback) : !passwordFeedback[s.key]
  );

  const renderInput = (key, placeholder, Icon, opts = {}) => {
    const isFocused = focusedField === key;
    const hasError = errors[key];
    return (
      <View style={[
        styles.inputWrap, 
        { backgroundColor: theme.darkBgSecondary, borderColor: theme.border },
        isFocused && { borderColor: theme.gold, backgroundColor: isDark ? '#1E1B1C' : '#ffffff' }, 
        hasError && { borderColor: theme.error }, 
        opts.style
      ]}>
        <Icon size={17} color={isFocused ? theme.gold : theme.textTertiary} style={styles.inputIcon} />
        {opts.prefix && (
          <TouchableOpacity onPress={opts.onPrefixPress} disabled={!opts.onPrefixPress} style={{ paddingRight: 6 }}>
            <Text style={[styles.phonePrefix, { color: theme.textSecondary, fontWeight: opts.onPrefixPress ? '600' : '400' }]}>{opts.prefix} {opts.onPrefixPress ? '▾' : ''}</Text>
          </TouchableOpacity>
        )}
        <TextInput
          style={[styles.input, { color: theme.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={theme.textTertiary}
          value={form[key]}
          onChangeText={(v) => handleChange(key, v)}
          onFocus={() => { setFocusedField(key); if (key === 'password') setPasswordFocused(true); }}
          onBlur={() => handleBlur(key)}
          secureTextEntry={opts.secure && !opts.show}
          selectionColor={theme.gold}
          {...(opts.extra || {})}
        />
        {opts.secure && (
          <TouchableOpacity onPress={opts.toggle} style={styles.eyeBtn}>
            {opts.show ? <EyeOff size={17} color={theme.textTertiary} /> : <Eye size={17} color={theme.textTertiary} />}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDeep }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.backgroundDeep} />

      {/* Animated Background */}
      <Animated.Image source={BG_IMAGES[bgIndex]} style={[styles.bgImage, { opacity: bgOpacity }]} blurRadius={2} />
      <View style={[styles.bgOverlay, { backgroundColor: overlayColor }]} />

      {/* Theme Toggle */}
      <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
        {isDark ? <Sun size={22} color={theme.textPrimary} /> : <Moon size={22} color={theme.textPrimary} />}
      </TouchableOpacity>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <Animated.View style={[styles.brandSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={[styles.brandSubtitle, { color: theme.goldMuted }]}>BGC'S PREMIER STUDIO</Text>
            <Text style={[styles.brandTitle, { color: theme.gold }]}>INKVICTUS</Text>
          </Animated.View>

          {/* Form */}
          <Animated.View style={[styles.formSection, { opacity: fadeAnim, transform: [{ translateX: shakeAnim }] }]}>

            <Text style={styles.welcomeText}>Create Account</Text>
            <Text style={styles.welcomeSub}>Begin your tattoo journey today</Text>

            {/* Name Row: First | Last */}
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                {renderInput('firstName', 'First Name', User, { extra: { autoCapitalize: 'words' } })}
                {errors.firstName ? <Text style={styles.errorText}>{errors.firstName}</Text> : null}
              </View>
              <View style={{ width: 8 }} />
              <View style={{ flex: 1 }}>
                {renderInput('lastName', 'Last Name', User, { extra: { autoCapitalize: 'words' } })}
                {errors.lastName ? <Text style={styles.errorText}>{errors.lastName}</Text> : null}
              </View>
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: theme.textTertiary, fontSize: 12, marginBottom: 8, fontWeight: '600' }}>SUFFIX (OPTIONAL)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {['None', 'Jr.', 'Sr.', 'II', 'III', 'IV'].map(opt => (
                   <TouchableOpacity 
                     key={opt} 
                     style={[styles.pill, form.suffix === (opt === 'None' ? '' : opt) && { borderColor: theme.gold, backgroundColor: 'rgba(190,144,85,0.1)' }]}
                     onPress={() => handleChange('suffix', opt === 'None' ? '' : opt)}
                   >
                     <Text style={[styles.pillTxt, { color: theme.textSecondary }, form.suffix === (opt === 'None' ? '' : opt) && { color: theme.gold, fontWeight: '700' }]}>{opt}</Text>
                   </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              {renderInput('email', 'Email address', Mail, { extra: { keyboardType: 'email-address', autoCapitalize: 'none' } })}
              {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
              {renderInput('phone', '9XXXXXXXXX', Phone, { prefix: form.phoneCode, onPrefixPress: () => setShowPhoneDropdown(true), extra: { keyboardType: 'number-pad', returnKeyType: 'done', maxLength: 10, onSubmitEditing: Keyboard.dismiss } })}
              {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              {renderInput('password', 'Create password', Lock, { secure: true, show: showPassword, toggle: () => setShowPassword(!showPassword) })}
              {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
            </View>

            {/* Password Strength Meter */}
            {(passwordFocused || form.password.length > 0) && (
              <View style={styles.strengthSection}>
                <View style={styles.strengthBarRow}>
                  {[0, 1, 2, 3, 4].map(i => (
                    <View
                      key={i}
                      style={[
                        styles.strengthSegment,
                        { backgroundColor: i < strengthScore ? strengthColors[strengthScore] : '#2B2B2B' },
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.strengthLabelRow}>
                  <Text style={[styles.strengthLabel, { color: strengthColors[strengthScore] }]}>
                    {strengthLabels[strengthScore]}
                  </Text>
                  {nextHint && <Text style={styles.strengthHint}>{nextHint.hint}</Text>}
                </View>
              </View>
            )}

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              {renderInput('confirmPassword', 'Confirm password', Shield, { secure: true, show: showConfirmPassword, toggle: () => setShowConfirmPassword(!showConfirmPassword) })}
              {errors.confirmPassword ? <Text style={styles.errorText}>{errors.confirmPassword}</Text> : null}
            </View>

            {/* Terms */}
            <TouchableOpacity style={styles.checkRow} onPress={() => setAgreedToTerms(!agreedToTerms)} activeOpacity={0.7}>
              <View style={[styles.checkbox, agreedToTerms && styles.checkboxActive, errors.terms && styles.checkboxError]}>
                {agreedToTerms && <Check size={11} color={colors.backgroundDeep} />}
              </View>
              <Text style={styles.checkLabel}>
                I agree to the <Text style={styles.checkLink}>Terms of Service</Text> and <Text style={styles.checkLink}>Privacy Policy</Text>
              </Text>
            </TouchableOpacity>
            {errors.terms ? <Text style={[styles.errorText, { marginTop: -8, marginBottom: 12 }]}>{errors.terms}</Text> : null}

            {/* Optional Health Info section */}
            <TouchableOpacity
              onPress={() => setHealthExpanded(p => !p)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
                backgroundColor: theme.darkBgSecondary, borderWidth: 1, borderColor: theme.border, marginBottom: 14
              }}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Shield size={15} color={theme.gold} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary }}>Health Info (Optional)</Text>
                {(selectedConditions.length + selectedAllergens.length) > 0 && (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: `${theme.gold}25` }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.gold }}>{selectedConditions.length + selectedAllergens.length}</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: theme.textTertiary, fontSize: 18, lineHeight: 22 }}>{healthExpanded ? '−' : '+'}</Text>
            </TouchableOpacity>

            {healthExpanded && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textTertiary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Health Conditions</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
                  {PRESET_CONDITIONS.map(c => {
                    const active = selectedConditions.includes(c);
                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => toggleTag(setSelectedConditions, c)}
                        style={{
                          paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
                          borderColor: active ? theme.gold : 'rgba(150,150,150,0.3)',
                          backgroundColor: active ? `${theme.gold}18` : 'transparent'
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? theme.gold : theme.textSecondary }}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textTertiary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Known Allergens</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 }}>
                  {PRESET_ALLERGENS.map(a => {
                    const active = selectedAllergens.includes(a);
                    return (
                      <TouchableOpacity
                        key={a}
                        onPress={() => toggleTag(setSelectedAllergens, a)}
                        style={{
                          paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5,
                          borderColor: active ? '#dc2626' : 'rgba(150,150,150,0.3)',
                          backgroundColor: active ? 'rgba(239,68,68,0.1)' : 'transparent'
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#dc2626' : theme.textSecondary }}>{a}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Submit */}
            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                onPress={handleSubmit}
                onPressIn={handleButtonPressIn}
                onPressOut={handleButtonPressOut}
                disabled={submitted}
                activeOpacity={1}
              >
                <View style={[styles.button, submitted && styles.buttonDisabled]}>
                  <Text style={styles.buttonText}>{submitted ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}</Text>
                  {!submitted && <ArrowRight size={17} color={colors.backgroundDeep} style={{ marginLeft: 8 }} />}
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={onSwitchToLogin}>
                <Text style={styles.link}>Sign In</Text>
              </TouchableOpacity>
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Phone Code Dropdown Overlay */}
      {showPhoneDropdown && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, elevation: 9999 }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowPhoneDropdown(false)} />
          <View style={{ backgroundColor: theme.darkBgSecondary, width: '80%', borderRadius: 16, padding: 20, zIndex: 10000, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginBottom: 16 }}>Select Country Code</Text>
            {countryCodes.map((cc, i) => (
              <TouchableOpacity 
                key={cc.code} 
                style={{ paddingVertical: 14, borderBottomWidth: i === countryCodes.length - 1 ? 0 : 1, borderBottomColor: theme.border }}
                onPress={() => { setForm(p => ({...p, phoneCode: cc.code})); setShowPhoneDropdown(false); }}
              >
                <Text style={{ color: theme.textPrimary, fontSize: 16 }}>{cc.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundDeep },
  themeToggle: { position: 'absolute', top: 50, right: 24, zIndex: 10, padding: 8 },
  bgImage: { position: 'absolute', width: SCREEN_WIDTH, height: SCREEN_HEIGHT, resizeMode: 'cover' },
  bgOverlay: { position: 'absolute', width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: 'rgba(15,13,14,0.88)' },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 60,
    paddingBottom: 40,
  },

  // Brand Header
  brandSection: { alignItems: 'center', marginBottom: 28 },
  brandSubtitle: { fontSize: 11, fontWeight: '500', letterSpacing: 4, color: colors.goldMuted, marginBottom: 6 },
  brandTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 28, fontWeight: '700', letterSpacing: 8, color: colors.gold,
  },

  // Form
  formSection: { paddingBottom: 20 },
  welcomeText: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  welcomeSub: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
  
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(150,150,150,0.3)', backgroundColor: 'transparent' },
  pillTxt: { fontSize: 13, fontWeight: '500' },
  
  miniPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(150,150,150,0.3)' },
  miniPillTxt: { fontSize: 12, fontWeight: '600' },

  // Name Row
  nameRow: { flexDirection: 'row', marginBottom: 4 },
  optionalHint: { fontSize: 11, color: colors.textTertiary, marginBottom: 16, marginLeft: 2 },

  // Inputs
  inputGroup: { marginBottom: 14 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', height: 50,
    backgroundColor: colors.darkBgSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 13,
  },
  inputFocused: { borderColor: colors.gold, backgroundColor: '#1E1B1C' },
  inputError: { borderColor: colors.error },
  inputIcon: { marginRight: 10 },
  phonePrefix: {
    fontSize: 14, color: colors.goldMuted, fontWeight: '600',
    marginRight: 8, paddingRight: 8, borderRightWidth: 1, borderRightColor: colors.border,
  },
  input: { flex: 1, height: '100%', fontSize: 14, color: colors.textPrimary },
  eyeBtn: { padding: 4 },
  errorText: { fontSize: 11, color: colors.error, marginTop: 4, marginLeft: 4, marginBottom: 10 },

  // Strength Meter
  strengthSection: { marginTop: -6, marginBottom: 14 },
  strengthBarRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  strengthSegment: { flex: 1, height: 3, borderRadius: 2 },
  strengthLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  strengthLabel: { fontSize: 11, fontWeight: '600' },
  strengthHint: { fontSize: 11, color: colors.textTertiary },

  // Terms
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 18 },
  checkbox: {
    width: 18, height: 18, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginTop: 2,
  },
  checkboxActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  checkboxError: { borderColor: colors.error },
  checkLabel: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  checkLink: { color: colors.gold, fontWeight: '500' },

  // Button
  button: {
    height: 50, borderRadius: 12, backgroundColor: colors.gold,
    justifyContent: 'center', alignItems: 'center', flexDirection: 'row',
    marginBottom: 18, ...shadows.button,
  },
  buttonDisabled: { backgroundColor: '#3A3A3A' },
  buttonText: { fontSize: 14, fontWeight: '700', letterSpacing: 1.5, color: colors.backgroundDeep },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'center' },
  footerText: { fontSize: 13, color: colors.textSecondary },
  link: { fontSize: 13, color: colors.gold, fontWeight: '600' },
});
