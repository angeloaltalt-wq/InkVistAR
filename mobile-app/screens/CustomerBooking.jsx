import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Alert, Image, Animated, Dimensions, Keyboard, SafeAreaView, Platform, StatusBar
} from 'react-native';
import { ArrowLeft, ChevronLeft, ChevronRight, Camera, CalendarCheck, MapPin, Check, Info, Star, CreditCard, Ticket, Clock, User, Plus, History } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { typography, borderRadius, shadows } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { API_URL } from '../src/utils/api';
import { formatTime } from '../src/utils/formatters';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const tattooBodyParts = ["Face", "Neck", "Chest", "Back", "Left Shoulder", "Right Shoulder", "Left Upper Arm", "Right Upper Arm", "Left Forearm", "Right Forearm", "Left Wrist", "Right Wrist", "Left Hand", "Right Hand", "Left Ribs", "Right Ribs", "Left Hip", "Right Hip", "Left Thigh", "Right Thigh", "Left Calf", "Right Calf", "Left Ankle", "Right Ankle", "Other"];
const piercingBodyParts = ["Left Ear Lobe", "Right Ear Lobe", "Left Helix", "Right Helix", "Left Tragus", "Right Tragus", "Left Conch", "Right Conch", "Left Industrial", "Right Industrial", "Left Nostril", "Right Nostril", "Septum", "Left Eyebrow", "Right Eyebrow", "Lip/Oral", "Navel", "Left Nipple", "Right Nipple", "Other"];

export function CustomerBooking({ customerId, onBack, initialUser }) {
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);

  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 5;
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [completedAppointments, setCompletedAppointments] = useState([]);

  // Form Data

  const getFirstName = () => {
    if (initialUser?.firstName) return initialUser.firstName;
    if (initialUser?.name) return initialUser.name.split(' ')[0];
    return '';
  };
  const getLastName = () => {
    if (initialUser?.lastName) return initialUser.lastName;
    if (initialUser?.name) return initialUser.name.split(' ').slice(1).join(' ');
    return '';
  };

  // Form Data
  const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);
  const countryCodes = [
    { code: '+63', label: '🇵🇭 Philippines (+63)' },
    { code: '+1', label: '🇺🇸 US/Canada (+1)' },
    { code: '+44', label: '🇬🇧 UK (+44)' },
    { code: '+61', label: '🇦🇺 Australia (+61)' },
    { code: '+81', label: '🇯🇵 Japan (+81)' },
  ];

  const [formData, setFormData] = useState({
    bookingType: '', // 'new' | 'followup'
    selectedServices: [],
    followupAppointmentId: null,
    designTitle: '',
    consultationMethod: 'Face-to-Face',
    onlinePlatform: '',
    notes: '',
    placement: [],
    placementNotes: '',
    referenceImage: null,
    artistId: null, // Now optional
    date: '',
    time: '',
    firstName: getFirstName(),
    lastName: getLastName(),
    email: initialUser?.email || '',
    phone: initialUser?.phone ? initialUser.phone.replace(/^0+/, '') : '',
  });

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [bookedDates, setBookedDates] = useState({});

  // Animations
  const stepAnimWidth = useRef(new Animated.Value(20)).current; 
  const ticketSlide = useRef(new Animated.Value(-800)).current;

  // Sound
  const [clickSound, setClickSound] = useState();

  useEffect(() => {
    return clickSound ? () => { clickSound.unloadAsync(); } : undefined;
  }, [clickSound]);

  const triggerFeedback = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/ui/click_1.ogg' },
        { volume: 0.5 }
      );
      setClickSound(sound);
      await sound.playAsync();
    } catch (e) {}
  };

  useEffect(() => { 
    fetchCompletedAppointments();
    fetchAvailability();
  }, []);

  const fetchCompletedAppointments = async () => {
    try {
      const r = await (await fetch(`${API_URL}/customer/${customerId || 'guest'}/appointments`)).json();
      if (r.success) {
        setCompletedAppointments(r.appointments.filter(a => ['completed', 'finished'].includes(a.status?.toLowerCase())));
      }
    } catch (e) {}
  };

  const fetchAvailability = async () => {
    try {
      const r = await (await fetch(`${API_URL}/public/calendar-availability`)).json();
      if (r.success) {
        const bookings = {};
        r.bookings.forEach(b => {
          const ds = typeof b.appointment_date === 'string' ? b.appointment_date.substring(0, 10) : new Date(b.appointment_date).toISOString().split('T')[0];
          if (!bookings[ds]) bookings[ds] = { consultationTimes: [], sessionCount: 0 };
          const sType = (b.service_type || '').toLowerCase();
          if (sType === 'consultation') {
             if (b.start_time) bookings[ds].consultationTimes.push(b.start_time.substring(0, 5));
          } else {
             bookings[ds].sessionCount += 1;
          }
        });
        setBookedDates(bookings);
      }
    } catch (e) {}
  };

  useEffect(() => { fetchAvailability(); }, [currentMonth]);

  const handleInput = (field, val) => {
    setFormData(p => ({ ...p, [field]: val }));
    if (errors[field]) setErrors(p => ({ ...p, [field]: '' }));
  };

  const toggleArrayField = (field, item) => {
    triggerFeedback();
    setFormData(prev => {
      let arr = prev[field] || [];
      if (field === 'selectedServices') {
        const isAdding = !arr.includes(item);
        if (isAdding) {
          if (item === 'Consultation') {
            arr = ['Consultation']; // Mutual exclusion
          } else {
            arr = arr.filter(x => x !== 'Consultation');
            arr.push(item);
          }
        } else {
          arr = arr.filter(x => x !== item);
        }
        return { ...prev, [field]: arr };
      }
      
      const isAdding = !arr.includes(item);
      return { ...prev, [field]: isAdding ? [...arr, item] : arr.filter(x => x !== item) };
    });
    if (errors[field]) setErrors(p => ({ ...p, [field]: '' }));
  };

  const validateSingleField = (field) => {
    let errorMsg = '';
    if (field === 'designTitle') {
      if (formData.designTitle.length < 5) errorMsg = "Idea Name must be at least 5 chars.";
    }
    setErrors(prev => ({ ...prev, [field]: errorMsg }));
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.5, base64: true });
    if (!result.canceled) handleInput('referenceImage', 'data:image/jpeg;base64,' + result.assets[0].base64);
  };

  const validateStep = () => {
    const newErrors = {};
    if (step === 1) {
      if (!formData.bookingType) newErrors.bookingType = "Select booking type.";
      if (formData.bookingType === 'new' && formData.selectedServices.length === 0) newErrors.selectedServices = "Select at least one service.";
      if (formData.bookingType === 'followup') {
        if (!formData.followupAppointmentId) newErrors.followupAppointmentId = "Select a past appointment.";
        else if (formData.selectedServices.length === 0) newErrors.selectedServices = "Select at least one service.";
      }
    } else if (step === 2) {
      if (formData.designTitle.length < 5) newErrors.designTitle = "Idea Name must be at least 5 chars.";
      if (formData.selectedServices.includes('Consultation') && formData.consultationMethod === 'Online' && !formData.onlinePlatform) {
        newErrors.onlinePlatform = "Select a platform.";
      }
    } else if (step === 3) {
      if (formData.placement.length === 0) newErrors.placement = "Select at least one placement.";
      if (formData.placement.includes('Other') && !formData.placementNotes.trim()) newErrors.placementNotes = "Specify location notes.";
    } else if (step === 4) {
      if (!formData.date) newErrors.date = "Select a date.";
      const showTime = formData.selectedServices.includes('Consultation') || formData.selectedServices.includes('Piercing');
      if (showTime && !formData.time) newErrors.time = "Select a time.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    triggerFeedback();
    if (!validateStep()) return;
    if (step < TOTAL_STEPS) {
      const nextStep = step + 1;
      setStep(nextStep);
      Animated.timing(stepAnimWidth, { toValue: (SCREEN_WIDTH - 64) * (nextStep / TOTAL_STEPS), duration: 400, useNativeDriver: false }).start();
      if (nextStep === TOTAL_STEPS) {
        Animated.spring(ticketSlide, { toValue: 0, damping: 14, stiffness: 90, useNativeDriver: true }).start();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      triggerFeedback();
      const prevStep = step - 1;
      setStep(prevStep);
      Animated.timing(stepAnimWidth, { toValue: (SCREEN_WIDTH - 64) * (prevStep / TOTAL_STEPS), duration: 400, useNativeDriver: false }).start();
    } else {
      onBack();
    }
  };

  const getDerivedServiceType = () => {
    if (!formData.selectedServices.length) return formData.bookingType === 'followup' ? 'Follow-Up Session' : '';
    let base = formData.selectedServices[0];
    if (formData.selectedServices.includes('Tattoo Session') && formData.selectedServices.includes('Piercing')) base = 'Tattoo + Piercing';
    return formData.bookingType === 'followup' ? `Follow-Up ${base}` : base;
  };

  const submitBooking = async () => {
    setLoading(true);
    try {
      let followupNote = '';
      if (formData.bookingType === 'followup' && formData.followupAppointmentId) {
        const refAppt = completedAppointments.find(a => a.id === formData.followupAppointmentId);
        const refCode = refAppt ? (refAppt.booking_code || `#${refAppt.id}`) : `#${formData.followupAppointmentId}`;
        followupNote = `\n\nFollow-up of Booking ${refCode}`;
      }

      let rawPhone = formData.phone.trim().replace(/^0+/, '');
      const fullPhone = `${formData.phoneCode || '+63'} ${rawPhone}`;

      const payload = {
        customerId: customerId || null,
        artistId: formData.artistId || null, // Backend auto-assigns or leaves unassigned if null
        date: formData.date,
        startTime: formData.time,
        endTime: formData.time,
        serviceType: getDerivedServiceType(),
        designTitle: formData.designTitle,
        notes: `Method: ${formData.consultationMethod} ${formData.onlinePlatform}\nPlacement: ${formData.placement.join(', ')} ${formData.placementNotes}\nNotes: ${formData.notes}${followupNote}`,
        referenceImage: formData.referenceImage,
        customerName: `${formData.firstName} ${formData.lastName}`,
        guestEmail: formData.email,
        guestPhone: fullPhone
      };

      const r = await (await fetch(`${API_URL}/customer/appointments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })).json();
      
      if (r.success) {
        Alert.alert('Booking Confirmed', 'Your session request has been successfully sent!', [{ text: 'Great!', onPress: onBack }]);
      } else {
        Alert.alert('Booking Failed', r.message || 'Please try again.');
      }
    } catch (e) { Alert.alert('Error', 'Could not connect to server.'); }
    finally { setLoading(false); }
  };

  // ----- RENDERERS -----

  const renderServicesSelection = () => (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.label}>Select Your Services <Text style={{color: colors.error}}>*</Text></Text>
      {['Tattoo Session', 'Consultation', 'Piercing'].map(s => {
        const isSelected = formData.selectedServices.includes(s);
        const isDisabled = !isSelected && (
          (s === 'Consultation' && formData.selectedServices.some(x => ['Tattoo Session', 'Piercing'].includes(x))) ||
          (['Tattoo Session', 'Piercing'].includes(s) && formData.selectedServices.includes('Consultation'))
        );

        return (
          <TouchableOpacity 
            key={s} 
            style={[
              styles.serviceRow, 
              isSelected && styles.serviceRowActive,
              isDisabled && { opacity: 0.5 }
            ]} 
            onPress={() => toggleArrayField('selectedServices', s)}
            disabled={isDisabled}
          >
            <Text style={[styles.serviceTxt, isSelected && styles.serviceTxtActive]}>{s}</Text>
            <View style={[styles.checkbox, isSelected && styles.checkboxActive, isDisabled && { borderColor: colors.border }]}>
              {isSelected && <Check size={14} color={colors.backgroundDeep} />}
            </View>
          </TouchableOpacity>
        )
      })}
      {errors.selectedServices && <Text style={styles.errorTxt}>{errors.selectedServices}</Text>}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>1. Service Type</Text>
      <Text style={styles.stepDesc}>Is this a new booking or a follow-up?</Text>

      <View style={styles.rowBtn}>
        {[{id:'new', label:'New Booking', icon: <Plus size={24} color={formData.bookingType === 'new' ? colors.gold : colors.textPrimary} />}, 
          {id:'followup', label:'Follow-Up', icon: <History size={24} color={formData.bookingType === 'followup' ? colors.gold : colors.textPrimary} />}].map(opt => (
          <TouchableOpacity key={opt.id} style={[styles.cardBtn, formData.bookingType === opt.id && styles.cardBtnActive]} onPress={() => { triggerFeedback(); handleInput('bookingType', opt.id); }}>
            <View style={{ marginBottom: 8 }}>{opt.icon}</View>
            <Text style={[styles.cardBtnTxt, formData.bookingType === opt.id && styles.cardBtnTxtActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {errors.bookingType && <Text style={styles.errorTxt}>{errors.bookingType}</Text>}

      {formData.bookingType === 'new' && (
        <View style={styles.animDrop}>
          {renderServicesSelection()}
        </View>
      )}

      {formData.bookingType === 'followup' && (
        <View style={styles.animDrop}>
          <Text style={styles.label}>Select Previous Appointment <Text style={{color: colors.error}}>*</Text></Text>
          {completedAppointments.length === 0 ? (
            <Text style={styles.errorTxt}>No past completed appointments found.</Text>
          ) : (
            completedAppointments.map(a => (
              <TouchableOpacity key={a.id} style={[styles.apptCard, formData.followupAppointmentId === a.id && styles.apptCardActive]} onPress={() => { triggerFeedback(); handleInput('followupAppointmentId', a.id); }}>
                <Text style={[styles.apptCardTitle, formData.followupAppointmentId === a.id && styles.apptCardTitleActive]}>{a.booking_code || `#${a.id}`} — {a.service_type}</Text>
                <Text style={[styles.apptCardSub, formData.followupAppointmentId === a.id && styles.apptCardSubActive]}>{new Date(a.appointment_date).toLocaleDateString()}</Text>
              </TouchableOpacity>
            ))
          )}
          {errors.followupAppointmentId && <Text style={styles.errorTxt}>{errors.followupAppointmentId}</Text>}
          
          {formData.followupAppointmentId && renderServicesSelection()}
        </View>
      )}
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>2. Share Your Vision</Text>
      <Text style={styles.stepDesc}>Tell us roughly what you're looking for.</Text>

      <View style={styles.inputWrap}>
        <Text style={styles.label}>Idea Name <Text style={{color: colors.error}}>*</Text></Text>
        <TextInput 
          style={[styles.input, { minHeight: 56 }, errors.designTitle && styles.inputError]} 
          placeholder="e.g. Fine-line Floral" 
          placeholderTextColor={colors.textTertiary} 
          value={formData.designTitle} 
          onChangeText={(v) => handleInput('designTitle', v)} 
          onBlur={() => validateSingleField('designTitle')}
          maxLength={150} 
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
        {errors.designTitle && <Text style={styles.errorTxt}>{errors.designTitle}</Text>}
      </View>

      {formData.selectedServices.includes('Consultation') && (
        <>
          <Text style={styles.label}>Consultation Method</Text>
          <View style={styles.row}>
            {['Face-to-Face', 'Online'].map(opt => (
              <TouchableOpacity key={opt} style={[styles.toggleBtn, formData.consultationMethod === opt && styles.toggleBtnActive]} onPress={() => { triggerFeedback(); handleInput('consultationMethod', opt); }}>
                <Text style={[styles.toggleTxt, formData.consultationMethod === opt && styles.toggleTxtActive]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {formData.consultationMethod === 'Online' && (
            <View style={styles.subCard}>
              <Text style={styles.label}>Platform Preference</Text>
              <View style={styles.row}>
                {['Messenger', 'Instagram'].map(opt => (
                  <TouchableOpacity key={opt} style={[styles.subToggle, formData.onlinePlatform === opt && styles.subToggleActive]} onPress={() => handleInput('onlinePlatform', opt)}>
                    <Text style={[styles.subToggleTxt, formData.onlinePlatform === opt && styles.subToggleTxtActive]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errors.onlinePlatform && <Text style={styles.errorTxt}>{errors.onlinePlatform}</Text>}
            </View>
          )}
        </>
      )}

      <View style={styles.inputWrap}>
        <Text style={styles.label}>Additional Details</Text>
        <TextInput 
          style={[styles.input, { height: 120, textAlignVertical: 'top' }]} 
          placeholder="Specific details or meaning..." 
          placeholderTextColor={colors.textTertiary} 
          multiline 
          value={formData.notes} 
          onChangeText={(v) => handleInput('notes', v)} 
          maxLength={500} 
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={Keyboard.dismiss}
        />
        <Text style={styles.counter}>{formData.notes.length}/500</Text>
      </View>

      <Text style={[styles.label, { marginTop: 8 }]}>Reference Image (Optional)</Text>
      <TouchableOpacity style={styles.uploadZone} onPress={pickImage}>
        {formData.referenceImage ? (
          <Image source={{ uri: formData.referenceImage }} style={styles.uploadedImg} />
        ) : (
          <View style={styles.uploadInner}>
            <Camera size={32} color={colors.goldMuted} />
            <Text style={styles.uploadTxt}>Tap to upload inspiration</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderStep3 = () => {
    const showTattoo = formData.selectedServices.includes('Tattoo Session') || formData.selectedServices.includes('Consultation');
    const showPiercing = formData.selectedServices.includes('Piercing');

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>3. Placement</Text>
        
        <Text style={styles.label}>Where is this going? <Text style={{color: colors.error}}>*</Text></Text>
        
        {showTattoo && (
          <>
            {(showTattoo && showPiercing) && <Text style={[styles.label, { color: colors.gold, marginTop: 4, marginBottom: 8, textTransform: 'none' }]}>Tattoo Placement</Text>}
            <View style={styles.pillContainer}>
              {tattooBodyParts.map(part => {
                const isSelected = formData.placement.includes(part);
                return (
                  <TouchableOpacity key={`tattoo-${part}`} style={[styles.pill, isSelected && styles.pillActive]} onPress={() => toggleArrayField('placement', part)}>
                    {isSelected && <Check size={14} color={colors.backgroundDeep} style={{ marginRight: 4 }} />}
                    <Text style={[styles.pillTxt, isSelected && styles.pillTxtActive]}>{part}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {showPiercing && (
          <>
            {(showTattoo && showPiercing) && <Text style={[styles.label, { color: colors.gold, marginTop: 16, marginBottom: 8, textTransform: 'none' }]}>Piercing Placement</Text>}
            <View style={styles.pillContainer}>
              {piercingBodyParts.map(part => {
                const isSelected = formData.placement.includes(part);
                return (
                  <TouchableOpacity key={`piercing-${part}`} style={[styles.pill, isSelected && styles.pillActive]} onPress={() => toggleArrayField('placement', part)}>
                    {isSelected && <Check size={14} color={colors.backgroundDeep} style={{ marginRight: 4 }} />}
                    <Text style={[styles.pillTxt, isSelected && styles.pillTxtActive]}>{part}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {errors.placement && <Text style={styles.errorTxt}>{errors.placement}</Text>}

      {formData.placement.includes('Other') && (
        <View style={styles.inputWrap}>
          <Text style={styles.label}>Specific Location Notes <Text style={{color: colors.error}}>*</Text></Text>
          <TextInput 
            style={[styles.input, errors.placementNotes && styles.inputError]} 
            placeholder="e.g. Left inner forearm" 
            placeholderTextColor={colors.textTertiary} 
            value={formData.placementNotes} 
            onChangeText={(v) => handleInput('placementNotes', v)}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          {errors.placementNotes && <Text style={styles.errorTxt}>{errors.placementNotes}</Text>}
        </View>
      )}
    </View>
    );
  };

  const renderStep4 = () => {
    const showTimeSelection = formData.selectedServices.includes('Consultation') || formData.selectedServices.includes('Piercing');
    const today = new Date();
    today.setHours(0,0,0,0);
    const maxDate = new Date();
    maxDate.setMonth(today.getMonth() + 4);

    return (
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>4. Select Date & Time</Text>
        <Text style={styles.stepDesc}>When would you like to come in?</Text>
        
        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={() => { setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1))); triggerFeedback(); }}><ChevronLeft color={colors.textPrimary} /></TouchableOpacity>
            <Text style={styles.monthText}>{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
            <TouchableOpacity onPress={() => { setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1))); triggerFeedback(); }}><ChevronRight color={colors.textPrimary} /></TouchableOpacity>
          </View>
          
          <View style={styles.calWeekdays}>
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <Text key={i} style={styles.calWeekdayTxt}>{d}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {[...Array(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate())].map((_, i) => {
              const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
              const checkDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1);
              const isSelected = formData.date === dateStr;
              const isPast = checkDate <= today;
              const isTooFar = checkDate > maxDate;
              
              const dateData = bookedDates[dateStr] || { consultationTimes: [], sessionCount: 0 };
              const isFull = dateData.sessionCount >= 4 || dateData.consultationTimes.length >= 7; // Estimated logic
              const isBusy = dateData.sessionCount >= 2 || dateData.consultationTimes.length >= 4;

              const isDisabled = isPast || isTooFar || isFull;
              
              let bgColor = colors.backgroundDeep;
              let txtColor = colors.textPrimary;
              let dotColor = null;

              if (isPast || isTooFar) {
                txtColor = colors.textTertiary;
              } else if (isFull) {
                bgColor = 'rgba(239, 68, 68, 0.1)';
                txtColor = '#991b1b';
                dotColor = '#ef4444';
              } else if (isBusy) {
                bgColor = 'rgba(245, 158, 11, 0.1)';
                txtColor = '#92400e';
                dotColor = '#f59e0b';
              } else {
                bgColor = 'rgba(16, 185, 129, 0.1)';
                txtColor = '#065f46';
                dotColor = '#10b981';
              }

              if (isSelected) {
                bgColor = colors.gold;
                txtColor = '#ffffff';
                dotColor = '#ffffff';
              }

              return (
                <TouchableOpacity 
                  key={i} 
                  style={[styles.dayCell, { backgroundColor: bgColor }, isSelected && styles.dayCellActive, isDisabled && { opacity: 0.5 }]} 
                  onPress={() => { if(!isDisabled) { triggerFeedback(); handleInput('date', dateStr); } }}
                  disabled={isDisabled}
                >
                  <Text style={[styles.dayText, { color: txtColor }, isSelected && styles.dayTextActive]}>{i + 1}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.calLegend}>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#10b981' }]} /><Text style={styles.legendTxt}>Available</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} /><Text style={styles.legendTxt}>Limited</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} /><Text style={styles.legendTxt}>Full</Text></View>
        </View>

        {errors.date && <Text style={styles.errorTxt}>{errors.date}</Text>}

        {showTimeSelection ? (
          formData.date && (
            <View style={{ marginTop: 24 }}>
              <Text style={styles.label}>Select Time</Text>
              <View style={styles.timeGrid}>
                {['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map(t => {
                  const isSelected = formData.time === t;
                  return (
                    <TouchableOpacity key={t} style={[styles.timePill, isSelected && styles.timePillActive]} onPress={() => { triggerFeedback(); handleInput('time', t); }}>
                      <Text style={[styles.timeTxt, isSelected && styles.timeTxtActive]}>
                        {formatTime(t)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {errors.time && <Text style={styles.errorTxt}>{errors.time}</Text>}
            </View>
          )
        ) : (
          <View style={styles.infoBox}>
            <Info size={16} color={colors.textTertiary} style={{ marginTop: 2, marginRight: 8 }} />
            <Text style={styles.infoTxt}>Tattoo Sessions require custom time blocks. Our management will reach out to assign the exact start time for your selected date.</Text>
          </View>
        )}
      </View>
    );
  };

  const renderStep5 = () => (
    <View style={styles.stepContainer}>
      <Animated.View style={[styles.ticket, { transform: [{ translateY: ticketSlide }] }]}>
        <View style={styles.ticketHeader}>
          <Text style={styles.ticketTitle}>Studio Ticket</Text>
          <Ticket size={24} color={colors.gold} />
        </View>
        <View style={styles.ticketBody}>
          <Text style={styles.tLabel}>Service Type</Text>
          <Text style={styles.tValue}>{getDerivedServiceType()}</Text>

          <Text style={styles.tLabel}>Idea</Text>
          <Text style={styles.tValue}>{formData.designTitle || 'N/A'}</Text>
          
          <Text style={styles.tLabel}>Placement</Text>
          <Text style={styles.tValue}>{formData.placement.join(', ') || 'N/A'}</Text>
          
          <Text style={styles.tLabel}>Session Schedule</Text>
          <Text style={styles.tValue}>{formData.date} {formData.time ? `at ${formData.time}` : '(1:00 PM - 8:00 PM)'}</Text>
        </View>
        <View style={styles.ticketDivider}>
          <View style={styles.ticketHoleLeft} />
          <View style={styles.ticketDashes} />
          <View style={styles.ticketHoleRight} />
        </View>
        <View style={styles.ticketFooter}>
          <Text style={styles.tValue}>{formData.firstName} {formData.lastName}</Text>
          <Text style={styles.tLabel}>{formData.email}</Text>
        </View>
      </Animated.View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}><ArrowLeft size={24} color={colors.textPrimary} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Journey</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: stepAnimWidth }]} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.nextBtn} onPress={step === TOTAL_STEPS ? submitBooking : handleNext} disabled={loading}>
          {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.nextTxt}>{step === TOTAL_STEPS ? 'Confirm Booking' : 'Next Step'}</Text>}
        </TouchableOpacity>
      </View>

      {/* Phone Code Dropdown Overlay */}
      {showPhoneDropdown && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 9999, elevation: 9999 }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowPhoneDropdown(false)} />
          <View style={{ backgroundColor: colors.darkBgSecondary, width: '80%', borderRadius: borderRadius.lg, padding: 20, zIndex: 10000, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: 16 }}>Select Country Code</Text>
            {countryCodes.map((cc, i) => (
              <TouchableOpacity 
                key={cc.code} 
                style={{ paddingVertical: 14, borderBottomWidth: i === countryCodes.length - 1 ? 0 : 1, borderBottomColor: colors.border }}
                onPress={() => { triggerFeedback(); handleInput('phoneCode', cc.code); setShowPhoneDropdown(false); }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 16 }}>{cc.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 16, backgroundColor: colors.backgroundDeep },
  headerTitle: { ...typography.h2, color: colors.textPrimary },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.darkBgSecondary, justifyContent: 'center', alignItems: 'center' },
  progressTrack: { height: 4, backgroundColor: colors.border, marginHorizontal: 32, marginTop: 10, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 2 },
  
  stepContainer: { paddingBottom: 40 },
  stepTitle: { ...typography.h1, color: colors.textPrimary, marginBottom: 8 },
  stepDesc: { ...typography.body, color: colors.textSecondary, marginBottom: 24 },
  
  inputWrap: { marginBottom: 20 },
  label: { ...typography.bodySmall, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: colors.backgroundDeep, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: 14, color: colors.textPrimary, ...typography.body },
  inputError: { borderColor: colors.error },
  errorTxt: { ...typography.bodyXSmall, color: colors.error, marginTop: 4 },
  
  miniPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(150,150,150,0.3)' },
  miniPillTxt: { fontSize: 12, fontWeight: '600' },

  counter: { ...typography.bodyXSmall, color: colors.textTertiary, textAlign: 'right', marginTop: 4 },
  
  row: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  rowBtn: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  cardBtn: { flex: 1, paddingVertical: 20, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep, alignItems: 'center', justifyContent: 'center' },
  cardBtnActive: { borderColor: colors.gold, backgroundColor: 'rgba(190, 144, 85, 0.1)' },
  cardBtnTxt: { ...typography.body, color: colors.textSecondary, fontWeight: '700' },
  cardBtnTxtActive: { color: colors.gold },
  
  animDrop: { marginTop: 10 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep, marginBottom: 12 },
  serviceRowActive: { borderColor: colors.gold, backgroundColor: 'rgba(190, 144, 85, 0.1)' },
  serviceTxt: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  serviceTxtActive: { color: colors.gold },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  
  apptCard: { padding: 16, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep, marginBottom: 12 },
  apptCardActive: { borderColor: colors.gold, backgroundColor: 'rgba(190, 144, 85, 0.1)' },
  apptCardTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  apptCardTitleActive: { color: colors.gold },
  apptCardSub: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 4 },
  apptCardSubActive: { color: colors.gold },

  infoBox: { flexDirection: 'row', backgroundColor: colors.darkBgSecondary, padding: 16, borderRadius: borderRadius.md, marginTop: 10, borderWidth: 1, borderColor: colors.border },
  infoTxt: { flex: 1, ...typography.bodyXSmall, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 18 },

  toggleBtn: { flex: 1, paddingVertical: 14, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep, alignItems: 'center' },
  toggleBtnActive: { borderColor: colors.gold, backgroundColor: 'rgba(190, 144, 85, 0.1)' },
  toggleTxt: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  toggleTxtActive: { color: colors.gold },
  
  subCard: { backgroundColor: colors.darkBgSecondary, padding: 16, borderRadius: borderRadius.lg, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  subToggle: { flex: 1, paddingVertical: 10, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep, alignItems: 'center' },
  subToggleActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  subToggleTxt: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  subToggleTxtActive: { color: colors.backgroundDeep },
  
  pillContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  pill: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep, alignItems: 'center' },
  pillActive: { borderColor: colors.gold, backgroundColor: colors.gold, ...shadows.medium },
  pillTxt: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  pillTxtActive: { color: colors.backgroundDeep },
  
  uploadZone: { height: 160, borderRadius: borderRadius.xl, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', backgroundColor: colors.darkBgSecondary, overflow: 'hidden' },
  uploadInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  uploadTxt: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 12 },
  uploadedImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  
  calCard: { backgroundColor: colors.darkBgSecondary, borderRadius: borderRadius.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  monthText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  calWeekdays: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  calWeekdayTxt: { width: '13%', textAlign: 'center', ...typography.bodySmall, color: colors.textTertiary, fontWeight: '700' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 6 },
  dayCell: { width: '12%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: borderRadius.sm, position: 'relative' },
  dayCellActive: { shadowColor: colors.gold, shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  dayText: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '600' },
  dayTextActive: { color: colors.backgroundDeep, fontWeight: '700' },
  dayDot: { width: 4, height: 4, borderRadius: 2, position: 'absolute', bottom: 4 },
  
  calLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { ...typography.bodyXSmall, color: colors.textSecondary },
  
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  timePill: { width: '30%', paddingVertical: 12, borderRadius: borderRadius.lg, backgroundColor: colors.darkBgSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  timePillActive: { borderColor: colors.gold, backgroundColor: 'rgba(190, 144, 85, 0.1)' },
  timeTxt: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  timeTxtActive: { color: colors.gold },
  
  ticket: { backgroundColor: '#fcf8f2', borderRadius: 16, padding: 24, ...shadows.medium, marginHorizontal: 10 },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#f0e6d2', paddingBottom: 16, marginBottom: 16 },
  ticketTitle: { ...typography.h2, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 1 },
  ticketBody: { gap: 16 },
  tLabel: { ...typography.bodyXSmall, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  tValue: { ...typography.body, color: '#1e293b', fontWeight: '700' },
  ticketDivider: { height: 40, flexDirection: 'row', alignItems: 'center', marginVertical: 10 },
  ticketHoleLeft: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.background, marginLeft: -34 },
  ticketDashes: { flex: 1, height: 2, borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', marginHorizontal: 10 },
  ticketHoleRight: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.background, marginRight: -34 },
  ticketFooter: { paddingTop: 10 },
  
  bottomBar: { padding: 20, backgroundColor: colors.backgroundDeep, borderTopWidth: 1, borderTopColor: colors.border },
  nextBtn: { borderRadius: borderRadius.xl, paddingVertical: 16, alignItems: 'center', backgroundColor: colors.gold, shadowColor: colors.gold, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  nextTxt: { ...typography.button, color: '#ffffff', fontSize: 16, fontWeight: '800' },
});