/**
 * CustomerDashboard.jsx -- Premium Customer Home Screen (Gilded Noir v2)
 * Themed with lucide icons, theme tokens, bento grid layout.
 * Features: Hero appointment card, 2x2 quick actions, interactive animations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, RefreshControl, Animated, Platform
} from 'react-native';
import {
  Bell, User, Palette, Calendar, Heart, Sparkles,
  MessageCircle, Images, Zap, Clock, ChevronRight, Lightbulb, ArrowRight, Medal, Shield,
  Activity, Flag, CheckCircle,
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { typography, shadows } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { StatusBadge } from '../src/components/shared/StatusBadge';
import { getCustomerDashboard, getCustomerProfile } from '../src/utils/api';
import { getCustomerFavoriteWorks, getCustomerMyTattoos } from '../src/api/customerAPI';
import { getGalleryWorks } from '../src/utils/api';
import { Image } from 'react-native';
import { CustomerPaymentAlertOverlay } from '../src/components/shared/CustomerPaymentAlertOverlay';

// --- Animated Button Wrapper for "Bouncy" feel ---
const AnimatedTouchable = ({ children, onPress, style, activeOpacity = 0.9 }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, damping: 15, useNativeDriver: true }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} activeOpacity={activeOpacity} style={{ flex: 1 }}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export function CustomerDashboard({ userName, userId, onNavigate, onLogout }) {
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [myTattoosCount, setMyTattoosCount] = useState(0);
  const [trendingWorks, setTrendingWorks] = useState([]);
  const [profileImage, setProfileImage] = useState(null);
  const [activePrecare, setActivePrecare] = useState(null);
  const [showPreCareModal, setShowPreCareModal] = useState(false);

  const loadDashboard = async () => {
    if (!userId) return;
    try {
      const result = await getCustomerDashboard(userId);
      if (result.success) {
        setDashboardData(result);
        setActivePrecare(result.activePrecare || null);
      }

      const favResult = await getCustomerFavoriteWorks(userId);
      if (favResult.success) setFavoritesCount((favResult.favorites || []).length);

      const tattoosResult = await getCustomerMyTattoos(userId);
      if (tattoosResult.success) setMyTattoosCount((tattoosResult.tattoos || []).length);

      const galleryResult = await getGalleryWorks();
      if (galleryResult.success && galleryResult.works?.length > 0) {
        const shuffled = [...galleryResult.works].sort(() => 0.5 - Math.random());
        setTrendingWorks(shuffled.slice(0, 5));
      }

      // Fetch profile image
      const profileResult = await getCustomerProfile(userId);
      if (profileResult.success && profileResult.profile?.profile_image) {
        setProfileImage(profileResult.profile.profile_image);
      }
    } catch (e) { console.error('Dashboard error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadDashboard(); }, [userId]);
  useFocusEffect(useCallback(() => { if (userId) loadDashboard(); }, [userId]));
  const onRefresh = () => { setRefreshing(true); loadDashboard(); };

  // Get next appointment for hero card
  const allUpcoming = dashboardData?.appointments || [];
  const nextAptRaw = allUpcoming.length > 0 ? allUpcoming[0] : null;
  const nextApt = nextAptRaw ? {
    id: nextAptRaw.id,
    artist: nextAptRaw.artist_name,
    date: new Date(nextAptRaw.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' }),
    time: nextAptRaw.start_time?.slice(0, 5) || 'TBD',
    type: nextAptRaw.design_title || 'Tattoo Session',
    status: nextAptRaw.status || 'pending',
  } : null;

  // Remaining upcoming for secondary list
  const upcomingApts = allUpcoming.slice(1, 3).map(a => ({
    id: a.id,
    artist: a.artist_name,
    date: new Date(a.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: a.start_time?.slice(0, 5) || 'TBD',
    type: a.design_title || 'Tattoo Session',
    status: a.status || 'pending',
  }));

  const bentoGrid = [
    { title: 'Book Now', subtitle: 'Schedule session', Icon: Calendar, screen: 'booking-create', color: colors.gold, bg: colors.iconGoldBg },
    { title: 'My Tattoos', subtitle: `${myTattoosCount} sessions`, Icon: Zap, screen: 'Gallery', params: { initialViewMode: 'My Tattoos' }, color: colors.success, bg: colors.successBg },
    { title: 'AR Preview', subtitle: 'Try it on', Icon: Sparkles, screen: 'AR', color: colors.info, bg: colors.infoBg },
    { title: 'Gallery', subtitle: 'Browse designs', Icon: Images, screen: 'Gallery', color: colors.iconPurple, bg: colors.iconPurpleBg },
  ];



  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <PremiumLoader message="Loading your dashboard..." />
      </SafeAreaView>
    );
  }

  // Generate initials for avatar
  const initials = userName?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        
        {/* Header Bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{userName.split(' ')[0]}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => onNavigate('customer-notifications')}>
              <Bell size={20} color={colors.textPrimary} />
              {dashboardData?.unreadCount > 0 && (
                <View style={styles.notifDot}>
                  <Text style={styles.notifDotText}>{dashboardData.unreadCount > 99 ? '99+' : dashboardData.unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileBtn} onPress={() => onNavigate('Profile')}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.profileImg} />
              ) : (
                <User size={22} color={colors.textPrimary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Stats Row */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statPill} onPress={() => onNavigate('Appointments')} activeOpacity={0.7}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.iconBlueBg }]}>
              <Calendar size={18} color={colors.iconBlue} />
            </View>
            <View>
              <Text style={styles.statValue}>{allUpcoming.length}</Text>
              <Text style={styles.statLabel}>Upcoming</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.statPill} onPress={() => onNavigate('Gallery', { initialViewMode: 'Favorites' })} activeOpacity={0.7}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.iconRoseBg }]}>
              <Heart size={18} color={colors.iconRose} />
            </View>
            <View>
              <Text style={styles.statValue}>{favoritesCount}</Text>
              <Text style={styles.statLabel}>Saved</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.statPill} onPress={() => onNavigate('Gallery', { initialViewMode: 'My Tattoos' })} activeOpacity={0.7}>
            <View style={[styles.statIconWrap, { backgroundColor: colors.iconPurpleBg }]}>
              <Medal size={18} color={colors.iconPurple} />
            </View>
            <View>
              <Text style={styles.statValue}>{myTattoosCount}</Text>
              <Text style={styles.statLabel}>Tattoos</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Hero Appointment Card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Session</Text>
          {nextApt ? (
            <AnimatedTouchable onPress={() => onNavigate('Appointments', { openAppointmentId: nextApt.id })} style={styles.heroCard}>
              <View style={styles.heroAccent} />
              <View style={styles.heroContent}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroMeta}>NEXT APPOINTMENT</Text>
                  <Text style={styles.heroType} numberOfLines={1}>{nextApt.type}</Text>
                  <View style={styles.heroTimeRow}>
                    <Clock size={13} color={colors.textSecondary} style={{ marginRight: 6 }} />
                    <Text style={styles.heroTime}>{nextApt.date} • {nextApt.time}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
                    <StatusBadge status={nextApt.status} />
                    <Text style={styles.heroArtist}>with {nextApt.artist}</Text>
                  </View>
                </View>
                <View style={styles.heroArrowWrap}>
                  <ChevronRight size={20} color={colors.gold} />
                </View>
              </View>
            </AnimatedTouchable>
          ) : (
            <AnimatedTouchable onPress={() => onNavigate('booking-create')} style={styles.heroEmpty}>
              <Calendar size={28} color={colors.gold} style={{ marginBottom: 12 }} />
              <Text style={styles.heroEmptyTitle}>Ready for your next tattoo?</Text>
              <Text style={styles.heroEmptySub}>Book a session with one of our artists.</Text>
              <View style={styles.heroEmptyBtn}>
                <Text style={styles.heroEmptyBtnText}>BOOK NOW</Text>
              </View>
            </AnimatedTouchable>
          )}
        </View>

        {/* Healing Journey Tracker */}
        {myTattoosCount > 0 && (
          <View style={styles.section}>
            <AnimatedTouchable style={styles.healingCard} onPress={() => onNavigate('CustomerAftercare')}>
              <View style={styles.healingHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Activity size={16} color={colors.gold} />
                  <Text style={styles.healingTitle}>Healing Journey Tracker</Text>
                </View>
                <View style={styles.healingBadge}>
                  <Text style={styles.healingBadgeText}>View Guide</Text>
                </View>
              </View>
              
              <View style={styles.healingBody}>
                <View style={styles.healingProgressWrap}>
                  <View style={styles.healingCircle}>
                    <Text style={styles.healingDay}>1</Text>
                    <Text style={styles.healingDayTotal}>of 30</Text>
                  </View>
                </View>
                
                <View style={styles.healingContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Text style={styles.healingStatusTag}>INITIAL HEALING</Text>
                  </View>
                  <Text style={styles.healingSessionName}>Tattoo Session: Lowkey</Text>
                  <Text style={styles.healingInstruction} numberOfLines={3}>
                    Remove the bandage/wrap after 2-4 hours. Gently wash with lukewarm water and fragrance-free antibacterial soap. Pat dry with a clean paper towel — never use a cloth towel.
                  </Text>
                </View>
              </View>
            </AnimatedTouchable>
          </View>
        )}

        {/* 2x2 Bento Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.bentoGrid}>
            {bentoGrid.map((item, index) => (
              <AnimatedTouchable 
                key={index} 
                style={styles.bentoTileWrap} 
                onPress={() => onNavigate(item.screen, item.params || {})}
              >
                <View style={styles.bentoTile}>
                  <View style={[styles.bentoIconWrap, { backgroundColor: item.bg }]}>
                    <item.Icon size={22} color={item.color} />
                  </View>
                  <Text style={styles.bentoTitle}>{item.title}</Text>
                  <Text style={styles.bentoSubtitle}>{item.subtitle}</Text>
                </View>
              </AnimatedTouchable>
            ))}
          </View>
        </View>

        {/* Secondary Appointments */}
        {upcomingApts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
              <TouchableOpacity onPress={() => onNavigate('Appointments')}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>
            {upcomingApts.map(apt => (
              <AnimatedTouchable key={apt.id} style={styles.aptCard} onPress={() => onNavigate('Appointments', { openAppointmentId: apt.id })}>
                <View style={styles.aptDetails}>
                  <Text style={styles.aptType} numberOfLines={1}>{apt.type}</Text>
                  <Text style={styles.aptMeta}>{apt.artist} • {apt.date}</Text>
                </View>
                <StatusBadge status={apt.status} />
              </AnimatedTouchable>
            ))}
          </View>
        )}

        {/* Pre-Session Conditioning Plan */}
        {activePrecare && (
          <View style={styles.section}>
            <AnimatedTouchable style={styles.precareCard} onPress={() => setShowPreCareModal(true)}>
              <View style={styles.precareHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Shield size={16} color="#6366f1" />
                  <Text style={styles.precareTitle}>Pre-Session Conditioning Plan</Text>
                </View>
                <View style={styles.precareBadge}>
                  <Text style={styles.precareBadgeText}>
                    {activePrecare.daysUntil === 0 ? 'Today!' : activePrecare.daysUntil === 1 ? 'Tomorrow' : `${activePrecare.daysUntil} days away`}
                  </Text>
                </View>
              </View>
              <View style={styles.precareBody}>
                <View style={styles.precareIconBox}>
                  <Shield size={28} color="#6366f1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.precareDesign}>{activePrecare.designTitle}</Text>
                  <Text style={styles.precareArtist}>with {activePrecare.artistName}</Text>
                  <Text style={styles.precareCta}>Tap to view your 6-step preparation guide</Text>
                </View>
              </View>
            </AnimatedTouchable>
          </View>
        )}

        {/* Trending Styles */}
        <View style={[styles.section, { paddingRight: 0 }]}>
           <View style={[styles.sectionHeaderRow, { paddingRight: 20 }]}>
            <Text style={styles.sectionTitle}>Trending Styles</Text>
            <TouchableOpacity onPress={() => onNavigate('Gallery')}>
              <Text style={styles.viewAllText}>Explore</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
            {trendingWorks.map((work, i) => (
              <AnimatedTouchable key={i} onPress={() => onNavigate('Gallery', { initialCategory: work.category })}>
                <View style={styles.trendingCard}>
                  <View style={styles.trendingIconWrap}>
                    <Image source={{ uri: work.image_url }} style={styles.trendingImage} />
                  </View>
                  <Text style={styles.trendingText} numberOfLines={1}>{work.category || 'Tattoo'}</Text>
                </View>
              </AnimatedTouchable>
            ))}
          </ScrollView>
        </View>

        {/* Reports & Feedback */}
        <View style={styles.section}>
          <AnimatedTouchable onPress={() => onNavigate('CustomerReports')} style={styles.actionRowCard}>
            <View style={styles.actionRowInner}>
              <View style={styles.actionRowIconWrap}>
                <Flag size={20} color={colors.textSecondary} />
              </View>
              <View style={styles.actionRowTextWrap}>
                <Text style={styles.actionRowTitle}>Reports & Feedback</Text>
                <Text style={styles.actionRowDesc}>Submit bugs or share feedback</Text>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </View>
          </AnimatedTouchable>
        </View>

        {/* AI Chat CTA */}
        <View style={styles.section}>
          <AnimatedTouchable onPress={() => onNavigate('Gallery')} style={styles.actionRowCard}>
            <View style={styles.actionRowInner}>
              <View style={[styles.actionRowIconWrap, { backgroundColor: colors.iconGoldBg }]}>
                <Lightbulb size={24} color={colors.gold} />
              </View>
              <View style={styles.actionRowTextWrap}>
                <Text style={styles.actionRowTitle}>Need Inspiration?</Text>
                <Text style={styles.actionRowDesc}>Chat with AI for tattoo ideas</Text>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </View>
          </AnimatedTouchable>
        </View>

      </ScrollView>

      {/* Pre-Care Modal */}
      {showPreCareModal && activePrecare && (
        <View style={styles.modalOverlay}>
          <View style={styles.precareModal}>
            <View style={styles.precareModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Shield size={18} color="#6366f1" />
                <Text style={{ ...typography.h4, color: colors.textPrimary }}>Pre-Session Plan</Text>
              </View>
              <TouchableOpacity onPress={() => setShowPreCareModal(false)}>
                <Text style={{ color: '#6366f1', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              <View style={styles.precareModalInfo}>
                <Text style={{ ...typography.body, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>{activePrecare.designTitle}</Text>
                <Text style={{ ...typography.bodySmall, color: colors.textSecondary }}>with {activePrecare.artistName}</Text>
                <View style={styles.precareModalBadge}>
                  <Text style={{ color: '#818cf8', fontSize: 11, fontWeight: '700' }}>
                    {activePrecare.daysUntil === 0 ? 'Today!' : activePrecare.daysUntil === 1 ? 'Tomorrow' : `${activePrecare.daysUntil} days away`}
                  </Text>
                </View>
              </View>

              <Text style={{ ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginBottom: 16, paddingHorizontal: 16 }}>
                Follow these 6 essential steps before your session for the best possible results.
              </Text>

              {[
                { num: '1', title: 'Hydrate Thoroughly', desc: 'Drink plenty of water 24-48 hours before. Well-hydrated skin holds ink more evenly.', color: '#3b82f6' },
                { num: '2', title: 'Eat a Full Meal', desc: 'Have a balanced meal 1-2 hours before arriving. Keeps blood sugar stable.', color: '#10b981' },
                { num: '3', title: 'Avoid Alcohol & Blood Thinners', desc: 'No alcohol for 24 hours. Avoid ibuprofen and aspirin.', color: '#ef4444' },
                { num: '4', title: 'Moisturize (Not Day-Of)', desc: 'Moisturize daily before session, but NOT on the day of. Avoid sunburns!', color: '#f59e0b' },
                { num: '5', title: 'Get Good Rest', desc: 'Aim for 7-8 hours of sleep. Proper rest improves pain tolerance.', color: '#8b5cf6' },
                { num: '6', title: 'Wear Loose Clothing', desc: 'Choose clothes with easy access to the tattoo area. Prevents irritation.', color: '#6366f1' },
              ].map((step, idx) => (
                <View key={idx} style={[styles.precareStep, idx % 2 === 0 ? { backgroundColor: 'rgba(99,102,241,0.06)' } : {}]}>
                  <View style={[styles.precareStepNum, { backgroundColor: step.color + '20' }]}>
                    <Text style={{ color: step.color, fontWeight: '800', fontSize: 15 }}>{step.num}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...typography.bodySmall, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 }}>{step.title}</Text>
                    <Text style={{ ...typography.bodyXSmall, color: colors.textSecondary, lineHeight: 18 }}>{step.desc}</Text>
                  </View>
                </View>
              ))}

              <View style={styles.precareModalTip}>
                <Text style={{ ...typography.bodyXSmall, color: '#10b981', textAlign: 'center' }}>
                  Following these steps ensures better ink retention, less bleeding, and smoother healing.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.precareModalBtn} onPress={() => { setShowPreCareModal(false); onNavigate('Appointments'); }}>
              <Text style={styles.precareModalBtnText}>View My Booking</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Global Payment Overlay */}
      <CustomerPaymentAlertOverlay 
        customerId={userId} 
        onPayOnline={(alert) => {
          // If the app has a specific flow for payment, redirect to it.
          // Mobile usually redirects to a payment link.
          // Since there is a web endpoint for pay-mongo, we can open webview or navigate to a payment screen if it exists.
          // The web app redirects to `/pay-mongo?appointmentId=...`
          // Assuming `onNavigate` can go to a payment portal or Appointments list.
          onNavigate('Appointments', { openAppointmentId: alert.id });
        }}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 20 : 52, paddingBottom: 24,
  },
  greeting: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: 2 },
  userName: { ...typography.h2, color: colors.textPrimary },
  headerActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  notifDot: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: colors.error, minWidth: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
    borderWidth: 2, borderColor: colors.background,
  },
  notifDotText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  profileBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.gold,
    overflow: 'hidden',
  },
  profileImg: { width: 44, height: 44, borderRadius: 22 },
  avatarWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.gold,
  },
  avatarText: { ...typography.body, fontWeight: '700', color: colors.gold },

  // Stats Row
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 28, gap: 12,
  },
  statPill: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 14,
    alignItems: 'flex-start', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.medium, height: 110
  },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statValue: { ...typography.h3, color: colors.textPrimary, lineHeight: 24, fontWeight: '800' },
  statLabel: { ...typography.bodyXSmall, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },

  section: { paddingHorizontal: 20, marginBottom: 28 },
  sectionTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  viewAllText: { ...typography.bodySmall, color: colors.gold, fontWeight: '600' },

  // Hero Card
  heroCard: {
    backgroundColor: colors.surface, borderRadius: 16, flexDirection: 'row',
    overflow: 'hidden', borderWidth: 1, borderColor: colors.borderLight, ...shadows.subtle,
  },
  heroAccent: { width: 4, backgroundColor: colors.gold },
  heroContent: { flex: 1, padding: 18, flexDirection: 'row', alignItems: 'center' },
  heroMeta: { ...typography.labelSmall, color: colors.textSecondary, marginBottom: 6 },
  heroType: { ...typography.h3, color: colors.textPrimary, marginBottom: 6 },
  heroTimeRow: { flexDirection: 'row', alignItems: 'center' },
  heroTime: { ...typography.bodySmall, color: colors.textSecondary },
  heroArtist: { ...typography.bodySmall, color: colors.textSecondary },
  heroArrowWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.iconGoldBg,
    justifyContent: 'center', alignItems: 'center', marginLeft: 12,
  },

  heroEmpty: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight, borderStyle: 'dashed',
  },
  heroEmptyTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  heroEmptySub: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: 16, textAlign: 'center' },
  heroEmptyBtn: {
    backgroundColor: colors.gold, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8,
  },
  heroEmptyBtnText: { ...typography.button, color: colors.backgroundDeep, fontSize: 13 },

  // Healing Tracker
  healingCard: {
    backgroundColor: '#1c1819', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.subtle,
  },
  healingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  healingTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.gold, letterSpacing: 0.5 },
  healingBadge: { backgroundColor: 'rgba(190, 144, 85, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  healingBadgeText: { ...typography.labelSmall, color: colors.gold, fontWeight: '700' },
  healingBody: { flexDirection: 'row', alignItems: 'center' },
  healingProgressWrap: { marginRight: 16 },
  healingCircle: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: colors.gold,
    justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface,
  },
  healingDay: { ...typography.h3, color: colors.gold, lineHeight: 22, marginTop: 4 },
  healingDayTotal: { ...typography.labelSmall, color: colors.textTertiary, fontSize: 9 },
  healingContent: { flex: 1 },
  healingStatusTag: { ...typography.labelSmall, color: colors.error, fontWeight: '800', letterSpacing: 1 },
  healingSessionName: { ...typography.body, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  healingInstruction: { ...typography.bodyXSmall, color: colors.textSecondary, lineHeight: 16 },

  // Bento Grid
  bentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  bentoTileWrap: { width: '48%', aspectRatio: 1.1 },
  bentoTile: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.borderLight, justifyContent: 'flex-end',
  },
  bentoIconWrap: {
    width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    position: 'absolute', top: 16, left: 16,
  },
  bentoTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  bentoSubtitle: { ...typography.bodyXSmall, color: colors.textSecondary },

  // Secondary Apts
  aptCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.borderLight,
  },
  aptDetails: { flex: 1, marginRight: 12 },
  aptType: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  aptMeta: { ...typography.bodySmall, color: colors.textSecondary },

  // Trending
  trendingScroll: { paddingRight: 20, gap: 12 },
  trendingCard: {
    backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: colors.borderLight,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  trendingIconWrap: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: colors.darkBgSecondary,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  trendingImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  trendingText: { ...typography.bodySmall, fontWeight: '600', color: colors.textPrimary, maxWidth: 80 },

  // Action Row Cards (Feedback & AI)
  actionRowCard: {
    backgroundColor: colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  actionRowInner: {
    padding: 16, flexDirection: 'row', alignItems: 'center',
  },
  actionRowIconWrap: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.darkBgSecondary,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  actionRowTextWrap: { flex: 1, paddingRight: 8 },
  actionRowTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  actionRowDesc: { ...typography.bodyXSmall, color: colors.textSecondary },

  // Pre-Care Conditioning Plan
  precareCard: {
    backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)', ...shadows.subtle,
  },
  precareHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(99,102,241,0.12)',
  },
  precareTitle: { ...typography.bodySmall, fontWeight: '700', color: '#c7d2fe', letterSpacing: 0.3 },
  precareBadge: { backgroundColor: 'rgba(99,102,241,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  precareBadgeText: { fontSize: 11, fontWeight: '700', color: '#818cf8' },
  precareBody: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  precareIconBox: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(99,102,241,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  precareDesign: { ...typography.body, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  precareArtist: { ...typography.bodyXSmall, color: colors.textSecondary, marginBottom: 4 },
  precareCta: { ...typography.bodyXSmall, color: '#6366f1', fontWeight: '600' },

  // Pre-Care Modal
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
    padding: 20, zIndex: 999,
  },
  precareModal: {
    backgroundColor: colors.surface, borderRadius: 20, width: '100%', maxWidth: 420,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)', overflow: 'hidden',
  },
  precareModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  precareModalInfo: {
    backgroundColor: 'rgba(99,102,241,0.08)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.15)',
    borderRadius: 12, padding: 16, margin: 16, alignItems: 'center',
  },
  precareModalBadge: {
    backgroundColor: 'rgba(99,102,241,0.15)', paddingHorizontal: 14, paddingVertical: 4,
    borderRadius: 20, marginTop: 8,
  },
  precareStep: {
    flexDirection: 'row', gap: 14, padding: 14, marginHorizontal: 16,
    borderRadius: 10, marginBottom: 4, alignItems: 'flex-start',
  },
  precareStepNum: {
    width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  precareModalTip: {
    margin: 16, padding: 12, backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', borderRadius: 10,
  },
  precareModalBtn: {
    backgroundColor: '#6366f1', margin: 16, marginTop: 0, paddingVertical: 14,
    borderRadius: 12, alignItems: 'center',
  },
  precareModalBtnText: { ...typography.button, color: '#ffffff', fontSize: 15 },
});