// CustomerDashboard.jsx - UPDATED VERSION
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getCustomerDashboard } from '../src/utils/api';

export function CustomerDashboard({ userName, userId, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);

  const loadDashboard = async () => {
    if (!userId) return;
    try {
      const result = await getCustomerDashboard(userId);
      if (result.success) {
        setDashboardData(result);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [userId]);

  // Re-fetch dashboard data when screen gains focus (fixes notification dot persistence)
  useFocusEffect(
    useCallback(() => {
      if (userId) loadDashboard();
    }, [userId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  // Process appointments for display
  const upcomingAppointments = dashboardData?.appointments?.slice(0, 2).map(apt => ({
    id: apt.id,
    artist: apt.artist_name,
    date: new Date(apt.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: apt.start_time.slice(0, 5),
    type: apt.design_title || 'Appointment',
    artistAvatar: '🎨'
  })) || [];

  // This was the source of the fake names. It should be empty.
  const savedDesigns = [];

  const trendingStyles = [
    { name: 'Minimalist', icon: 'brush', color: '#000000' },
    { name: 'Traditional', icon: 'color-palette', color: '#b91c1c' },
    { name: 'Watercolor', icon: 'water', color: '#3b82f6' },
    { name: 'Geometric', icon: 'square', color: '#10b981' },
    { name: 'Blackwork', icon: 'contrast', color: '#111827' },
  ];

  const quickActions = [
    { 
      id: 1, 
      title: 'AR Preview', 
      subtitle: 'Try tattoos in AR', 
      icon: 'sparkles', 
      screen: 'AR',
      gradient: ['#fef3c7', '#fbbf24']
    },
    { 
      id: 2, 
      title: 'Book Artist', 
      subtitle: 'Schedule appointment', 
      icon: 'calendar', 
      screen: 'booking-create',
      gradient: ['#000000', '#374151']
    },
    { 
      id: 3, 
      title: 'Chat with Studio', 
      subtitle: 'Contact our admins', 
      icon: 'chatbubbles', 
      screen: 'Chat',
      gradient: ['#1e40af', '#3b82f6']
    },
    { 
      id: 4, 
      title: 'Gallery', 
      subtitle: 'Browse designs', 
      icon: 'images', 
      screen: 'Gallery', // Navigate to Tab
      gradient: ['#7c3aed', '#a78bfa']
    },
  ];

  const stats = dashboardData?.stats || {
    total_tattoos: 0,
    upcoming: 0,
    saved_designs: 0,
    artists: 0
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#daa520" />
      }>
        {/* Header Gradient */}
        <LinearGradient
          colors={['#000000', '#b8860b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.welcomeText}>Welcome back,</Text>
              <Text style={styles.userName}>{userName}</Text>
              <Text style={styles.userTagline}>Your tattoo journey starts here</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity 
                style={styles.notificationButton}
                onPress={() => onNavigate('customer-notifications')}
              >
                <Ionicons name="notifications" size={24} color="#ffffff" />
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
                <Ionicons name="person" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <Ionicons name="color-palette" size={20} color="#daa520" />
              </View>
              <Text style={styles.statNumber}>{stats.total_tattoos}</Text>
              <Text style={styles.statLabel}>Tattoos</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <Ionicons name="calendar" size={20} color="#10b981" />
              </View>
              <Text style={styles.statNumber}>{stats.upcoming}</Text>
              <Text style={styles.statLabel}>Upcoming</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <Ionicons name="heart" size={20} color="#ef4444" />
              </View>
              <Text style={styles.statNumber}>{stats.saved_designs}</Text>
              <Text style={styles.statLabel}>Saved</Text>
            </View>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <Ionicons name="star" size={20} color="#f59e0b" />
              </View>
              <Text style={styles.statNumber}>{stats.artists}</Text>
              <Text style={styles.statLabel}>Artists</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Content */}
        <View style={styles.content}>
          {/* Quick Actions Grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsGrid}>
              {quickActions.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={styles.actionCard}
                  onPress={() => onNavigate(action.screen)}
                >
                  <LinearGradient
                    colors={action.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.actionIconContainer}
                  >
                    <Ionicons name={action.icon} size={28} color="#ffffff" />
                  </LinearGradient>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Upcoming Appointments */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
              <TouchableOpacity onPress={() => onNavigate('Appointments')}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>
            
            {loading ? (
              <ActivityIndicator size="small" color="#daa520" />
            ) : upcomingAppointments.length > 0 ? (
              upcomingAppointments.map((apt) => (
                <TouchableOpacity 
                  key={apt.id} 
                  style={styles.appointmentCard}
                  onPress={() => onNavigate('Appointments')} // Navigate to Tab
                >
                  <View style={styles.appointmentContent}>
                    <View style={styles.appointmentIconContainer}>
                      <LinearGradient
                        colors={['#000000', '#daa520']}
                        style={styles.appointmentIcon}
                      >
                        <Text style={styles.artistAvatar}>{apt.artistAvatar}</Text>
                      </LinearGradient>
                      <View style={styles.appointmentStatus}>
                        <View style={styles.statusDot} />
                        <Text style={styles.statusText}>Confirmed</Text>
                      </View>
                    </View>
                    <View style={styles.appointmentDetails}>
                      <Text style={styles.appointmentArtist}>{apt.artist}</Text>
                      <Text style={styles.appointmentType}>{apt.type}</Text>
                      <View style={styles.appointmentTimeRow}>
                        <Ionicons name="time" size={14} color="#6b7280" />
                        <Text style={styles.appointmentTime}>{apt.date} • {apt.time}</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.appointmentAction}>
                      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyStateContainer}>
                <Text style={styles.emptyStateText}>No upcoming appointments.</Text>
                <TouchableOpacity style={styles.bookNowButton} onPress={() => onNavigate('booking-create')}>
                  <Ionicons name="calendar" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.bookNowText}>Book Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Saved Designs */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Saved Designs</Text>
              <TouchableOpacity>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.designsContainer}
            >
              {savedDesigns.length > 0 ? (
                savedDesigns.map((design) => (
                  <TouchableOpacity key={design.id} style={styles.designCard}>
                    <View style={styles.designImage}>
                      <LinearGradient
                        colors={['#000000', '#374151']}
                        style={styles.designImageGradient}
                      >
                        <Ionicons name="color-palette" size={32} color="#ffffff" />
                      </LinearGradient>
                      <TouchableOpacity style={styles.likeButton}>
                        <Ionicons name="heart" size={16} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.designInfo}>
                      <Text style={styles.designName}>{design.name}</Text>
                      <Text style={styles.designArtist}>{design.artist}</Text>
                      <View style={styles.designStats}>
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryText}>{design.category}</Text>
                        </View>
                        <View style={styles.likesBadge}>
                          <Ionicons name="heart" size={12} color="#ef4444" />
                          <Text style={styles.likesText}>{design.likes}</Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={{ color: '#6b7280', fontStyle: 'italic', padding: 10 }}>No saved designs yet.</Text>
              )}
            </ScrollView>
          </View>

          {/* Trending Styles */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.trendingHeader}>
                <Ionicons name="trending-up" size={20} color="#111827" />
                <Text style={[styles.sectionTitle, { marginLeft: 8 }]}>Trending Styles</Text>
              </View>
              <TouchableOpacity onPress={() => onNavigate('customer-artists')}>
                <Text style={styles.viewAllText}>Discover New Artists</Text>
              </TouchableOpacity>
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendingContainer}
            >
              {trendingStyles.map((style, index) => (
                <TouchableOpacity key={index} style={styles.trendingCard} onPress={() => onNavigate('Gallery', { searchQuery: style.name })}>
                  <View style={[styles.trendingIcon, { backgroundColor: style.color + '20' }]}>
                    <Ionicons name={style.icon} size={24} color={style.color} />
                  </View>
                  <Text style={styles.trendingText}>{style.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Recommendations */}
          <View style={styles.section}>
            <LinearGradient
              colors={['#000000', '#1f2937']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.recommendationCard}
            >
              <View style={styles.recommendationContent}>
                <Ionicons name="bulb" size={32} color="#fbbf24" />
                <View style={styles.recommendationText}>
                  <Text style={styles.recommendationTitle}>Need Inspiration?</Text>
                  <Text style={styles.recommendationDescription}>
                    Chat with our AI assistant for personalized tattoo suggestions
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.recommendationButton}
                  onPress={() => onNavigate('chatbot-enhanced')}
                >
                  <Text style={styles.recommendationButtonText}>Try AI Chat</Text>
                  <Ionicons name="arrow-forward" size={16} color="#000000" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
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
    alignItems: 'center',
    marginBottom: 24,
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
  userTagline: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  notificationButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#ef4444',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
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
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.9,
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
  trendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '48%',
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
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  appointmentCard: {
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
  appointmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appointmentIconContainer: {
    position: 'relative',
    marginRight: 16,
  },
  appointmentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistAvatar: {
    fontSize: 24,
  },
  appointmentStatus: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 4,
  },
  statusText: {
    fontSize: 10,
    color: '#374151',
    fontWeight: '600',
  },
  appointmentDetails: {
    flex: 1,
  },
  appointmentArtist: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  appointmentType: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 6,
  },
  appointmentTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  appointmentTime: {
    fontSize: 12,
    color: '#6b7280',
  },
  appointmentAction: {
    padding: 8,
  },
  designsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  designCard: {
    width: 160,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  designImage: {
    height: 140,
    position: 'relative',
  },
  designImageGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  likeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  designInfo: {
    padding: 12,
  },
  designName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  designArtist: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  designStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 10,
    color: '#374151',
    fontWeight: '600',
  },
  likesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likesText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  trendingContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  trendingCard: {
    alignItems: 'center',
    padding: 12,
  },
  trendingIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  trendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  recommendationCard: {
    borderRadius: 20,
    padding: 24,
  },
  recommendationContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recommendationText: {
    flex: 1,
    marginLeft: 16,
    marginRight: 16,
  },
  recommendationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  recommendationDescription: {
    fontSize: 14,
    color: '#e5e7eb',
    lineHeight: 20,
  },
  recommendationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  recommendationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  emptyStateContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
  },
  emptyStateText: {
    color: '#6b7280',
    marginBottom: 12,
  },
  bookNowButton: {
    flexDirection: 'row',
    backgroundColor: '#daa520',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },
  bookNowText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});