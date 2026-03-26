import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  SafeAreaView, 
  ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getNotifications, markNotificationAsRead, markNotificationAsUnread } from '../src/utils/api';

const timeAgo = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.round((now - date) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

export function ArtistNotifications({ onBack, userId }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, hasMore: false });

  useEffect(() => {
    loadNotifications(1);
  }, [userId, filterType]);

  const loadNotifications = async (pageNum = 1) => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const options = { page: pageNum, limit: 20 };
      if (filterType !== 'all') {
        options.type = filterType;
      }
      const result = await getNotifications(userId, options);
      if (result.success) {
        if (pageNum === 1) {
          setNotifications(result.notifications || []);
        } else {
          setNotifications(prev => [...prev, ...(result.notifications || [])]);
        }
        setPagination(result.pagination || { page: 1, limit: 20, total: 0, hasMore: false });
        setHasMore(result.pagination?.hasMore || false);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length > 0) {
      Promise.all(unreadIds.map(id => markNotificationAsRead(id)));
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadNotifications(nextPage);
  };

  const handleFilter = (type) => {
    setFilterType(type);
    setPage(1);
    setNotifications([]);
  };

  const handlePress = async (item) => {
    if (!item.is_read) {
      await markNotificationAsRead(item.id);
      setNotifications(notifications.map(n => 
        n.id === item.id ? { ...n, is_read: true } : n
      ));
    }
    // Optional: Navigate to a specific screen based on item.type and item.related_id
  };

  const handleUnread = async (item) => {
    await markNotificationAsUnread(item.id);
    setNotifications(notifications.map(n => 
      n.id === item.id ? { ...n, is_read: false } : n
    ));
  };

  const getIcon = (type) => {
    switch (type) {
      case 'appointment_request': return { name: 'calendar', color: '#3b82f6' };
      case 'appointment_new': return { name: 'calendar', color: '#3b82f6' };
      case 'appointment_confirmed': return { name: 'checkmark-circle', color: '#10b981' };
      case 'appointment_cancelled': return { name: 'close-circle', color: '#ef4444' };
      case 'appointment_completed': return { name: 'star', color: '#8b5cf6' };
      default: return { name: 'notifications', color: '#6b7280' };
    }
  };

  const renderItem = ({ item }) => {
    const icon = getIcon(item.type);

    return (
      <TouchableOpacity 
        style={[styles.card, !item.is_read && styles.unreadCard]} 
        onPress={() => handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: `${icon.color}20` }]}>
          <Ionicons name={icon.name} size={24} color={icon.color} />
        </View>

        <View style={styles.contentContainer}>
          <View style={styles.cardHeader}>
            <Text style={[styles.title, !item.is_read && styles.unreadText]}>{item.title}</Text>
            <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
        </View>
        {item.is_read && (
          <TouchableOpacity 
            style={styles.unreadAction} 
            onPress={() => handleUnread(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="mail-unread-outline" size={20} color="#b8860b" />
          </TouchableOpacity>
        )}
        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#000000', '#1f2937']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <View style={styles.actionsBar}>
        <Text style={styles.countText}>
          {notifications.filter(n => !n.is_read).length} Unread
        </Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.actionText}>Mark all read</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {['all', 'appointment_request', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_completed', 'payment_success'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.filterChip, filterType === type && styles.filterChipActive]}
              onPress={() => handleFilter(type)}
            >
              <Text style={[styles.filterText, filterType === type && styles.filterTextActive]}>
                {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#daa520" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>No notifications yet</Text>
              <Text style={styles.emptySubText}>We'll let you know when something important happens.</Text>
            </View>
          }
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                <Text style={styles.loadMoreText}>Load More</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.endMessage}>
                <Text style={styles.endText}>No more notifications</Text>
              </View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 24,
    paddingTop: 50,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 14,
    color: '#b8860b',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: '#fffbeb', // Light yellow tint for unread
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
    marginRight: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    marginRight: 8,
  },
  unreadText: {
    color: '#000000',
    fontWeight: '700',
  },
  time: {
    fontSize: 12,
    color: '#9ca3af',
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  unreadAction: {
    padding: 4,
  },
  unreadDot: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#b8860b',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  loadMoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  loadMoreText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '600',
  },
  filterContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingBottom: 12,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterChipActive: {
    backgroundColor: '#b8860b',
    borderColor: '#b8860b',
  },
  filterText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  endMessage: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  endText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});