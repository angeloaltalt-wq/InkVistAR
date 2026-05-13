/**
 * AdminUserManagement.jsx -- Full User CRUD with premium styling
 * 1:1 parity with web's AdminUsers.js
 * Features: Search, role filter, add/edit modal, delete confirm, role badges
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, Modal, KeyboardAvoidingView, Platform, SafeAreaView,
  RefreshControl, ScrollView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Search, Plus, Pencil, Trash2, X, UserPlus, Shield, ChevronDown, ChevronLeft, Users, Camera, ArrowUpDown, ShieldCheck, ShieldOff, RotateCcw, Ban } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import { typography, spacing, borderRadius, shadows } from '../src/theme';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { StaggerItem } from '../src/components/shared/StaggerItem';
import { StatusBadge } from '../src/components/shared/StatusBadge';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { ConfirmModal } from '../src/components/shared/ConfirmModal';
import { ClientProfileModal } from '../src/components/Admin/ClientProfileModal';
import { ArtistProfileModal } from '../src/components/Admin/ArtistProfileModal';
import { getInitials } from '../src/utils/formatters';
import { getAllUsersForAdmin, deleteUserByAdmin, createUserByAdmin, updateUserByAdmin } from '../src/utils/api';
import { sanitizeText, sanitizeEmail, isValidEmail, sanitizePhone } from '../src/utils/validators';

const getRoleColors = (theme) => ({
  admin: { bg: theme.warningBg || 'rgba(245, 158, 11, 0.15)', text: theme.warning || '#f59e0b' },
  artist: { bg: theme.iconPurpleBg || 'rgba(168, 85, 247, 0.15)', text: theme.iconPurple || '#a855f7' },
  customer: { bg: theme.iconBlueBg || 'rgba(59, 130, 246, 0.15)', text: theme.iconBlue || '#3b82f6' },
  manager: { bg: theme.successBg || 'rgba(16, 185, 129, 0.15)', text: theme.success || '#10b981' },
});

export const AdminUserManagement = ({ navigation }) => {
  const { theme, hapticsEnabled } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(theme, insets);
  const ROLE_COLORS = getRoleColors(theme);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const stats = {
    total: users.length,
    artists: users.filter(u => u.user_type === 'artist').length,
    customers: users.filter(u => u.user_type === 'customer').length,
    admins: users.filter(u => u.user_type === 'admin' || u.user_type === 'manager').length,
  };

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '', type: 'customer', password: '', confirmPassword: '', phone: '', status: 'active' });
  const [profileImage, setProfileImage] = useState(null); // base64 uri

  // Sort
  const [sortBy, setSortBy] = useState('name'); // name | role | status | newest
  const [sortDropdown, setSortDropdown] = useState(false);

  // Manage Status Modal
  const [statusModal, setStatusModal] = useState({ visible: false, user: null, selectedStatus: 'active', reason: '' });
  const [statusSaving, setStatusSaving] = useState(false);

  // Delete confirm (with countdown)
  const [deleteModal, setDeleteModal] = useState({ visible: false, userId: null, userName: '', isDeleted: false });
  const [deleteCountdown, setDeleteCountdown] = useState(3);
  const [deleteReady, setDeleteReady] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const result = await getAllUsersForAdmin({ search });
    if (result.success) {
      setUsers(result.data || result.users || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, [search]);

  useEffect(() => {
    // Reset page when filters change
    setPage(1);
  }, [roleFilter, statusFilter, search]);

  // Countdown timer for destructive delete
  useEffect(() => {
    if (!deleteModal.visible || deleteModal.isDeleted) return;
    setDeleteCountdown(3);
    setDeleteReady(false);
    const interval = setInterval(() => {
      setDeleteCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setDeleteReady(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [deleteModal.visible]);

  const handleOpenModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name, email: user.email,
        type: user.user_type || 'customer', password: '',
        phone: user.phone || '', status: user.is_deleted ? 'suspended' : 'active',
      });
      setProfileImage(user.profile_image || null);
    } else {
      setEditingUser(null);
      setFormData({ name: '', email: '', type: 'customer', password: '', confirmPassword: '', phone: '', status: 'active' });
      setProfileImage(null);
    }
    setModalVisible(true);
  };

  const handleSaveUser = async () => {
    const sName = sanitizeText(formData.name);
    const sEmail = sanitizeEmail(formData.email);
    const sPhone = sanitizePhone(formData.phone);

    if (!sName || !sEmail) {
      Alert.alert('Validation Error', 'Name and Email are required');
      return;
    }
    if (!isValidEmail(sEmail)) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return;
    }
    if (sPhone && sPhone.startsWith('0')) {
      Alert.alert('Validation Error', 'Phone number cannot start with 0. Use format: 9XXXXXXXXX');
      return;
    }
    if (!editingUser && !formData.password) {
      Alert.alert('Validation Error', 'Password is required for new users');
      return;
    }
    if (!editingUser && formData.password.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters');
      return;
    }
    if (!editingUser && formData.password !== formData.confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match. Please re-enter.');
      return;
    }

    const payload = { ...formData, name: sName, email: sEmail, phone: sPhone };
    if (profileImage) payload.profile_image = profileImage;

    const result = editingUser
      ? await updateUserByAdmin(editingUser.id, payload)
      : await createUserByAdmin(payload);

    if (result.success) {
      Alert.alert('Success', editingUser ? 'User updated' : 'User created');
      setModalVisible(false);
      loadUsers();
    } else {
      Alert.alert('Error', result.message || 'Operation failed');
    }
  };

  const confirmDelete = (userId, userName, isDeleted = false) => {
    setDeleteModal({ visible: true, userId, userName, isDeleted });
  };

  const performDelete = async () => {
    if (deleteModal.isDeleted) {
      // Restore (un-soft-delete)
      const result = await updateUserByAdmin(deleteModal.userId, { status: 'active' });
      setDeleteModal({ visible: false, userId: null, userName: '', isDeleted: false });
      if (result.success) {
        Alert.alert('Success', 'User restored successfully.');
        loadUsers();
      } else {
        Alert.alert('Error', result.message || 'Failed to restore user');
      }
    } else {
      // Soft delete
      const result = await deleteUserByAdmin(deleteModal.userId);
      setDeleteModal({ visible: false, userId: null, userName: '', isDeleted: false });
      if (result.success) {
        Alert.alert('Success', 'User removed from active roster.');
        loadUsers();
      } else {
        Alert.alert('Error', result.message || 'Failed to delete user');
      }
    }
  };

  const openStatusModal = (user) => {
    setStatusModal({
      visible: true,
      user,
      selectedStatus: user.is_deleted ? 'deactivated' : user.status || 'active',
      reason: ''
    });
  };

  const handleStatusUpdate = async () => {
    if (!statusModal.user) return;
    const { selectedStatus, reason, user } = statusModal;
    if ((selectedStatus === 'deactivated' || selectedStatus === 'banned') && reason.trim().length < 5) {
      Alert.alert('Reason Required', 'Please provide at least 5 characters explaining this status change.');
      return;
    }
    setStatusSaving(true);
    const result = await updateUserByAdmin(user.id, { status: selectedStatus, statusReason: reason });
    setStatusSaving(false);
    if (result.success) {
      setStatusModal({ visible: false, user: null, selectedStatus: 'active', reason: '' });
      Alert.alert('Status Updated', `${user.name} has been set to ${selectedStatus}.`);
      loadUsers();
    } else {
      Alert.alert('Error', result.message || 'Failed to update status');
    }
  };

  // Filter + Sort
  const filteredUsers = users
    .filter(u => {
      if (roleFilter !== 'all' && u.user_type !== roleFilter) return false;
      if (statusFilter === 'active' && u.is_deleted === 1) return false;
      if (statusFilter === 'suspended' && u.is_deleted !== 1) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'role') return (a.user_type || '').localeCompare(b.user_type || '');
      if (sortBy === 'status') return (a.is_deleted || 0) - (b.is_deleted || 0);
      if (sortBy === 'newest') return (b.id || 0) - (a.id || 0);
      return 0;
    });

  const paginatedUsers = filteredUsers.slice(0, page * itemsPerPage);

  const getSuggestions = () => {
    if (search.length < 2) return [];
    const lower = search.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower)).slice(0, 5);
  };
  const suggestions = getSuggestions();

  const pickProfileImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const base64 = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      setProfileImage(base64);
    }
  };

  const renderUser = ({ item, index }) => {
    const roleColor = ROLE_COLORS[item.user_type] || ROLE_COLORS.customer;
    const isDeactivated = item.is_deleted === 1;
    return (
      <StaggerItem key={item.id || index} index={index}>
        <View style={[styles.userCard, isDeactivated && { opacity: 0.65, borderLeftWidth: 3, borderLeftColor: theme.error }]}>
          <View style={styles.userLeft}>
            <View style={[styles.avatar, { backgroundColor: roleColor.bg }]}>
              <Text style={[styles.avatarText, { color: roleColor.text }]}>{getInitials(item.name)}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 6 }}>
                <View style={[styles.roleBadge, { backgroundColor: roleColor.bg }]}>
                  <Text style={[styles.roleText, { color: roleColor.text }]}>{(item.user_type || 'customer').toUpperCase()}</Text>
                </View>
                {isDeactivated && (
                  <View style={[styles.roleBadge, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                    <Text style={[styles.roleText, { color: theme.error }]}>INACTIVE</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          <View style={styles.userActions}>
            <AnimatedTouchable style={[styles.iconBtn, styles.editBtn]} onPress={() => openStatusModal(item)} title="Manage status">
              <Shield size={16} color={theme.info || '#3b82f6'} />
            </AnimatedTouchable>
            <AnimatedTouchable style={[styles.iconBtn, styles.editBtn]} onPress={() => handleOpenModal(item)} title="Edit user">
              <Pencil size={16} color={theme.warning} />
            </AnimatedTouchable>
            <AnimatedTouchable style={[styles.iconBtn, styles.deleteBtn]} onPress={() => confirmDelete(item.id, item.name, isDeactivated)} title={isDeactivated ? 'Restore user' : 'Deactivate user'}>
              {isDeactivated ? <RotateCcw size={16} color={theme.success} /> : <Trash2 size={16} color={theme.error} />}
            </AnimatedTouchable>
          </View>
        </View>
      </StaggerItem>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>User Roster</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {/* Sort Dropdown */}
          <View style={{ position: 'relative' }}>
            <AnimatedTouchable
              style={[styles.iconBtnHeader]}
              onPress={() => setSortDropdown(!sortDropdown)}
              title="Sort users"
            >
              <ArrowUpDown size={16} color={theme.textPrimary} />
            </AnimatedTouchable>
            {sortDropdown && (
              <View style={styles.sortDropdown}>
                {[
                  { key: 'name', label: 'By Name' },
                  { key: 'role', label: 'By Role' },
                  { key: 'status', label: 'By Status' },
                  { key: 'newest', label: 'Newest First' },
                ].map(opt => (
                  <AnimatedTouchable
                    key={opt.key}
                    style={[styles.sortOption, sortBy === opt.key && styles.sortOptionActive]}
                    onPress={() => { setSortBy(opt.key); setSortDropdown(false); }}
                  >
                    <Text style={[styles.sortOptionText, sortBy === opt.key && { color: theme.gold }]}>{opt.label}</Text>
                  </AnimatedTouchable>
                ))}
              </View>
            )}
          </View>
          <AnimatedTouchable style={styles.addBtn} onPress={() => handleOpenModal(null)} title="Add new user">
            <Plus size={20} color={theme.backgroundDeep} />
          </AnimatedTouchable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading} onRefresh={loadUsers} tintColor={theme.gold} />}>
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
            <View style={styles.statBox}>
              <Text style={styles.statBoxTitle}>Total Users</Text>
              <Text style={styles.statBoxValue}>{stats.total}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxTitle}>Artists</Text>
              <Text style={[styles.statBoxValue, { color: ROLE_COLORS.artist.text }]}>{stats.artists}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxTitle}>Customers</Text>
              <Text style={[styles.statBoxValue, { color: ROLE_COLORS.customer.text }]}>{stats.customers}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxTitle}>Staff/Admins</Text>
              <Text style={[styles.statBoxValue, { color: ROLE_COLORS.admin.text }]}>{stats.admins}</Text>
            </View>
          </ScrollView>
        </View>

        {/* Search */}
        <View style={{ zIndex: 10, position: 'relative', marginHorizontal: 20, marginBottom: 12 }}>
          <View style={[styles.searchBar, { marginHorizontal: 0, marginBottom: 0 }]}>
            <Search size={18} color={theme.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search users..."
              placeholderTextColor={theme.textTertiary}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            />
            {search.length > 0 && (
              <AnimatedTouchable onPress={() => setSearch('')}>
                <X size={16} color={theme.textTertiary} />
              </AnimatedTouchable>
            )}
          </View>
          {searchFocused && search.length > 0 && suggestions.length > 0 && (
            <View style={styles.dropdownWrap}>
              {suggestions.map((s, i) => (
                <TouchableOpacity 
                  key={s.id} 
                  style={styles.dropdownItem} 
                  onPress={() => { 
                    setSearch(s.name); 
                    setSearchFocused(false); 
                  }}
                >
                  <View style={{ marginRight: 8 }}><Search size={14} color={theme.textTertiary} /></View>
                  <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.dropdownText}>{s.name}</Text>
                    <Text style={styles.dropdownType}>{s.user_type}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Role Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Text style={{ ...typography.bodySmall, color: theme.textSecondary, alignSelf: 'center', marginRight: 8 }}>Role:</Text>
          {['all', 'customer', 'artist', 'admin'].map(role => (
            <AnimatedTouchable
              key={`role-${role}`}
              style={[styles.filterPill, roleFilter === role && styles.filterPillActive]}
              onPress={() => setRoleFilter(role)}
            >
              <Text style={[styles.filterText, roleFilter === role && styles.filterTextActive]}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </Text>
            </AnimatedTouchable>
          ))}
        </ScrollView>

        {/* Status Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterRow, { marginTop: 0 }]}>
          <Text style={{ ...typography.bodySmall, color: theme.textSecondary, alignSelf: 'center', marginRight: 8 }}>Status:</Text>
          {['all', 'active', 'suspended'].map(status => (
            <AnimatedTouchable
              key={`status-${status}`}
              style={[styles.filterPill, statusFilter === status && styles.filterPillActive]}
              onPress={() => setStatusFilter(status)}
            >
              <Text style={[styles.filterText, statusFilter === status && styles.filterTextActive]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </AnimatedTouchable>
          ))}
        </ScrollView>

        {/* User Count */}
        <Text style={styles.countText}>{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</Text>

        {/* List */}
        {loading ? (
          <PremiumLoader message="Loading users..." />
        ) : (
          <View style={styles.listContent}>
            {paginatedUsers.length === 0 ? (
              <EmptyState icon={Users} title="No users found" subtitle="Try adjusting your filters" />
            ) : (
              paginatedUsers.map((item, index) => renderUser({ item, index }))
            )}
            {filteredUsers.length > paginatedUsers.length && (
              <AnimatedTouchable style={styles.loadMoreBtn} onPress={() => setPage(page + 1)}>
                <Text style={styles.loadMoreText}>Load More</Text>
              </AnimatedTouchable>
            )}
          </View>
        )}
      </ScrollView>

      {/* Customer Modal */}
      <ClientProfileModal
        visible={modalVisible && editingUser?.user_type === 'customer'}
        client={editingUser}
        onClose={() => setModalVisible(false)}
        onRefreshUsers={loadUsers}
      />

      {/* Artist Modal */}
      <ArtistProfileModal
        visible={modalVisible && editingUser?.user_type === 'artist'}
        artist={editingUser}
        onClose={() => setModalVisible(false)}
        onRefreshUsers={loadUsers}
      />

      {/* Add/Edit Modal for Admins & Managers */}
      <Modal visible={modalVisible && (!editingUser || ['admin', 'manager'].includes(editingUser.user_type))} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingUser ? 'Edit User' : 'New User'}</Text>
              <AnimatedTouchable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color={theme.textSecondary} />
              </AnimatedTouchable>
            </View>

            {/* Avatar Picker */}
            <View style={{ alignItems: 'center', marginVertical: 16 }}>
              <AnimatedTouchable onPress={pickProfileImage} style={styles.avatarPickerBtn}>
                {profileImage ? (
                  <Image source={{ uri: profileImage }} style={styles.avatarPickerImage} />
                ) : (
                  <View style={styles.avatarPickerPlaceholder}>
                    <Camera size={26} color={theme.textTertiary} />
                  </View>
                )}
                <View style={styles.avatarCameraOverlay}>
                  <Camera size={14} color="#fff" />
                </View>
              </AnimatedTouchable>
              <Text style={{ ...typography.bodyXSmall, color: theme.textTertiary, marginTop: 6 }}>Tap to set profile photo</Text>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Full Name"
              placeholderTextColor={theme.textTertiary}
              value={formData.name}
              onChangeText={t => setFormData({ ...formData, name: t })}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={theme.textTertiary}
              value={formData.email}
              onChangeText={t => setFormData({ ...formData, email: t })}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="9XXXXXXXXX"
              placeholderTextColor={theme.textTertiary}
              value={formData.phone}
              onChangeText={t => {
                const digits = t.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
                setFormData({ ...formData, phone: digits });
              }}
              keyboardType="number-pad"
              maxLength={10}
            />

            {/* Role Selector */}
            <Text style={styles.inputLabel}>Role</Text>
            <View style={styles.typeRow}>
              {['customer', 'artist', 'admin', 'manager'].map(type => (
                <AnimatedTouchable
                  key={type}
                  style={[styles.typeBtn, formData.type === type && styles.typeBtnActive]}
                  onPress={() => setFormData({ ...formData, type })}
                >
                  <Text style={[styles.typeText, formData.type === type && styles.typeTextActive]}>
                    {type.toUpperCase()}
                  </Text>
                </AnimatedTouchable>
              ))}
            </View>

            {/* Status (edit only) */}
            {editingUser && (
              <>
                <Text style={styles.inputLabel}>Status</Text>
                <View style={styles.typeRow}>
                  {['active', 'suspended'].map(status => (
                    <AnimatedTouchable
                      key={status}
                      style={[styles.typeBtn, formData.status === status && {
                        backgroundColor: status === 'active' ? theme.success : theme.error,
                        borderColor: status === 'active' ? theme.success : theme.error,
                      }]}
                      onPress={() => setFormData({ ...formData, status })}
                    >
                      <Text style={[styles.typeText, formData.status === status && { color: theme.backgroundDeep }]}>
                        {status.toUpperCase()}
                      </Text>
                    </AnimatedTouchable>
                  ))}
                </View>
              </>
            )}

            {/* Password (create only) */}
            {!editingUser && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Password (min. 8 characters)"
                  placeholderTextColor={theme.textTertiary}
                  value={formData.password}
                  onChangeText={t => setFormData({ ...formData, password: t })}
                  secureTextEntry
                />
                <TextInput
                  style={[
                    styles.input,
                    formData.confirmPassword && formData.confirmPassword !== formData.password
                      && { borderColor: theme.error, borderWidth: 1.5 }
                  ]}
                  placeholder="Confirm Password"
                  placeholderTextColor={theme.textTertiary}
                  value={formData.confirmPassword}
                  onChangeText={t => setFormData({ ...formData, confirmPassword: t })}
                  secureTextEntry
                />
                {formData.confirmPassword && formData.confirmPassword !== formData.password ? (
                  <Text style={{ color: theme.error, fontSize: 12, marginTop: -10, marginBottom: 10, paddingHorizontal: 2 }}>
                    Passwords do not match.
                  </Text>
                ) : null}
              </>
            )}

            {/* Actions */}
            <View style={styles.modalActions}>
              <AnimatedTouchable style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </AnimatedTouchable>
              <AnimatedTouchable style={styles.saveBtn} onPress={handleSaveUser}>
                <Text style={styles.saveBtnText}>{editingUser ? 'Update' : 'Create'}</Text>
              </AnimatedTouchable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete / Restore Confirm */}
      <Modal visible={deleteModal.visible} animationType="fade" transparent onRequestClose={() => setDeleteModal({ visible: false, userId: null, userName: '', isDeleted: false })}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: 'center' }]}>
            <View style={[styles.closeBtn, { width: 56, height: 56, borderRadius: 28, marginBottom: 16, backgroundColor: deleteModal.isDeleted ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' }]}>
              {deleteModal.isDeleted
                ? <RotateCcw size={26} color={theme.success} />
                : <Trash2 size={26} color={theme.error} />}
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center', color: deleteModal.isDeleted ? theme.success : theme.error }]}>
              {deleteModal.isDeleted ? 'Restore User' : 'Remove User'}
            </Text>
            <Text style={{ ...typography.body, color: theme.textSecondary, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 22 }}>
              {deleteModal.isDeleted
                ? `Restore "${deleteModal.userName}" to active status? They will regain access to their account.`
                : `Remove "${deleteModal.userName}" from the active roster? Their data will be preserved.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <AnimatedTouchable
                style={[styles.cancelBtn, { flex: 1 }]}
                onPress={() => setDeleteModal({ visible: false, userId: null, userName: '', isDeleted: false })}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </AnimatedTouchable>
              <AnimatedTouchable
                style={[styles.saveBtn, { flex: 1, backgroundColor: deleteModal.isDeleted ? theme.success : (deleteReady ? theme.error : theme.surfaceLight) }]}
                onPress={deleteReady ? performDelete : undefined}
                disabled={!deleteReady}
              >
                <Text style={[styles.saveBtnText, !deleteReady && { color: theme.textSecondary }]}>
                  {deleteModal.isDeleted ? 'Restore' : (deleteReady ? 'Confirm' : `Wait (${deleteCountdown}s)`)}
                </Text>
              </AnimatedTouchable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manage Status Modal */}
      <Modal visible={statusModal.visible} animationType="fade" transparent onRequestClose={() => setStatusModal({ visible: false, user: null, selectedStatus: 'active', reason: '' })}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Account Status</Text>
              <AnimatedTouchable onPress={() => setStatusModal({ visible: false, user: null, selectedStatus: 'active', reason: '' })} style={styles.closeBtn}>
                <X size={20} color={theme.textSecondary} />
              </AnimatedTouchable>
            </View>
            {statusModal.user && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ ...typography.bodySmall, color: theme.textSecondary, marginBottom: 16 }}>
                  Updating status for <Text style={{ fontWeight: '700', color: theme.textPrimary }}>{statusModal.user.name}</Text>
                </Text>

                <Text style={styles.inputLabel}>Account Status</Text>
                <View style={{ flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {[
                    { key: 'active', icon: ShieldCheck, label: 'Active', desc: 'Full account access', color: theme.success },
                    { key: 'deactivated', icon: ShieldOff, label: 'Deactivated', desc: 'Temporarily suspended', color: theme.warning },
                    { key: 'banned', icon: Ban, label: 'Banned', desc: 'Permanently restricted', color: theme.error },
                  ].map(opt => (
                    <AnimatedTouchable
                      key={opt.key}
                      style={[
                        { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1.5, gap: 12,
                          borderColor: statusModal.selectedStatus === opt.key ? opt.color : theme.border,
                          backgroundColor: statusModal.selectedStatus === opt.key ? `${opt.color}12` : theme.surfaceLight
                        }
                      ]}
                      onPress={() => setStatusModal(prev => ({ ...prev, selectedStatus: opt.key }))}
                    >
                      <opt.icon size={20} color={opt.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.body, fontWeight: '700', color: statusModal.selectedStatus === opt.key ? opt.color : theme.textPrimary }}>{opt.label}</Text>
                        <Text style={{ ...typography.bodyXSmall, color: theme.textTertiary }}>{opt.desc}</Text>
                      </View>
                      {statusModal.selectedStatus === opt.key && (
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: opt.color, justifyContent: 'center', alignItems: 'center' }}>
                          <X size={10} color="#fff" />
                        </View>
                      )}
                    </AnimatedTouchable>
                  ))}
                </View>

                {(statusModal.selectedStatus === 'deactivated' || statusModal.selectedStatus === 'banned') && (
                  <>
                    <Text style={styles.inputLabel}>Reason (Required)</Text>
                    <TextInput
                      style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                      placeholder="Explain the reason for this status change..."
                      placeholderTextColor={theme.textTertiary}
                      multiline
                      value={statusModal.reason}
                      onChangeText={t => setStatusModal(prev => ({ ...prev, reason: t }))}
                    />
                  </>
                )}

                <View style={styles.modalActions}>
                  <AnimatedTouchable style={styles.cancelBtn} onPress={() => setStatusModal({ visible: false, user: null, selectedStatus: 'active', reason: '' })}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </AnimatedTouchable>
                  <AnimatedTouchable
                    style={[styles.saveBtn, statusSaving && { opacity: 0.6 }]}
                    onPress={handleStatusUpdate}
                    disabled={statusSaving}
                  >
                    <Text style={styles.saveBtnText}>{statusSaving ? 'Saving...' : 'Apply Status'}</Text>
                  </AnimatedTouchable>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const getStyles = (theme, insets) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: (insets?.top || 0) + 16, paddingBottom: 16,
    backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitle: { ...typography.h2, color: theme.textPrimary },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.gold, justifyContent: 'center', alignItems: 'center',
    ...shadows.subtle,
  },
  statsRow: { marginTop: 16, marginBottom: 4 },
  statBox: {
    backgroundColor: theme.surface, padding: 12, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: theme.border, minWidth: 100,
  },
  statBoxTitle: { ...typography.bodyXSmall, color: theme.textSecondary, marginBottom: 4 },
  statBoxValue: { ...typography.h3, color: theme.textPrimary },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.surface, marginHorizontal: 16, marginTop: 12, marginBottom: 16,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: theme.border, gap: 10,
  },
  searchInput: { flex: 1, ...typography.body, color: theme.textPrimary },

  // Filters
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.round,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.borderLight,
  },
  filterPillActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  filterText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '600' },
  filterTextActive: { color: theme.backgroundDeep },

  countText: {
    ...typography.bodySmall, color: theme.textTertiary, paddingHorizontal: 16, marginBottom: 8,
  },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },

  // User Card
  userCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: theme.surface, padding: 16, borderRadius: borderRadius.xl,
    marginBottom: 10, borderWidth: 1, borderColor: theme.borderLight, ...shadows.subtle,
  },
  userLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  avatarText: { fontWeight: '700', fontSize: 16 },
  userInfo: { flex: 1 },
  userName: { ...typography.body, fontWeight: '700', color: theme.textPrimary },
  userEmail: { ...typography.bodyXSmall, color: theme.textSecondary, marginTop: 2 },
  roleBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: borderRadius.round, marginTop: 6,
  },
  roleText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  userActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 10, borderRadius: borderRadius.md, borderWidth: 1, borderColor: theme.borderLight },
  editBtn: { backgroundColor: theme.surfaceLight },
  deleteBtn: { backgroundColor: theme.surfaceLight },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalCard: {
    backgroundColor: theme.surface, borderRadius: borderRadius.xxl, padding: 24,
    ...shadows.cardStrong, borderWidth: 1, borderColor: theme.borderLight,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  modalTitle: { ...typography.h3, color: theme.textPrimary },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surfaceLight,
    justifyContent: 'center', alignItems: 'center',
  },
  inputLabel: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '600', marginBottom: 8, marginTop: 8 },
  input: {
    backgroundColor: theme.surfaceLight, color: theme.textPrimary,
    padding: 14, borderRadius: borderRadius.md, marginBottom: 16,
    ...typography.body, borderWidth: 1, borderColor: theme.border,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  typeBtn: {
    flex: 1, minWidth: '22%', padding: 12, alignItems: 'center',
    backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: theme.borderLight,
  },
  typeBtnActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  typeText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700' },
  typeTextActive: { color: theme.backgroundDeep },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 16, borderRadius: borderRadius.md,
    backgroundColor: theme.surfaceLight, alignItems: 'center', borderWidth: 1, borderColor: theme.borderLight,
  },
  cancelBtnText: { ...typography.button, color: theme.textSecondary },
  saveBtn: {
    flex: 1, paddingVertical: 16, borderRadius: borderRadius.md,
    backgroundColor: theme.gold, alignItems: 'center',
    ...shadows.button,
  },
  saveBtnText: { ...typography.button, color: theme.backgroundDeep },
  avatarPickerBtn: {
    width: 84, height: 84, borderRadius: 42, overflow: 'hidden',
    borderWidth: 2, borderColor: theme.gold, position: 'relative',
  },
  avatarPickerImage: { width: 84, height: 84, borderRadius: 42 },
  avatarPickerPlaceholder: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: theme.surfaceLight, justifyContent: 'center', alignItems: 'center',
  },
  avatarCameraOverlay: {
    position: 'absolute', bottom: 0, right: 0, width: 26, height: 26,
    borderRadius: 13, backgroundColor: theme.gold,
    justifyContent: 'center', alignItems: 'center',
  },
  dropdownWrap: { position: 'absolute', top: 52, left: 0, right: 0, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, paddingVertical: 4, zIndex: 20 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.borderLight },
  dropdownText: { ...typography.body, color: theme.textPrimary },
  dropdownType: { ...typography.bodyXSmall, color: theme.gold },
  loadMoreBtn: { padding: 14, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: theme.borderLight },
  loadMoreText: { ...typography.bodySmall, color: theme.gold, fontWeight: '600' },
  iconBtnHeader: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.borderLight, justifyContent: 'center', alignItems: 'center' },
  sortDropdown: {
    position: 'absolute', top: 44, right: 0, backgroundColor: theme.surface, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: theme.border, ...shadows.cardStrong, zIndex: 100, minWidth: 140,
  },
  sortOption: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.borderLight },
  sortOptionActive: { backgroundColor: theme.surfaceLight },
  sortOptionText: { ...typography.bodySmall, color: theme.textSecondary, fontWeight: '600' },
});
