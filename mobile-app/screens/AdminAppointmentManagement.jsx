/**
 * AdminAppointmentManagement.jsx -- Full Appointment CRUD
 * 1:1 parity with web's AdminAppointments.js
 * Features: Search, status filter, reference image, edit modal with date/time/status/price, delete
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, Modal, ScrollView, SafeAreaView,
  RefreshControl, Image, Animated, PanResponder,
} from 'react-native';
import {
  Search, Calendar, User, Palette, Clock, X, Plus,
  CheckCircle, AlertTriangle, FileText, Trash2, Save,
  ChevronLeft, ChevronRight, Filter, ChevronDown,
  ShieldCheck, List, Archive, LayoutGrid,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import { typography, spacing, borderRadius, shadows } from '../src/theme';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { StaggerItem } from '../src/components/shared/StaggerItem';
import { StatusBadge } from '../src/components/shared/StatusBadge';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { ConfirmModal } from '../src/components/shared/ConfirmModal';
import { formatCurrency, formatDate, formatTime, getDisplayCode } from '../src/utils/formatters';
import {
  getAdminAppointments, updateAppointmentByAdmin, deleteAppointmentByAdmin,
  createAppointmentByAdmin, API_BASE_URL, getAllUsersForAdmin, fetchAPI,
} from '../src/utils/api';
import { sanitizeNumeric, sanitizeEmail, isValidEmail, sanitizeText } from '../src/utils/validators';

export const AdminAppointmentManagement = ({ navigation, route }) => {
  const { theme, hapticsEnabled } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(theme, insets);

  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(route?.params?.filter || 'all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDiscountType, setEditDiscountType] = useState('flat');
  const [editDiscountAmount, setEditDiscountAmount] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editDesignTitle, setEditDesignTitle] = useState('');
  const [editServiceType, setEditServiceType] = useState('Tattoo Session');
  const [editArtistId, setEditArtistId] = useState('');

  // Date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Artists for booking
  const [artists, setArtists] = useState([]);

  const loadArtists = async () => {
    try {
      const result = await getAllUsersForAdmin({ search: '' });
      if (result.success) {
        const all = result.data || result.users || [];
        setArtists(all.filter(u => u.user_type === 'artist'));
      }
    } catch (e) { console.warn('loadArtists error', e); }
  };

  useEffect(() => { loadArtists(); }, []);

  // ── P2-7: Fetch session materials for archive view ────────────────────────
  const fetchSessionMaterials = async (id) => {
    try {
      const res = await fetchAPI(`/appointments/${id}/materials`);
      if (res.success) return { materials: res.materials || [], totalCost: res.totalCost || 0 };
    } catch (e) { /* silent */ }
    return { materials: [], totalCost: 0 };
  };

  // ── P2-7: Fetch any pending reschedule request for an appointment ─────────
  const fetchRescheduleRequest = async (apptId) => {
    try {
      const res = await fetchAPI(`/admin/appointments/${apptId}/reschedule-request`);
      if (res.success && res.request) setPendingReschedule(res.request);
      else setPendingReschedule(null);
    } catch (e) { setPendingReschedule(null); }
  };

  // ── P2-7: Admin approve/reject reschedule request ─────────────────────────
  const handleRescheduleDecision = async (decision) => {
    if (!pendingReschedule) return;
    setRescheduleDeciding(true);
    try {
      const res = await fetchAPI(`/admin/reschedule-requests/${pendingReschedule.id}/decide`, {
        method: 'PUT',
        body: JSON.stringify({
          decision: decision === 'approve' ? 'approved' : 'rejected',
          adminNotes: rescheduleNotes.trim() || null,
        }),
      });
      if (res.success) {
        Alert.alert(
          decision === 'approve' ? 'Request Approved' : 'Request Rejected',
          res.message || 'Decision recorded.',
        );
        setPendingReschedule(null);
        setRescheduleNotes('');
        loadData();
      } else {
        Alert.alert('Error', res.message || 'Failed to process request.');
      }
    } catch (e) {
      Alert.alert('Error', 'Network error processing request.');
    } finally {
      setRescheduleDeciding(false);
    }
  };

  useEffect(() => {
    if (route?.params?.filter) {
      setFilter(route.params.filter);
      setPage(1);
    }
  }, [route?.params?.filter]);

  // Delete confirm
  const [deleteModal, setDeleteModal] = useState({ visible: false });

  // ── P2-7: View mode (list / calendar) ────────────────────────────────────
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'
  const [calViewMonth, setCalViewMonth] = useState(new Date());
  const [calSelectedDay, setCalSelectedDay] = useState(null);

  // ── P2-7: Archive mode (read-only view for completed sessions) ────────────
  const [archiveMode, setArchiveMode] = useState(false);
  const [archiveMaterials, setArchiveMaterials] = useState({ materials: [], totalCost: 0 });
  const [archiveLoading, setArchiveLoading] = useState(false);

  // ── P2-7: Reschedule Request decision panel ───────────────────────────────
  const [pendingReschedule, setPendingReschedule] = useState(null);
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [rescheduleDeciding, setRescheduleDeciding] = useState(false);

  // ── Validation state ──────────────────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState({});

  const clearError = (field) => {
    if (fieldErrors[field]) setFieldErrors(prev => ({ ...prev, [field]: '' }));
  };

  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const MIN_TATTOO_PRICE = 5000;

  const validateForm = (isCreate) => {
    const errs = {};

    // ─ Client email (create only)
    if (isCreate) {
      const email = sanitizeEmail(editClientEmail);
      if (!email) {
        errs.clientEmail = 'Client email is required.';
      } else if (!isValidEmail(email)) {
        errs.clientEmail = 'Enter a valid email address.';
      }
    }

    // ─ Date
    const dateVal = (editDate || '').trim();
    if (!dateVal) {
      errs.date = 'Date is required.';
    } else if (!DATE_REGEX.test(dateVal)) {
      errs.date = 'Date must be in YYYY-MM-DD format.';
    } else {
      const inputDate = new Date(dateVal + 'T00:00:00');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (inputDate < today) {
        errs.date = 'Date cannot be in the past.';
      }
    }

    // ─ Time — only validate if fully entered (5 chars = HH:MM)
    const timeVal = (editTime || '').trim();
    if (!timeVal) {
      errs.time = 'Start time is required.';
    } else if (timeVal.length === 5 && !TIME_REGEX.test(timeVal)) {
      errs.time = 'Time must be in HH:MM format (e.g. 13:00).';
    } else if (timeVal.length > 0 && timeVal.length < 5) {
      errs.time = 'Please enter a complete time (HH:MM).';
    }

    // ─ Price
    const priceNum = parseFloat(sanitizeNumeric(editPrice, true)) || 0;
    if (priceNum < 0) {
      errs.price = 'Price cannot be negative.';
    } else if (priceNum > 0 && priceNum < MIN_TATTOO_PRICE) {
      errs.price = `Minimum session price is ₱${MIN_TATTOO_PRICE.toLocaleString()}.`;
    }

    // ─ Status gate: cannot complete without a price
    if (editStatus === 'completed' && priceNum <= 0) {
      errs.price = 'A price must be set before marking this session as Completed.';
    }

    // ─ Design title: strip dangerous chars but allow empty
    if (editDesignTitle && sanitizeText(editDesignTitle) !== editDesignTitle.trim()) {
      errs.designTitle = 'Design title contains invalid characters.';
    }

    // ─ Artist required for create
    if (isCreate && !editArtistId) {
      errs.artistId = 'Please assign an artist to this session.';
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    const result = await getAdminAppointments();
    if (result.success) {
      // Sort by most recent ID first (per gemini.md rule)
      const sorted = (result.data || result.appointments || []).sort((a, b) => (b.id || 0) - (a.id || 0));
      setAppointments(sorted);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const openModal = async (appt) => {
    // P2-7: Completed appointments open in read-only Archive mode
    if (appt && appt.status === 'completed') {
      setSelectedAppt(appt);
      setArchiveMode(true);
      setArchiveLoading(true);
      setModalVisible(true);
      const mats = await fetchSessionMaterials(appt.id);
      setArchiveMaterials(mats);
      setArchiveLoading(false);
      return;
    }
    // Standard editable modal
    setArchiveMode(false);
    setArchiveMaterials({ materials: [], totalCost: 0 });
    setPendingReschedule(null);
    setRescheduleNotes('');
    setSelectedAppt(appt);
    setEditDate(appt ? (appt.appointment_date ? appt.appointment_date.split('T')[0] : '') : '');
    setEditTime(appt ? appt.start_time || '' : '');
    setEditStatus(appt ? appt.status || 'pending' : 'pending');
    setEditPrice(appt ? String(appt.price || appt.total_price || '') : '');
    setEditDiscountType(appt ? (appt.discount_type || 'flat') : 'flat');
    setEditDiscountAmount(appt ? (appt.discount_amount ? String(appt.discount_amount) : '') : '');
    setEditClientEmail(appt ? appt.client_email || '' : '');
    setEditDesignTitle(appt ? appt.design_title || '' : '');
    setEditServiceType(appt ? appt.service_type || 'Tattoo Session' : 'Tattoo Session');
    setEditArtistId(appt ? String(appt.artist_id || '') : '');
    setCalendarMonth(new Date());
    setShowDatePicker(false);
    setFieldErrors({});
    setModalVisible(true);
    // Fetch pending reschedule request
    if (appt?.id) fetchRescheduleRequest(appt.id);
  };

  const handleSave = async () => {
    const isCreate = !selectedAppt;
    if (!validateForm(isCreate)) {
      Alert.alert(
        'Validation Error',
        'Please correct the highlighted fields before saving.',
        [{ text: 'OK' }]
      );
      return;
    }

    const sPrice = parseFloat(sanitizeNumeric(editPrice, true)) || 0;

    if (isCreate) {
      const result = await createAppointmentByAdmin({
        clientEmail: sanitizeEmail(editClientEmail),
        designTitle: sanitizeText(editDesignTitle),
        date: editDate.trim(),
        startTime: editTime.trim(),
        price: sPrice,
        status: editStatus,
        artistId: editArtistId || null,
      });
      if (result.success) {
        Alert.alert('Success', 'Appointment created');
        setModalVisible(false);
        setFieldErrors({});
        loadData();
      } else {
        Alert.alert('Error', result.message || 'Failed to create');
      }
      return;
    }

    const discountAmt = parseFloat(editDiscountAmount) || 0;
    const discountTypeVal = discountAmt > 0 ? (editDiscountType || 'flat') : null;

    const result = await updateAppointmentByAdmin(selectedAppt.id, {
      status: editStatus,
      date: editDate.trim(),
      startTime: editTime.trim(),
      price: sPrice,
      serviceType: editServiceType,
      designTitle: sanitizeText(editDesignTitle),
      artistId: editArtistId || null,
      discountAmount: discountAmt,
      discountType: discountTypeVal,
    });
    if (result.success) {
      Alert.alert('Success', 'Appointment updated');
      setModalVisible(false);
      setFieldErrors({});
      loadData();
    } else if (result.status === 409 || result.message?.toLowerCase().includes('conflict')) {
      Alert.alert('Scheduling Conflict', 'This artist already has an appointment at this time.');
    } else {
      Alert.alert('Error', result.message || 'Failed to update');
    }
  };

  const handleDelete = async () => {
    const result = await deleteAppointmentByAdmin(selectedAppt.id);
    setDeleteModal({ visible: false });
    if (result.success) {
      setModalVisible(false);
      loadData();
    } else {
      Alert.alert('Error', 'Failed to delete appointment');
    }
  };

  // Filter & paginate (P2-7: calendar day filter when calSelectedDay is set)
  const filteredData = appointments.filter(a => {
    const matchFilter = filter === 'all' || a.status === filter;
    const matchSearch = search === '' ||
      (a.client_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.artist_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.design_title || '').toLowerCase().includes(search.toLowerCase());
    // Calendar grid day filter
    let matchDay = true;
    if (calSelectedDay && viewMode === 'calendar') {
      const aptDate = (a.appointment_date || '').split('T')[0];
      const y = calViewMonth.getFullYear();
      const m = String(calViewMonth.getMonth() + 1).padStart(2, '0');
      const d = String(calSelectedDay).padStart(2, '0');
      matchDay = aptDate === `${y}-${m}-${d}`;
    }
    return matchFilter && matchSearch && matchDay;
  });
  const totalPages = Math.ceil(filteredData.length / perPage);
  const displayed = filteredData.slice((page - 1) * perPage, page * perPage);

  // P2-7: Calendar grid helpers
  const calYear = calViewMonth.getFullYear();
  const calMonth = calViewMonth.getMonth();
  const calFirstDay = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const CAL_MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const CAL_DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const getApptDotsForDay = (d) => {
    const y = calYear; const m = String(calMonth + 1).padStart(2, '0');
    const ds = String(d).padStart(2, '0');
    return appointments.filter(a => (a.appointment_date || '').split('T')[0] === `${y}-${m}-${ds}`);
  };

  // Swipeable Card Wrapper
  const SwipeableCard = ({ item, index }) => {
    const pan = React.useRef(new Animated.ValueXY()).current;

    const panResponder = React.useMemo(() => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dy) < 20,
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -100) {
          // Trigger delete intent
          Animated.spring(pan, { toValue: { x: -150, y: 0 }, useNativeDriver: false }).start();
          setSelectedAppt(item);
          setDeleteModal({ visible: true });
          // Reset after short delay so it doesn't stay stuck open
          setTimeout(() => {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          }, 500);
        } else {
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        }
      }
    }), [item]);

    return (
      <StaggerItem index={index}>
        <View style={{ marginBottom: 10 }}>
          {/* Background Delete Action */}
          <View style={styles.swipeDeleteBg}>
            <Trash2 size={24} color={theme.backgroundDeep} />
            <Text style={styles.swipeDeleteText}>Delete</Text>
          </View>
          {/* Foreground Card */}
          <Animated.View style={[styles.cardWrapper, { transform: [{ translateX: pan.x }] }]} {...panResponder.panHandlers}>
            <AnimatedTouchable style={styles.card} onPress={() => openModal(item)} activeOpacity={0.9}>
              <View style={styles.cardTop}>
                <View style={styles.cardTopLeft}>
                  <Text style={styles.bookingCode}>{getDisplayCode(item.booking_code, item.id)}</Text>
                  <Text style={styles.cardDate}>{formatDate(item.appointment_date)}</Text>
                </View>
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.design_title || 'Tattoo Session'}</Text>
              <View style={styles.cardMeta}>
                <View style={styles.metaItem}>
                  <User size={13} color={theme.textTertiary} />
                  <Text style={styles.metaText}>{item.client_name || 'N/A'}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Palette size={13} color={theme.textTertiary} />
                  <Text style={styles.metaText}>{item.artist_name || 'Unassigned'}</Text>
                </View>
                {item.start_time && (
                  <View style={styles.metaItem}>
                    <Clock size={13} color={theme.textTertiary} />
                    <Text style={styles.metaText}>{formatTime(item.start_time)}</Text>
                  </View>
                )}
              </View>
              {item.price || item.total_price ? (
                <Text style={styles.cardPrice}>P{formatCurrency(item.price || item.total_price)}</Text>
              ) : null}
              {/* P2-7: Waiver badge */}
              {item.waiver_accepted_at ? (
                <View style={styles.waiverBadge}>
                  <ShieldCheck size={11} color="#047857" />
                  <Text style={styles.waiverBadgeText}>Waiver Signed</Text>
                </View>
              ) : null}
            </AnimatedTouchable>
          </Animated.View>
        </View>
      </StaggerItem>
    );
  };

  const renderItem = ({ item, index }) => <SwipeableCard item={item} index={index} />;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Queue Engine</Text>
          <Text style={styles.headerCount}>{filteredData.length} total sessions</Text>
        </View>
        {/* P2-7: View-mode toggle */}
        <View style={styles.viewModeToggle}>
          <AnimatedTouchable
            style={[styles.viewModeBtn, viewMode === 'list' && styles.viewModeBtnActive]}
            onPress={() => { setViewMode('list'); setCalSelectedDay(null); setPage(1); }}
            title="List view"
          >
            <List size={16} color={viewMode === 'list' ? theme.backgroundDeep : theme.textSecondary} />
          </AnimatedTouchable>
          <AnimatedTouchable
            style={[styles.viewModeBtn, viewMode === 'calendar' && styles.viewModeBtnActive]}
            onPress={() => { setViewMode('calendar'); setPage(1); }}
            title="Calendar view"
          >
            <LayoutGrid size={16} color={viewMode === 'calendar' ? theme.backgroundDeep : theme.textSecondary} />
          </AnimatedTouchable>
        </View>
        <AnimatedTouchable style={styles.addBtn} onPress={() => openModal(null)} title="New appointment">
          <Plus size={20} color={theme.backgroundDeep} />
        </AnimatedTouchable>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Search size={18} color={theme.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search client, artist, design..."
          placeholderTextColor={theme.textTertiary}
          value={search}
          onChangeText={(t) => { setSearch(t); setPage(1); }}
          maxLength={100}
        />
      </View>

      {/* Status Filters */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map((f, i) => (
            <StaggerItem key={f} index={i} style={[styles.filterPill, filter === f && styles.filterPillActive]}>
              <AnimatedTouchable onPress={() => { setFilter(f); setPage(1); }} style={{ paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
                </Text>
              </AnimatedTouchable>
            </StaggerItem>
          ))}
        </ScrollView>
      </View>

      {/* P2-7: Calendar Grid View */}
      {viewMode === 'calendar' && (
        <View style={styles.calGrid}>
          {/* Month navigation */}
          <View style={styles.calGridHeader}>
            <AnimatedTouchable onPress={() => setCalViewMonth(m => { const n = new Date(m); n.setMonth(n.getMonth()-1); return n; })} style={styles.calMonthBtn}>
              <ChevronLeft size={18} color={theme.textPrimary} />
            </AnimatedTouchable>
            <Text style={styles.calGridMonthText}>{CAL_MONTH_NAMES[calMonth]} {calYear}</Text>
            <AnimatedTouchable onPress={() => setCalViewMonth(m => { const n = new Date(m); n.setMonth(n.getMonth()+1); return n; })} style={styles.calMonthBtn}>
              <ChevronRight size={18} color={theme.textPrimary} />
            </AnimatedTouchable>
          </View>
          {/* Day labels */}
          <View style={styles.calDayLabelRow}>
            {CAL_DAY_LABELS.map(l => <Text key={l} style={styles.calDayLabel}>{l}</Text>)}
          </View>
          {/* Day cells */}
          <View style={styles.calDayCells}>
            {Array.from({ length: calFirstDay }).map((_, i) => <View key={`e${i}`} style={styles.calDayCell} />)}
            {Array.from({ length: calDaysInMonth }, (_, i) => i + 1).map(d => {
              const dots = getApptDotsForDay(d);
              const isSelected = calSelectedDay === d;
              const isToday = new Date().getDate() === d && new Date().getMonth() === calMonth && new Date().getFullYear() === calYear;
              return (
                <AnimatedTouchable
                  key={d}
                  style={[styles.calDayCell, isSelected && styles.calDayCellSelected, isToday && !isSelected && styles.calDayCellToday]}
                  onPress={() => { setCalSelectedDay(calSelectedDay === d ? null : d); setPage(1); }}
                >
                  <Text style={[styles.calDayCellText, isSelected && styles.calDayCellTextSelected, isToday && !isSelected && { color: theme.gold }]}>{d}</Text>
                  {dots.length > 0 && (
                    <View style={styles.calDotRow}>
                      {dots.slice(0, 3).map((apt, idx) => (
                        <View key={idx} style={[styles.calDot, { backgroundColor: apt.status === 'completed' ? theme.success : apt.status === 'cancelled' ? theme.error : theme.gold }]} />
                      ))}
                    </View>
                  )}
                </AnimatedTouchable>
              );
            })}
          </View>
          {calSelectedDay && (
            <View style={styles.calSelectedBanner}>
              <Text style={styles.calSelectedText}>
                {CAL_MONTH_NAMES[calMonth]} {calSelectedDay} — {getApptDotsForDay(calSelectedDay).length} session{getApptDotsForDay(calSelectedDay).length !== 1 ? 's' : ''}
              </Text>
              <AnimatedTouchable onPress={() => { setCalSelectedDay(null); setPage(1); }}>
                <X size={14} color={theme.textTertiary} />
              </AnimatedTouchable>
            </View>
          )}
        </View>
      )}

      {/* List */}
      {loading ? (
        <PremiumLoader message="Loading appointments..." />
      ) : (
        <FlatList
          data={displayed}
          renderItem={renderItem}
          keyExtractor={item => (item.id || Math.random()).toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon={Calendar} title="No appointments found" subtitle="The queue is currently empty." />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor={theme.gold} />}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <View style={styles.pagination}>
          <AnimatedTouchable disabled={page === 1} onPress={() => setPage(p => p - 1)} style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}>
            <ChevronLeft size={18} color={page === 1 ? theme.textTertiary : theme.textPrimary} />
          </AnimatedTouchable>
          <Text style={styles.pageText}>Page {page} of {totalPages}</Text>
          <AnimatedTouchable disabled={page === totalPages} onPress={() => setPage(p => p + 1)} style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}>
            <ChevronRight size={18} color={page === totalPages ? theme.textTertiary : theme.textPrimary} />
          </AnimatedTouchable>
        </View>
      )}

      {/* Edit Modal */}
      <Modal visible={modalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {archiveMode ? 'Archive Record' : selectedAppt ? 'Manage Session' : 'New Session'}
                </Text>
                {/* P2-7: Waiver badge in modal header */}
                {selectedAppt?.waiver_accepted_at ? (
                  <View style={[styles.waiverBadge, { marginTop: 4 }]}>
                    <ShieldCheck size={11} color="#047857" />
                    <Text style={styles.waiverBadgeText}>Waiver signed {new Date(selectedAppt.waiver_accepted_at).toLocaleDateString()}</Text>
                  </View>
                ) : null}
              </View>
              <AnimatedTouchable
                onPress={() => { setModalVisible(false); setArchiveMode(false); }}
                style={styles.closeBtn}
                aria-label="Close modal"
                title="Close"
              >
                <X size={20} color={theme.textSecondary} />
              </AnimatedTouchable>
            </View>

            {/* Modal Scroll View */}
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>

              {/* P2-7: ARCHIVE MODE — read-only completed session view */}
              {archiveMode && selectedAppt ? (
                <View style={styles.archiveView}>
                  <View style={styles.archiveBanner}>
                    <Archive size={16} color="#6d28d9" />
                    <Text style={styles.archiveBannerText}>Completed Session — Read Only</Text>
                  </View>
                  <View style={styles.infoSection}>
                    <InfoRow theme={theme} label="Booking" value={getDisplayCode(selectedAppt.booking_code, selectedAppt.id)} />
                    <InfoRow theme={theme} label="Client" value={selectedAppt.client_name || 'N/A'} />
                    <InfoRow theme={theme} label="Artist" value={selectedAppt.artist_name || 'Unassigned'} />
                    <InfoRow theme={theme} label="Service" value={selectedAppt.service_type || 'N/A'} />
                    <InfoRow theme={theme} label="Date" value={formatDate(selectedAppt.appointment_date)} />
                    <InfoRow theme={theme} label="Price" value={`₱${formatCurrency(selectedAppt.price || 0)}`} />
                    <InfoRow theme={theme} label="Payment" value={(selectedAppt.payment_status || 'unpaid').toUpperCase()} />
                    {selectedAppt.session_duration ? (
                      <InfoRow theme={theme} label="Duration" value={`${Math.floor(selectedAppt.session_duration / 3600)}h ${Math.floor((selectedAppt.session_duration % 3600) / 60)}m`} />
                    ) : null}
                    {selectedAppt.notes ? <InfoRow theme={theme} label="Notes" value={selectedAppt.notes} /> : null}
                  </View>
                  {/* Material cost table */}
                  <Text style={styles.archiveSectionTitle}>Logistics & Consumables</Text>
                  {archiveLoading ? (
                    <PremiumLoader message="Loading materials..." />
                  ) : archiveMaterials.materials.length === 0 ? (
                    <Text style={styles.archiveEmptyText}>No materials logged for this session.</Text>
                  ) : (
                    <View style={styles.archiveMaterialTable}>
                      <View style={styles.archiveMaterialHeader}>
                        <Text style={[styles.archiveMaterialCell, { flex: 2 }]}>Item</Text>
                        <Text style={styles.archiveMaterialCell}>Qty</Text>
                        <Text style={styles.archiveMaterialCell}>Cost</Text>
                      </View>
                      {archiveMaterials.materials.map((m, i) => (
                        <View key={i} style={[styles.archiveMaterialRow, i % 2 === 1 && styles.archiveMaterialRowAlt]}>
                          <Text style={[styles.archiveMaterialCellText, { flex: 2 }]} numberOfLines={1}>{m.item_name || m.name || 'Item'}</Text>
                          <Text style={styles.archiveMaterialCellText}>{m.quantity_used || m.qty || 1}</Text>
                          <Text style={styles.archiveMaterialCellText}>₱{formatCurrency((m.unit_cost || m.cost_per_unit || 0) * (m.quantity_used || m.qty || 1))}</Text>
                        </View>
                      ))}
                      <View style={styles.archiveMaterialTotal}>
                        <Text style={styles.archiveMaterialTotalLabel}>Total Material Cost</Text>
                        <Text style={styles.archiveMaterialTotalValue}>₱{formatCurrency(archiveMaterials.totalCost)}</Text>
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                <>{/* ─── Standard editable modal content below ─────────────────── */}

                {/* P2-7: Reschedule Request Decision Panel */}
                {pendingReschedule && (
                  <View style={styles.reschedulePanel}>
                    <View style={styles.reschedulePanelHeader}>
                      <AlertTriangle size={16} color="#b45309" />
                      <Text style={styles.reschedulePanelTitle}>Pending Reschedule Request</Text>
                    </View>
                    <Text style={styles.reschedulePanelDetail}>
                      Requested: {pendingReschedule.requested_date || 'N/A'}{pendingReschedule.requested_time ? ` at ${pendingReschedule.requested_time}` : ''}
                    </Text>
                    {pendingReschedule.reason ? (
                      <Text style={styles.reschedulePanelReason}>"{pendingReschedule.reason}"</Text>
                    ) : null}
                    <TextInput
                      style={styles.rescheduleNotesInput}
                      value={rescheduleNotes}
                      onChangeText={setRescheduleNotes}
                      placeholder="Admin notes (optional)"
                      placeholderTextColor={theme.textTertiary}
                      multiline
                      numberOfLines={2}
                    />
                    <View style={styles.rescheduleBtnRow}>
                      <AnimatedTouchable
                        style={[styles.rescheduleBtn, styles.rescheduleBtnApprove]}
                        onPress={() => handleRescheduleDecision('approve')}
                        disabled={rescheduleDeciding}
                        title="Approve reschedule request"
                      >
                        <CheckCircle size={14} color="#fff" />
                        <Text style={styles.rescheduleBtnText}>{rescheduleDeciding ? 'Saving...' : 'Approve'}</Text>
                      </AnimatedTouchable>
                      <AnimatedTouchable
                        style={[styles.rescheduleBtn, styles.rescheduleBtnReject]}
                        onPress={() => handleRescheduleDecision('reject')}
                        disabled={rescheduleDeciding}
                        title="Reject reschedule request"
                      >
                        <X size={14} color="#fff" />
                        <Text style={styles.rescheduleBtnText}>Reject</Text>
                      </AnimatedTouchable>
                    </View>
                  </View>
                )}

              {selectedAppt && selectedAppt.id ? (
                <View style={styles.infoSection}>
                  <InfoRow theme={theme} label="Booking Code" value={getDisplayCode(selectedAppt.booking_code, selectedAppt.id)} />
                  <InfoRow theme={theme} label="Client" value={`${selectedAppt.client_name}${selectedAppt.client_email ? ` (${selectedAppt.client_email})` : ''}`} />
                  <InfoRow theme={theme} label="Notes" value={selectedAppt.notes || 'No notes'} />
                </View>
              ) : (
                <View style={styles.infoSection}>
                  <Text style={styles.inputLabel}>Client Email <Text style={styles.requiredStar}>*</Text></Text>
                  <TextInput
                    style={[styles.input, fieldErrors.clientEmail && styles.inputError]}
                    value={editClientEmail}
                    onChangeText={t => { setEditClientEmail(t); clearError('clientEmail'); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="client@email.com"
                    placeholderTextColor={theme.textTertiary}
                  />
                  {fieldErrors.clientEmail ? <Text style={styles.errorText}>{fieldErrors.clientEmail}</Text> : null}
                </View>
              )}

              {/* Image Assets */}
              <View style={{ marginBottom: 16 }}>
                {selectedAppt?.reference_image && selectedAppt.reference_image.length > 10 && (
                  <View style={styles.imgContainer}>
                    <Text style={styles.inputLabel}>Reference from Booking</Text>
                    <Image
                      source={{ uri: selectedAppt.reference_image.startsWith('data:') ? selectedAppt.reference_image : selectedAppt.reference_image.startsWith('http') ? selectedAppt.reference_image : `${API_BASE_URL}${selectedAppt.reference_image}` }}
                      style={styles.refImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
                
                {selectedAppt?.before_photo && selectedAppt.before_photo.length > 10 && (
                  <View style={styles.imgContainer}>
                    <Text style={styles.inputLabel}>Stage Photo (Before/Draft)</Text>
                    <Image
                      source={{ uri: selectedAppt.before_photo.startsWith('data:') ? selectedAppt.before_photo : selectedAppt.before_photo.startsWith('http') ? selectedAppt.before_photo : `${API_BASE_URL}${selectedAppt.before_photo}` }}
                      style={styles.refImage}
                      resizeMode="contain"
                    />
                  </View>
                )}

                {selectedAppt?.after_photo && selectedAppt.after_photo.length > 10 && (
                  <View style={styles.imgContainer}>
                    <Text style={styles.inputLabel}>Result Photo (After)</Text>
                    <Image
                      source={{ uri: selectedAppt.after_photo.startsWith('data:') ? selectedAppt.after_photo : selectedAppt.after_photo.startsWith('http') ? selectedAppt.after_photo : `${API_BASE_URL}${selectedAppt.after_photo}` }}
                      style={styles.refImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
              </View>

              {/* Editable Fields */}
              <Text style={styles.sectionHeader}>Edit Details</Text>

              <Text style={styles.inputLabel}>Service Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['Tattoo Session', 'Piercing', 'Consultation'].map(s => (
                    <AnimatedTouchable
                      key={s}
                      style={[styles.statusBtn, editServiceType === s && styles.statusBtnActive]}
                      onPress={() => setEditServiceType(s)}
                    >
                      <Text style={[styles.statusBtnText, editServiceType === s && styles.statusBtnTextActive]}>
                        {s}
                      </Text>
                    </AnimatedTouchable>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.inputLabel}>Design Title</Text>
              <TextInput
                style={[styles.input, fieldErrors.designTitle && styles.inputError]}
                value={editDesignTitle}
                onChangeText={t => { setEditDesignTitle(t); clearError('designTitle'); }}
                placeholder="e.g. Floral Sleeve"
                placeholderTextColor={theme.textTertiary}
              />
              {fieldErrors.designTitle ? <Text style={styles.errorText}>{fieldErrors.designTitle}</Text> : null}

              <Text style={styles.inputLabel}>Assigned Artist</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {artists.length === 0 ? (
                    <Text style={styles.noArtistHint}>No artists available</Text>
                  ) : artists.map(a => (
                    <AnimatedTouchable
                      key={String(a.id)}
                      style={[styles.artistChip, String(editArtistId) === String(a.id) && styles.artistChipActive]}
                      onPress={() => { setEditArtistId(String(a.id)); clearError('artistId'); }}
                    >
                      <Text style={[styles.artistChipText, String(editArtistId) === String(a.id) && styles.artistChipTextActive]}>{a.name}</Text>
                    </AnimatedTouchable>
                  ))}
                </View>
              </ScrollView>
              {fieldErrors.artistId ? <Text style={styles.errorText}>{fieldErrors.artistId}</Text> : null}

              <Text style={styles.inputLabel}>Date <Text style={styles.requiredStar}>*</Text></Text>
              <AnimatedTouchable
                style={[styles.datePickerBtn, fieldErrors.date && styles.inputError]}
                onPress={() => { setShowDatePicker(v => !v); clearError('date'); }}
              >
                <Calendar size={16} color={editDate ? theme.gold : theme.textTertiary} />
                <Text style={[styles.datePickerBtnText, !editDate && { color: theme.textTertiary }]}>
                  {editDate || 'Select a date'}
                </Text>
                <ChevronDown size={14} color={theme.textTertiary} />
              </AnimatedTouchable>
              {fieldErrors.date ? <Text style={styles.errorText}>{fieldErrors.date}</Text> : null}

              {showDatePicker && (
                <InlineCalendar
                  theme={theme}
                  styles={styles}
                  month={calendarMonth}
                  selectedDate={editDate}
                  onSelectDate={d => { setEditDate(d); setShowDatePicker(false); clearError('date'); }}
                  onPrevMonth={() => setCalendarMonth(m => { const n = new Date(m); n.setMonth(n.getMonth()-1); return n; })}
                  onNextMonth={() => setCalendarMonth(m => { const n = new Date(m); n.setMonth(n.getMonth()+1); return n; })}
                />
              )}

              <Text style={styles.inputLabel}>Start Time <Text style={styles.requiredStar}>*</Text></Text>
              <View style={styles.timeSlotGrid}>
                {['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'].map(t => (
                  <AnimatedTouchable
                    key={t}
                    style={[styles.timeSlot, editTime === t && styles.timeSlotActive,
                      fieldErrors.time && !editTime && styles.timeSlotError]}
                    onPress={() => { setEditTime(t); clearError('time'); }}
                  >
                    <Text style={[styles.timeSlotText, editTime === t && styles.timeSlotTextActive]}>{t}</Text>
                  </AnimatedTouchable>
                ))}
              </View>
              {fieldErrors.time ? <Text style={styles.errorText}>{fieldErrors.time}</Text> : null}

              <Text style={styles.inputLabel}>Price (PHP)</Text>
              <TextInput
                style={[styles.input, fieldErrors.price && styles.inputError]}
                value={editPrice}
                onChangeText={t => { setEditPrice(t); clearError('price'); }}
                keyboardType="numeric"
                placeholder="Min. ₱5,000 for sessions"
                placeholderTextColor={theme.textTertiary}
              />
              {fieldErrors.price ? <Text style={styles.errorText}>{fieldErrors.price}</Text> : null}

              {/* P2-15: Special Discount Section */}
              <View style={styles.discountSection}>
                <Text style={styles.discountTitle}>Special Discount</Text>
                {/* Preset quick-apply buttons */}
                <View style={styles.discountPresets}>
                  {[
                    { label: 'PWD 20%', type: 'percent', value: '20' },
                    { label: 'Senior 20%', type: 'percent', value: '20' },
                    { label: 'Promo 10%', type: 'percent', value: '10' },
                    { label: 'Clear', type: 'flat', value: '' },
                  ].map(preset => (
                    <AnimatedTouchable
                      key={preset.label}
                      style={[
                        styles.discountPreset,
                        editDiscountAmount === preset.value && editDiscountType === preset.type && preset.value !== ''
                          ? styles.discountPresetActive
                          : (preset.label === 'Clear' ? styles.discountPresetClear : {}),
                      ]}
                      onPress={() => {
                        setEditDiscountType(preset.type);
                        setEditDiscountAmount(preset.value);
                      }}
                    >
                      <Text
                        style={[
                          styles.discountPresetText,
                          editDiscountAmount === preset.value && editDiscountType === preset.type && preset.value !== ''
                            ? styles.discountPresetTextActive
                            : (preset.label === 'Clear' ? styles.discountPresetClearText : {}),
                        ]}
                      >{preset.label}</Text>
                    </AnimatedTouchable>
                  ))}
                </View>
                {/* Type toggle + amount input row */}
                <View style={styles.discountRow}>
                  <View style={styles.discountTypeToggle}>
                    {['flat', 'percent'].map(t => (
                      <AnimatedTouchable
                        key={t}
                        style={[styles.discountTypeBtn, editDiscountType === t && styles.discountTypeBtnActive]}
                        onPress={() => setEditDiscountType(t)}
                      >
                        <Text style={[styles.discountTypeBtnText, editDiscountType === t && styles.discountTypeBtnTextActive]}>
                          {t === 'flat' ? '₱ Flat' : '% Pct'}
                        </Text>
                      </AnimatedTouchable>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.input, styles.discountAmountInput]}
                    value={editDiscountAmount}
                    onChangeText={t => {
                      const raw = t.replace(/[^0-9.]/g, '');
                      const num = parseFloat(raw) || 0;
                      if (editDiscountType === 'percent' && num > 100) return;
                      const priceNum = parseFloat(editPrice) || 0;
                      if (editDiscountType === 'flat' && priceNum > 0 && num > priceNum) return;
                      setEditDiscountAmount(raw);
                    }}
                    keyboardType="decimal-pad"
                    placeholder={editDiscountType === 'percent' ? '0 – 100%' : '0'}
                    placeholderTextColor={theme.textTertiary}
                  />
                </View>
                {/* Effective price preview */}
                {parseFloat(editDiscountAmount) > 0 && parseFloat(editPrice) > 0 && (
                  <View style={styles.discountPreview}>
                    <Text style={styles.discountPreviewLabel}>Effective Price:</Text>
                    <Text style={styles.discountPreviewValue}>
                      ₱{(() => {
                        const p = parseFloat(editPrice) || 0;
                        const d = parseFloat(editDiscountAmount) || 0;
                        const eff = editDiscountType === 'percent'
                          ? p * (1 - d / 100)
                          : Math.max(0, p - d);
                        return eff.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                      <Text style={styles.discountPreviewWas}>{` (was ₱${parseFloat(editPrice).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}</Text>
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.statusRow}>
                {['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'].map(s => (
                  <AnimatedTouchable
                    key={s}
                    style={[styles.statusBtn, editStatus === s && styles.statusBtnActive]}
                    onPress={() => setEditStatus(s)}
                  >
                    <Text style={[styles.statusBtnText, editStatus === s && styles.statusBtnTextActive]}>
                      {s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}
                    </Text>
                  </AnimatedTouchable>
                ))}
              </View>

              {/* Actions */}
              <View style={styles.actionRow}>
                {selectedAppt?.id && (
                  <AnimatedTouchable style={styles.deleteBtnModal} onPress={() => setDeleteModal({ visible: true })}>
                    <Trash2 size={18} color={theme.error} />
                  </AnimatedTouchable>
                )}
                <AnimatedTouchable style={styles.saveBtnModal} onPress={handleSave}>
                  <Save size={18} color={theme.backgroundDeep} />
                  <Text style={styles.actionBtnText}>Save Session</Text>
                </AnimatedTouchable>
              </View>

              <View style={{ height: 30 }} />
              </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        visible={deleteModal.visible}
        title="Delete Appointment"
        message="Are you sure you want to delete this appointment? This action cannot be undone."
        confirmText="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ visible: false })}
      />
    </SafeAreaView>
  );
};

const InfoRow = ({ theme, label, value }) => {
  const styles = getStyles(theme, null);
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || 'N/A'}</Text>
    </View>
  );
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

const InlineCalendar = ({ theme, styles, month, selectedDate, onSelectDate, onPrevMonth, onNextMonth }) => {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const fmt = (d) => `${year}-${String(mon+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const isPast = (d) => new Date(fmt(d) + 'T00:00:00') < today;

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarHeader}>
        <AnimatedTouchable onPress={onPrevMonth} style={styles.calMonthBtn}>
          <ChevronLeft size={18} color={theme.textPrimary} />
        </AnimatedTouchable>
        <Text style={styles.calMonthText}>{MONTH_NAMES[mon]} {year}</Text>
        <AnimatedTouchable onPress={onNextMonth} style={styles.calMonthBtn}>
          <ChevronRight size={18} color={theme.textPrimary} />
        </AnimatedTouchable>
      </View>
      <View style={styles.calDayRow}>
        {DAY_LABELS.map(l => <Text key={l} style={styles.calDayLabel}>{l}</Text>)}
      </View>
      <View style={styles.calGrid}>
        {cells.map((d, i) => d === null ? (
          <View key={`e-${i}`} style={styles.calCell} />
        ) : (
          <AnimatedTouchable
            key={d}
            disabled={isPast(d)}
            style={[styles.calCell, selectedDate === fmt(d) && styles.calCellSelected, isPast(d) && styles.calCellPast]}
            onPress={() => onSelectDate(fmt(d))}
          >
            <Text style={[styles.calCellText, selectedDate === fmt(d) && styles.calCellTextSelected, isPast(d) && styles.calCellTextPast]}>{d}</Text>
          </AnimatedTouchable>
        ))}
      </View>
    </View>
  );
};


const getStyles = (theme, insets) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: (insets?.top || 0) + 16, paddingBottom: 16,
    backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitle: { ...typography.h2, color: theme.textPrimary },
  addBtn: {
    width: 40, height: 40, borderRadius: borderRadius.round, backgroundColor: theme.gold,
    justifyContent: 'center', alignItems: 'center',
    ...shadows.sm,
  },
  headerCount: { ...typography.bodySmall, color: theme.textTertiary, marginTop: 4 },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.surfaceLight, margin: 16, marginBottom: 8,
    borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: theme.border,
  },
  searchInput: { flex: 1, ...typography.body, color: theme.textPrimary },

  // Filters
  filterContainer: { height: 40, marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterPill: {
    borderRadius: borderRadius.round,
    backgroundColor: theme.surface,
    borderWidth: 1, borderColor: theme.borderLight,
    overflow: 'hidden',
  },
  filterPillActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  filterText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '600' },
  filterTextActive: { color: theme.backgroundDeep },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },

  // Swipeable Card Wrapper
  swipeDeleteBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.error,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 24,
  },
  swipeDeleteText: {
    ...typography.body,
    fontWeight: '700',
    color: theme.backgroundDeep,
    marginLeft: 8,
  },
  cardWrapper: {
    flex: 1,
  },

  // Card
  card: {
    backgroundColor: theme.surface, padding: 16, borderRadius: borderRadius.xl,
    borderWidth: 1, borderColor: theme.borderLight, ...shadows.subtle,
  },
  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bookingCode: { ...typography.bodyXSmall, color: theme.gold, fontWeight: '700' },
  cardDate: { ...typography.bodyXSmall, color: theme.textTertiary },
  cardTitle: { ...typography.body, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.bodyXSmall, color: theme.textSecondary },
  cardPrice: { ...typography.bodySmall, color: theme.success, fontWeight: '700', marginTop: 10 },

  // Pagination
  pagination: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 14, paddingVertical: 14, backgroundColor: theme.surface,
    borderTopWidth: 1, borderTopColor: theme.border,
  },
  pageBtn: { padding: 8, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md },
  pageBtnDisabled: { opacity: 0.3 },
  pageText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  modalCard: {
    backgroundColor: theme.surface, borderRadius: borderRadius.xxl,
    maxHeight: '90%', ...shadows.cardStrong, borderWidth: 1, borderColor: theme.borderLight,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  modalTitle: { ...typography.h3, color: theme.textPrimary },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surfaceLight,
    justifyContent: 'center', alignItems: 'center',
  },
  modalBody: { padding: 20 },

  // Info Section
  infoSection: {
    backgroundColor: theme.surfaceLight, borderRadius: borderRadius.lg,
    padding: 16, marginBottom: 20, borderWidth: 1, borderColor: theme.border,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 8,
  },
  infoLabel: { ...typography.bodyXSmall, color: theme.textTertiary, fontWeight: '600', width: '35%' },
  infoValue: { ...typography.bodySmall, color: theme.textPrimary, flex: 1, textAlign: 'right' },

  // Image
  imgContainer: { marginBottom: 20 },
  refImage: { width: '100%', height: 200, borderRadius: borderRadius.lg, marginTop: 8, backgroundColor: theme.surfaceLight },

  // Edit fields
  sectionHeader: { ...typography.h4, color: theme.gold, marginBottom: 16, marginTop: 4 },
  inputLabel: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: theme.surfaceLight, color: theme.textPrimary,
    padding: 14, borderRadius: borderRadius.md, marginBottom: 4,
    ...typography.body, borderWidth: 1, borderColor: theme.border,
  },
  inputError: {
    borderColor: theme.error,
    borderWidth: 1.5,
    backgroundColor: (theme.errorBg || 'rgba(239,68,68,0.06)'),
  },
  errorText: {
    ...typography.bodyXSmall,
    color: theme.error,
    marginBottom: 12,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  requiredStar: { color: theme.error, fontWeight: '700' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statusBtn: {
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: borderRadius.md,
    backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.borderLight,
  },
  statusBtnActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  statusBtnText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700' },
  statusBtnTextActive: { color: theme.backgroundDeep },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  deleteBtnModal: {
    backgroundColor: theme.surfaceLight, paddingHorizontal: 16, paddingVertical: 16, borderRadius: borderRadius.lg,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: theme.error,
  },
  saveBtnModal: {
    flex: 1, backgroundColor: theme.gold, paddingVertical: 16, borderRadius: borderRadius.lg,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    ...shadows.button,
  },
  actionBtnText: { ...typography.button, color: theme.backgroundDeep, fontSize: 15 },

  // Date picker button
  datePickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.border,
    borderRadius: borderRadius.md, padding: 14, marginBottom: 4,
  },
  datePickerBtnText: { ...typography.body, color: theme.textPrimary, flex: 1 },

  // Inline Calendar
  calendarContainer: {
    backgroundColor: theme.surface, borderRadius: borderRadius.xl, padding: 12,
    borderWidth: 1, borderColor: theme.borderLight, marginBottom: 16, ...shadows.subtle,
  },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calMonthBtn: { padding: 6 },
  calMonthText: { ...typography.body, fontWeight: '700', color: theme.textPrimary },
  calDayRow: { flexDirection: 'row', marginBottom: 6 },
  calDayLabel: { flex: 1, textAlign: 'center', ...typography.bodyXSmall, color: theme.textTertiary, fontWeight: '700' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
  calCellSelected: { backgroundColor: theme.gold },
  calCellPast: { opacity: 0.3 },
  calCellText: { ...typography.bodySmall, color: theme.textPrimary, fontWeight: '500' },
  calCellTextSelected: { color: theme.backgroundDeep, fontWeight: '700' },
  calCellTextPast: { color: theme.textTertiary },

  // Time Slot Grid
  timeSlotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  timeSlot: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: borderRadius.md,
    backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.borderLight,
  },
  timeSlotActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  timeSlotError: { borderColor: theme.error },
  timeSlotText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600' },
  timeSlotTextActive: { color: theme.backgroundDeep },

  // Artist Chip
  artistChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: borderRadius.round,
    backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.borderLight,
  },
  artistChipActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  artistChipText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600' },
  artistChipTextActive: { color: theme.backgroundDeep },
  noArtistHint: { ...typography.bodySmall, color: theme.textTertiary, fontStyle: 'italic', paddingVertical: 8 },

  // P2-15: Discount Section
  discountSection: {
    marginTop: 20, padding: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)',
    marginBottom: 8,
  },
  discountTitle: {
    ...typography.bodySmall, fontWeight: '800', color: '#b45309',
    letterSpacing: 0.4, marginBottom: 12,
  },
  discountPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  discountPreset: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: borderRadius.round,
    backgroundColor: theme.surfaceLight,
    borderWidth: 1, borderColor: theme.borderLight,
  },
  discountPresetActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  discountPresetClear: { borderColor: theme.border },
  discountPresetText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700' },
  discountPresetTextActive: { color: '#1c1917' },
  discountPresetClearText: { color: theme.textTertiary },
  discountRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 },
  discountTypeToggle: { flexDirection: 'row', backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md, padding: 3, borderWidth: 1, borderColor: theme.border },
  discountTypeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: borderRadius.sm - 2 },
  discountTypeBtnActive: { backgroundColor: '#f59e0b' },
  discountTypeBtnText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700' },
  discountTypeBtnTextActive: { color: '#1c1917' },
  discountAmountInput: { flex: 1, marginBottom: 0 },
  discountPreview: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 10, backgroundColor: '#fefce8', borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: '#fde68a',
  },
  discountPreviewLabel: { ...typography.bodySmall, color: '#92400e' },
  discountPreviewValue: { ...typography.body, fontWeight: '700', color: '#b45309' },
  discountPreviewWas: { ...typography.bodyXSmall, color: '#d97706', fontWeight: '400' },

  // ── P2-7: Waiver Badge ──────────────────────────────────────────────────
  waiverBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: borderRadius.sm, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#a7f3d0'
  },
  waiverBadgeText: { ...typography.bodyXSmall, color: '#047857', fontWeight: '700' },

  // ── P2-7: View Mode Toggle ──────────────────────────────────────────────
  viewModeToggle: {
    flexDirection: 'row', backgroundColor: theme.surfaceLight,
    borderRadius: borderRadius.md, padding: 3, borderWidth: 1, borderColor: theme.border,
    marginRight: 10
  },
  viewModeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: borderRadius.sm - 2 },
  viewModeBtnActive: { backgroundColor: theme.gold },

  // ── P2-7: Full Calendar Grid View ───────────────────────────────────────
  calGrid: {
    backgroundColor: theme.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  calGridHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  calGridMonthText: { ...typography.body, fontWeight: '700', color: theme.textPrimary },
  calDayLabelRow: { flexDirection: 'row', marginBottom: 8 },
  calDayCells: { flexDirection: 'row', flexWrap: 'wrap' },
  calDayCell: {
    width: '14.28%', aspectRatio: 1, padding: 2, alignItems: 'center',
    borderWidth: 1, borderColor: 'transparent', borderRadius: borderRadius.sm,
  },
  calDayCellSelected: { backgroundColor: theme.surfaceLight, borderColor: theme.border },
  calDayCellToday: { borderColor: theme.gold },
  calDayCellText: { ...typography.bodySmall, color: theme.textSecondary, marginTop: 2 },
  calDayCellTextSelected: { fontWeight: '700', color: theme.textPrimary },
  calDotRow: { flexDirection: 'row', gap: 2, marginTop: 4 },
  calDot: { width: 4, height: 4, borderRadius: 2 },
  calSelectedBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 12, padding: 12, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md,
  },
  calSelectedText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600' },

  // ── P2-7: Archive Mode (Read-Only) ──────────────────────────────────────
  archiveView: { paddingBottom: 24 },
  archiveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3e8ff',
    padding: 12, borderRadius: borderRadius.md, marginBottom: 16,
    borderWidth: 1, borderColor: '#d8b4fe',
  },
  archiveBannerText: { ...typography.bodySmall, color: '#6d28d9', fontWeight: '700' },
  archiveSectionTitle: { ...typography.h4, color: theme.textPrimary, marginBottom: 12, marginTop: 8 },
  archiveEmptyText: { ...typography.bodySmall, color: theme.textTertiary, fontStyle: 'italic' },
  archiveMaterialTable: {
    borderWidth: 1, borderColor: theme.border, borderRadius: borderRadius.md, overflow: 'hidden',
  },
  archiveMaterialHeader: {
    flexDirection: 'row', backgroundColor: theme.surfaceLight, padding: 12,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  archiveMaterialCell: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700', flex: 1 },
  archiveMaterialRow: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.borderLight },
  archiveMaterialRowAlt: { backgroundColor: theme.surfaceLight },
  archiveMaterialCellText: { ...typography.bodySmall, color: theme.textPrimary, flex: 1 },
  archiveMaterialTotal: {
    flexDirection: 'row', justifyContent: 'space-between', padding: 12,
    backgroundColor: '#fffbeb', borderTopWidth: 1, borderTopColor: '#fde68a',
  },
  archiveMaterialTotalLabel: { ...typography.bodySmall, color: '#b45309', fontWeight: '700' },
  archiveMaterialTotalValue: { ...typography.body, color: '#b45309', fontWeight: '800' },

  // ── P2-7: Reschedule Request Decision Panel ─────────────────────────────
  reschedulePanel: {
    backgroundColor: '#fffbeb', borderRadius: borderRadius.lg, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#fde68a',
  },
  reschedulePanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  reschedulePanelTitle: { ...typography.bodySmall, color: '#b45309', fontWeight: '700' },
  reschedulePanelDetail: { ...typography.bodySmall, color: '#92400e', marginBottom: 4 },
  reschedulePanelReason: { ...typography.bodySmall, color: '#78350f', fontStyle: 'italic', marginBottom: 12 },
  rescheduleNotesInput: {
    backgroundColor: '#fff', borderRadius: borderRadius.md, padding: 12,
    borderWidth: 1, borderColor: '#fcd34d', ...typography.bodySmall, color: '#1c1917',
    marginBottom: 12, minHeight: 60, textAlignVertical: 'top'
  },
  rescheduleBtnRow: { flexDirection: 'row', gap: 10 },
  rescheduleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: borderRadius.md, ...shadows.button
  },
  rescheduleBtnApprove: { backgroundColor: '#059669' },
  rescheduleBtnReject: { backgroundColor: '#dc2626' },
  rescheduleBtnText: { ...typography.button, color: '#fff', fontSize: 13 },
});
