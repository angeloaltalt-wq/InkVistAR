/**
 * CustomerAppointments.jsx -- My Consultations (List + Calendar)
 * Themed with lucide icons. Preserves filters, pagination, detail modal, payment WebView.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, ActivityIndicator, Modal, Platform, RefreshControl, Animated, Image, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Calendar, List, ChevronLeft, ChevronRight, ChevronRight as ChevronR,
  X, Plus, CreditCard, ShieldAlert, Info, Layers, CheckCircle, Circle
} from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/context/ThemeContext';
import { colors, typography, borderRadius, shadows } from '../src/theme';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { getCustomerAppointments, updateAppointmentStatus, createCheckoutSession, getPaymentStatus, getCustomerTransactions, API_URL } from '../src/utils/api';

const ITEMS_PER_PAGE = 5;

const AnimatedTouch = Animated.createAnimatedComponent(TouchableOpacity);

const AnimatedTouchable = ({ children, onPress, style, activeOpacity = 0.9, disabled }) => {
  const { hapticsEnabled } = useTheme();
  const scale = React.useRef(new Animated.Value(1)).current;
  const pressIn = () => {
    if (!disabled && hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true }).start();
  };
  const pressOut = () => Animated.spring(scale, { toValue: 1, damping: 15, useNativeDriver: true }).start();
  return (
    <AnimatedTouch style={[style, { transform: [{ scale }] }]} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={activeOpacity} disabled={disabled}>
      {children}
    </AnimatedTouch>
  );
};

const PulseDot = ({ color }) => {
  const anim = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: anim, marginRight: 6 }} />;
};

export function CustomerAppointments({ customerId, onBack, onBookNew, navigation, route }) {
  const { theme, hapticsEnabled } = useTheme();
  const styles = getStyles(theme);
  const modalS = getModalStyles(theme);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [modalTab, setModalTab] = useState('details');
  const [apptTransactions, setApptTransactions] = useState([]);
  const fabPulse = useRef(new Animated.Value(1)).current;
  // B-M2: project timeline for selected appointment
  const [projectTimeline, setProjectTimeline] = useState(null);
  const [projectTimelineLoading, setProjectTimelineLoading] = useState(false);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(fabPulse, { toValue: 1, duration: 1500, useNativeDriver: true })
      ])
    ).start();
  }, []);

  const handleSelectAppointment = async (appt) => {
    setSelectedAppointment(appt);
    setModalTab('details');
    // B-M2: reset and fetch project timeline
    setProjectTimeline(null);
    if (!appt) return;
    if (appt.project_id) {
      setProjectTimelineLoading(true);
      try {
        const r = await (await fetch(`${API_URL}/projects/${appt.project_id}`)).json();
        if (r.success && r.project) setProjectTimeline(r.project);
      } catch (e) { /* silent */ } finally { setProjectTimelineLoading(false); }
    }
    try {
      const res = await getCustomerTransactions(customerId);
      if (res.success && res.transactions) {
        setApptTransactions(res.transactions.filter(t => t.appointment_id === appt.id));
      } else {
        setApptTransactions([]);
      }
    } catch (e) {
      console.error('Error fetching appt transactions:', e);
      setApptTransactions([]);
    }
  };

  useEffect(() => { if (customerId) fetchAppointments(); }, [customerId]);

  const fetchAppointments = async () => {
    try {
      if (!refreshing) setLoading(true);
      const r = await getCustomerAppointments(customerId);
      if (r.success) { setAppointments(r.appointments || []); checkPaymentStatuses(r.appointments || []); }
    } catch (e) { console.log('Fetch error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const checkPaymentStatuses = async (list) => {
    const toCheck = list.filter(a => a.payment_status !== 'paid' && parseFloat(a.price || 0) > 0);
    for (const apt of toCheck) {
      try {
        const r = await getPaymentStatus(apt.id);
        if (r.success && r.payment_status === 'paid') setAppointments(p => p.map(x => x.id === apt.id ? { ...x, payment_status: 'paid' } : x));
      } catch (e) { /* silent */ }
    }
  };

  useEffect(() => {
    if (route?.params?.openAppointmentId && appointments.length > 0) {
      const apt = appointments.find(a => a.id === route.params.openAppointmentId);
      if (apt) {
        setSelectedAppointment(apt);
        if (navigation) navigation.setParams({ openAppointmentId: undefined });
      }
    }
  }, [route?.params?.openAppointmentId, appointments]);

  const handlePaymentInit = () => {
    if (!selectedAppointment) return;
    setShowPaymentOptions(true);
  };

  const triggerPayment = async (type, customAmt = null) => {
    if (!selectedAppointment) return;
    const appt = selectedAppointment; // capture ref before any state changes
    setPaymentLoading(true);
    try {
      const amount = type === 'custom' ? customAmt : appt.price;
      const r = await createCheckoutSession(appt.id, amount, type, type === 'custom' ? amount : null);
      if (r.success && r.checkoutUrl) {
        // Close options and open WebView in the same render batch
        setShowPaymentOptions(false);
        setPaymentUrl(r.checkoutUrl);
        setShowPaymentModal(true);
      } else {
        setShowPaymentOptions(false);
        setPaymentLoading(false);
        setTimeout(() => Alert.alert('Payment Error', r.message || 'Could not initiate payment.'), 350);
        return;
      }
    } catch (e) {
      setShowPaymentOptions(false);
      setPaymentLoading(false);
      setTimeout(() => Alert.alert('Error', 'Failed to connect to payment gateway.'), 350);
      return;
    }
    setPaymentLoading(false);
  };

  const handlePaymentSuccess = async () => {
    const paidApptId = selectedAppointment?.id;
    setShowPaymentModal(false);
    setPaymentUrl(null);
    try {
      const r = await getCustomerAppointments(customerId);
      if (r.success) {
        const freshList = r.appointments || [];
        setAppointments(freshList);
        // Reopen the detail modal with updated data so customer sees "Paid"
        if (paidApptId) {
          const updated = freshList.find(a => a.id === paidApptId);
          if (updated) {
            handleSelectAppointment(updated);
            setTimeout(() => Alert.alert('Payment Successful', 'Your payment has been received. Thank you!'), 400);
          }
        }
      }
    } catch (e) { console.log('Refresh error:', e); }
  };
  const handlePaymentClose = async () => {
    const closedApptId = selectedAppointment?.id;
    setShowPaymentModal(false);
    setPaymentUrl(null);
    try {
      const r = await getCustomerAppointments(customerId);
      if (r.success) {
        const freshList = r.appointments || [];
        setAppointments(freshList);
        // Reopen with fresh data in case payment completed before closing
        if (closedApptId) {
          const updated = freshList.find(a => a.id === closedApptId);
          if (updated) { handleSelectAppointment(updated); return; }
        }
      }
    } catch (e) { console.log('Refresh error:', e); }
    setSelectedAppointment(null);
  };
  const onRefresh = () => { setRefreshing(true); fetchAppointments(); };
  const changeMonth = (inc) => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + inc); setCurrentMonth(d); };

  const handleCancel = (id) => {
    Alert.alert('Cancel Appointment', 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', onPress: async () => {
        try {
          const r = await updateAppointmentStatus(id, 'cancelled');
          if (r.success) { Alert.alert('Cancelled', 'Your appointment has been cancelled.'); setSelectedAppointment(null); fetchAppointments(); }
          else Alert.alert('Error', r.message || 'Failed.');
        } catch (e) { Alert.alert('Error', 'Could not connect.'); }
      }},
    ]);
  };

  // Calendar
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
      if (appsOnDay.length > 0) { if (appsOnDay.some(a => a.status === 'confirmed')) dotColor = theme.success; else if (appsOnDay.some(a => a.status === 'pending')) dotColor = theme.warning; else if (appsOnDay.some(a => a.status === 'completed')) dotColor = theme.info; else dotColor = theme.textTertiary; }
      days.push(
        <AnimatedTouchable key={i} style={[styles.dayCell, isSel && styles.selectedDay, !isSel && dotColor && { backgroundColor: dotColor + '15', borderWidth: 1, borderColor: dotColor + '40' }]} onPress={() => setSelectedDate(isSel ? null : ds)}>
          <Text style={[styles.dayText, isSel && styles.selectedDayText, !isSel && dotColor && { color: dotColor, fontWeight: '800' }]}>{i}</Text>
        </AnimatedTouchable>
      );
    }
    return days;
  };

  // Filter + Paginate
  const getFiltered = () => {
    let f = appointments;
    if (statusFilter !== 'all') f = f.filter(a => a.status?.toLowerCase() === statusFilter);
    if (viewMode === 'calendar' && selectedDate) f = f.filter(a => { const ad = typeof a.appointment_date === 'string' ? a.appointment_date.substring(0, 10) : new Date(a.appointment_date).toISOString().split('T')[0]; return ad === selectedDate; });
    return f;
  };
  const allFiltered = getFiltered();
  const totalPages = Math.ceil(allFiltered.length / ITEMS_PER_PAGE) || 1;
  const displayed = viewMode === 'list' ? allFiltered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE) : allFiltered;
  useEffect(() => { setCurrentPage(1); }, [statusFilter, viewMode]);

  const getStatusColor = (s) => { switch (s?.toLowerCase()) { case 'confirmed': return theme.success; case 'pending': return theme.warning; case 'completed': return theme.info; case 'cancelled': return theme.error; default: return theme.textTertiary; } };

  const getDisplayPrice = (item) => {
    const isConsultation = item.design_title?.toLowerCase().includes('consultation') || item.service_type?.toLowerCase().includes('consultation');
    const priceVal = parseFloat(item.price || 0);
    const isPending = ['pending', 'waiting for approval'].includes(item.status?.toLowerCase());

    if (isPending && priceVal === 0) {
      return isConsultation ? 'No Charge' : 'Pending Quote';
    }
    return `P${priceVal.toLocaleString()}`;
  };

  const getDisplayTitle = (item) => {
    const service = item.service_type?.trim();
    const title = item.design_title?.trim() || 'Appointment';
    if (!service) return title;
    
    // If the title already starts with the service type, don't duplicate it
    if (title.toLowerCase().startsWith(service.toLowerCase())) {
      return title;
    }
    return `${service}: ${title}`;
  };

  const renderItem = (item, index) => (
    <AnimatedTouchable key={`appt-${item.id || index}`} style={styles.card} onPress={() => handleSelectAppointment(item)} activeOpacity={0.9}>
      <View style={styles.cardLeft}>
        <View style={styles.dateBox}>
          <Text style={styles.dateDay}>{new Date(item.appointment_date).getDate()}</Text>
          <Text style={styles.dateMonth}>{new Date(item.appointment_date).toLocaleString('default', { month: 'short' })}</Text>
        </View>
      </View>
      <View style={styles.cardCenter}>
        <Text style={styles.serviceText} numberOfLines={1}>{getDisplayTitle(item)}</Text>
        <Text style={styles.artistText}>with {item.artist_name?.trim().toLowerCase() === 'system admin' ? 'Unassigned' : (item.artist_name || 'Unassigned')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
          <Text style={styles.timeText}>{item.start_time ? item.start_time.substring(0, 5) : 'TBD'}</Text>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: theme.textTertiary, marginHorizontal: 6 }} />
          <Text style={[styles.priceText, { color: getDisplayPrice(item) === 'Pending Quote' ? theme.warning : theme.gold }]}>{getDisplayPrice(item)}</Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.statusPill, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          {item.status?.toLowerCase() === 'pending' && <PulseDot color={getStatusColor(item.status)} />}
          <Text style={[styles.statusPillText, { color: getStatusColor(item.status) }]}>{item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Pending'}</Text>
        </View>
        <ChevronR size={16} color={theme.textTertiary} />
      </View>
    </AnimatedTouchable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.headerTitle}>My Appointments</Text>
          <AnimatedTouchable onPress={() => customAlert('Color Legend', 'Pending (Yellow): Waiting for studio approval\nConfirmed (Green): Scheduled and active\nCompleted (Blue): Session finished\nCancelled (Red): Session aborted')} style={{ padding: 6, marginLeft: 8, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.round }}>
            <Info size={16} color={theme.textSecondary} />
          </AnimatedTouchable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AnimatedTouchable onPress={() => setViewMode(v => v === 'list' ? 'calendar' : 'list')} style={styles.headerBtn}>
            {viewMode === 'list' ? <Calendar size={20} color={theme.textPrimary} /> : <List size={20} color={theme.textPrimary} />}
          </AnimatedTouchable>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabs}>
        {['all', 'pending', 'confirmed'].map(f => (
          <AnimatedTouchable key={f} style={[styles.tab, statusFilter === f && styles.tabActive]} onPress={() => setStatusFilter(f)}>
            <Text style={[styles.tabText, statusFilter === f && styles.tabTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </AnimatedTouchable>
        ))}
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 90, paddingTop: 14 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.gold} />}>
        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <View style={styles.calCard}>
            <View style={styles.calHeader}>
              <AnimatedTouchable onPress={() => changeMonth(-1)} style={styles.monthBtn}><ChevronLeft size={18} color={theme.textPrimary} /></AnimatedTouchable>
              <Text style={styles.monthText}>{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
              <AnimatedTouchable onPress={() => changeMonth(1)} style={styles.monthBtn}><ChevronRight size={18} color={theme.textPrimary} /></AnimatedTouchable>
            </View>
            <View style={styles.weekRow}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={styles.weekDayText}>{d}</Text>)}</View>
            <View style={styles.daysGrid}>{renderCalendar()}</View>
            {selectedDate && <AnimatedTouchable onPress={() => setSelectedDate(null)} style={styles.clearDate}><Text style={styles.clearDateText}>Clear Date Filter</Text></AnimatedTouchable>}
          </View>
        )}

        {/* List */}
        {loading ? <PremiumLoader message="Loading appointments..." /> : (
          <View>
            {displayed.length > 0 ? displayed.map((item, i) => renderItem(item, i)) : (
              <EmptyState icon={Calendar} title="No appointments found" subtitle="Tap + to schedule a new one" />
            )}
          </View>
        )}

        {/* Pagination */}
        {viewMode === 'list' && allFiltered.length > 0 && (
          <View style={styles.pagination}>
            <AnimatedTouchable style={[styles.pageBtn, currentPage === 1 && { opacity: 0.4 }]} onPress={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
              <ChevronLeft size={18} color={theme.textPrimary} />
            </AnimatedTouchable>
            <Text style={styles.pageInfo}>Page {currentPage} of {totalPages}</Text>
            <AnimatedTouchable style={[styles.pageBtn, currentPage === totalPages && { opacity: 0.4 }]} onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              <ChevronRight size={18} color={theme.textPrimary} />
            </AnimatedTouchable>
          </View>
        )}
      </ScrollView>

      {/* Docked Book Session Button */}
      <View style={styles.dockedBar}>
        <AnimatedTouchable style={styles.dockedBtn} onPress={onBookNew} activeOpacity={0.8}>
          <Plus size={20} color={theme.backgroundDeep} />
          <Text style={styles.dockedBtnText}>Book Session</Text>
        </AnimatedTouchable>
      </View>

      {/* Detail Modal */}
      <Modal visible={!!selectedAppointment && !showPaymentModal && !showPaymentOptions && !paymentLoading} transparent animationType="slide" onRequestClose={() => handleSelectAppointment(null)}>
        <View style={modalS.overlay}>
          <View style={modalS.content}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={modalS.title}>Appointment Details</Text>
              <AnimatedTouchable onPress={() => handleSelectAppointment(null)}><X size={22} color={theme.textSecondary} /></AnimatedTouchable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, backgroundColor: theme.surfaceLight, padding: 4, borderRadius: 12 }}>
              <AnimatedTouchable style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: modalTab === 'details' ? theme.surface : 'transparent', borderRadius: 8, ...(modalTab === 'details' ? shadows.subtle : {}) }} onPress={() => setModalTab('details')}>
                <Text style={{ ...typography.bodySmall, fontWeight: modalTab === 'details' ? '700' : '500', color: modalTab === 'details' ? theme.textPrimary : theme.textSecondary }}>Details</Text>
              </AnimatedTouchable>
              <AnimatedTouchable style={{ flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: modalTab === 'transactions' ? theme.surface : 'transparent', borderRadius: 8, ...(modalTab === 'transactions' ? shadows.subtle : {}) }} onPress={() => setModalTab('transactions')}>
                <Text style={{ ...typography.bodySmall, fontWeight: modalTab === 'transactions' ? '700' : '500', color: modalTab === 'transactions' ? theme.textPrimary : theme.textSecondary }}>Transactions</Text>
              </AnimatedTouchable>
            </View>

            {modalTab === 'details' && selectedAppointment && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* B-M2: Project Timeline (read-only) */}
                {(projectTimeline || projectTimelineLoading) && (() => {
                  if (projectTimelineLoading) return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, padding: 12, backgroundColor: theme.surfaceLight, borderRadius: 10, borderWidth: 1, borderColor: theme.border }}>
                      <Layers size={12} color={theme.gold} />
                      <ActivityIndicator size="small" color={theme.gold} />
                      <Text style={{ ...typography.bodyXSmall, color: theme.textSecondary }}>Loading project timeline...</Text>
                    </View>
                  );
                  if (!projectTimeline) return null;
                  const sessions = projectTimeline.sessions || [];
                  const planned = Math.max(projectTimeline.total_sessions_planned || 1, sessions.reduce((m, s) => Math.max(m, s.session_number || 0), 0));
                  const nodes = Array.from({ length: planned }, (_, i) => ({
                    num: i + 1,
                    session: sessions.find(s => (s.session_number || 0) === i + 1)
                  }));
                  const completedCount = sessions.filter(s => s.status === 'completed').length;
                  return (
                    <View style={{ marginBottom: 18, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(190,144,85,0.2)', backgroundColor: theme.surfaceLight }}>
                      {/* Timeline header */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(190,144,85,0.15)' }}>
                        <Layers size={12} color={theme.gold} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: theme.gold, textTransform: 'uppercase', letterSpacing: 0.4 }}>Project Timeline</Text>
                        {projectTimeline.design_title ? <Text style={{ fontSize: 10, color: theme.textTertiary, fontStyle: 'italic' }}>{projectTimeline.design_title}</Text> : null}
                        <View style={{ marginLeft: 'auto', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: projectTimeline.status === 'active' ? `${theme.gold}18` : `${theme.success}20` }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: projectTimeline.status === 'active' ? theme.gold : theme.success }}>
                            {projectTimeline.status === 'completed_early' ? 'Done Early' : projectTimeline.status === 'completed' ? 'Completed' : 'Active'}
                          </Text>
                        </View>
                      </View>
                      {/* Nodes rail */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, alignItems: 'center' }}>
                        {nodes.map((node, idx) => {
                          const isCompleted = node.session?.status === 'completed';
                          const isCurrent = node.session?.id === selectedAppointment?.id;
                          const isLast = idx === nodes.length - 1;
                          const dotBg = isCompleted ? `${theme.gold}20` : isCurrent ? 'rgba(251,191,36,0.18)' : theme.surfaceLight;
                          const dotBorder = isCompleted ? theme.gold : isCurrent ? '#f59e0b' : theme.border;
                          const labelColor = isCompleted ? theme.gold : isCurrent ? '#f59e0b' : theme.textTertiary;
                          return (
                            <View key={node.num} style={{ flexDirection: 'row', alignItems: 'center' }}>
                              {idx > 0 && <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: isCompleted ? theme.gold : theme.border }} />}
                              <View style={{ alignItems: 'center' }}>
                                <View style={{
                                  width: 28, height: 28, borderRadius: 14,
                                  backgroundColor: dotBg, borderWidth: isCurrent ? 2.5 : 1.5, borderColor: dotBorder,
                                  justifyContent: 'center', alignItems: 'center',
                                }}>
                                  {isCompleted ? <CheckCircle size={12} color={theme.gold} /> : !node.session ? <Circle size={9} color={theme.textTertiary} /> : <Text style={{ fontSize: 10, fontWeight: '700', color: '#f8fafc' }}>{node.num}</Text>}
                                </View>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: labelColor, marginTop: 4 }}>S{node.num}</Text>
                                {node.session?.appointment_date ? <Text style={{ fontSize: 8, color: theme.textTertiary }}>{new Date(node.session.appointment_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</Text> : null}
                              </View>
                              {!isLast && <View style={{ width: 20, height: 2, borderRadius: 1, backgroundColor: nodes[idx+1]?.session ? theme.gold : theme.border }} />}
                            </View>
                          );
                        })}
                      </ScrollView>
                      {/* Summary strip */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingBottom: 10 }}>
                        <Text style={{ fontSize: 10, color: theme.textTertiary }}>{completedCount} of {planned} sessions completed</Text>
                      </View>
                    </View>
                  );
                })()}

                {[
                  ['Status', () => <View style={[modalS.badge, { backgroundColor: getStatusColor(selectedAppointment.status) + '20' }]}><Text style={[modalS.badgeText, { color: getStatusColor(selectedAppointment.status) }]}>{selectedAppointment.status?.toUpperCase()}</Text></View>],
                  ['Payment Status', () => <View style={[modalS.badge, { backgroundColor: selectedAppointment.payment_status === 'paid' ? `${theme.success}20` : `${theme.warning}20` }]}><Text style={[modalS.badgeText, { color: selectedAppointment.payment_status === 'paid' ? theme.success : theme.warning }]}>{(selectedAppointment.payment_status || 'unpaid').toUpperCase()}</Text></View>],
                  ['Date & Time', () => <Text style={modalS.value}>{new Date(selectedAppointment.appointment_date).toLocaleDateString()} at {selectedAppointment.start_time}</Text>],
                  ['Artist', () => <><Text style={modalS.value}>{selectedAppointment.artist_name?.trim().toLowerCase() === 'system admin' ? 'Unassigned' : (selectedAppointment.artist_name || 'Unassigned')}</Text><Text style={modalS.subValue}>{selectedAppointment.studio_name}</Text></>],
                  ['Price', () => <Text style={[modalS.value, { color: getDisplayPrice(selectedAppointment) === 'Pending Quote' ? theme.warning : theme.gold, fontWeight: '700' }]}>{getDisplayPrice(selectedAppointment)}</Text>],
                  ['Service / Design', () => <Text style={modalS.value}>{getDisplayTitle(selectedAppointment)}</Text>],
                  ...(selectedAppointment.notes ? [['Notes', () => <Text style={modalS.value}>{selectedAppointment.notes}</Text>]] : []),
                  ...(selectedAppointment.reference_image ? [['Attached Photo', () => <Image source={{ uri: selectedAppointment.reference_image }} style={{ width: '100%', height: 200, borderRadius: 12, marginTop: 8 }} resizeMode="cover" />]] : []),
                ].map(([label, render], i) => <View key={i} style={modalS.row}><Text style={modalS.label}>{label}</Text>{render()}</View>)}
              </ScrollView>
            )}

            {modalTab === 'transactions' && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 350 }}>
                {apptTransactions.length > 0 ? apptTransactions.map((tx, idx) => (
                  <View key={idx} style={{ backgroundColor: theme.surfaceLight, padding: 12, borderRadius: 12, marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ ...typography.bodyXSmall, color: theme.textSecondary }}>{new Date(tx.created_at).toLocaleDateString()}</Text>
                      <Text style={{ ...typography.bodyXSmall, fontWeight: '700', color: theme.gold }}>{(tx.type || 'payment').toUpperCase()}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ ...typography.bodySmall, color: theme.textPrimary, flex: 1 }} numberOfLines={1}>{tx.description}</Text>
                      <Text style={{ ...typography.body, fontWeight: '800', color: theme.textPrimary }}>₱{(parseFloat(tx.amount || 0) / 100).toLocaleString('en-PH', {minimumFractionDigits: 2})}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tx.status === 'paid' ? theme.success : tx.status === 'failed' ? theme.error : theme.warning, marginRight: 6 }} />
                      <Text style={{ ...typography.bodyXSmall, color: theme.textSecondary }}>{(tx.status || 'pending').toUpperCase()}</Text>
                    </View>
                  </View>
                )) : (
                  <EmptyState icon={CreditCard} title="No Transactions" subtitle="No payment history for this session" />
                )}
              </ScrollView>
            )}

            {modalTab === 'details' && ['pending', 'confirmed', 'completed', 'pending_schedule'].includes(selectedAppointment?.status) && selectedAppointment?.payment_status !== 'paid' && parseFloat(selectedAppointment?.price || 0) > 0 && (
              <AnimatedTouchable style={[modalS.payBtn, { backgroundColor: theme.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 }]} onPress={handlePaymentInit} disabled={paymentLoading} activeOpacity={0.8}>
                {paymentLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                  <><CreditCard size={18} color={theme.backgroundDeep} /><Text style={[modalS.payText, { color: theme.backgroundDeep }]}>{['pending', 'pending_schedule'].includes(selectedAppointment?.status) ? 'Pay to Confirm' : 'Pay Balance'} (P{parseFloat(selectedAppointment?.price || 0).toLocaleString()})</Text></>
                )}
              </AnimatedTouchable>
            )}

            {modalTab === 'details' && ['pending', 'confirmed', 'pending_schedule'].includes(selectedAppointment?.status) && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <AnimatedTouchable style={[modalS.cancelBtn, { flex: 1, backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.border }]} onPress={() => { Alert.alert('Reschedule Request', 'To reschedule, please contact your artist directly or message the studio via the Chat portal.', [{ text: 'Go to Chat', onPress: () => { handleSelectAppointment(null); navigation.navigate('Chat'); } }, { text: 'Close', style: 'cancel' }]); }}>
                  <Text style={[modalS.cancelText, { color: theme.textPrimary }]}>Reschedule</Text>
                </AnimatedTouchable>
                <AnimatedTouchable style={[modalS.cancelBtn, { flex: 1, marginTop: 0 }]} onPress={() => handleCancel(selectedAppointment.id)}>
                  <Text style={modalS.cancelText}>Cancel</Text>
                </AnimatedTouchable>
              </View>
            )}

            <AnimatedTouchable style={modalS.closeBtn} onPress={() => handleSelectAppointment(null)}>
              <Text style={modalS.closeBtnText}>Close</Text>
            </AnimatedTouchable>
          </View>
        </View>
      </Modal>

      {/* Payment WebView Modal */}
      <Modal visible={showPaymentModal} animationType="slide" onRequestClose={handlePaymentClose}>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <AnimatedTouchable onPress={handlePaymentClose} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <X size={22} color={theme.textPrimary} />
              <Text style={{ marginLeft: 8, ...typography.body, fontWeight: '700', color: theme.textPrimary }}>Close Checkout</Text>
            </AnimatedTouchable>
          </View>
          {paymentUrl && (
            <WebView 
              source={{ uri: paymentUrl }} 
              style={{ flex: 1 }} 
              startInLoadingState 
              renderLoading={() => <ActivityIndicator style={{ position: 'absolute', top: '50%', left: '50%' }} size="large" color={theme.gold} />} 
              onNavigationStateChange={(navState) => {
                if (navState.url && navState.url.includes('booking-confirmation')) {
                  handlePaymentSuccess();
                }
              }}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Payment Options Modal */}
      <Modal visible={showPaymentOptions} animationType="fade" transparent onRequestClose={() => { if (!paymentLoading) setShowPaymentOptions(false); }}>
        <View style={[modalS.overlay, { justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[modalS.content, { width: '90%', borderRadius: borderRadius.xl }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={modalS.title}>Select Payment</Text>
              {!paymentLoading && <AnimatedTouchable onPress={() => setShowPaymentOptions(false)}><X size={22} color={theme.textSecondary} /></AnimatedTouchable>}
            </View>

            {paymentLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={theme.gold} />
                <Text style={{ ...typography.body, color: theme.textSecondary, marginTop: 16 }}>Connecting to payment gateway...</Text>
              </View>
            ) : (
              <>
                <Text style={{ ...typography.body, color: theme.textSecondary, marginBottom: 16 }}>Choose how you'd like to pay for your session.</Text>
                <AnimatedTouchable 
                  style={{ backgroundColor: theme.surfaceLight, padding: 16, borderRadius: borderRadius.md, marginBottom: 12, borderWidth: 1, borderColor: theme.border }}
                  onPress={() => triggerPayment('balance')}
                >
                  <Text style={{ ...typography.h4, color: theme.textPrimary, marginBottom: 4 }}>Pay Full Balance</Text>
                  <Text style={{ ...typography.bodySmall, color: theme.textSecondary }}>Settle the remaining amount for this session.</Text>
                </AnimatedTouchable>
                <AnimatedTouchable 
                  style={{ backgroundColor: theme.surfaceLight, padding: 16, borderRadius: borderRadius.md, marginBottom: 12, borderWidth: 1, borderColor: theme.border }}
                  onPress={() => triggerPayment('deposit')}
                >
                  <Text style={{ ...typography.h4, color: theme.textPrimary, marginBottom: 4 }}>Pay Downpayment</Text>
                  <Text style={{ ...typography.bodySmall, color: theme.textSecondary }}>Pay a standard ₱5,000 to secure or maintain your spot.</Text>
                </AnimatedTouchable>
                <AnimatedTouchable 
                  style={{ backgroundColor: theme.surfaceLight, padding: 16, borderRadius: borderRadius.md, borderWidth: 1, borderColor: theme.border }}
                  onPress={() => {
                    setShowPaymentOptions(false);
                    setTimeout(() => {
                      Alert.alert('Custom Payment', 'Please select the amount you wish to pay.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: '\u20b1500', onPress: () => triggerPayment('custom', 500) },
                        { text: '\u20b11,000', onPress: () => triggerPayment('custom', 1000) },
                        { text: '\u20b12,500', onPress: () => triggerPayment('custom', 2500) }
                      ]);
                    }, 350);
                  }}
                >
                  <Text style={{ ...typography.h4, color: theme.textPrimary, marginBottom: 4 }}>Custom Amount</Text>
                  <Text style={{ ...typography.bodySmall, color: theme.textSecondary }}>Choose a specific partial amount to pay right now.</Text>
                </AnimatedTouchable>
              </>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const getStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 16 : 52, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerTitle: { ...typography.h2, color: theme.textPrimary },
  headerBtn: { padding: 8 },
  tabs: { flexDirection: 'row', padding: 14, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: borderRadius.round, marginHorizontal: 3, backgroundColor: theme.surfaceLight },
  tabActive: { backgroundColor: theme.gold },
  tabText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600' },
  tabTextActive: { color: theme.backgroundDeep },
  calCard: { backgroundColor: theme.surface, borderRadius: borderRadius.xl, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: theme.border },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  monthBtn: { padding: 6 },
  monthText: { ...typography.body, fontWeight: '700', color: theme.textPrimary },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  weekDayText: { width: '14.28%', textAlign: 'center', ...typography.bodyXSmall, color: theme.textTertiary, fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 20, marginBottom: 4 },
  selectedDay: { backgroundColor: theme.gold },
  dayText: { ...typography.bodySmall, color: theme.textPrimary },
  selectedDayText: { color: theme.backgroundDeep, fontWeight: '700' },
  calDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearDate: { marginTop: 10, alignItems: 'center', padding: 6 },
  clearDateText: { ...typography.bodySmall, color: theme.gold, fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: borderRadius.xl, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  cardLeft: { marginRight: 12, justifyContent: 'center' },
  dateBox: { alignItems: 'center', backgroundColor: theme.surfaceLight, padding: 6, borderRadius: borderRadius.md, width: 44 },
  dateDay: { fontSize: 16, fontWeight: '800', color: theme.gold },
  dateMonth: { ...typography.bodyXSmall, color: theme.gold, textTransform: 'uppercase' },
  cardCenter: { flex: 1, justifyContent: 'center' },
  serviceText: { ...typography.body, fontWeight: '700', color: theme.textPrimary },
  artistText: { ...typography.bodySmall, color: theme.textSecondary, marginTop: 2 },
  timeText: { ...typography.bodyXSmall, color: theme.textTertiary },
  priceText: { ...typography.bodyXSmall, color: theme.textPrimary, fontWeight: '700' },
  cardRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: borderRadius.sm, flexDirection: 'row', alignItems: 'center' },
  statusPillText: { ...typography.bodyXSmall, fontWeight: '700', textTransform: 'capitalize' },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: theme.border },
  pageBtn: { padding: 8, borderRadius: borderRadius.md, backgroundColor: theme.surfaceLight },
  pageInfo: { ...typography.bodySmall, color: theme.textTertiary },
  dockedBar: { padding: 16, paddingBottom: Platform.OS === 'ios' ? 100 : 80, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  dockedBtn: { backgroundColor: theme.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: borderRadius.xl, gap: 8 },
  dockedBtnText: { ...typography.button, color: theme.backgroundDeep, fontSize: 16 },
});

const getModalStyles = (theme) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,13,14,0.7)', justifyContent: 'flex-end' },
  content: { backgroundColor: theme.surface, borderTopLeftRadius: borderRadius.xxl, borderTopRightRadius: borderRadius.xxl, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '90%', borderWidth: 1, borderColor: theme.border, borderBottomWidth: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 16 },
  title: { ...typography.h3, color: theme.textPrimary },
  row: { marginBottom: 14 },
  label: { ...typography.bodyXSmall, color: theme.textTertiary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { ...typography.body, color: theme.textPrimary, fontWeight: '500' },
  subValue: { ...typography.bodySmall, color: theme.textSecondary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.sm, alignSelf: 'flex-start' },
  badgeText: { ...typography.bodyXSmall, fontWeight: '700' },
  payBtn: { borderRadius: borderRadius.xl, overflow: 'hidden', marginTop: 8, marginBottom: 8 },
  payGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  payText: { ...typography.button, color: theme.backgroundDeep },
  cancelBtn: { backgroundColor: `${theme.error}15`, padding: 12, borderRadius: borderRadius.md, alignItems: 'center', marginBottom: 8 },
  cancelText: { ...typography.body, color: theme.error, fontWeight: '700' },
  closeBtn: { backgroundColor: theme.surfaceLight, padding: 12, borderRadius: borderRadius.md, alignItems: 'center', marginTop: 4 },
  closeBtnText: { ...typography.body, color: theme.textSecondary, fontWeight: '600' },
});