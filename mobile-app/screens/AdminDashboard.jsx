import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, TextInput, Modal, Dimensions, Animated, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Users, Calendar, Palette, Package, BarChart3,
  Bell, AlertTriangle, CheckCircle, Search, ChevronLeft,
  ChevronRight, ShoppingCart, Settings, MessageSquare,
  DollarSign, X, Activity, FileText, Banknote,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { typography, borderRadius, shadows } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { StatusBadge } from '../src/components/shared/StatusBadge';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { ConfirmModal } from '../src/components/shared/ConfirmModal';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { formatCurrency, formatDate, formatTime, getDisplayCode } from '../src/utils/formatters';
import {
  getAdminDashboard, getAdminAppointments, getAdminAnalytics,
  updateAppointmentStatus, getAdminInventory, getNotifications,
  getAdminPayoutAlerts,
} from '../src/utils/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const StaggerItem = ({ index, children }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 400, delay: index * 80, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      {children}
    </Animated.View>
  );
};

export const AdminDashboard = ({ onLogout, navigation }) => {
  const { theme, hapticsEnabled } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(theme, insets);

  const [stats, setStats] = useState({ totalUsers: 0, totalAppointments: 0, totalRevenue: 0, activeArtists: 0 });
  const [appointments, setAppointments] = useState([]);
  const [artistStatus, setArtistStatus] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [inventoryAlerts, setInventoryAlerts] = useState({ outOfStock: [], lowStock: [] });
  const [payoutAlert, setPayoutAlert] = useState(null); // { count: N } when payout day
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);

  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [appointmentFilter, setAppointmentFilter] = useState('upcoming');
  const [appointmentPage, setAppointmentPage] = useState(1);
  const appointmentsPerPage = 5;

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ visible: false, message: '', onConfirm: null });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, apptRes, analyticsRes, payoutRes] = await Promise.all([
        getAdminDashboard(),
        getAdminAppointments(),
        getAdminAnalytics(),
        getAdminPayoutAlerts(),
      ]);

      // ─ P2-13: Payout Alert (15th / 30th of month)
      if (payoutRes?.success && payoutRes?.alerts?.length > 0) {
        setPayoutAlert({ count: payoutRes.alerts.length });
      } else {
        setPayoutAlert(null);
      }

      if (dashRes.success && dashRes.data) {
        const d = dashRes.data;
        setStats({
          totalUsers: d.users || d.totalUsers || 0,
          totalAppointments: d.appointments || d.totalAppointments || 0,
          totalRevenue: d.revenue || d.totalRevenue || 0,
          activeArtists: d.artists || d.activeArtists || 0,
        });
      }

      if (apptRes.success) {
        const appts = apptRes.data || apptRes.appointments || [];
        setAppointments(appts);
        processAppointmentData(appts);
      }

      if (analyticsRes.success && analyticsRes.data) {
        processAnalyticsStats(analyticsRes.data);
      }

      // Inventory low-stock alerts
      try {
        const invRes = await getAdminInventory();
        if (invRes.success) {
          const items = invRes.data || invRes.inventory || invRes.items || [];
          const outOfStock = items.filter(i => (i.quantity || i.stock || 0) <= 0);
          const lowStock = items.filter(i => {
            const qty = i.quantity || i.stock || 0;
            const min = i.minimum_stock || i.reorder_level || 5;
            return qty > 0 && qty <= min;
          });
          setInventoryAlerts({ outOfStock, lowStock });
        }
      } catch (e) {
        console.warn('Inventory alert fetch error:', e);
      }

      try {
        const notifsRes = await getNotifications(1, { limit: 100 });
        if (notifsRes.success && notifsRes.notifications) {
          setUnreadNotifsCount(notifsRes.notifications.filter(n => !n.is_read).length);
        }
      } catch (e) {
        console.warn('Notif error:', e);
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    }
    setLoading(false);
  }, []);

  const processAppointmentData = (appts) => {
    const last7 = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7[d.toISOString().split('T')[0]] = 0;
    }
    appts.forEach(apt => {
      const dateStr = typeof apt.appointment_date === 'string'
        ? apt.appointment_date.split('T')[0]
        : new Date(apt.appointment_date).toISOString().split('T')[0];
      if (last7.hasOwnProperty(dateStr)) last7[dateStr]++;
    });
    setChartData(Object.entries(last7).map(([date, count]) => ({
      day: new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      count,
    })));

    const genAlerts = [];
    const pending = appts.filter(a => a.status === 'pending');
    if (pending.length > 0) {
      genAlerts.push({ id: 1, type: 'appointment', message: `${pending.length} pending appointment requests`, severity: 'medium' });
    }
    setAlerts(genAlerts);
  };

  const processAnalyticsStats = (data) => {
    if (data.users) {
      setStats(prev => ({ ...prev, totalUsers: data.users.total || prev.totalUsers, activeArtists: data.artists?.length || prev.activeArtists }));
    }
    if (data.revenue) setStats(prev => ({ ...prev, totalRevenue: data.revenue.total || prev.totalRevenue }));
    if (data.appointments) setStats(prev => ({ ...prev, totalAppointments: data.appointments.total || prev.totalAppointments }));

    if (data.artists) {
      setArtistStatus(data.artists.map(a => ({
        id: a.id || a.artist_id,
        name: a.name || a.artist_name || 'Unknown',
        status: (a.sessions || a.appointments || 0) > 0 ? 'Booked' : 'Available',
        revenue: a.revenue || 0,
      })));
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const filteredAppointments = appointments.filter(apt => {
    const matchSearch =
      (apt.client_name || '').toLowerCase().includes(appointmentSearch.toLowerCase()) ||
      (apt.artist_name || '').toLowerCase().includes(appointmentSearch.toLowerCase());
    if (!matchSearch) return false;
    if (appointmentFilter === 'upcoming') {
      const today = new Date().toISOString().split('T')[0];
      const aptDate = typeof apt.appointment_date === 'string'
        ? apt.appointment_date.split('T')[0]
        : new Date(apt.appointment_date).toISOString().split('T')[0];
      return aptDate >= today && apt.status !== 'cancelled' && apt.status !== 'completed';
    }
    return true;
  }).sort((a, b) => {
    if (appointmentFilter === 'latest') return (b.id || 0) - (a.id || 0);
    return new Date(a.appointment_date) - new Date(b.appointment_date);
  });

  const totalPages = Math.ceil(filteredAppointments.length / appointmentsPerPage) || 1;
  const displayedAppointments = filteredAppointments.slice((appointmentPage - 1) * appointmentsPerPage, appointmentPage * appointmentsPerPage);

  const handleStatusUpdate = (id, status) => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setConfirmModal({
      visible: true,
      message: `Mark this appointment as "${status}"?`,
      onConfirm: async () => {
        await updateAppointmentStatus(id, status);
        setConfirmModal({ visible: false, message: '', onConfirm: null });
        loadAll();
      },
    });
  };

  const StatCard = ({ icon: Icon, label, value, color, bgColor, onPress }) => (
    <AnimatedTouchable style={styles.statCard} onPress={onPress} activeOpacity={0.8} disabled={!onPress}>
      <View style={[styles.statIconBg, { backgroundColor: bgColor }]}>
        <Icon size={22} color={color} />
      </View>
      <View style={styles.statInfo}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </AnimatedTouchable>
  );

  const QuickAction = ({ icon: Icon, label, color, onPress }) => (
    <AnimatedTouchable style={styles.quickAction} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.quickActionIcon, { backgroundColor: color + '15' }]}>
        <Icon size={24} color={color} />
      </View>
      <Text style={styles.quickActionLabel} numberOfLines={1}>{label}</Text>
    </AnimatedTouchable>
  );

  const BarChart = ({ data }) => {
    const maxCount = Math.max(...data.map(d => d.count), 1);
    return (
      <View style={styles.chartContainer}>
        {data.map((item, i) => (
          <View key={i} style={styles.barGroup}>
            <View style={styles.barRail}>
              <View style={[styles.barFill, { height: `${(item.count / maxCount) * 100}%` }]}>
                {item.count > 0 && <Text style={styles.barTooltip}>{item.count}</Text>}
              </View>
            </View>
            <Text style={styles.barLabel}>{item.day}</Text>
          </View>
        ))}
      </View>
    );
  };

  if (loading && !appointments.length) {
    return (
      <View style={styles.loadingContainer}>
        <PremiumLoader message="Loading admin dashboard..." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Studio Dashboard</Text>
          <Text style={styles.headerSubtitle}>InkVistAR Management</Text>
        </View>
        <View style={styles.headerActions}>
          <AnimatedTouchable style={styles.headerBtn} onPress={() => navigation?.navigate?.('admin-notifications')}>
            <Bell size={20} color={theme.textPrimary} />
            {unreadNotifsCount > 0 && <View style={styles.badge} />}
          </AnimatedTouchable>
          <AnimatedTouchable style={styles.headerBtn} onPress={onLogout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </AnimatedTouchable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadAll} tintColor={theme.gold} />}
        showsVerticalScrollIndicator={false}
      >
        <StaggerItem index={0}>
          <View style={styles.statsGrid}>
            <StatCard icon={DollarSign} label="Revenue" value={`P${formatCurrency(stats.totalRevenue)}`} color={theme.success} bgColor={`${theme.success}15`} onPress={() => navigation?.navigate?.('admin-analytics')} />
            <StatCard icon={Calendar} label="Bookings" value={String(stats.totalAppointments)} color={theme.gold} bgColor={`${theme.gold}15`} onPress={() => navigation?.navigate?.('Bookings')} />
            <StatCard icon={Users} label="Total Users" value={String(stats.totalUsers)} color={theme.info} bgColor={`${theme.info}15`} onPress={() => navigation?.navigate?.('Users')} />
            <StatCard icon={Palette} label="Active Artists" value={String(stats.activeArtists)} color={theme.warning} bgColor={`${theme.warning}15`} />
          </View>
        </StaggerItem>

        <StaggerItem index={1}>
          <Text style={styles.sectionTitle}>Studio Operations</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickActionsScroll} contentContainerStyle={styles.quickActionsContent}>
            <QuickAction icon={Calendar} label="Calendar" color={theme.gold} onPress={() => navigation?.navigate?.('Bookings')} />
            <QuickAction icon={Users} label="Users" color={theme.info} onPress={() => navigation?.navigate?.('Users')} />
            <QuickAction icon={Package} label="Inventory" color={theme.warning} onPress={() => navigation?.navigate?.('admin-inventory')} />
            <QuickAction icon={BarChart3} label="Analytics" color={theme.textPrimary} onPress={() => navigation?.navigate?.('admin-analytics')} />
            <QuickAction icon={FileText} label="Reports" color={theme.success} onPress={() => navigation?.navigate?.('admin-reports')} />
            <QuickAction icon={MessageSquare} label="Chat" color={theme.textSecondary} onPress={() => navigation?.navigate?.('admin-chat')} />
            <QuickAction icon={Settings} label="Settings" color={theme.textTertiary} onPress={() => navigation?.navigate?.('admin-settings')} />
          </ScrollView>
        </StaggerItem>

        {chartData.length > 0 && (
          <StaggerItem index={2}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Activity size={18} color={theme.gold} />
                <Text style={styles.cardTitle}>Booking Velocity</Text>
              </View>
              <BarChart data={chartData} />
            </View>
          </StaggerItem>
        )}

        {/* P2-13: Bi-Monthly Payout Reminder Banner */}
        {payoutAlert && (
          <StaggerItem index={2}>
            <AnimatedTouchable
              style={styles.payoutBanner}
              onPress={() => navigation?.navigate?.('admin-analytics', { tab: 'payouts' })}
              accessibilityLabel="View payout details"
              title="View artist payouts for today"
            >
              <View style={styles.payoutBannerLeft}>
                <View style={styles.payoutIconWrap}>
                  <Banknote size={20} color="#92400e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payoutBannerTitle}>Payout Day</Text>
                  <Text style={styles.payoutBannerMsg}>
                    {payoutAlert.count} artist{payoutAlert.count > 1 ? 's have' : ' has'} unpaid commissions to settle today.
                  </Text>
                </View>
              </View>
              <ChevronRight size={18} color="#92400e" />
            </AnimatedTouchable>
          </StaggerItem>
        )}

        {(alerts.length > 0 || inventoryAlerts.outOfStock.length > 0 || inventoryAlerts.lowStock.length > 0) && (
          <StaggerItem index={3}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <AlertTriangle size={18} color={theme.warning} />
                <Text style={styles.cardTitle}>Action Required</Text>
              </View>
              {alerts.map((alert, index) => (
                <AnimatedTouchable
                  key={`alert-${alert.id || index}`}
                  style={styles.alertItem}
                  onPress={() => {
                    if (alert.type === 'appointment') navigation?.navigate?.('Bookings', { filter: 'pending' });
                    else if (alert.type === 'inventory') navigation?.navigate?.('admin-inventory');
                    else if (alert.type === 'inventory_out') navigation?.navigate?.('admin-inventory');
                  }}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.alertText} numberOfLines={1} ellipsizeMode="tail">{alert.message}</Text>
                  </View>
                  <ChevronRight size={16} color={theme.textTertiary} />
                </AnimatedTouchable>
              ))}
              {inventoryAlerts.outOfStock.length > 0 && (
                <AnimatedTouchable style={[styles.alertItem, { borderLeftWidth: 3, borderLeftColor: theme.error }]} onPress={() => navigation?.navigate?.('admin-inventory')}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.alertText, { color: theme.error, fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">
                      {inventoryAlerts.outOfStock.length} item{inventoryAlerts.outOfStock.length !== 1 ? 's' : ''} out of stock
                    </Text>
                  </View>
                  <ChevronRight size={16} color={theme.error} />
                </AnimatedTouchable>
              )}
              {inventoryAlerts.lowStock.length > 0 && (
                <AnimatedTouchable style={[styles.alertItem, { borderLeftWidth: 3, borderLeftColor: theme.warning }]} onPress={() => navigation?.navigate?.('admin-inventory')}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[styles.alertText, { color: theme.warning, fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">
                      {inventoryAlerts.lowStock.length} item{inventoryAlerts.lowStock.length !== 1 ? 's' : ''} running low
                    </Text>
                  </View>
                  <ChevronRight size={16} color={theme.warning} />
                </AnimatedTouchable>
              )}
            </View>
          </StaggerItem>
        )}

        <StaggerItem index={4}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Calendar size={18} color={theme.gold} />
              <Text style={styles.cardTitle}>Recent Appointments</Text>
            </View>

            <View style={styles.filterRow}>
              {['upcoming', 'latest', 'all'].map(f => (
                <AnimatedTouchable key={f} style={[styles.filterPill, appointmentFilter === f && styles.filterPillActive]} onPress={() => { setAppointmentFilter(f); setAppointmentPage(1); }}>
                  <Text style={[styles.filterPillText, appointmentFilter === f && styles.filterPillTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
                </AnimatedTouchable>
              ))}
            </View>

            <View style={styles.searchBar}>
              <Search size={16} color={theme.textTertiary} />
              <TextInput style={styles.searchInput} placeholder="Search client or artist..." placeholderTextColor={theme.textTertiary} value={appointmentSearch} onChangeText={(t) => { setAppointmentSearch(t); setAppointmentPage(1); }} />
            </View>

            {displayedAppointments.length > 0 ? (
              displayedAppointments.map((apt, index) => (
                <AnimatedTouchable key={`apt-${apt.id || index}`} style={styles.appointmentRow} onPress={() => { setSelectedAppointment(apt); setDetailModalVisible(true); }} activeOpacity={0.8}>

                  <View style={styles.aptHeader}>
                    <View style={styles.aptInfoWrapper}>
                      <Text style={styles.aptClient} numberOfLines={1}>{apt.client_name || 'N/A'}</Text>
                      <Text style={styles.aptDesign} numberOfLines={1}>{apt.design_title || 'Tattoo Session'}</Text>
                      <Text style={styles.aptArtist} numberOfLines={1}>with {apt.artist_name || 'Unassigned'}</Text>
                    </View>
                    <StatusBadge status={apt.status} />
                  </View>

                  <View style={styles.aptFooter}>
                    <Text style={styles.aptDate}>
                      {formatDate(apt.appointment_date)} {apt.start_time ? `at ${formatTime(apt.start_time)}` : ''}
                    </Text>

                    {apt.status === 'pending' && (
                      <View style={styles.aptActions}>
                        {(!apt.service_type || apt.service_type.toLowerCase() === 'consultation') ? (
                          <AnimatedTouchable style={[styles.aptActionBtn, { borderColor: theme.success }]} onPress={() => handleStatusUpdate(apt.id, 'confirmed')}>
                            <CheckCircle size={18} color={theme.success} />
                          </AnimatedTouchable>
                        ) : (
                          <AnimatedTouchable style={[styles.aptActionBtn, { borderColor: theme.gold }]} onPress={() => navigation?.navigate?.('Bookings', { filter: 'pending' })}>
                            <FileText size={18} color={theme.gold} />
                          </AnimatedTouchable>
                        )}
                        <AnimatedTouchable style={[styles.aptActionBtn, { borderColor: theme.error }]} onPress={() => handleStatusUpdate(apt.id, 'cancelled')}>
                          <X size={18} color={theme.error} />
                        </AnimatedTouchable>
                      </View>
                    )}
                  </View>

                </AnimatedTouchable>
              ))
            ) : (
              <EmptyState icon={Calendar} title="No appointments found" subtitle="Try adjusting your filters or search." />
            )}

            {totalPages > 1 && (
              <View style={styles.pagination}>
                <AnimatedTouchable disabled={appointmentPage === 1} onPress={() => setAppointmentPage(p => p - 1)} style={[styles.pageBtn, appointmentPage === 1 && styles.pageBtnDisabled]}>
                  <ChevronLeft size={18} color={appointmentPage === 1 ? theme.textTertiary : theme.textPrimary} />
                </AnimatedTouchable>
                <Text style={styles.pageText}>{appointmentPage} / {totalPages}</Text>
                <AnimatedTouchable disabled={appointmentPage === totalPages} onPress={() => setAppointmentPage(p => p + 1)} style={[styles.pageBtn, appointmentPage === totalPages && styles.pageBtnDisabled]}>
                  <ChevronRight size={18} color={appointmentPage === totalPages ? theme.textTertiary : theme.textPrimary} />
                </AnimatedTouchable>
              </View>
            )}
          </View>
        </StaggerItem>
      </ScrollView>

      <Modal visible={detailModalVisible} transparent animationType="slide" onRequestClose={() => setDetailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Appointment Details</Text>
              <AnimatedTouchable onPress={() => setDetailModalVisible(false)}>
                <X size={22} color={theme.textSecondary} />
              </AnimatedTouchable>
            </View>
            {selectedAppointment && (
              <ScrollView style={styles.modalBody}>
                <DetailRow theme={theme} label="Booking Code" value={getDisplayCode(selectedAppointment.booking_code, selectedAppointment.id)} />
                <DetailRow theme={theme} label="Client" value={selectedAppointment.client_name || selectedAppointment.guest_name || 'Guest'} />
                {(selectedAppointment.client_phone || selectedAppointment.guest_phone) && (
                  <DetailRow theme={theme} label="Phone" value={selectedAppointment.guest_phone || selectedAppointment.client_phone} />
                )}
                {(selectedAppointment.client_email || selectedAppointment.guest_email) && (
                  <DetailRow theme={theme} label="Email" value={selectedAppointment.guest_email || selectedAppointment.client_email} />
                )}
                <DetailRow theme={theme} label="Artist" value={selectedAppointment.artist_name} />
                <DetailRow theme={theme} label="Date" value={formatDate(selectedAppointment.appointment_date)} />
                <DetailRow theme={theme} label="Time" value={formatTime(selectedAppointment.start_time)} />
                <DetailRow theme={theme} label="Service" value={selectedAppointment.service_type || selectedAppointment.design_title || 'Tattoo Session'} />
                <DetailRow theme={theme} label="Status" value={selectedAppointment.status} isStatus />
                <DetailRow theme={theme} label="Payment" value={selectedAppointment.payment_status || 'N/A'} isStatus />
                <DetailRow theme={theme} label="Total Price" value={`P${formatCurrency(selectedAppointment.total_price || selectedAppointment.price || 0)}`} />
                {selectedAppointment.notes && <DetailRow theme={theme} label="Notes" value={selectedAppointment.notes} />}
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={confirmModal.visible}
        title="Confirm Action"
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ visible: false, message: '', onConfirm: null })}
      />
    </View>
  );
};

const DetailRow = ({ theme, label, value, isStatus }) => {
  const insets = useSafeAreaInsets();
  const styles = getStyles(theme, insets);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {isStatus ? <StatusBadge status={value} /> : <Text style={styles.detailValue}>{value || 'N/A'}</Text>}
    </View>
  );
};

const getStyles = (theme, insets) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: (insets?.top || 0) + 12, paddingBottom: 16,
    backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitle: { ...typography.h2, color: theme.textPrimary },
  headerSubtitle: { ...typography.bodySmall, color: theme.gold, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: { padding: 8, borderRadius: borderRadius.md, backgroundColor: theme.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  badge: { position: 'absolute', top: 6, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.error, borderWidth: 1.5, borderColor: theme.surfaceLight },
  logoutText: { ...typography.button, color: theme.error, fontSize: 13 },
  scrollContent: { padding: 16, paddingBottom: 60 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  statCard: {
    width: '48%', backgroundColor: theme.surface, borderRadius: borderRadius.xl,
    padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: theme.border,
  },
  statIconBg: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  statInfo: { flex: 1 },
  statLabel: { ...typography.bodyXSmall, color: theme.textSecondary, marginBottom: 2 },
  statValue: { ...typography.h3, color: theme.textPrimary },
  sectionTitle: { ...typography.h4, color: theme.textPrimary, marginBottom: 12 },
  quickActionsScroll: { marginBottom: 24, overflow: 'visible' },
  quickActionsContent: { paddingRight: 16, gap: 16 },
  quickAction: { alignItems: 'center', width: 70 },
  quickActionIcon: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  quickActionLabel: { ...typography.bodyXSmall, color: theme.textPrimary, textAlign: 'center', fontWeight: '600' },
  card: { backgroundColor: theme.surface, borderRadius: borderRadius.xl, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle: { ...typography.h4, color: theme.textPrimary },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140, paddingTop: 8 },
  barGroup: { alignItems: 'center', flex: 1 },
  barRail: { width: 24, height: 110, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.sm, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: borderRadius.sm, backgroundColor: theme.gold, alignItems: 'center', justifyContent: 'flex-start', minHeight: 4 },
  barTooltip: { ...typography.bodyXSmall, color: theme.backgroundDeep, fontWeight: '800', marginTop: 4 },
  barLabel: { ...typography.bodyXSmall, color: theme.textTertiary, marginTop: 8 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.round, backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.border },
  filterPillActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  filterPillText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700' },
  filterPillTextActive: { color: theme.backgroundDeep },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, ...typography.bodySmall, color: theme.textPrimary },

  appointmentRow: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
  aptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  aptInfoWrapper: { flex: 1, marginRight: 12 },
  aptClient: { ...typography.body, fontWeight: '700', color: theme.textPrimary },
  aptDesign: { ...typography.bodySmall, color: theme.gold, marginTop: 4, fontWeight: '600' },
  aptArtist: { ...typography.bodySmall, color: theme.textSecondary, marginTop: 2 },

  aptFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  aptDate: { ...typography.bodyXSmall, color: theme.textTertiary, flex: 1 },

  aptActions: { flexDirection: 'row', gap: 8 },
  aptActionBtn: { padding: 8, borderRadius: borderRadius.sm, borderWidth: 1, backgroundColor: theme.surfaceLight, alignItems: 'center', justifyContent: 'center' },

  pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16 },
  pageBtn: { padding: 8, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md },
  pageBtnDisabled: { opacity: 0.3 },
  pageText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '700' },
  alertItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: borderRadius.md, marginBottom: 8, backgroundColor: `${theme.warning}15`, borderWidth: 1, borderColor: `${theme.warning}30` },
  alertText: { ...typography.bodySmall, color: theme.warning, fontWeight: '600' },
  // P2-13: Payout Banner
  payoutBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fef3c7', borderRadius: borderRadius.xl,
    padding: 16, marginBottom: 16,
    borderWidth: 1.5, borderColor: '#fcd34d',
    ...shadows.sm,
  },
  payoutBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 8 },
  payoutIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fde68a', justifyContent: 'center', alignItems: 'center',
  },
  payoutBannerTitle: { fontSize: 13, fontWeight: '800', color: '#92400e', letterSpacing: 0.3 },
  payoutBannerMsg: { fontSize: 12, color: '#b45309', marginTop: 2, lineHeight: 17 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,13,14,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: theme.surface, borderTopLeftRadius: borderRadius.xxl, borderTopRightRadius: borderRadius.xxl, maxHeight: '85%', borderWidth: 1, borderColor: theme.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalTitle: { ...typography.h3, color: theme.textPrimary },
  modalBody: { padding: 20 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  detailLabel: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { ...typography.body, color: theme.textPrimary, textAlign: 'right', maxWidth: '60%', fontWeight: '500' },
});
