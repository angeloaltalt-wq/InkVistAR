/**
 * ArtistSessions.jsx -- Today's Session Queue (Gilded Noir v2)
 * Theme-aware, animated, haptic feedback, horizontal card queue.
 */
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, SafeAreaView, RefreshControl, Animated, Platform
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Calendar, Clock, PenTool, ChevronRight, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { typography, shadows } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { StatusBadge } from '../src/components/shared/StatusBadge';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { formatCurrency, getInitials } from '../src/utils/formatters';
import { getArtistAppointments } from '../src/utils/api';

const StaggerItem = ({ index, children }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      {children}
    </Animated.View>
  );
};

export const ArtistSessions = ({ artistId, onBack, navigation, route }) => {
  const { theme: colors, hapticsEnabled } = useTheme();
  const styles = getStyles(colors);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTodaySessions = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const response = await getArtistAppointments(artistId, '', today);
      if (response.success) setSessions(response.appointments || []);
    } catch (error) { console.error('Error fetching sessions:', error); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTodaySessions();
    }, [artistId])
  );

  useEffect(() => {
    if (route?.params?.openAppointmentId && sessions.length > 0) {
      const apt = sessions.find(a => a.id === route.params.openAppointmentId);
      if (apt) {
        navigation.navigate('artist-active-session', { appointment: apt });
        navigation.setParams({ openAppointmentId: undefined });
      }
    }
  }, [route?.params?.openAppointmentId, sessions]);

  const onRefresh = () => { setRefreshing(true); fetchTodaySessions(); };

  const renderSession = ({ item, index }) => {
    const commission = (item.price || 0) * 0.3;
    return (
      <StaggerItem index={index}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.timeWrap}>
              <Clock size={14} color={colors.gold} />
              <Text style={styles.timeText}>{item.start_time?.substring(0, 5) || '00:00'}</Text>
            </View>
            <StatusBadge status={item.status} />
          </View>

          <View style={styles.cardBody}>
            <View style={styles.clientSection}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(item.client_name)}</Text>
              </View>
              <View style={styles.clientInfo}>
                <Text style={styles.clientName}>{item.client_name || 'Unknown Client'}</Text>
                <Text style={styles.designTitle} numberOfLines={1}>{item.design_title || 'No design specified'}</Text>
              </View>
            </View>
            <View style={styles.priceSection}>
              <Text style={styles.priceLabel}>Earnings (30%)</Text>
              <Text style={styles.priceValue}>P{formatCurrency(commission)}</Text>
            </View>
          </View>

          {(item.status === 'confirmed' || item.status === 'in_progress') && (
            <AnimatedTouchable
              style={styles.manageBtn}
              onPress={() => {
                if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('artist-active-session', { appointment: item });
              }}
            >
              <PenTool size={16} color={colors.backgroundDeep} />
              <Text style={styles.manageBtnText}>Manage Session</Text>
            </AnimatedTouchable>
          )}
        </View>
      </StaggerItem>
    );
  };

  const todayStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Session Manager</Text>
          <Text style={styles.dateText}>{todayStr}</Text>
        </View>
        <AnimatedTouchable onPress={onRefresh} style={styles.refreshBtn}>
          <Calendar size={20} color={colors.gold} />
        </AnimatedTouchable>
      </View>

      {loading && !refreshing ? <PremiumLoader message="Loading today's queue..." /> : (
        <FlatList
          data={sessions}
          renderItem={renderSession}
          keyExtractor={(item) => (item.id || Math.random()).toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState icon={Calendar} title="Your board is clear" subtitle="No sessions scheduled for today" />
              <AnimatedTouchable style={styles.scheduleLink} innerStyle={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }} onPress={() => navigation?.navigate?.('Schedule')}>
                <Text style={styles.scheduleLinkText} numberOfLines={1}>View Full Schedule</Text>
                <ChevronRight size={16} color={colors.gold} />
              </AnimatedTouchable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    padding: 20, paddingTop: Platform.OS === 'ios' ? 20 : 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.h1, color: colors.textPrimary },
  dateText: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 4 },
  refreshBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 16,
    marginBottom: 14, borderWidth: 1, borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { ...typography.body, fontWeight: '700', color: colors.gold },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  clientSection: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.iconGoldBg,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { ...typography.body, fontWeight: '700', color: colors.gold },
  clientInfo: { flex: 1 },
  clientName: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  designTitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  priceSection: { alignItems: 'flex-end' },
  priceLabel: { ...typography.bodyXSmall, color: colors.textTertiary, textTransform: 'uppercase', fontWeight: '600' },
  priceValue: { ...typography.h4, color: colors.gold, fontWeight: '800' },
  manageBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    paddingVertical: 13, backgroundColor: colors.gold, borderRadius: 12,
  },
  manageBtnText: { ...typography.button, color: colors.backgroundDeep },
  emptyWrap: { alignItems: 'center', marginTop: 60 },
  scheduleLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20,
    paddingVertical: 12, paddingHorizontal: 20, minWidth: 200, alignSelf: 'center',
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
  },
  scheduleLinkText: { ...typography.body, color: colors.gold, fontWeight: '600' },
});
