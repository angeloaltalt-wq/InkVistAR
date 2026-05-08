/**
 * ArtistSchedule.jsx -- Calendar + List Schedule (Gilded Noir v2)
 * Theme-aware, animated, gold accents. Filters, sort, calendar, appointment cards, detail & add modals.
 */
import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, Modal, TextInput, Animated, Pressable, RefreshControl, Share, Platform, Image, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import {
  ArrowLeft, Calendar, CheckCircle2, ArrowUpDown, ChevronLeft, ChevronRight,
  Clock, User, X, Ban, Download, Printer, Lock, Unlock, PenTool,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { typography } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { getArtistAppointments, updateAppointmentStatus, createArtistAppointment, updateAppointmentDetails } from '../src/utils/api';

export function ArtistSchedule({ onBack, artistId, navigation, route }) {
  const { theme: colors, hapticsEnabled } = useTheme();
  const styles = getStyles(colors);
  const modalS = getModalStyles(colors);

  const [selectedFilter, setSelectedFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('asc');
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const [modalVisible, setModalVisible] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTime, setNewTime] = useState('10:00');
  const [newDesign, setNewDesign] = useState('');
  const [alertModal, setAlertModal] = useState({ visible: false, title: '', message: '' });
  const [uploadingDraft, setUploadingDraft] = useState(false);

  // Date blocking
  const [blockedDates, setBlockedDates] = useState([]);
  const [blockModal, setBlockModal] = useState({ visible: false, date: '' });

  // Detail modal animation
  const slideAnim = useRef(new Animated.Value(800)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const openDetail = (apt) => {
    setSelectedAppointment(apt);
    setDetailModalVisible(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const closeDetail = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 800, duration: 200, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => { setDetailModalVisible(false); setSelectedAppointment(null); });
  };

  useEffect(() => {
    if (route?.params?.openAppointmentId && appointments.length > 0) {
      const apt = appointments.find(a => a.id === route.params.openAppointmentId);
      if (apt) {
        openDetail(apt);
        navigation.setParams({ openAppointmentId: undefined });
      }
    }
  }, [route?.params?.openAppointmentId, appointments]);

  const filters = [
    { id: 'all', label: 'All' }, { id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' },
    { id: 'pending', label: 'Pending' }, { id: 'completed', label: 'Finished' }, { id: 'cancelled', label: 'Cancelled' },
  ];

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
    }, [artistId])
  );

  const loadAppointments = async () => {
    if (!artistId) return;
    setLoading(true);
    const r = await getArtistAppointments(artistId);
    if (r.success) setAppointments(r.appointments || []);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAppointments();
    setRefreshing(false);
  };

  const handleStatusUpdate = async (id, newStatus) => {
    const r = await updateAppointmentStatus(id, newStatus);
    r.success ? loadAppointments() : setAlertModal({ visible: true, title: 'Error', message: 'Failed to update status' });
  };

  const handleAddAppointment = async () => {
    if (!newClientEmail || !newDate || !newTime) { setAlertModal({ visible: true, title: 'Missing Fields', message: 'Fill in all required fields.' }); return; }
    const r = await createArtistAppointment({ artistId, clientEmail: newClientEmail, date: newDate, startTime: newTime, designTitle: newDesign || 'Consultation' });
    if (r.success) { setAlertModal({ visible: true, title: 'Success', message: 'Appointment scheduled!' }); setModalVisible(false); loadAppointments(); }
    else { setAlertModal({ visible: true, title: 'Error', message: r.message || 'Failed to schedule' }); }
  };

  const toggleBlockDate = (date) => {
    setBlockedDates(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    );
    setBlockModal({ visible: false, date: '' });
  };

  const exportToCSV = async () => {
    if (appointments.length === 0) {
      setAlertModal({ visible: true, title: 'No Data', message: 'There are no appointments to export.' });
      return;
    }
    const header = 'Booking Code,Client,Date,Time,Service,Status,Price,Payment';
    const rows = appointments.map(a =>
      `"${a.booking_code || a.id}","${a.client_name || ''}","${(a.appointment_date || '').substring(0, 10)}","${a.start_time || ''}","${a.design_title || ''}","${a.status || ''}","${a.price || 0}","${a.payment_status || ''}"`
    );
    const csv = [header, ...rows].join('\n');
    const fileName = `schedule_${new Date().toISOString().split('T')[0]}.csv`;
    const fileUri = FileSystem.documentDirectory + fileName;
    try {
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      await Share.share({
        title: 'Schedule Export',
        message: `Schedule CSV exported. File saved at:\n${fileUri}\n\n${csv.substring(0, 500)}...`,
        url: fileUri,
      });
    } catch (e) {
      setAlertModal({ visible: true, title: 'Error', message: 'Failed to export schedule.' });
    }
  };

  const handleUploadDraft = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'You need to allow access to your photos to upload a draft.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets[0]) {
        setUploadingDraft(true);
        const base64Img = `data:image/jpeg;base64,${pickerResult.assets[0].base64}`;
        
        const response = await updateAppointmentDetails(selectedAppointment.id, { draftImage: base64Img, notes: selectedAppointment.notes });
        
        if (response.success) {
          setSelectedAppointment({ ...selectedAppointment, draft_image: base64Img });
          setAppointments(prev => prev.map(a => a.id === selectedAppointment.id ? { ...a, draft_image: base64Img } : a));
          if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Alert.alert('Upload Failed', response.message || 'Failed to upload draft.');
        }
        setUploadingDraft(false);
      }
    } catch (error) {
      setUploadingDraft(false);
      Alert.alert('Error', 'Something went wrong while uploading.');
    }
  };

  const printScheduleSummary = () => {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const upcoming = appointments
      .filter(a => a.status !== 'cancelled' && a.status !== 'completed')
      .slice(0, 10)
      .map(a => `• ${(a.appointment_date || '').substring(0, 10)} ${a.start_time || ''} — ${a.client_name || 'Unknown'} (${a.design_title || 'Session'})`)
      .join('\n');
    const summary = `SCHEDULE SUMMARY\nGenerated: ${today}\nArtist ID: ${artistId}\n\nUpcoming Sessions:\n${upcoming || 'None'}`;
    setAlertModal({ visible: true, title: 'Schedule Summary', message: summary });
  };

  const changeMonth = (inc) => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + inc); setCurrentMonth(d); };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear(), month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(<View key={`e-${i}`} style={styles.dayCell} />);
    for (let i = 1; i <= daysInMonth; i++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isSel = selectedDate === ds;
      const appsOnDay = appointments.filter(a => { if (!a.appointment_date) return false; const ad = typeof a.appointment_date === 'string' ? a.appointment_date.substring(0, 10) : new Date(a.appointment_date).toISOString().split('T')[0]; return ad === ds; });
      let dotColor = null;
      if (appsOnDay.length > 0) {
        if (appsOnDay.some(a => a.status === 'in_progress')) dotColor = colors.info;
        else if (appsOnDay.some(a => a.status === 'confirmed')) dotColor = colors.success;
        else if (appsOnDay.some(a => a.status === 'pending')) dotColor = colors.warning;
        else if (appsOnDay.some(a => a.status === 'completed')) dotColor = colors.gold;
        else if (appsOnDay.some(a => a.status === 'cancelled')) dotColor = colors.error;
        else dotColor = colors.textTertiary;
      }
      const isBlocked = blockedDates.includes(ds);
      days.push(
        <AnimatedTouchable key={i}
          style={[
            styles.dayCell,
            isSel && styles.selectedDay,
            isBlocked && styles.blockedDay,
            !isSel && !isBlocked && dotColor && { backgroundColor: dotColor + '15', borderWidth: 1, borderColor: dotColor + '40' }
          ]}
          onPress={() => {
            if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (isBlocked) {
              setBlockModal({ visible: true, date: ds });
            } else {
              setSelectedDate(isSel ? null : ds);
              if (selectedFilter === 'today') setSelectedFilter('all');
            }
          }}
          onLongPress={() => setBlockModal({ visible: true, date: ds })}
        >
          {isBlocked ? (
            <Ban size={14} color={colors.error} />
          ) : (
            <Text style={[styles.dayText, isSel && styles.selectedDayText, !isSel && dotColor && { color: dotColor, fontWeight: '800' }]}>{i}</Text>
          )}
        </AnimatedTouchable>
      );
    }
    return days;
  };

  const filteredAppointments = appointments.filter(apt => {
    if (selectedFilter === 'today') { const now = new Date(); const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; return apt.appointment_date?.startsWith(ts); }
    if (selectedDate && (!apt.appointment_date || !apt.appointment_date.startsWith(selectedDate))) return false;
    if (selectedFilter === 'all') return true;
    const s = (apt.status || 'pending').toLowerCase();
    if (selectedFilter === 'upcoming') return s === 'confirmed';
    if (selectedFilter === 'pending') return s === 'pending';
    if (selectedFilter === 'completed') return s === 'completed';
    if (selectedFilter === 'cancelled') return s === 'cancelled';
    return true;
  }).sort((a, b) => {
    const gd = (ds, ts) => { const d = new Date(ds); if (ts) { const [h, m] = ts.split(':'); d.setHours(parseInt(h || 0), parseInt(m || 0)); } return d; };
    return sortOrder === 'asc' ? gd(a.appointment_date, a.start_time) - gd(b.appointment_date, b.start_time) : gd(b.appointment_date, b.start_time) - gd(a.appointment_date, a.start_time);
  });

  const getStatusStyle = (s) => {
    switch (s?.toLowerCase()) {
      case 'confirmed': return { bg: colors.iconGoldBg, color: colors.gold };
      case 'pending': return { bg: colors.warningBg, color: colors.warning };
      case 'completed': return { bg: colors.successBg, color: colors.success };
      case 'cancelled': return { bg: colors.errorBg, color: colors.error };
      default: return { bg: colors.surfaceLight, color: colors.textTertiary };
    }
  };

  const getPaymentColor = (ps) => ps === 'paid' ? colors.success : ps === 'pending' ? colors.warning : colors.textTertiary;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <AnimatedTouchable onPress={onBack} style={styles.backBtn}><ArrowLeft size={20} color={colors.textPrimary} /></AnimatedTouchable>
          <Text style={styles.headerTitle}>My Schedule</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Stats & Actions */}
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBadge}><Calendar size={14} color={colors.gold} /><Text style={styles.statText}>{appointments.length} Total</Text></View>
            <View style={styles.statBadge}><CheckCircle2 size={14} color={colors.success} /><Text style={styles.statText}>{appointments.filter(a => a.status === 'confirmed').length} Confirmed</Text></View>
          </View>

          {/* Action Toolbar */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarRow}>
            <AnimatedTouchable
              style={styles.toolbarBtn}
              onPress={() => {
                const today = new Date();
                const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                setBlockModal({ visible: true, date: ds });
              }}
            >
              <Ban size={16} color={colors.error} />
              <Text style={[styles.toolbarBtnText, { color: colors.error }]}>Block Date</Text>
            </AnimatedTouchable>
            <AnimatedTouchable style={styles.toolbarBtn} onPress={exportToCSV}>
              <Download size={16} color={colors.gold} />
              <Text style={[styles.toolbarBtnText, { color: colors.gold }]}>Export</Text>
            </AnimatedTouchable>
            <AnimatedTouchable style={styles.toolbarBtn} onPress={printScheduleSummary}>
              <Printer size={16} color={colors.textSecondary} />
              <Text style={[styles.toolbarBtnText, { color: colors.textSecondary }]}>Print</Text>
            </AnimatedTouchable>
          </ScrollView>
        </View>

        <View style={styles.content}>
          {/* Sort */}
          <View style={styles.sortRow}>
            <AnimatedTouchable style={styles.sortBtn} onPress={() => { if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSortOrder(p => p === 'asc' ? 'desc' : 'asc'); }}>
              <ArrowUpDown size={14} color={colors.textSecondary} />
              <Text style={styles.sortText}>Date: {sortOrder === 'asc' ? 'Oldest' : 'Newest'}</Text>
            </AnimatedTouchable>
          </View>

          {/* Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {filters.map(f => (
              <AnimatedTouchable key={f.id} onPress={() => {
                if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (f.id === 'today') { const n = new Date(); setCurrentMonth(n); const ds = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; setSelectedDate(ds); setSelectedFilter('today'); }
                else { setSelectedFilter(f.id); setSelectedDate(null); }
                setVisibleCount(10);
              }} style={[styles.filterChip, selectedFilter === f.id && styles.filterChipActive]}>
                <Text style={[styles.filterText, selectedFilter === f.id && styles.filterTextActive]}>{f.label}</Text>
              </AnimatedTouchable>
            ))}
          </ScrollView>

          {/* Calendar */}
          <View style={styles.calCard}>
            <View style={styles.calHeader}>
              <AnimatedTouchable onPress={() => changeMonth(-1)} style={styles.monthBtn}><ChevronLeft size={18} color={colors.textPrimary} /></AnimatedTouchable>
              <Text style={styles.monthText}>{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
              <AnimatedTouchable onPress={() => changeMonth(1)} style={styles.monthBtn}><ChevronRight size={18} color={colors.textPrimary} /></AnimatedTouchable>
            </View>
            <View style={styles.weekRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={styles.weekDayText}>{d}</Text>)}</View>
            <View style={styles.daysGrid}>{renderCalendar()}</View>
            {/* Color Legend */}
            <View style={styles.legendRow}>
              {[
                { label: 'Confirmed', color: colors.success },
                { label: 'Pending', color: colors.warning },
                { label: 'In Progress', color: colors.info },
                { label: 'Completed', color: colors.gold },
                { label: 'Cancelled', color: colors.error },
              ].map(l => (
                <View key={l.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                  <Text style={styles.legendText}>{l.label}</Text>
                </View>
              ))}
            </View>
            {selectedDate && <AnimatedTouchable onPress={() => setSelectedDate(null)} style={styles.clearDate}><Text style={styles.clearDateText}>Clear Date Filter</Text></AnimatedTouchable>}
          </View>

          {loading && <ActivityIndicator size="large" color={colors.gold} />}

          {/* Appointments List */}
          <Text style={styles.sectionTitle}>Appointments</Text>
          {filteredAppointments.length === 0 && <Text style={{ color: colors.textTertiary, fontStyle: 'italic', marginTop: 8 }}>No appointments found for this filter.</Text>}
          {filteredAppointments.slice(0, visibleCount).map(apt => {
            const ss = getStatusStyle(apt.status);
            return (
              <AnimatedTouchable key={apt.id} style={styles.aptCard} onPress={() => openDetail(apt)} activeOpacity={0.85}>
                <View style={styles.aptHeader}>
                  <View style={styles.aptTimeRow}>
                    <Clock size={16} color={colors.gold} />
                    <Text style={styles.aptTime}>{apt.start_time}</Text>
                    <View style={styles.aptDateBadge}><Text style={styles.aptDateText}>{new Date(apt.appointment_date).toLocaleDateString()}</Text></View>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: ss.bg }]}><Text style={[styles.statusPillText, { color: ss.color }]}>{apt.status ? apt.status.charAt(0).toUpperCase() + apt.status.slice(1) : 'Pending'}</Text></View>
                </View>
                <View style={styles.aptDetails}>
                  <View style={styles.clientRow}>
                    <View style={styles.clientAvatar}><User size={18} color={colors.textTertiary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.clientName}>{apt.client_name}</Text>
                      <Text style={styles.aptType}>{apt.design_title || 'Consultation'}</Text>
                    </View>
                  </View>
                  <View style={styles.durationBadge}><Clock size={12} color={colors.textTertiary} /><Text style={styles.durationText}>1h</Text></View>
                </View>
                <View style={styles.aptFooter}>
                  <Text style={styles.aptPrice}>P{parseFloat(apt.price || 0).toLocaleString()}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: getPaymentColor(apt.payment_status), marginRight: 4 }} />
                    <Text style={styles.aptPayment}>{apt.payment_status || 'unpaid'}</Text>
                  </View>
                </View>
                {(apt.status === 'confirmed' || apt.status === 'in_progress') && (
                  <View style={styles.aptActions}>
                    <AnimatedTouchable style={styles.manageBtn} onPress={() => navigation.navigate('artist-active-session', { appointment: apt })}>
                      <PenTool size={14} color={colors.backgroundDeep} />
                      <Text style={styles.manageBtnText}>Manage Session</Text>
                    </AnimatedTouchable>
                  </View>
                )}
              </AnimatedTouchable>
            );
          })}
          {visibleCount < filteredAppointments.length && (
            <AnimatedTouchable style={styles.loadMore} onPress={() => setVisibleCount(p => p + 10)}><Text style={styles.loadMoreText}>Load More</Text></AnimatedTouchable>
          )}
        </View>
      </ScrollView>

      {/* Add Appointment Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={modalS.overlay}>
          <View style={modalS.content}>
            <View style={modalS.header}><Text style={modalS.title}>New Appointment</Text><TouchableOpacity onPress={() => setModalVisible(false)}><X size={22} color={colors.textPrimary} /></TouchableOpacity></View>
            <Text style={modalS.label}>Client Email</Text><TextInput style={modalS.input} placeholder="client@email.com" placeholderTextColor={colors.textTertiary} value={newClientEmail} onChangeText={setNewClientEmail} autoCapitalize="none" />
            <Text style={modalS.label}>Date (YYYY-MM-DD)</Text><TextInput style={modalS.input} placeholder="2024-01-30" placeholderTextColor={colors.textTertiary} value={newDate} onChangeText={setNewDate} />
            <Text style={modalS.label}>Time (HH:MM)</Text><TextInput style={modalS.input} placeholder="14:00" placeholderTextColor={colors.textTertiary} value={newTime} onChangeText={setNewTime} />
            <Text style={modalS.label}>Design / Type</Text><TextInput style={modalS.input} placeholder="Sleeve, Touch-up..." placeholderTextColor={colors.textTertiary} value={newDesign} onChangeText={setNewDesign} />
            <AnimatedTouchable style={modalS.saveBtn} onPress={handleAddAppointment}><Text style={modalS.saveBtnText}>Schedule</Text></AnimatedTouchable>
          </View>
        </View>
      </Modal>

      {/* Detail Modal with Spring Animation */}
      <Modal visible={detailModalVisible} transparent animationType="none" onRequestClose={closeDetail}>
        <Animated.View style={[modalS.overlay, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDetail} />
          <Animated.View style={[modalS.content, { transform: [{ translateY: slideAnim }] }]}>
            <View style={modalS.handle}><View style={modalS.handleBar} /></View>
            <View style={modalS.header}>
              <Text style={modalS.title}>Appointment {selectedAppointment?.booking_code || selectedAppointment?.id}</Text>
              <TouchableOpacity onPress={closeDetail}><X size={22} color={colors.textPrimary} /></TouchableOpacity>
            </View>
            {selectedAppointment && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={modalS.clientRow}>
                  <View style={modalS.colHalf}>
                    <Text style={modalS.label}>Client</Text>
                    <Text style={modalS.valueBold}>{selectedAppointment.client_name}</Text>
                  </View>
                  <View style={modalS.colHalf}>
                    <Text style={[modalS.label, { textAlign: 'right' }]}>Date & Time</Text>
                    <Text style={[modalS.valueBold, { textAlign: 'right' }]}>{new Date(selectedAppointment.appointment_date).toLocaleDateString()} at {selectedAppointment.start_time}</Text>
                  </View>
                </View>

                <View style={modalS.serviceCard}>
                  <Text style={[modalS.label, { textAlign: 'center' }]}>Service Requested</Text>
                  <Text style={[modalS.valueBold, { textAlign: 'center', marginBottom: 16 }]}>Tattoo Session: {selectedAppointment.design_title}</Text>

                  <View style={modalS.serviceStatsRow}>
                    <View style={modalS.statItem}>
                      <Text style={modalS.labelSmall}>Status</Text>
                      <View style={[modalS.statusPill, { backgroundColor: getStatusStyle(selectedAppointment.status).bg }]}>
                        <Text style={[modalS.statusPillText, { color: getStatusStyle(selectedAppointment.status).color }]}>
                          {selectedAppointment.status ? selectedAppointment.status.charAt(0).toUpperCase() + selectedAppointment.status.slice(1) : 'Pending'}
                        </Text>
                      </View>
                    </View>
                    <View style={modalS.statItem}>
                      <Text style={modalS.labelSmall}>Price</Text>
                      <Text style={modalS.valueBoldPrice}>₱{parseFloat(selectedAppointment.price || 0).toLocaleString()}</Text>
                    </View>
                    <View style={modalS.statItem}>
                      <Text style={modalS.labelSmall}>Your Cut (30%)</Text>
                      <Text style={modalS.valueBoldCut}>₱{((parseFloat(selectedAppointment.price || 0) * 0.3)).toLocaleString()}</Text>
                    </View>
                  </View>

                  <View style={modalS.paymentRow}>
                    <Text style={modalS.labelSmall}>Payment</Text>
                    <View style={[modalS.statusPill, { backgroundColor: selectedAppointment.payment_status === 'paid' ? colors.successBg : colors.warningBg, marginTop: 4, alignSelf: 'flex-start' }]}>
                      <Text style={[modalS.statusPillText, { color: getPaymentColor(selectedAppointment.payment_status) }]}>
                        {selectedAppointment.payment_status ? selectedAppointment.payment_status.toUpperCase() : 'UNPAID'}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={[modalS.label, { textAlign: 'center', marginTop: 8, marginBottom: 8 }]}>Notes & Description</Text>
                <View style={modalS.notesBox}>
                  <Text style={modalS.notesText}>{selectedAppointment.notes || 'Placement: Face, Neck Details:'}</Text>
                </View>

                <Text style={[modalS.label, { textAlign: 'center', marginTop: 4, marginBottom: 8 }]}>Reference Image</Text>
                <View style={modalS.imageContainer}>
                  {selectedAppointment.reference_image ? (
                    <Image source={{ uri: selectedAppointment.reference_image }} style={modalS.referenceImage} resizeMode="cover" />
                  ) : (
                    <View style={modalS.placeholderImage}>
                      <Text style={modalS.placeholderText}>No reference image</Text>
                    </View>
                  )}
                </View>

                <View style={modalS.draftCard}>
                  <View style={modalS.draftHeader}>
                    <Text style={modalS.draftTitle}>Artist Draft Design</Text>
                    <AnimatedTouchable style={modalS.uploadBtn} onPress={handleUploadDraft} disabled={uploadingDraft}>
                      {uploadingDraft ? (
                        <ActivityIndicator size="small" color={colors.gold} />
                      ) : (
                        <Text style={modalS.uploadBtnText}>Upload Draft</Text>
                      )}
                    </AnimatedTouchable>
                  </View>
                  {selectedAppointment.draft_image ? (
                    <Image source={{ uri: selectedAppointment.draft_image }} style={modalS.draftImage} resizeMode="cover" />
                  ) : (
                    <View style={modalS.draftPlaceholder}>
                      <Text style={modalS.placeholderText}>No draft uploaded yet. Attach your design mockups here.</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* Alert Modal */}
      <Modal visible={alertModal.visible} animationType="fade" transparent>
        <View style={modalS.overlay}>
          <View style={[modalS.content, { alignItems: 'center' }]}>
            <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: 8 }}>{alertModal.title}</Text>
            <Text style={{ ...typography.body, color: colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>{alertModal.message}</Text>
            <AnimatedTouchable style={[modalS.saveBtn, { width: '100%' }]} onPress={() => setAlertModal({ ...alertModal, visible: false })}>
              <Text style={modalS.saveBtnText}>OK</Text>
            </AnimatedTouchable>
          </View>
        </View>
      </Modal>

      {/* Block Date Modal */}
      <Modal visible={blockModal.visible} animationType="fade" transparent>
        <View style={modalS.overlay}>
          <View style={[modalS.content, { alignItems: 'center' }]}>
            <Ban size={32} color={blockedDates.includes(blockModal.date) ? colors.success : colors.error} style={{ marginBottom: 12 }} />
            <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: 8 }}>
              {blockedDates.includes(blockModal.date) ? 'Unblock Date' : 'Block Date'}
            </Text>
            <Text style={{ ...typography.body, color: colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>
              {blockedDates.includes(blockModal.date)
                ? `Remove block from ${blockModal.date}? You will be available again on this date.`
                : `Block ${blockModal.date}? No new appointments will be accepted on this day.`
              }
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <AnimatedTouchable style={[modalS.saveBtn, { flex: 1, backgroundColor: colors.surfaceLight }]} onPress={() => setBlockModal({ visible: false, date: '' })}>
                <Text style={[modalS.saveBtnText, { color: colors.textSecondary }]}>Cancel</Text>
              </AnimatedTouchable>
              <AnimatedTouchable
                style={[modalS.saveBtn, { flex: 1, backgroundColor: blockedDates.includes(blockModal.date) ? colors.success : colors.error }]}
                onPress={() => toggleBlockDate(blockModal.date)}
              >
                <Text style={modalS.saveBtnText}>
                  {blockedDates.includes(blockModal.date) ? 'Unblock' : 'Block'}
                </Text>
              </AnimatedTouchable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 20 : 52, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  headerTitle: { ...typography.h2, color: colors.textPrimary },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center',
    backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  statText: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingBottom: 60 },
  sortRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10, marginTop: 4 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.surface,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  filterText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.backgroundDeep },
  calCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  monthBtn: { padding: 4 },
  monthText: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  weekDayText: { width: '14.28%', textAlign: 'center', ...typography.bodyXSmall, color: colors.textTertiary, fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 20, marginBottom: 4 },
  selectedDay: { backgroundColor: colors.gold },
  dayText: { ...typography.bodySmall, color: colors.textPrimary },
  selectedDayText: { color: colors.backgroundDeep, fontWeight: '700' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { ...typography.bodyXSmall, color: colors.textTertiary, fontSize: 10 },
  clearDate: { marginTop: 8, alignItems: 'center', padding: 4 },
  clearDateText: { ...typography.bodySmall, color: colors.gold, fontWeight: '600' },
  sectionTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: 10 },
  aptCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  aptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  aptTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aptTime: { ...typography.body, fontWeight: '700', color: colors.gold },
  aptDateBadge: { backgroundColor: colors.surfaceLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  aptDateText: { ...typography.bodyXSmall, color: colors.textSecondary, fontWeight: '600' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusPillText: { ...typography.bodyXSmall, fontWeight: '700' },
  aptDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  clientRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  clientAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceLight,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  clientName: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  aptType: { ...typography.bodySmall, color: colors.textSecondary },
  durationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  durationText: { ...typography.bodyXSmall, color: colors.textTertiary, fontWeight: '600' },
  aptFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  aptPrice: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  aptPayment: { ...typography.bodyXSmall, color: colors.textTertiary, textTransform: 'uppercase', fontWeight: '600' },
  aptActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  manageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.gold,
  },
  manageBtnText: { ...typography.bodySmall, color: colors.backgroundDeep, fontWeight: '700' },
  loadMore: {
    paddingVertical: 12, alignItems: 'center', marginTop: 8,
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  loadMoreText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  blockedDay: { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  toolbarRow: {
    flexDirection: 'row', gap: 8, marginBottom: 4, paddingRight: 16
  },
  toolbarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border,
  },
  toolbarBtnText: { ...typography.bodySmall, fontWeight: '600' },
});

const getModalStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  content: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%', borderWidth: 1, borderColor: colors.border },
  handle: { alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title: { ...typography.h3, color: colors.textPrimary },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  labelSmall: { ...typography.bodyXSmall, fontWeight: '600', color: colors.textSecondary },
  valueBold: { ...typography.body, fontWeight: '700', color: colors.textPrimary },

  clientRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  colHalf: { flex: 1 },

  serviceCard: { backgroundColor: colors.surfaceLight, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  serviceStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statItem: { alignItems: 'center' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginTop: 4 },
  statusPillText: { ...typography.bodyXSmall, fontWeight: '700' },
  valueBoldPrice: { ...typography.body, fontWeight: '700', color: colors.textPrimary, marginTop: 4 },
  valueBoldCut: { ...typography.body, fontWeight: '700', color: colors.success, marginTop: 4 },
  paymentRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },

  imageContainer: { backgroundColor: colors.surfaceLight, borderRadius: 16, overflow: 'hidden', height: 200, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  referenceImage: { width: '100%', height: '100%' },
  placeholderImage: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  placeholderText: { ...typography.bodySmall, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 20 },

  notesBox: { backgroundColor: colors.surfaceLight, borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  notesText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  draftCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 4 },
  draftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  draftTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  uploadBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.gold },
  uploadBtnText: { ...typography.bodySmall, fontWeight: '600', color: colors.gold },
  draftPlaceholder: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: 12, padding: 30, justifyContent: 'center', alignItems: 'center' },
  draftImage: { width: '100%', height: 150, borderRadius: 12 },

  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 14,
    ...typography.body, color: colors.textPrimary, backgroundColor: colors.surfaceLight,
  },
  saveBtn: { borderRadius: 12, backgroundColor: colors.gold, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  saveBtnText: { ...typography.button, color: colors.backgroundDeep },
});
