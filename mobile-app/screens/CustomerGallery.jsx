import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, StyleSheet, ScrollView, 
  SafeAreaView, Image, ActivityIndicator, TouchableOpacity,
  Modal, Dimensions, Pressable
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient'; // Fixed: Added missing import
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getGalleryWorks } from '../src/utils/api';
import { getCustomerFavoriteWorks, getCustomerMyTattoos, toggleFavoriteWork } from '../src/api/customerAPI';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function CustomerGallery({ onBack, userId }) {
  const navigation = useNavigation();
  const route = useRoute();
  
  // Accept initial search query and view mode from route params
  const initialQuery = route.params?.searchQuery || '';
  const initialViewMode = route.params?.initialViewMode || 'All';
  
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortOrder, setSortOrder] = useState('desc'); // desc = newest first
  const [works, setWorks] = useState([]);
  const [viewMode, setViewMode] = useState(initialViewMode); // All, Favorites, My Tattoos
  const [favorites, setFavorites] = useState([]);
  const [myTattoos, setMyTattoos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWork, setSelectedWork] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  useEffect(() => {
    if (!userId && viewMode !== 'All') {
      // If not logged in, restrict to All mode only.
      setViewMode('All');
      return;
    }
    fetchWorks();
  }, [viewMode, userId]);

  useEffect(() => {
    if (route.params?.searchQuery) {
      setSearchQuery(route.params.searchQuery);
    }
    if (route.params?.initialViewMode && route.params.initialViewMode !== viewMode) {
      setViewMode(route.params.initialViewMode);
    }
  }, [route.params?.searchQuery, route.params?.initialViewMode]);

  const fetchWorks = async () => {
    setLoading(true);
    try {
      if (viewMode === 'All') {
        const result = await getGalleryWorks();
        if (result.success) setWorks(result.works || []);

        if (userId) {
          const favResult = await getCustomerFavoriteWorks(userId);
          if (favResult.success) setFavorites((favResult.favorites || []).map((item)=>item.id));
        }
      } else if (viewMode === 'Favorites') {
        if (!userId) {
          setWorks([]);
          setFavorites([]);
          return;
        }
        const favResult = await getCustomerFavoriteWorks(userId);
        if (favResult.success) {
          setWorks(favResult.favorites || []);
          setFavorites((favResult.favorites || []).map((item)=>item.id));
        }
      } else if (viewMode === 'My Tattoos') {
        if (!userId) {
          setMyTattoos([]);
          return;
        }
        const tattooResult = await getCustomerMyTattoos(userId);
        if (tattooResult.success) {
          setMyTattoos(tattooResult.tattoos || []);
        }
      }
    } catch (error) {
      console.error('Failed to load gallery:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = async (workId) => {
    if (!userId) {
      navigation.navigate('login');
      return;
    }

    setTogglingFavorite(true);
    try {
      const result = await toggleFavoriteWork(userId, workId);
      if (result.success) {
        if (result.favorited) {
          setFavorites((prev) => [...new Set([...prev, workId])]);
          if (viewMode === 'Favorites') {
            const updated = await getCustomerFavoriteWorks(userId);
            if (updated.success) setWorks(updated.favorites || []);
          }
        } else {
          setFavorites((prev) => prev.filter((id) => id !== workId));
          if (viewMode === 'Favorites') setWorks((prev) => prev.filter((item) => item.id !== workId));
        }
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    } finally {
      setTogglingFavorite(false);
    }
  };

  const displayItems = viewMode === 'My Tattoos' ? myTattoos : works;

  const filteredWorks = displayItems.filter((work) => {
    const searchLower = searchQuery.toLowerCase();
    const titleMatch = (work.title || '').toLowerCase().includes(searchLower);
    const artistMatch = (work.artist_name || '').toLowerCase().includes(searchLower);
    const descriptionMatch = (work.description || '').toLowerCase().includes(searchLower);
    const categoryMatch = (work.category || '').toLowerCase().includes(searchLower);

    const matchesSearch = titleMatch || artistMatch || descriptionMatch || categoryMatch;
    const matchesCategory = selectedCategory === 'All' || (work.category || '').toLowerCase() === selectedCategory.toLowerCase();

    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    const dateA = new Date(a.created_at || a.appointment_date || 0);
    const dateB = new Date(b.created_at || b.appointment_date || 0);
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });

  const openDetail = (work) => {
    setSelectedWork(work);
    setModalVisible(true);
  };

  const closeDetail = () => {
    setModalVisible(false);
    setSelectedWork(null);
  };

  const handleBookSimilar = () => {
    closeDetail();
    // Pass the style/category as context to the booking screen if needed
    navigation.navigate('booking-create', { 
      prefillNote: `I'm interested in a consultation for a design similar to "${selectedWork?.title}".` 
    });
  };

  const categories = ['All', 'Realism', 'Traditional', 'Japanese', 'Tribal', 'Fine Line', 'Watercolor', 'Minimalist', 'Blackwork'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Inspiration Gallery</Text>
          <TouchableOpacity onPress={onBack} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by style, artist, or title..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.sortButton} onPress={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}>
              <Ionicons name={sortOrder === 'asc' ? "arrow-up" : "arrow-down"} size={16} color="#6b7280" />
              <Text style={styles.sortButtonText}>{sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.viewModeRow}>
            {['All', 'Favorites', 'My Tattoos'].map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.viewModeBtn, viewMode === mode && styles.viewModeBtnActive]}
                onPress={() => setViewMode(mode)}
              >
                <Text style={[styles.viewModeText, viewMode === mode && styles.viewModeTextActive]}>
                  {mode}{mode === 'Favorites' ? ` (${favorites.length})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Style Filters (Checkboxes/Chips) */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.categoriesContainer}
          >
            {categories.map((cat) => (
              <TouchableOpacity 
                key={cat}
                style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipSelected]}
                onPress={() => setSelectedCategory(cat)}
              >
                {selectedCategory === cat && <Ionicons name="checkmark" size={14} color="white" style={{ marginRight: 4 }} />}
                <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextSelected]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <ActivityIndicator size="large" color="#daa520" style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.worksGrid}>
              {filteredWorks.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="images-outline" size={48} color="#d1d5db" />
                  <Text style={styles.emptyStateText}>No works found</Text>
                  <Text style={styles.emptyStateSubtext}>
                    {searchQuery ? `No matches for "${searchQuery}"` : "The gallery is currently empty."}
                  </Text>
                </View>
              ) : (
                filteredWorks.map((work) => (
                  <TouchableOpacity 
                    key={work.id} 
                    style={styles.workCard} 
                    onPress={() => openDetail(work)}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: work.image_url }} style={styles.workImage} />

                    <TouchableOpacity
                      style={styles.favoriteToggle}
                      onPress={(e) => {
                        e.stopPropagation && e.stopPropagation();
                        handleToggleFavorite(work.id);
                      }}
                      disabled={togglingFavorite}
                    >
                      <Ionicons
                        name={favorites.includes(work.id) ? 'heart' : 'heart-outline'}
                        size={20}
                        color={favorites.includes(work.id) ? '#ff4d4d' : '#f1f5f9'}
                      />
                    </TouchableOpacity>

                    <View style={styles.workDetails}>
                      <Text style={styles.workTitle} numberOfLines={1}>{work.title}</Text>
                      <Text style={styles.workArtist} numberOfLines={1}>by {work.artist_name}</Text>
                    </View>
                    <View style={styles.tapHint}>
                      <Ionicons name="expand-outline" size={14} color="#9ca3af" />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Detail Modal (Bottom Sheet Style) */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeDetail}
      >
        <Pressable style={styles.modalOverlay} onPress={closeDetail}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {/* Close button */}
            <View style={styles.modalHandle}>
              <View style={styles.handleBar} />
            </View>
            <TouchableOpacity style={styles.modalCloseButton} onPress={closeDetail}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>

            {selectedWork && (
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                {/* High-res image */}
                <Image 
                  source={{ uri: selectedWork.image_url }} 
                  style={styles.modalImage} 
                  resizeMode="cover"
                />

                <View style={styles.modalBody}>
                  {/* Title & Artist */}
                  <Text style={styles.modalTitle}>{selectedWork.title || 'Untitled Work'}</Text>
                  <View style={styles.artistRow}>
                    <View style={styles.artistBadge}>
                      <Ionicons name="person" size={14} color="#daa520" />
                    </View>
                    <Text style={styles.modalArtist}>{selectedWork.artist_name || 'Unknown Artist'}</Text>
                  </View>

                  {/* Category badge */}
                  {selectedWork.category && (
                    <View style={styles.categoryContainer}>
                      <View style={styles.modalCategoryBadge}>
                        <Ionicons name="pricetag" size={12} color="#6b7280" />
                        <Text style={styles.modalCategoryText}>{selectedWork.category}</Text>
                      </View>
                    </View>
                  )}

                  {/* Description */}
                  {selectedWork.description ? (
                    <View style={styles.descriptionContainer}>
                      <Text style={styles.descriptionLabel}>About this piece</Text>
                      <Text style={styles.descriptionText}>{selectedWork.description}</Text>
                    </View>
                  ) : null}

                  {/* Price Estimate */}
                  {selectedWork.price_estimate ? (
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#fef9ee', borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#f5deb3'}}>
                      <Text style={{fontSize: 16}}>💰</Text>
                      <Text style={{fontWeight: '700', color: '#92400e', fontSize: 15}}>Estimated Price: ₱{Number(selectedWork.price_estimate).toLocaleString()}</Text>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <TouchableOpacity
                      style={[styles.bookSimilarButton, { flex: 1 }]}
                      onPress={handleBookSimilar}
                    >
                      <LinearGradient
                        colors={['#000000', '#b8860b']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.bookSimilarGradient}
                      >
                        <Ionicons name="calendar" size={20} color="#ffffff" />
                        <Text style={styles.bookSimilarText}>Request Consultation</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.bookSimilarButton, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' }]}
                      onPress={() => handleToggleFavorite(selectedWork.id)}
                      disabled={togglingFavorite}
                    >
                      <Ionicons name={favorites.includes(selectedWork.id) ? 'heart' : 'heart-outline'} size={20} color={favorites.includes(selectedWork.id) ? '#ff4d4d' : '#374151'} />
                      <Text style={[styles.bookSimilarText, { color: '#374151' }]}>
                        {favorites.includes(selectedWork.id) ? 'Unfavorite' : 'Favorite'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {viewMode === 'My Tattoos' && selectedWork.appointment_date && (
                    <View style={{padding: 12, borderColor: '#e5e7eb', borderWidth: 1, borderRadius: 10, marginBottom: 16}}>
                      <Text style={{fontWeight: '700', marginBottom: 8}}>Tattoo session</Text>
                      <Text>Date: {new Date(selectedWork.appointment_date).toLocaleDateString()}</Text>
                      <Text>Artist: {selectedWork.artist_name || 'N/A'}</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scrollView: { flex: 1 },
  header: {
    padding: 20,
    paddingTop: 50,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  headerButton: { padding: 8 },
  headerButtonText: { color: '#6b7280', fontSize: 16 },
  content: { padding: 16 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 50,
  },
  searchInput: {
    flex: 1,
    height: 48,
    marginLeft: 12,
    fontSize: 16,
    color: '#111827',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  // Checkbox/Chip Styles
  categoriesContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    paddingRight: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  categoryChipSelected: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  categoryText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  categoryTextSelected: { color: 'white' },

  viewModeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 12,
  },
  viewModeBtn: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  viewModeBtnActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  viewModeText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  viewModeTextActive: {
    color: '#fcd34d',
  },

  worksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  workCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  favoriteToggle: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  workImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  workDetails: {
    padding: 12,
  },
  workTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  workArtist: {
    fontSize: 12,
    color: '#6b7280',
  },
  tapHint: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    width: '100%',
    alignItems: 'center',
    padding: 32,
    marginTop: 20,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '50%',
  },
  modalHandle: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#f3f4f6',
  },
  modalBody: {
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  artistBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  modalArtist: {
    fontSize: 16,
    color: '#4b5563',
    fontWeight: '500',
  },
  categoryContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  modalCategoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  modalCategoryText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  descriptionContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  descriptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  descriptionText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  bookSimilarButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  bookSimilarGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  bookSimilarText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
});
