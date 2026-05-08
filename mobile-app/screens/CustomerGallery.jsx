/**
 * CustomerGallery.jsx -- Inspiration Gallery with Favorites & My Tattoos
 * Themed with lucide icons, search, category chips, sort, detail modal.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, Platform,
  SafeAreaView, Image, TouchableOpacity, RefreshControl,
  Modal, Dimensions, Pressable, Animated
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search, XCircle, ArrowUpDown, Check, Images, Heart, X, User, Tag,
  Calendar, DollarSign, Maximize2,
} from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { typography, borderRadius, shadows } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { formatCurrency } from '../src/utils/formatters';
import { getGalleryWorks } from '../src/utils/api';
import { getCustomerFavoriteWorks, getCustomerMyTattoos, toggleFavoriteWork } from '../src/api/customerAPI';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function CustomerGallery({ onBack, userId }) {
  const { theme: colors, isDark } = useTheme();
  const styles = getStyles(colors);
  const modalS = getModalStyles(colors);

  const navigation = useNavigation();
  const route = useRoute();
  const initialQuery = route.params?.searchQuery || '';
  const initialViewMode = route.params?.initialViewMode || 'All';
  const initialCategory = route.params?.initialCategory || null;

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(initialCategory ? [initialCategory] : []);
  const [sortOrder, setSortOrder] = useState('desc');
  const [works, setWorks] = useState([]);
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [favorites, setFavorites] = useState([]);
  const [myTattoos, setMyTattoos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedWork, setSelectedWork] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!userId && viewMode !== 'All') { setViewMode('All'); return; }
    fetchWorks();
  }, [viewMode, userId]);

  useEffect(() => {
    if (route.params?.searchQuery) setSearchQuery(route.params.searchQuery);
    if (route.params?.initialViewMode && route.params.initialViewMode !== viewMode) setViewMode(route.params.initialViewMode);
    if (route.params?.initialCategory) setSelectedCategories([route.params.initialCategory]);
  }, [route.params?.searchQuery, route.params?.initialViewMode, route.params?.initialCategory]);

  const fetchWorks = async () => {
    setLoading(true);
    try {
      if (viewMode === 'All') {
        const r = await getGalleryWorks();
        if (r.success) setWorks(r.works || []);
        if (userId) { const fr = await getCustomerFavoriteWorks(userId); if (fr.success) setFavorites((fr.favorites || []).map(i => i.id)); }
      } else if (viewMode === 'Favorites') {
        if (!userId) { setWorks([]); setFavorites([]); return; }
        const fr = await getCustomerFavoriteWorks(userId);
        if (fr.success) { setWorks(fr.favorites || []); setFavorites((fr.favorites || []).map(i => i.id)); }
      } else if (viewMode === 'My Tattoos') {
        if (!userId) { setMyTattoos([]); return; }
        const tr = await getCustomerMyTattoos(userId);
        if (tr.success) setMyTattoos(tr.tattoos || []);
      }
    } catch (e) { console.error('Gallery load error:', e); }
    finally { setLoading(false); }
  };

  const handleToggleFavorite = async (workId) => {
    if (!userId) { navigation.navigate('login'); return; }
    setTogglingFavorite(true);
    try {
      const r = await toggleFavoriteWork(userId, workId);
      if (r.success) {
        if (r.favorited) {
          setFavorites(p => [...new Set([...p, workId])]);
          if (viewMode === 'Favorites') { const u = await getCustomerFavoriteWorks(userId); if (u.success) setWorks(u.favorites || []); }
        } else {
          setFavorites(p => p.filter(id => id !== workId));
          if (viewMode === 'Favorites') setWorks(p => p.filter(i => i.id !== workId));
        }
      }
    } catch (e) { console.error(e); }
    finally { setTogglingFavorite(false); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWorks();
    setRefreshing(false);
  };

  const displayItems = viewMode === 'My Tattoos' ? myTattoos : works;
  const filteredWorks = displayItems.filter(w => {
    const q = searchQuery.toLowerCase();
    const matchSearch = (w.title || '').toLowerCase().includes(q) || (w.artist_name || '').toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q) || (w.category || '').toLowerCase().includes(q);
    const matchCat = selectedCategories.length === 0 || selectedCategories.includes(w.category);
    return matchSearch && matchCat;
  }).sort((a, b) => {
    const dA = new Date(a.created_at || a.appointment_date || 0);
    const dB = new Date(b.created_at || b.appointment_date || 0);
    return sortOrder === 'asc' ? dA - dB : dB - dA;
  });

  const slideAnim = useRef(new Animated.Value(800)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const openDetail = (w) => {
    setSelectedWork(w);
    setModalVisible(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, damping: 18, stiffness: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true })
    ]).start();
  };

  const closeDetail = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 800, duration: 200, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true })
    ]).start(() => {
      setModalVisible(false);
      setSelectedWork(null);
    });
  };

  const handleBookSimilar = () => { closeDetail(); navigation.navigate('booking-create', { prefillNote: `I'm interested in a design similar to "${selectedWork?.title}".`, artistId: selectedWork?.artist_id, style: selectedWork?.category }); };

  const categories = ['All', 'Realism', 'Traditional', 'Japanese', 'Tribal', 'Fine Line', 'Watercolor', 'Minimalist', 'Blackwork'];

  const handleCategoryToggle = (cat) => {
    if (cat === 'All') {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(prev =>
        prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
      );
    }
  };

  const getSuggestions = () => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    const map = new Map(); // to ensure unique texts
    displayItems.forEach(w => {
      if (w.artist_name && w.artist_name.toLowerCase().includes(q)) map.set(w.artist_name, { type: 'Artist', text: w.artist_name });
      if (w.category && w.category.toLowerCase().includes(q)) map.set(w.category, { type: 'Style', text: w.category });
      if (w.title && w.title.toLowerCase().includes(q)) map.set(w.title, { type: 'Title', text: w.title });
    });
    return Array.from(map.values()).slice(0, 5); // Limit to top 5
  };
  const suggestions = getSuggestions();

  // Calculate dynamic heights for masonry look based on item ID
  const getItemHeight = (id) => {
    const sum = String(id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return sum % 2 === 0 ? 180 : 260; // Varying heights for masonry effect
  };

  const leftCol = [];
  const rightCol = [];
  filteredWorks.forEach((w, i) => {
    if (i % 2 === 0) leftCol.push(w);
    else rightCol.push(w);
  });

  const renderWorkCard = (w) => (
    <TouchableOpacity key={w.id} style={[styles.workCard, { height: getItemHeight(w.id) }]} onPress={() => openDetail(w)} activeOpacity={0.85}>
      <Image source={{ uri: w.image_url }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['transparent', 'rgba(15,13,14,0.9)']} style={styles.workGradient}>
        <View style={styles.workInfo}>
          <Text style={styles.workTitle} numberOfLines={1}>{w.title}</Text>
          <Text style={styles.workArtist} numberOfLines={1}>by {w.artist_name}</Text>
        </View>
      </LinearGradient>
      <TouchableOpacity style={styles.favBtn} onPress={() => handleToggleFavorite(w.id)} disabled={togglingFavorite}>
        <Heart size={16} color={favorites.includes(w.id) ? colors.gold : 'rgba(255,255,255,0.7)'} fill={favorites.includes(w.id) ? colors.gold : 'none'} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inspiration Gallery</Text>
        <TouchableOpacity onPress={onBack}><Text style={styles.headerBack}>Back</Text></TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>
        <View style={styles.content}>
          {/* Search with Autocomplete Waterfall */}
          <View style={{ zIndex: 10, position: 'relative' }}>
            <View style={styles.searchWrap}>
              <Search size={18} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by style, artist, or title..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              />
              {searchQuery.length > 0 && <TouchableOpacity onPress={() => setSearchQuery('')}><XCircle size={18} color={colors.textTertiary} /></TouchableOpacity>}
            </View>

            {searchFocused && searchQuery.length > 0 && suggestions.length > 0 && (
              <View style={styles.dropdownWrap}>
                {suggestions.map((s, i) => (
                  <TouchableOpacity key={i} style={styles.dropdownItem} onPress={() => { setSearchQuery(s.text); setSearchFocused(false); }}>
                    <Search size={14} color={colors.textTertiary} style={{ marginRight: 8 }} />
                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.dropdownText}>{s.text}</Text>
                      <Text style={styles.dropdownType}>{s.type}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Sort */}
          <View style={styles.sortRow}>
            <TouchableOpacity style={styles.sortBtn} onPress={() => setSortOrder(p => p === 'asc' ? 'desc' : 'asc')}>
              <ArrowUpDown size={14} color={colors.textSecondary} />
              <Text style={styles.sortText}>{sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}</Text>
            </TouchableOpacity>
          </View>

          {/* View Mode */}
          <View style={styles.viewModeRow}>
            {['All', 'Favorites', 'My Tattoos'].map(mode => (
              <TouchableOpacity key={mode} style={[styles.viewModeBtn, viewMode === mode && styles.viewModeBtnActive]} onPress={() => setViewMode(mode)}>
                <Text style={[styles.viewModeText, viewMode === mode && styles.viewModeTextActive]}>{mode}{mode === 'Favorites' ? ` (${favorites.length})` : ''}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Category Checkboxes */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            <TouchableOpacity style={[styles.catChip, selectedCategories.length === 0 && styles.catChipActive]} onPress={() => handleCategoryToggle('All')}>
              {selectedCategories.length === 0 ? (
                <Check size={13} color={colors.backgroundDeep} />
              ) : (
                <X size={13} color={colors.textPrimary} />
              )}
              <Text style={[styles.catText, selectedCategories.length === 0 && styles.catTextActive]}>
                {selectedCategories.length === 0 ? 'All' : 'Clear'}
              </Text>
            </TouchableOpacity>
            {categories.filter(c => c !== 'All').map(cat => (
              <TouchableOpacity key={cat} style={[styles.catChip, selectedCategories.includes(cat) && styles.catChipActive]} onPress={() => handleCategoryToggle(cat)}>
                {selectedCategories.includes(cat) && <Check size={13} color={colors.backgroundDeep} />}
                <Text style={[styles.catText, selectedCategories.includes(cat) && styles.catTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Masonry Grid */}
          {loading ? <PremiumLoader message="Loading gallery..." /> : (
            <View style={styles.grid}>
              {filteredWorks.length === 0 ? (
                <EmptyState icon={Images} title="No works found" subtitle={searchQuery ? `No matches for "${searchQuery}"` : 'The gallery is currently empty.'} />
              ) : (
                <>
                  <View style={styles.column}>
                    {leftCol.map(w => renderWorkCard(w))}
                  </View>
                  <View style={styles.column}>
                    {rightCol.map(w => renderWorkCard(w))}
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Detail Modal with Custom Spring Animation */}
      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeDetail}>
        <Animated.View style={[modalS.overlay, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDetail} />
          <Animated.View style={[modalS.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={modalS.handle}><View style={modalS.handleBar} /></View>
            <TouchableOpacity style={modalS.closeBtn} onPress={closeDetail}><X size={22} color={colors.textSecondary} /></TouchableOpacity>
            {selectedWork && (
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <Image source={{ uri: selectedWork.image_url }} style={modalS.image} resizeMode="cover" />
                <View style={modalS.body}>
                  <Text style={modalS.title}>{selectedWork.title || 'Untitled Work'}</Text>
                  <View style={modalS.artistRow}>
                    <View style={modalS.artistBadge}><User size={13} color={colors.primary} /></View>
                    <Text style={modalS.artistName}>{selectedWork.artist_name || 'Unknown Artist'}</Text>
                  </View>
                  {selectedWork.category && (
                    <View style={modalS.catWrap}><Tag size={12} color={colors.textSecondary} /><Text style={modalS.catText}>{selectedWork.category}</Text></View>
                  )}
                  {selectedWork.description ? (
                    <View style={modalS.descWrap}>
                      <Text style={modalS.descLabel}>About this piece</Text>
                      <Text style={modalS.descText}>{selectedWork.description}</Text>
                    </View>
                  ) : null}
                  {selectedWork.price_estimate ? (
                    <View style={modalS.priceRow}>
                      <DollarSign size={16} color={colors.primaryDark} />
                      <Text style={modalS.priceText}>Estimated: P{formatCurrency(selectedWork.price_estimate)}</Text>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                    <TouchableOpacity style={[modalS.actionBtn, { flex: 1.5, backgroundColor: colors.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 }]} onPress={handleBookSimilar} activeOpacity={0.8}>
                      <Calendar size={18} color={colors.backgroundDeep} />
                      <Text style={[modalS.actionText, { color: colors.backgroundDeep }]}>Book Similar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={modalS.arBtn} onPress={() => alert('AR Viewer Initialization Placeholder')} activeOpacity={0.8}>
                      <Maximize2 size={18} color={colors.gold} />
                      <Text style={modalS.arText}>Try in AR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={modalS.favActionBtn} onPress={() => handleToggleFavorite(selectedWork.id)} disabled={togglingFavorite}>
                      <Heart size={20} color={favorites.includes(selectedWork.id) ? colors.gold : colors.textSecondary} fill={favorites.includes(selectedWork.id) ? colors.gold : 'none'} />
                    </TouchableOpacity>
                  </View>
                  {viewMode === 'My Tattoos' && selectedWork.appointment_date && (
                    <View style={modalS.sessionInfo}>
                      <Text style={{ fontWeight: '700', marginBottom: 6, color: colors.textPrimary }}>Tattoo Session</Text>
                      <Text style={{ color: colors.textSecondary }}>Date: {new Date(selectedWork.appointment_date).toLocaleDateString()}</Text>
                      <Text style={{ color: colors.textSecondary }}>Artist: {selectedWork.artist_name || 'N/A'}</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'ios' ? 16 : 52, backgroundColor: colors.backgroundDeep, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { ...typography.h2, color: colors.textPrimary },
  headerBack: { ...typography.body, color: colors.goldMuted },
  content: { padding: 16, paddingBottom: 90 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.darkBgSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, paddingHorizontal: 14, marginBottom: 14, height: 48 },
  searchInput: { flex: 1, height: 46, marginLeft: 10, ...typography.body, color: colors.textPrimary },
  sortRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  viewModeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 6 },
  viewModeBtn: { flex: 1, paddingVertical: 8, borderRadius: borderRadius.round, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.backgroundDeep },
  viewModeBtnActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  viewModeText: { ...typography.bodyXSmall, color: colors.textSecondary, fontWeight: '600' },
  viewModeTextActive: { color: colors.backgroundDeep, fontWeight: '700' },
  catRow: { flexDirection: 'row', marginBottom: 16, paddingRight: 16 },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: borderRadius.round, backgroundColor: colors.backgroundDeep, borderWidth: 1, borderColor: colors.border, marginRight: 8, gap: 4 },
  catChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  catText: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '500' },
  catTextActive: { color: colors.backgroundDeep, fontWeight: '700' },
  dropdownWrap: { position: 'absolute', top: 52, left: 0, right: 0, backgroundColor: colors.backgroundDeep, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, ...shadows.medium, paddingVertical: 4, zIndex: 20 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownText: { ...typography.body, color: colors.textPrimary },
  dropdownType: { ...typography.bodyXSmall, color: colors.goldMuted },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  column: { width: '48%', gap: 14 },
  workCard: { width: '100%', borderRadius: borderRadius.lg, overflow: 'hidden', position: 'relative' },
  workGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', justifyContent: 'flex-end', padding: 10 },
  favBtn: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15,13,14,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  workInfo: { padding: 0 },
  workTitle: { ...typography.bodySmall, fontWeight: '700', color: '#ffffff', marginBottom: 2 },
  workArtist: { ...typography.bodyXSmall, color: 'rgba(255,255,255,0.7)' },
});

const getModalStyles = (colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,13,14,0.8)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.backgroundDeep, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', minHeight: '60%', borderWidth: 1, borderColor: colors.border },
  handle: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  closeBtn: { position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.darkBgSecondary, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  image: { width: '100%', height: 350, backgroundColor: colors.darkBgSecondary },
  body: { padding: 20, paddingBottom: 40 },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: 8 },
  artistRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  artistBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.darkBgSecondary, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  artistName: { ...typography.body, color: colors.textSecondary, fontWeight: '500' },
  catWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.darkBgSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: borderRadius.sm, alignSelf: 'flex-start', gap: 5, marginBottom: 16 },
  catText: { ...typography.bodySmall, color: colors.gold, fontWeight: '600' },
  descWrap: { backgroundColor: colors.darkBgSecondary, borderRadius: borderRadius.lg, padding: 14, marginBottom: 16 },
  descLabel: { ...typography.bodyXSmall, fontWeight: '600', color: colors.goldMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  descText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: colors.darkBgSecondary, borderRadius: borderRadius.lg, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  priceText: { ...typography.body, fontWeight: '700', color: colors.gold },
  actionBtn: { borderRadius: borderRadius.xl, overflow: 'hidden' },
  actionGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  actionText: { ...typography.button, color: colors.backgroundDeep, fontSize: 15 },
  arBtn: { flex: 1, paddingHorizontal: 16, borderRadius: borderRadius.xl, borderWidth: 1, borderColor: colors.gold, justifyContent: 'center', alignItems: 'center', gap: 4 },
  arText: { ...typography.bodyXSmall, color: colors.gold, fontWeight: '600' },
  favActionBtn: { width: 50, borderRadius: borderRadius.xl, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.darkBgSecondary },
  sessionInfo: { padding: 12, borderColor: colors.border, borderWidth: 1, borderRadius: borderRadius.lg, marginBottom: 16, backgroundColor: colors.darkBgSecondary },
});
