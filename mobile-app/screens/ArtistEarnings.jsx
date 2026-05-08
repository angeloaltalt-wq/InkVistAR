/**
 * ArtistEarnings.jsx -- Earnings Ledger (Gilded Noir v2)
 * Theme-aware, animated, gold accents, filter pills, haptic feedback.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, RefreshControl, Animated, Platform,
} from 'react-native';
import {
  ArrowLeft, Download, Clock, CheckCircle, Wallet, TrendingUp, DollarSign
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { typography, shadows } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { StatusBadge } from '../src/components/shared/StatusBadge';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { formatCurrency } from '../src/utils/formatters';
import { getArtistEarningsLedger } from '../src/utils/api';

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

export function ArtistEarnings({ onBack, artistId }) {
  const { theme: colors, hapticsEnabled } = useTheme();
  const styles = getStyles(colors);
  
  const [timeFilter, setTimeFilter] = useState('all'); // all, week, month, year
  const [activeTab, setActiveTab] = useState('sessions'); // sessions, payouts
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [sessionEarnings, setSessionEarnings] = useState([]);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [commissionRate, setCommissionRate] = useState(30);

  useEffect(() => { fetchEarnings(); }, [artistId]);

  const fetchEarnings = async () => {
    if (!artistId) return;
    try {
      setLoading(true);
      const res = await getArtistEarningsLedger(artistId);
      if (res.success) {
        setCommissionRate((res.commissionRate * 100).toFixed(0));
        setSessionEarnings(res.sessions.sort((a, b) => {
            const dateDiff = new Date(b.appointment_date) - new Date(a.appointment_date);
            return dateDiff !== 0 ? dateDiff : (b.id - a.id);
        }));
        setPayoutHistory(res.payouts || []);
      }
    } catch (e) { console.error('Earnings error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = () => { setRefreshing(true); fetchEarnings(); };

  // ── Period Filtering ──
  const filterByPeriod = (dateStr) => {
    if (timeFilter === 'all') return true;
    const d = new Date(dateStr);
    const now = new Date();
    if (timeFilter === 'week') {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - mondayOffset);
      weekStart.setHours(0, 0, 0, 0);
      return d >= weekStart;
    }
    if (timeFilter === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (timeFilter === 'year') {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  };

  const filteredSessions = useMemo(() =>
    sessionEarnings.filter(s => filterByPeriod(s.appointment_date)),
    [sessionEarnings, timeFilter]
  );

  const filteredPayouts = useMemo(() =>
    payoutHistory.filter(p => filterByPeriod(p.created_at)),
    [payoutHistory, timeFilter]
  );

  // ── Computed Metrics ──
  const metrics = useMemo(() => {
    const totalEarned = filteredSessions
        .filter(s => (s.effectivePaymentStatus || s.payment_status) === 'paid')
        .reduce((sum, s) => sum + (s.artistShare || 0), 0);
    const pendingUnpaid = filteredSessions
        .filter(s => (s.effectivePaymentStatus || s.payment_status) !== 'paid')
        .reduce((sum, s) => sum + (s.artistShare || 0), 0);
    const totalPaidOut = filteredPayouts.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const balanceDue = totalEarned - totalPaidOut;
    return { totalEarned, pendingUnpaid, totalPaidOut, balanceDue };
  }, [filteredSessions, filteredPayouts]);

  const periodLabel = timeFilter === 'week' ? 'This Week' : timeFilter === 'month' ? 'This Month' : timeFilter === 'year' ? 'This Year' : 'All Time';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedTouchable onPress={onBack} style={styles.headerBtn}>
            <ArrowLeft size={20} color={colors.textPrimary} />
          </AnimatedTouchable>
          <Text style={styles.headerTitle}>Earnings & Payouts</Text>
          <View style={styles.headerBtn}>
            <Download size={20} color={colors.textTertiary} />
          </View>
        </View>

        {/* Filter Pills */}
        <StaggerItem index={0}>
          <View style={styles.filters}>
            {['all', 'week', 'month', 'year'].map(f => (
              <AnimatedTouchable
                key={f}
                style={[styles.filterBtn, timeFilter === f && styles.filterBtnActive]}
                onPress={() => { if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTimeFilter(f); }}
              >
                <Text style={[styles.filterText, timeFilter === f && styles.filterTextActive]}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </AnimatedTouchable>
            ))}
          </View>
        </StaggerItem>

        {loading && !refreshing ? (
          <View style={{ height: 200, justifyContent: 'center' }}><PremiumLoader /></View>
        ) : (
          <>
            {/* Horizontal Scroll Metrics */}
            <StaggerItem index={1}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsRow}>
                    <View style={styles.metricCard}>
                        <View style={styles.metricHeader}>
                            <TrendingUp size={16} color={colors.success} />
                            <Text style={styles.metricLabel}>Total Earned</Text>
                        </View>
                        <Text style={[styles.metricValue, { color: colors.success }]}>P{formatCurrency(metrics.totalEarned)}</Text>
                    </View>
                    <View style={styles.metricCard}>
                        <View style={styles.metricHeader}>
                            <Clock size={16} color={colors.warning} />
                            <Text style={styles.metricLabel}>Pending (Unpaid)</Text>
                        </View>
                        <Text style={[styles.metricValue, { color: colors.warning }]}>P{formatCurrency(metrics.pendingUnpaid)}</Text>
                    </View>
                    <View style={styles.metricCard}>
                        <View style={styles.metricHeader}>
                            <CheckCircle size={16} color={colors.info} />
                            <Text style={styles.metricLabel}>Paid Out</Text>
                        </View>
                        <Text style={[styles.metricValue, { color: colors.info }]}>P{formatCurrency(metrics.totalPaidOut)}</Text>
                    </View>
                    <View style={styles.metricCard}>
                        <View style={styles.metricHeader}>
                            <Wallet size={16} color={colors.gold} />
                            <Text style={styles.metricLabel}>Balance Due</Text>
                        </View>
                        <Text style={[styles.metricValue, { color: colors.gold }]}>P{formatCurrency(metrics.balanceDue)}</Text>
                    </View>
                </ScrollView>
            </StaggerItem>

            <View style={styles.content}>
                {/* Modern View Toggles */}
                <StaggerItem index={2}>
                    <View style={styles.modernViewToggle}>
                        <AnimatedTouchable 
                            style={[styles.toggleBtn, activeTab === 'sessions' && styles.toggleBtnActive]}
                            onPress={() => { if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab('sessions'); }}
                        >
                            <Text style={[styles.toggleText, activeTab === 'sessions' && styles.toggleTextActive]}>Sessions</Text>
                        </AnimatedTouchable>
                        <AnimatedTouchable 
                            style={[styles.toggleBtn, activeTab === 'payouts' && styles.toggleBtnActive]}
                            onPress={() => { if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab('payouts'); }}
                        >
                            <Text style={[styles.toggleText, activeTab === 'payouts' && styles.toggleTextActive]}>Payouts</Text>
                        </AnimatedTouchable>
                    </View>
                </StaggerItem>

                {activeTab === 'sessions' ? (
                    <>
                        <StaggerItem index={3}>
                            <View style={styles.sectionHeaderRow}>
                                <Text style={styles.sectionTitle}>Session Earnings</Text>
                                <Text style={styles.sectionCount}>{filteredSessions.length} session(s)</Text>
                            </View>
                        </StaggerItem>
                        {filteredSessions.length > 0 ? (
                            filteredSessions.map((tx, i) => (
                            <StaggerItem key={tx.id || i} index={i + 4}>
                                <View style={styles.txCard}>
                                    <View style={[styles.txIcon, { backgroundColor: (tx.effectivePaymentStatus || tx.payment_status) === 'paid' ? colors.successBg : colors.warningBg }]}>
                                        <DollarSign size={20} color={(tx.effectivePaymentStatus || tx.payment_status) === 'paid' ? colors.success : colors.warning} />
                                    </View>
                                    <View style={styles.txDetails}>
                                        <Text style={styles.txClient}>{tx.client_name || 'Client'}</Text>
                                        <Text style={styles.txDesign} numberOfLines={1}>
                                            {tx.isCollab ? `Collab ${tx.splitPercent}%` : tx.isReferral ? 'Referral (70%)' : 'Solo'} — {tx.design_title}
                                        </Text>
                                        <Text style={styles.txDate}>{new Date(tx.appointment_date).toLocaleDateString()}</Text>
                                    </View>
                                    <View style={styles.txAmountWrap}>
                                        <Text style={[styles.txAmount, (tx.effectivePaymentStatus || tx.payment_status) !== 'paid' && { color: colors.warning }]}>
                                            P{formatCurrency(tx.artistShare)}
                                        </Text>
                                        <StatusBadge status={(tx.effectivePaymentStatus || tx.payment_status) === 'paid' ? 'paid' : 'unpaid'} />
                                    </View>
                                </View>
                            </StaggerItem>
                            ))
                        ) : (
                            <EmptyState icon={DollarSign} title="No sessions" subtitle={`No completed sessions for ${periodLabel}`} />
                        )}
                    </>
                ) : (
                    <>
                        <StaggerItem index={3}>
                            <View style={styles.sectionHeaderRow}>
                                <Text style={styles.sectionTitle}>Payout History</Text>
                                <Text style={styles.sectionCount}>{filteredPayouts.length} payout(s)</Text>
                            </View>
                        </StaggerItem>
                        {filteredPayouts.length > 0 ? (
                            filteredPayouts.map((tx, i) => (
                            <StaggerItem key={tx.id || i} index={i + 4}>
                                <View style={styles.txCard}>
                                    <View style={[styles.txIcon, { backgroundColor: colors.infoBg }]}>
                                        <CheckCircle size={20} color={colors.info} />
                                    </View>
                                    <View style={styles.txDetails}>
                                        <Text style={styles.txClient}>{tx.payout_method || 'Payout'}</Text>
                                        <Text style={styles.txDesign} numberOfLines={1}>{tx.reference_no || 'No Reference'}</Text>
                                        <Text style={styles.txDate}>{new Date(tx.created_at).toLocaleDateString()}</Text>
                                    </View>
                                    <View style={styles.txAmountWrap}>
                                        <Text style={[styles.txAmount, { color: colors.info }]}>
                                            P{formatCurrency(tx.amount)}
                                        </Text>
                                        <StatusBadge status={tx.status || 'completed'} />
                                    </View>
                                </View>
                            </StaggerItem>
                            ))
                        ) : (
                            <EmptyState icon={Wallet} title="No payouts" subtitle={`No payouts found for ${periodLabel}`} />
                        )}
                    </>
                )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 20 : 52, paddingBottom: 16,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  headerTitle: { ...typography.h2, color: colors.textPrimary },
  filters: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 20 },
  filterBtn: {
    flex: 1, paddingVertical: 10, backgroundColor: colors.surface,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  filterText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.backgroundDeep },
  metricsRow: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  metricCard: {
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      borderRadius: 16, padding: 16, width: 150,
  },
  metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  metricLabel: { ...typography.bodyXSmall, color: colors.textSecondary, fontWeight: '600', textTransform: 'uppercase' },
  metricValue: { fontSize: 22, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  modernViewToggle: {
    flexDirection: 'row', backgroundColor: colors.surfaceLight, borderRadius: 30,
    padding: 4, marginBottom: 24, borderWidth: 1, borderColor: colors.border,
  },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 26, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2, borderWidth: 1, borderColor: colors.border },
  toggleText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  toggleTextActive: { color: colors.gold },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  sectionCount: { ...typography.bodySmall, color: colors.textTertiary, fontWeight: '600' },
  txCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  txIcon: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txDetails: { flex: 1 },
  txClient: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  txDesign: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: 2 },
  txDate: { ...typography.bodyXSmall, color: colors.textTertiary },
  txAmountWrap: { alignItems: 'flex-end', gap: 4 },
  txAmount: { ...typography.h4, color: colors.success, fontWeight: '700' },
});