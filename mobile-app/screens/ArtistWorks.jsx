// ArtistWorks.jsx - UPDATED VERSION WITH VISIBILITY AND SYNCED CATEGORIES
import { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  ScrollView, SafeAreaView, Image, Alert, Modal, ActivityIndicator 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getArtistPortfolio, addArtistWork, deleteArtistWork, updateArtistWorkVisibility } from '../src/utils/api';

export function ArtistWorks({ onBack, artistId }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest'); 
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newWorkTitle, setNewWorkTitle] = useState('');
  const [titleError, setTitleError] = useState('');
  const [newWorkDescription, setNewWorkDescription] = useState('');
  const [newWorkCategory, setNewWorkCategory] = useState('Realism');
  const [isPublic, setIsPublic] = useState(true);
  const [newWorkImage, setNewWorkImage] = useState(''); 
  const [newWorkPriceEstimate, setNewWorkPriceEstimate] = useState('');
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadType, setUploadType] = useState('url'); // 'url' or 'upload'
  const [selectedWork, setSelectedWork] = useState(null);

  const categories = [
    { id: 'all', label: 'All', icon: 'grid' },
    { id: 'Realism', label: 'Realism', icon: 'eye' },
    { id: 'Traditional', label: 'Traditional', icon: 'color-palette' },
    { id: 'Japanese', label: 'Japanese', icon: 'brush' },
    { id: 'Tribal', label: 'Tribal', icon: 'flame' },
    { id: 'Fine Line', label: 'Fine Line', icon: 'pencil' },
  ];

  useEffect(() => {
    loadPortfolio();
  }, [artistId]);

  useEffect(() => {
    if (newWorkTitle.length > 0) {
      if (newWorkTitle.length < 3 || newWorkTitle.length > 50) {
        setTitleError('Title must be between 3 and 50 characters.');
      }
      else if (!/^[a-zA-Z0-9 ]+$/.test(newWorkTitle)) {
        setTitleError('Title can only contain letters, numbers, and spaces.');
      }
      else {
        setTitleError('');
      }
    } else {
      setTitleError('');
    }
  }, [newWorkTitle]);

  const loadPortfolio = async () => {
    if (!artistId) return;
    setLoading(true);
    const result = await getArtistPortfolio(artistId);
    if (result.success) {
      setWorks(result.works || []);
    }
    setLoading(false);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need access to your photos to upload work.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      setNewWorkImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleUploadWork = async () => {
    if (!newWorkTitle.trim() || titleError) return;
    if (!newWorkImage.trim()) {
      Alert.alert('Missing Image', 'Please provide an image (URL or Upload).');
      return;
    }

    const result = await addArtistWork(artistId, {
      title: newWorkTitle,
      description: newWorkDescription,
      category: newWorkCategory,
      imageUrl: newWorkImage,
      isPublic: isPublic,
      priceEstimate: newWorkPriceEstimate || null
    });

    if (result.success) {
      Alert.alert('Success!', 'Your work has been uploaded to your portfolio.');
      setNewWorkTitle('');
      setNewWorkImage('');
      setNewWorkDescription('');
      setNewWorkPriceEstimate('');
      setTitleError('');
      setIsPublic(true);
      setShowUploadModal(false);
      loadPortfolio();
    } else {
      Alert.alert('Error', result.message || 'Failed to upload work.');
    }
  };

  const handleDeleteWork = (id) => {
    Alert.alert(
      'Delete Work',
      'Are you sure you want to delete this work?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            const result = await deleteArtistWork(id);
            if (result.success) {
              loadPortfolio();
            } else {
              Alert.alert('Error', 'Failed to delete work');
            }
          }
        }
      ]
    );
  };

  const filteredWorks = works.filter(work => {
    const matchesCategory = selectedCategory === 'all' || (work.category || '').toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch = (work.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    if (sortBy === 'az') return a.title.localeCompare(b.title);
    return 0;
  });

  const toggleSort = () => {
    if (sortBy === 'newest') setSortBy('oldest');
    else if (sortBy === 'oldest') setSortBy('az');
    else setSortBy('newest');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#000000', '#b8860b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Portfolio</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setShowUploadModal(true)}
            >
              <Ionicons name="add" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{works.length}</Text>
              <Text style={styles.statLabel}>Total Works</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {works.filter(w => w.is_public).length}
              </Text>
              <Text style={styles.statLabel}>Public</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {works.filter(w => !w.is_public).length}
              </Text>
              <Text style={styles.statLabel}>Private</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search your works..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.sortButton} onPress={toggleSort}>
              <Ionicons name="filter" size={16} color="#6b7280" />
              <Text style={styles.sortButtonText}>Sort: {sortBy.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContainer}
          >
            {categories.map((category) => (
              <TouchableOpacity
                key={category.id}
                onPress={() => setSelectedCategory(category.id)}
                style={[
                  styles.categoryButton,
                  selectedCategory === category.id && styles.categoryButtonActive
                ]}
              >
                <Ionicons 
                  name={category.icon} 
                  size={16} 
                  color={selectedCategory === category.id ? '#ffffff' : '#6b7280'} 
                />
                <Text style={[
                  styles.categoryText,
                  selectedCategory === category.id && styles.categoryTextActive
                ]}>
                  {category.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading && <ActivityIndicator size="large" color="#daa520" style={{ marginTop: 20 }} />}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Portfolio Items</Text>
            <View style={styles.worksGrid}>
              {!loading && filteredWorks.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color="#d1d5db" />
                  <Text style={styles.emptyStateText}>No works found</Text>
                </View>
              )}

              {filteredWorks.map((work) => (
                <TouchableOpacity 
                  key={work.id} 
                  style={styles.workCard}
                  onPress={() => setSelectedWork(work)}
                >
                  {work.image_url ? (
                    <Image source={{ uri: work.image_url }} style={styles.workImage} />
                  ) : (
                    <View style={[styles.workImage, { backgroundColor: '#333' }]}>
                      <Ionicons name="images" size={40} color="#666" />
                    </View>
                  )}
                  <View style={styles.workDetails}>
                    <Text style={styles.workTitle} numberOfLines={1}>{work.title}</Text>
                    {work.price_estimate && (
                      <Text style={{fontSize: 12, color: '#daa520', fontWeight: '600', marginBottom: 4}}>₱{Number(work.price_estimate).toLocaleString()}</Text>
                    )}
                    <View style={styles.workMeta}>
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>{work.category || 'Art'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons 
                          name={work.is_public ? "globe-outline" : "lock-closed-outline"} 
                          size={12} 
                          color={work.is_public ? "#daa520" : "#9ca3af"} 
                        />
                        <Text style={styles.workDate}>
                          {new Date(work.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={styles.workDelete}
                    onPress={() => handleDeleteWork(work.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Upload Modal */}
      <Modal visible={showUploadModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add New Work</Text>
                <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                  <Ionicons name="close" size={24} color="#111827" />
                </TouchableOpacity>
              </View>

              {/* Image Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Image Source</Text>
                <View style={styles.tabContainer}>
                  <TouchableOpacity 
                    style={[styles.tabButton, uploadType === 'url' && styles.tabButtonActive]}
                    onPress={() => setUploadType('url')}
                  >
                    <Text style={[styles.tabButtonText, uploadType === 'url' && styles.tabButtonTextActive]}>URL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.tabButton, uploadType === 'upload' && styles.tabButtonActive]}
                    onPress={() => setUploadType('upload')}
                  >
                    <Text style={[styles.tabButtonText, uploadType === 'upload' && styles.tabButtonTextActive]}>Upload</Text>
                  </TouchableOpacity>
                </View>

                {uploadType === 'url' ? (
                  <TextInput
                    style={styles.input}
                    placeholder="https://example.com/image.jpg"
                    value={newWorkImage}
                    onChangeText={setNewWorkImage}
                  />
                ) : (
                  <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                    {newWorkImage ? (
                      <Image source={{ uri: newWorkImage }} style={styles.imagePreview} />
                    ) : (
                      <View style={styles.imagePickerPlaceholder}>
                        <Ionicons name="cloud-upload-outline" size={32} color="#6b7280" />
                        <Text style={styles.imagePickerText}>Select Image</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Title</Text>
                <TextInput
                  style={[styles.input, titleError ? styles.inputError : null]}
                  placeholder="Enter title"
                  value={newWorkTitle}
                  onChangeText={setNewWorkTitle}
                />
                {titleError ? <Text style={styles.errorText}>{titleError}</Text> : null}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Tell more about this piece..."
                  value={newWorkDescription}
                  onChangeText={setNewWorkDescription}
                  multiline
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {categories.slice(1).map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.categoryOption, newWorkCategory === cat.id && styles.categoryOptionActive]}
                      onPress={() => setNewWorkCategory(cat.id)}
                    >
                      <Text style={[styles.categoryOptionText, newWorkCategory === cat.id && styles.categoryOptionTextActive]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Price Estimate (₱)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 2500"
                  value={newWorkPriceEstimate}
                  onChangeText={setNewWorkPriceEstimate}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Settings</Text>
                <TouchableOpacity 
                  style={styles.visibilityToggle}
                  onPress={() => setIsPublic(!isPublic)}
                >
                  <Ionicons name={isPublic ? "globe-outline" : "lock-closed-outline"} size={20} color={isPublic ? "#daa520" : "#6b7280"} />
                  <Text style={[styles.visibilityText, isPublic && styles.visibilityTextActive]}>
                    {isPublic ? "Public Portfolio" : "Private Portfolio"}
                  </Text>
                  <View style={[styles.toggleSwitch, isPublic && styles.toggleSwitchActive]}>
                    <View style={[styles.toggleThumb, isPublic && styles.toggleThumbActive]} />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowUploadModal(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.uploadButton, (!newWorkTitle.trim() || !!titleError) && styles.disabledButton]} 
                  onPress={handleUploadWork}
                  disabled={!newWorkTitle.trim() || !!titleError}
                >
                  <LinearGradient colors={['#000', '#daa520']} style={styles.uploadButtonGradient}>
                    <Text style={styles.uploadButtonText}>Upload Work</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Selected Work Details Modal */}
      <Modal visible={!!selectedWork} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedWork && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Work Details</Text>
                  <TouchableOpacity onPress={() => setSelectedWork(null)}>
                    <Ionicons name="close" size={24} color="#111827" />
                  </TouchableOpacity>
                </View>

                {selectedWork.image_url ? (
                  <Image source={{ uri: selectedWork.image_url }} style={{ width: '100%', height: 300, borderRadius: 12, marginBottom: 16 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: '100%', height: 300, borderRadius: 12, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                    <Ionicons name="images" size={60} color="#666" />
                  </View>
                )}

                <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 8, color: '#111827' }}>{selectedWork.title}</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{selectedWork.category || 'Art'}</Text>
                  </View>
                  <Text style={{ marginLeft: 12, color: '#6b7280', fontSize: 14 }}>
                    {new Date(selectedWork.created_at).toLocaleDateString()}
                  </Text>
                </View>

                {selectedWork.description ? (
                  <Text style={{ fontSize: 16, color: '#4b5563', marginBottom: 24, lineHeight: 24 }}>
                    {selectedWork.description}
                  </Text>
                ) : null}

                {selectedWork.price_estimate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#fef9ee', borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#f5deb3' }}>
                    <Text style={{ fontSize: 16 }}>💰</Text>
                    <Text style={{ fontWeight: '700', color: '#92400e', fontSize: 15 }}>Estimated Price: ₱{Number(selectedWork.price_estimate).toLocaleString()}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Visibility Settings</Text>
                  <TouchableOpacity 
                    style={styles.visibilityToggle}
                    onPress={async () => {
                      const newIsPublic = !selectedWork.is_public;
                      setSelectedWork({ ...selectedWork, is_public: newIsPublic });
                      const result = await updateArtistWorkVisibility(selectedWork.id, newIsPublic);
                      if (result.success) {
                        setWorks(works.map(w => w.id === selectedWork.id ? { ...w, is_public: newIsPublic } : w));
                      } else {
                        Alert.alert('Error', 'Failed to update visibility');
                        setSelectedWork({ ...selectedWork, is_public: !newIsPublic }); // revert visual state
                      }
                    }}
                  >
                    <Ionicons name={selectedWork.is_public ? "globe-outline" : "lock-closed-outline"} size={20} color={selectedWork.is_public ? "#daa520" : "#6b7280"} />
                    <Text style={[styles.visibilityText, selectedWork.is_public && styles.visibilityTextActive]}>
                      {selectedWork.is_public ? "Public Portfolio" : "Private Portfolio"}
                    </Text>
                    <View style={[styles.toggleSwitch, selectedWork.is_public && styles.toggleSwitchActive]}>
                      <View style={[styles.toggleThumb, selectedWork.is_public && styles.toggleThumbActive]} />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* <TouchableOpacity 
                  style={[styles.cancelButton, { marginTop: 16, backgroundColor: '#fee2e2' }]} 
                  onPress={() => {
                    handleDeleteWork(selectedWork.id);
                    setSelectedWork(null);
                  }}
                >
                  <Text style={[styles.cancelButtonText, { color: '#ef4444' }]}>Delete Work</Text>
                </TouchableOpacity> */}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <TouchableOpacity style={styles.fab} onPress={() => setShowUploadModal(true)}>
        <LinearGradient colors={['#000', '#daa520']} style={styles.fabGradient}>
          <Ionicons name="add" size={32} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scrollView: { flex: 1 },
  header: { padding: 24, paddingTop: 60, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.2)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#ffffff' },
  addButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.2)', justifyContent: 'center', alignItems: 'center' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: 12, padding: 12, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '700', color: '#ffffff', marginBottom: 2 },
  statLabel: { fontSize: 10, color: '#ffffff', opacity: 0.8 },
  content: { padding: 16, paddingBottom: 100 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 16, marginBottom: 16, height: 48, elevation: 2 },
  searchInput: { flex: 1, marginLeft: 12, fontSize: 16, color: '#111827' },
  controlsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sortButtonText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  categoriesContainer: { flexDirection: 'row', marginBottom: 24 },
  categoryButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#ffffff', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', marginRight: 12 },
  categoryButtonActive: { backgroundColor: '#000000', borderColor: '#000000' },
  categoryText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  categoryTextActive: { color: '#ffffff' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  worksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  workCard: { width: '47%', backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', marginBottom: 8, elevation: 3 },
  workImage: { width: '100%', height: 150, resizeMode: 'cover' },
  workDetails: { padding: 10 },
  workTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  workMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  categoryBadgeText: { fontSize: 10, color: '#374151' },
  workDate: { fontSize: 10, color: '#9ca3af' },
  workDelete: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, fontSize: 16 },
  tabContainer: { flexDirection: 'row', marginBottom: 12, backgroundColor: '#eee', borderRadius: 12, padding: 4 },
  tabButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabButtonActive: { backgroundColor: '#fff' },
  tabButtonText: { fontSize: 12, color: '#666' },
  tabButtonTextActive: { color: '#000', fontWeight: 'bold' },
  imagePickerButton: { height: 150, backgroundColor: '#f9f9f9', borderRadius: 12, borderStyle: 'dashed', borderWidth: 2, borderColor: '#ddd', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  imagePreview: { width: '100%', height: '100%' },
  imagePickerPlaceholder: { alignItems: 'center' },
  imagePickerText: { fontSize: 12, color: '#999', marginTop: 8 },
  categoryOption: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f3f4f6', borderRadius: 20, marginRight: 8, borderElevation: 1 },
  categoryOptionActive: { backgroundColor: '#000' },
  categoryOptionText: { fontSize: 12, color: '#666' },
  categoryOptionTextActive: { color: '#fff' },
  visibilityToggle: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9f9f9', borderRadius: 12, borderWidth: 1, borderColor: '#eee' },
  visibilityText: { flex: 1, marginLeft: 12, fontSize: 14, color: '#666' },
  visibilityTextActive: { color: '#000', fontWeight: '600' },
  toggleSwitch: { width: 40, height: 22, backgroundColor: '#eee', borderRadius: 11, padding: 2 },
  toggleSwitchActive: { backgroundColor: '#daa520' },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  toggleThumbActive: { transform: [{ translateX: 18 }] },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelButton: { flex: 1, paddingVertical: 14, alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12 },
  cancelButtonText: { fontWeight: '600', color: '#666' },
  uploadButton: { flex: 2 },
  uploadButtonGradient: { height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  uploadButtonText: { color: '#fff', fontWeight: 'bold' },
  disabledButton: { opacity: 0.5 },
  fab: { position: 'absolute', bottom: 30, right: 20, width: 64, height: 64, borderRadius: 32, elevation: 5 },
  fabGradient: { width: '100%', height: '100%', borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
});