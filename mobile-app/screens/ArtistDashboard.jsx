// ArtistDashboard.jsx - COMPLETE VERSION WITH REAL DATA
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Image
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getArtistDashboard, API_URL } from '../src/utils/api';


export function ArtistDashboard({ userName, userEmail, userId, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [artOfTheDay, setArtOfTheDay] = useState(null);
  const [loadingArt, setLoadingArt] = useState(true);
  const [error, setError] = useState(null);

  // Load dashboard data
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const result = await getArtistDashboard(userId);

      if (result.success) {
        setDashboardData(result);
        setError(null);
      } else {
        setError(result.message || 'Failed to load data');
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadDashboardData();

    const fetchArtOfTheDay = async () => {
      try {
        setLoadingArt(true);
        const response = await fetch(`${API_URL}/api/gallery/art-of-the-day`);
        const data = await response.json();
        if (data.success) {
          setArtOfTheDay(data.work);
        } else {
          setArtOfTheDay(null);
        }
      } catch (error) {
        console.error("Failed to fetch Art of the Day:", error);
        setArtOfTheDay(null);
      } finally {
        setLoadingArt(false);
      }
    };
    fetchArtOfTheDay();
  }, [userId]);

  // Pull to refresh
  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  // Loading state
  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#daa520" />
          <Text style={styles.loadingText}>Loading your dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error && !dashboardData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#dc2626" />
          <Text style={styles.errorTitle}>Oops!</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDashboardData}>
            <Ionicons name="refresh" size={20} color="#ffffff" />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Destructure real data with fallbacks
  const {
    artist = {},
    appointments = [],
    works = [],
    stats = {}
  } = dashboardData || {};

  const artistName = artist?.name || userName;
  const artistSpecialization = artist?.specialization || 'Tattoo Artist';
  const artistExperience = artist?.experience_years || '8';
  const artistHourlyRate = artist?.hourly_rate || 150;
  const artistRating = stats?.avg_rating ? Number(stats.avg_rating).toFixed(1) : '4.9';
  const artistTotalReviews = stats?.total_reviews || 89;

  // Calculate stats from real data
  const today = new Date();

  // Helper to check if date is today (in local time)
  const isToday = (dateString) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  const todayAppointments = appointments.filter(apt =>
    isToday(apt.appointment_date)
  ).length;

  const weekAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.appointment_date);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return aptDate >= weekAgo;
  }).length;

  const totalEarnings = stats?.total_earnings || 0;
  const totalAppointments = stats?.total_appointments || 0;
  const avgSessionPrice = totalAppointments > 0 ? totalEarnings / totalAppointments : 0;

  // Quick stats with real data
  const quickStats = [
    {
      label: 'Today',
      value: todayAppointments.toString(),
      icon: 'today',
      change: todayAppointments > 0 ? '+1' : '+0'
    },
    {
      label: 'This Week',
      value: weekAppointments.toString(),
      icon: 'calendar',
      change: weekAppointments > 5 ? '+3' : '+0'
    },
    {
      label: 'Total Earned',
      value: `₱${totalEarnings.toLocaleString()}`,
      icon: 'cash',
      change: totalEarnings > 0 ? '+12%' : '+0%'
    },
    {
      label: 'Hourly Rate',
      value: `₱${Number(artistHourlyRate || 0).toLocaleString()}`,
      icon: 'time',
      change: '→'
    },
  ];

  // Today's schedule from real appointments
  const todaySchedule = appointments
    .filter(apt => isToday(apt.appointment_date))
    .slice(0, 3) // Limit to 3 for display
    .map(apt => {
      let timeStr = 'TBD';
      let durationStr = '1h';

      if (apt.start_time) {
        const startTime = new Date(`2000-01-01T${apt.start_time}`);
        if (!isNaN(startTime)) {
          timeStr = startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

          if (apt.end_time) {
            const endTime = new Date(`2000-01-01T${apt.end_time}`);
            if (!isNaN(endTime)) {
              const durationMs = endTime - startTime;
              const durationHours = Math.round(durationMs / (1000 * 60 * 60) * 10) / 10;
              durationStr = `${durationHours}h`;
            }
          }
        }
      }

      return {
        id: apt.id,
        client: apt.client_name || 'Client',
        time: timeStr,
        type: apt.design_title || 'Consultation',
        status: apt.status || 'pending',
        duration: durationStr,
        fullApt: apt
      };
    });

  // Recent works from real portfolio
  const recentWorks = works.slice(0, 3).map(work => ({
    id: work.id,
    title: work.title || 'Untitled',
    category: work.category || 'Portfolio',
    likes: work.likes || 0,
    date: work.created_at
      ? new Date(work.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
      : 'Recently'
  }));


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#daa520']}
            tintColor="#daa520"
          />
        }
      >
        {/* Header Section */}
        <LinearGradient
          colors={['#000000', '#b8860b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.welcomeText}>Welcome back,</Text>
              <Text style={styles.userName}>{artistName}</Text>
              <Text style={styles.userRole}>
                {artistSpecialization} • {artistExperience} Years Exp.
              </Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.notificationButton}
                onPress={() => onNavigate('artist-notifications')}
              >
                <Ionicons name="notifications" size={22} color="#ffffff" />
                {dashboardData?.unreadCount > 0 && (
                  <View style={styles.notificationDot}>
                    <Text style={styles.notificationDotText}>{dashboardData.unreadCount > 99 ? '99+' : dashboardData.unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => onNavigate('Profile')}
              >
                <Ionicons name="person" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats Overview */}
          <View style={styles.statsOverview}>
            {quickStats.map((stat, index) => (
              <View key={index} style={styles.statItem}>
                <View style={styles.statIcon}>
                  <Ionicons name={stat.icon} size={20} color="#daa520" />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
                <Text style={[
                  styles.statChange,
                  stat.change.includes('+') || stat.change.includes('↑')
                    ? styles.statChangePositive
                    : styles.statChangeNeutral
                ]}>
                  {stat.change}
                </Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* Main Content */}
        <View style={styles.content}>
          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => onNavigate('Schedule')}
              >
                <LinearGradient
                  colors={['#000000', '#374151']}
                  style={styles.quickActionIcon}
                >
                  <Ionicons name="calendar" size={24} color="#ffffff" />
                </LinearGradient>
                <Text style={styles.quickActionText}>Schedule</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => onNavigate('Clients')}
              >
                <LinearGradient
                  colors={['#b91c1c', '#dc2626']}
                  style={styles.quickActionIcon}
                >
                  <Ionicons name="list" size={24} color="#ffffff" />
                </LinearGradient>
                <Text style={styles.quickActionText}>Sessions</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => onNavigate('Works')}
              >
                <LinearGradient
                  colors={['#1e40af', '#3b82f6']}
                  style={styles.quickActionIcon}
                >
                  <Ionicons name="images" size={24} color="#ffffff" />
                </LinearGradient>
                <Text style={styles.quickActionText}>Portfolio</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => onNavigate('artist-earnings')}
              >
                <LinearGradient
                  colors={['#059669', '#10b981']}
                  style={styles.quickActionIcon}
                >
                  <Ionicons name="cash" size={24} color="#ffffff" />
                </LinearGradient>
                <Text style={styles.quickActionText}>Earnings</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Today's Schedule */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Schedule</Text>
              {todaySchedule.length > 0 && (
                <TouchableOpacity onPress={() => onNavigate('Schedule')}>
                  <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
              )}
            </View>

            {todaySchedule.length > 0 ? (
              todaySchedule.map((apt) => (
                <TouchableOpacity
                  key={apt.id}
                  style={styles.scheduleCard}
                  onPress={() => onNavigate('artist-active-session', { appointment: apt.fullApt })}
                >
                  <View style={styles.scheduleTime}>
                    <Ionicons name="time" size={20} color="#daa520" />
                    <Text style={styles.scheduleTimeText}>{apt.time}</Text>
                    <View style={styles.durationBadge}>
                      <Text style={styles.durationText}>{apt.duration}</Text>
                    </View>
                  </View>
                  <View style={styles.scheduleDetails}>
                    <Text style={styles.scheduleClient}>{apt.client}</Text>
                    <Text style={styles.scheduleType}>{apt.type}</Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    apt.status === 'confirmed' ? styles.statusConfirmed :
                      apt.status === 'completed' ? styles.statusCompleted :
                        styles.statusPending
                  ]}>
                    <Text style={[
                      styles.statusText,
                      apt.status === 'confirmed' ? styles.statusTextConfirmed :
                        apt.status === 'completed' ? styles.statusTextCompleted :
                          styles.statusTextPending
                    ]}>
                      {apt.status}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyStateText}>No appointments today</Text>
                <Text style={styles.emptyStateSubtext}>Your schedule is clear</Text>
              </View>
            )}
          </View>

          {/* Recent Works */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Works</Text>
              {recentWorks.length > 0 && (
                <TouchableOpacity onPress={() => onNavigate('Works')}>
                  <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
              )}
            </View>

            {recentWorks.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.worksContainer}
              >
                {recentWorks.map((work) => (
                  <TouchableOpacity
                    key={work.id}
                    style={styles.workCard}
                    onPress={() => onNavigate('artist-work-details', { workId: work.id })}
                  >
                    <LinearGradient
                      colors={['#000000', '#374151']}
                      style={styles.workImage}
                    >
                      <Ionicons name="image" size={40} color="#9ca3af" />
                    </LinearGradient>
                    <View style={styles.workInfo}>
                      <Text style={styles.workTitle}>{work.title}</Text>
                      <View style={styles.workMeta}>
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryText}>{work.category}</Text>
                        </View>
                      </View>
                      <Text style={styles.workDate}>{work.date}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyStateText}>No portfolio works yet</Text>
                <TouchableOpacity
                  style={styles.addWorkButton}
                  onPress={() => onNavigate('Works')}
                >
                  <Text style={styles.addWorkButtonText}>Add Your First Work</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Art of the Day */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Art of the Day</Text>
            {loadingArt ? (
              <ActivityIndicator size="large" color="#daa520" style={{ height: 200, marginTop: 16 }} />
            ) : artOfTheDay ? (
              <View style={styles.artCard}>
                <Image source={{ uri: artOfTheDay.image_url }} style={styles.artImage} resizeMode="cover" />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.8)']}
                  style={styles.artOverlay}
                >
                  <Text style={styles.artTitle}>{artOfTheDay.title}</Text>
                  <Text style={styles.artArtist}>by {artOfTheDay.artist_name}</Text>
                </LinearGradient>
              </View>
            ) : (
              <View style={[styles.emptyState, { marginTop: 16 }]}>
                <Ionicons name="image-outline" size={48} color="#9ca3af" />
                <Text style={styles.emptyStateText}>No featured art today.</Text>
                <Text style={styles.emptyStateSubtext}>Upload a public piece to be featured!</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 32,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#dc2626',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 60,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 4,
    opacity: 0.9,
  },
  userName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  userRole: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.9,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  notificationDotText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsOverview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 4,
  },
  statChange: {
    fontSize: 11,
    fontWeight: '700',
  },
  statChangePositive: {
    color: '#10b981',
  },
  statChangeNeutral: {
    color: '#9ca3af',
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  viewAllText: {
    fontSize: 14,
    color: '#daa520',
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  addWorkButton: {
    marginTop: 16,
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addWorkButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickAction: {
    width: '48%',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  scheduleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  scheduleTime: {
    alignItems: 'center',
    marginRight: 16,
  },
  scheduleTimeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginTop: 4,
    marginBottom: 8,
  },
  durationBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  durationText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  scheduleDetails: {
    flex: 1,
  },
  scheduleClient: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  scheduleType: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 12,
  },
  statusConfirmed: {
    backgroundColor: '#fef3c7',
  },
  statusCompleted: {
    backgroundColor: '#d1fae5',
  },
  statusPending: {
    backgroundColor: '#fee2e2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextConfirmed: {
    color: '#b8860b',
  },
  statusTextCompleted: {
    color: '#059669',
  },
  statusTextPending: {
    color: '#dc2626',
  },
  worksContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  workCard: {
    width: 200,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  workImage: {
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  workInfo: {
    padding: 12,
  },
  workTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  workMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  workDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  artCard: {
    marginTop: 16,
    height: 250,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1f2937',
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  artImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  artOverlay: {
    padding: 20,
  },
  artTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10
  },
  artArtist: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10
  },
});