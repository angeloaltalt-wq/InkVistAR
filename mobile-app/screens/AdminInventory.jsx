/**
 * AdminInventory.jsx -- Full Inventory CRUD
 * 1:1 parity with web's AdminInventory.js
 * Features: Stock CRUD, low-stock alerts, search, filter, add/edit modal, stock transactions
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, Modal, ScrollView, RefreshControl, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  Search, Plus, Pencil, Trash2, X, Package, AlertTriangle,
  TrendingDown, TrendingUp, Archive, ChevronLeft, ChevronRight,
  Printer, Download, History, Layers, Filter, Camera, ArrowUpDown, RotateCcw, SortAsc
} from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/context/ThemeContext';
import { typography, spacing, borderRadius, shadows } from '../src/theme';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { StaggerItem } from '../src/components/shared/StaggerItem';
import { PremiumLoader } from '../src/components/shared/PremiumLoader';
import { EmptyState } from '../src/components/shared/EmptyState';
import { ConfirmModal } from '../src/components/shared/ConfirmModal';
import { formatCurrency } from '../src/utils/formatters';
import {
  getAdminInventory, createAdminInventory, updateAdminInventory,
  deleteAdminInventory, fetchAPI,
} from '../src/utils/api';
import { sanitizeText, sanitizeNumeric } from '../src/utils/validators';

export const AdminInventory = ({ navigation }) => {
  const { theme, hapticsEnabled } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(theme, insets);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, low, out

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({
    name: '', category: 'supplies', unit: 'pcs',
    current_stock: '', min_stock: '', cost_per_unit: '', image: ''
  });

  // Transaction modal
  const [txModalVisible, setTxModalVisible] = useState(false);
  const [txItem, setTxItem] = useState(null);
  const [txType, setTxType] = useState('in');
  const [txQty, setTxQty] = useState('');
  const [txNotes, setTxNotes] = useState('');

  // Delete
  const [deleteModal, setDeleteModal] = useState({ visible: false, itemId: null, itemName: '', isArchived: false });

  // Sort
  const [sortBy, setSortBy] = useState('name'); // name | stock_asc | stock_desc | cost
  const [sortDropdown, setSortDropdown] = useState(false);

  // Show archived toggle
  const [showArchived, setShowArchived] = useState(false);

  // Autocomplete & Filters
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [itemStatusFilter, setItemStatusFilter] = useState('active');
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [stockStatusFilter, setStockStatusFilter] = useState([]);

  // History & Kits
  const [historyModal, setHistoryModal] = useState(false);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  const [kitsModal, setKitsModal] = useState(false);
  const [kitsData, setKitsData] = useState({});
  const [kitsLoading, setKitsLoading] = useState(false);

  const INVENTORY_CATEGORIES = ['all', 'ink', 'needles', 'jewelry', 'supplies', 'aftercare', 'machinery'];

  const loadData = async () => {
    setLoading(true);
    const result = await getAdminInventory();
    if (result.success) {
      setItems(result.data || result.inventory || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const openForm = (item = null) => {
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name, category: item.category || 'supplies',
        unit: item.unit || 'pcs',
        current_stock: String(item.current_stock || 0),
        min_stock: String(item.min_stock || 0),
        cost_per_unit: String(item.cost_per_unit || 0),
        image: item.image || ''
      });
    } else {
      setEditingItem(null);
      setForm({ name: '', category: 'supplies', unit: 'pcs', current_stock: '', min_stock: '', cost_per_unit: '', image: '' });
    }
    setModalVisible(true);
  };

  const handleImagePick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setForm({ ...form, image: `data:image/jpeg;base64,${result.assets[0].base64}` });
    }
  };

  const handleSave = async () => {
    const sName = sanitizeText(form.name);
    if (!sName) {
      Alert.alert('Validation Error', 'Item name is required');
      return;
    }
    const payload = {
      ...form,
      name: sName,
      current_stock: parseInt(sanitizeNumeric(form.current_stock)) || 0,
      min_stock: parseInt(sanitizeNumeric(form.min_stock)) || 0,
      cost_per_unit: parseFloat(sanitizeNumeric(form.cost_per_unit, true)) || 0,
    };

    const result = editingItem
      ? await updateAdminInventory(editingItem.id, payload)
      : await createAdminInventory(payload);

    if (result.success) {
      Alert.alert('Success', editingItem ? 'Item updated' : 'Item added');
      setModalVisible(false);
      loadData();
    } else {
      Alert.alert('Error', result.message || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    if (deleteModal.isArchived) {
      // Restore
      const result = await updateAdminInventory(deleteModal.itemId, { is_deleted: 0 });
      setDeleteModal({ visible: false, itemId: null, itemName: '', isArchived: false });
      if (result.success) {
        Alert.alert('Restored', 'Item restored to active inventory.');
        loadData();
      } else {
        Alert.alert('Error', result.message || 'Failed to restore');
      }
    } else {
      // Soft archive
      const result = await deleteAdminInventory(deleteModal.itemId);
      setDeleteModal({ visible: false, itemId: null, itemName: '', isArchived: false });
      if (result.success) {
        loadData();
      } else {
        Alert.alert('Error', result.message || 'Failed to archive');
      }
    }
  };

  const openTxModal = (item) => {
    setTxItem(item);
    setTxType('in');
    setTxQty('');
    setTxNotes('');
    setTxModalVisible(true);
  };

  const handleTransaction = async () => {
    const sQty = parseInt(sanitizeNumeric(txQty));
    if (!sQty || isNaN(sQty) || sQty <= 0) {
      Alert.alert('Validation Error', 'Quantity must be greater than 0');
      return;
    }
    if (!sanitizeText(txNotes)) {
      Alert.alert('Validation Error', 'Reason/Notes is required');
      return;
    }
    const result = await fetchAPI(`/admin/inventory/${txItem.id}/transaction`, {
      method: 'POST',
      body: JSON.stringify({
        type: txType,
        quantity: sQty,
        notes: sanitizeText(txNotes),
      }),
    });
    if (result.success) {
      Alert.alert('Success', `Stock ${txType === 'in' ? 'added' : 'deducted'} successfully`);
      setTxModalVisible(false);
      loadData();
    } else {
      Alert.alert('Error', result.message || 'Transaction failed');
    }
  };

  // Filter & Search
  const searchSuggestions = Array.from(new Set([
    ...items.map(i => (i.id || '').toString()),
    ...items.map(i => (i.name || '').trim()),
    ...items.map(i => (i.category || '').trim())
  ])).filter(Boolean);

  const filtered = items
    .filter(item => {
      if (!showArchived && item.is_deleted) return false; // hide archived by default
      const matchSearch = (item.name || '').toLowerCase().includes(search.toLowerCase()) || (item.category || '').toLowerCase().includes(search.toLowerCase());
      
      let matchCategory = true;
      if (categoryFilter.length > 0) {
        matchCategory = categoryFilter.includes((item.category || '').toLowerCase());
      }
      
      let matchStock = true;
      if (stockStatusFilter.length > 0) {
        matchStock = false;
        if (stockStatusFilter.includes('out') && item.current_stock <= 0) matchStock = true;
        if (stockStatusFilter.includes('low') && item.current_stock > 0 && item.current_stock <= item.min_stock) matchStock = true;
        if (stockStatusFilter.includes('optimal') && item.current_stock > item.min_stock && item.current_stock <= item.max_stock) matchStock = true;
        if (stockStatusFilter.includes('overstock') && item.current_stock > item.max_stock) matchStock = true;
      }

      return matchSearch && matchCategory && matchStock;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'stock_asc') return (a.current_stock || 0) - (b.current_stock || 0);
      if (sortBy === 'stock_desc') return (b.current_stock || 0) - (a.current_stock || 0);
      if (sortBy === 'cost') return (b.cost_per_unit || 0) - (a.cost_per_unit || 0);
      return 0;
    });

  const toggleCategory = (cat) => {
    if (categoryFilter.includes(cat)) {
      setCategoryFilter(categoryFilter.filter(c => c !== cat));
    } else {
      setCategoryFilter([...categoryFilter, cat]);
    }
  };

  const toggleStockStatus = (status) => {
    if (stockStatusFilter.includes(status)) {
      setStockStatusFilter(stockStatusFilter.filter(s => s !== status));
    } else {
      setStockStatusFilter([...stockStatusFilter, status]);
    }
  };

  const lowStockCount = items.filter(i => i.current_stock <= i.min_stock && i.current_stock > 0).length;
  const outOfStockCount = items.filter(i => i.current_stock <= 0).length;

  const fetchHistory = async () => {
    setHistoryLoading(true);
    setHistoryModal(true);
    const result = await fetchAPI('/admin/inventory/transactions?page=1&limit=50');
    if (result.success) setHistoryData(result.data || []);
    setHistoryLoading(false);
  };

  const fetchKits = async () => {
    setKitsLoading(true);
    setKitsModal(true);
    const result = await fetchAPI('/admin/service-kits');
    if (result.success) setKitsData(result.data || {});
    setKitsLoading(false);
  };

  const renderItem = ({ item, index }) => {
    const isLow = item.current_stock <= item.min_stock && item.current_stock > 0;
    const isOut = item.current_stock <= 0;
    return (
      <StaggerItem index={index}>
        <View style={[styles.itemCard, isOut && styles.itemCardOut, isLow && styles.itemCardLow]}>
          <View style={styles.itemTop}>
            <View style={styles.itemTopLeft}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.itemCategory}>{item.category || 'General'}</Text>
            </View>
            <View style={styles.stockBadge}>
              <Text style={[
                styles.stockText,
                isOut ? { color: theme.error } :
                isLow ? { color: theme.warning } :
                { color: theme.success }
              ]}>
                {item.current_stock} {item.unit || 'pcs'}
              </Text>
              {isLow && <AlertTriangle size={14} color={theme.warning} />}
              {isOut && <AlertTriangle size={14} color={theme.error} />}
            </View>
          </View>

          <View style={styles.itemMeta}>
            <Text style={styles.metaText}>Min: {item.min_stock || 0}</Text>
            <Text style={styles.metaText}>Cost: P{formatCurrency(item.cost_per_unit || 0)}/{item.unit || 'pc'}</Text>
          </View>

          <View style={styles.itemActions}>
            {!item.is_deleted && (
              <AnimatedTouchable style={styles.txBtn} onPress={() => openTxModal(item)}>
                <TrendingUp size={14} color={theme.success} />
                <Text style={[styles.txBtnText, { color: theme.success }]}>Stock In/Out</Text>
              </AnimatedTouchable>
            )}
            <View style={styles.iconActions}>
              {!item.is_deleted && (
                <AnimatedTouchable style={[styles.iconBtn, styles.editBtn]} onPress={() => openForm(item)} title="Edit item">
                  <Pencil size={14} color={theme.warning} />
                </AnimatedTouchable>
              )}
              <AnimatedTouchable
                style={[styles.iconBtn, item.is_deleted ? styles.editBtn : styles.delBtn]}
                onPress={() => setDeleteModal({ visible: true, itemId: item.id, itemName: item.name, isArchived: !!item.is_deleted })}
                title={item.is_deleted ? 'Restore item' : 'Archive item'}
              >
                {item.is_deleted ? <RotateCcw size={14} color={theme.success} /> : <Archive size={14} color={theme.error} />}
              </AnimatedTouchable>
            </View>
          </View>
        </View>
      </StaggerItem>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <AnimatedTouchable onPress={() => navigation?.goBack?.()} style={{ marginRight: 15 }}>
            <ChevronLeft size={24} color={theme.textPrimary} />
          </AnimatedTouchable>
          <View>
            <Text style={styles.headerTitle}>Inventory</Text>
            <Text style={styles.headerSub}>{items.length} items total</Text>
          </View>
        </View>
        <AnimatedTouchable style={styles.addBtn} onPress={() => openForm(null)}>
          <Plus size={20} color={theme.backgroundDeep} />
        </AnimatedTouchable>
      </View>

      {/* Header Actions */}
      <View style={styles.actionRow}>
        <View style={styles.actionGroup}>
          <AnimatedTouchable style={styles.iconBtnHeader} onPress={() => Alert.alert('Print', 'Inventory report printing is optimized for the web portal.')}>
            <Printer size={16} color={theme.textPrimary} />
          </AnimatedTouchable>
          <AnimatedTouchable style={styles.iconBtnHeader} onPress={() => Alert.alert('Export', 'CSV export is available in the web portal.')}>
            <Download size={16} color={theme.textPrimary} />
          </AnimatedTouchable>
        </View>

        <View style={styles.actionGroup}>
          {/* Sort Dropdown */}
          <View style={{ position: 'relative' }}>
            <AnimatedTouchable style={[styles.iconBtnHeader, { flexDirection: 'row', gap: 4, paddingHorizontal: 10, width: 'auto' }]} onPress={() => setSortDropdown(!sortDropdown)} title="Sort items">
              <ArrowUpDown size={14} color={theme.textPrimary} />
              <Text style={{ ...typography.bodyXSmall, color: theme.textPrimary, fontWeight: '700' }}>Sort</Text>
            </AnimatedTouchable>
            {sortDropdown && (
              <View style={styles.sortDropdown}>
                {[
                  { key: 'name', label: 'By Name' },
                  { key: 'stock_asc', label: 'Stock: Low to High' },
                  { key: 'stock_desc', label: 'Stock: High to Low' },
                  { key: 'cost', label: 'Cost: High to Low' },
                ].map(opt => (
                  <AnimatedTouchable key={opt.key}
                    style={[styles.sortOption, sortBy === opt.key && styles.sortOptionActive]}
                    onPress={() => { setSortBy(opt.key); setSortDropdown(false); }}
                  >
                    <Text style={[{ ...typography.bodyXSmall, color: theme.textSecondary }, sortBy === opt.key && { color: theme.gold }]}>{opt.label}</Text>
                  </AnimatedTouchable>
                ))}
              </View>
            )}
          </View>
          <AnimatedTouchable
            style={[styles.iconBtnHeader, { flexDirection: 'row', gap: 4, paddingHorizontal: 10, width: 'auto', backgroundColor: showArchived ? 'rgba(239,68,68,0.12)' : theme.surfaceLight }]}
            onPress={() => setShowArchived(!showArchived)}
            title="Toggle archived items"
          >
            <Archive size={14} color={showArchived ? theme.error : theme.textPrimary} />
            <Text style={{ ...typography.bodyXSmall, color: showArchived ? theme.error : theme.textPrimary, fontWeight: '700' }}>Archived</Text>
          </AnimatedTouchable>
          <AnimatedTouchable style={[styles.iconBtnHeader, { backgroundColor: theme.surfaceLight }]} onPress={fetchHistory}>
            <History size={16} color={theme.textPrimary} />
            <Text style={styles.iconBtnText}>History</Text>
          </AnimatedTouchable>
          <AnimatedTouchable style={[styles.iconBtnHeader, { backgroundColor: theme.surfaceLight }]} onPress={fetchKits}>
            <Layers size={16} color={theme.textPrimary} />
            <Text style={styles.iconBtnText}>Kits</Text>
          </AnimatedTouchable>
        </View>
      </View>

      {/* Alert banner */}
      {(lowStockCount > 0 || outOfStockCount > 0) && (
        <View style={styles.alertBanner}>
          <AlertTriangle size={16} color={theme.warning} />
          <Text style={styles.alertText}>
            {lowStockCount > 0 ? `${lowStockCount} low stock` : ''}
            {lowStockCount > 0 && outOfStockCount > 0 ? ' | ' : ''}
            {outOfStockCount > 0 ? `${outOfStockCount} out of stock` : ''}
          </Text>
        </View>
      )}

      {/* Search & Autocomplete */}
      <View style={{ zIndex: 10 }}>
        <View style={styles.searchBar}>
          <Search size={18} color={theme.textTertiary} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search items by name, category..." 
            placeholderTextColor={theme.textTertiary} 
            value={search} 
            onChangeText={(t) => { setSearch(t); setShowSuggestions(true); }} 
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
        </View>
        {showSuggestions && search && searchSuggestions.filter(s => s.toLowerCase().includes(search.toLowerCase())).length > 0 && (
          <View style={styles.waterfallDropdown}>
            {searchSuggestions.filter(s => s.toLowerCase().includes(search.toLowerCase())).slice(0, 5).map((s, i) => (
              <AnimatedTouchable key={s} style={styles.waterfallItem} onPress={() => { setSearch(s); setShowSuggestions(false); }}>
                <Search size={14} color={theme.textTertiary} style={{ marginRight: 8 }} />
                <Text style={styles.waterfallText}>{s}</Text>
              </AnimatedTouchable>
            ))}
          </View>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <AnimatedTouchable style={[styles.filterPill, stockStatusFilter.length === 0 && styles.filterPillActive]} onPress={() => setStockStatusFilter([])}>
             <Text style={[styles.filterText, stockStatusFilter.length === 0 && styles.filterTextActive]}>All Stock</Text>
          </AnimatedTouchable>
          {['low', 'out', 'optimal', 'overstock'].map(f => (
            <AnimatedTouchable key={f} style={[styles.filterPill, stockStatusFilter.includes(f) && styles.filterPillActive]} onPress={() => toggleStockStatus(f)}>
              <Text style={[styles.filterText, stockStatusFilter.includes(f) && styles.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
            </AnimatedTouchable>
          ))}
        </ScrollView>
      </View>
      <View style={[styles.filterRow, { marginTop: 0 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <AnimatedTouchable style={[styles.filterPill, categoryFilter.length === 0 && styles.filterPillActive]} onPress={() => setCategoryFilter([])}>
             <Text style={[styles.filterText, categoryFilter.length === 0 && styles.filterTextActive]}>All Categories</Text>
          </AnimatedTouchable>
          {INVENTORY_CATEGORIES.filter(c => c !== 'all').map(cat => (
            <AnimatedTouchable key={cat} style={[styles.filterPill, categoryFilter.includes(cat) && styles.filterPillActive]} onPress={() => toggleCategory(cat)}>
              <Text style={[styles.filterText, categoryFilter.includes(cat) && styles.filterTextActive]}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
            </AnimatedTouchable>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? <PremiumLoader message="Loading inventory..." /> : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={item => (item.id || Math.random()).toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<EmptyState icon={Package} title="No inventory items" subtitle="Add items to start tracking" actionLabel="Add Item" onAction={() => openForm(null)} />}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor={theme.gold} />}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingItem ? 'Edit Item' : 'Add New Item'}</Text>
              <AnimatedTouchable onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color={theme.textSecondary} />
              </AnimatedTouchable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <AnimatedTouchable style={styles.imagePicker} onPress={handleImagePick}>
                  {form.image ? (
                    <Image source={{ uri: form.image }} style={styles.pickedImage} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Camera size={24} color={theme.textTertiary} />
                      <Text style={styles.imagePlaceholderText}>Add Photo</Text>
                    </View>
                  )}
                </AnimatedTouchable>
              </View>

              <Text style={styles.inputLabel}>Item Name</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={t => setForm({ ...form, name: t })} placeholder="e.g. Disposable Gloves" placeholderTextColor={theme.textTertiary} />

              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.typeRow}>
                {INVENTORY_CATEGORIES.filter(c => c !== 'all').map(cat => (
                  <AnimatedTouchable key={cat} style={[styles.typeBtn, form.category === cat && styles.typeBtnActive]} onPress={() => setForm({ ...form, category: cat })}>
                    <Text style={[styles.typeText, form.category === cat && styles.typeTextActive]}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                  </AnimatedTouchable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Unit</Text>
              <TextInput style={styles.input} value={form.unit} onChangeText={t => setForm({ ...form, unit: t })} placeholder="e.g. pcs, bottles, sets" placeholderTextColor={theme.textTertiary} />

              <Text style={styles.inputLabel}>Current Stock</Text>
              <TextInput style={styles.input} value={form.current_stock} onChangeText={t => setForm({ ...form, current_stock: t })} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Minimum Stock (Alert Threshold)</Text>
              <TextInput style={styles.input} value={form.min_stock} onChangeText={t => setForm({ ...form, min_stock: t })} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Cost per Unit (PHP)</Text>
              <TextInput style={styles.input} value={form.cost_per_unit} onChangeText={t => setForm({ ...form, cost_per_unit: t })} keyboardType="decimal-pad" />

              <View style={styles.modalActions}>
                <AnimatedTouchable style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </AnimatedTouchable>
                <AnimatedTouchable style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>{editingItem ? 'Update' : 'Add Item'}</Text>
                </AnimatedTouchable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Stock Transaction Modal */}
      <Modal visible={txModalVisible} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Stock Transaction</Text>
              <AnimatedTouchable onPress={() => setTxModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color={theme.textSecondary} />
              </AnimatedTouchable>
            </View>
            {txItem && (
              <View style={{ padding: 4 }}>
                <Text style={styles.txItemName}>{txItem.name}</Text>
                <Text style={styles.txItemStock}>Current: {txItem.current_stock} {txItem.unit}</Text>

                <Text style={styles.inputLabel}>Transaction Type</Text>
                <View style={styles.typeRow}>
                  <AnimatedTouchable style={[styles.typeBtn, txType === 'in' && { backgroundColor: theme.success, borderColor: theme.success }]} onPress={() => setTxType('in')}>
                    <Text style={[styles.typeText, txType === 'in' && { color: theme.backgroundDeep }]}>Stock In</Text>
                  </AnimatedTouchable>
                  <AnimatedTouchable style={[styles.typeBtn, txType === 'out' && { backgroundColor: theme.error, borderColor: theme.error }]} onPress={() => setTxType('out')}>
                    <Text style={[styles.typeText, txType === 'out' && { color: theme.backgroundDeep }]}>Stock Out</Text>
                  </AnimatedTouchable>
                </View>

                <Text style={styles.inputLabel}>Quantity</Text>
                <TextInput style={styles.input} value={txQty} onChangeText={setTxQty} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.textTertiary} />

                <Text style={styles.inputLabel}>Notes (Optional)</Text>
                <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={txNotes} onChangeText={setTxNotes} multiline placeholder="Reason for transaction..." placeholderTextColor={theme.textTertiary} />

                <View style={styles.modalActions}>
                  <AnimatedTouchable style={styles.cancelBtn} onPress={() => setTxModalVisible(false)}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </AnimatedTouchable>
                  <AnimatedTouchable style={[styles.saveBtn, txType === 'out' && { backgroundColor: theme.error }]} onPress={handleTransaction}>
                    <Text style={styles.saveBtnText}>Submit</Text>
                  </AnimatedTouchable>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* History Modal */}
      <Modal visible={historyModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlayFull}>
          <View style={styles.modalCardFull}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Stock History</Text>
              <AnimatedTouchable onPress={() => setHistoryModal(false)} style={styles.closeBtn}>
                <X size={20} color={theme.textSecondary} />
              </AnimatedTouchable>
            </View>
            {historyLoading ? <PremiumLoader message="Loading history..." /> : (
              <FlatList
                data={historyData}
                keyExtractor={(item, index) => item.id?.toString() || index.toString()}
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <View style={styles.historyCard}>
                    <View style={styles.historyTop}>
                      <Text style={styles.historyReason}>{item.reason || 'Transaction'}</Text>
                      <Text style={styles.historyDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
                    </View>
                    <View style={styles.historyTop}>
                      <Text style={styles.historyItem}>{item.item_name}</Text>
                      <Text style={[styles.historyItem, { fontWeight: '700', color: item.type === 'in' ? theme.success : theme.error }]}>
                        {item.type === 'in' ? '+' : '-'}{item.quantity}
                      </Text>
                    </View>
                  </View>
                )}
                ListEmptyComponent={<EmptyState icon={History} title="No transaction history" />}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Service Kits Modal */}
      <Modal visible={kitsModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlayFull}>
          <View style={styles.modalCardFull}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Service Kits</Text>
              <AnimatedTouchable onPress={() => setKitsModal(false)} style={styles.closeBtn}>
                <X size={20} color={theme.textSecondary} />
              </AnimatedTouchable>
            </View>
            {kitsLoading ? <PremiumLoader message="Loading kits..." /> : (
              <FlatList
                data={Object.keys(kitsData)}
                keyExtractor={(item) => item}
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <View style={styles.kitCard}>
                    <Text style={styles.kitTitle}>{item}</Text>
                    {(kitsData[item] || []).map((mat, i) => (
                      <Text key={i} style={styles.kitMeta}>• {mat.name} ({mat.default_quantity} {mat.unit})</Text>
                    ))}
                  </View>
                )}
                ListEmptyComponent={<EmptyState icon={Layers} title="No service kits found" />}
              />
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Delete / Archive Confirm */}
      <ConfirmModal
        visible={deleteModal.visible}
        title={deleteModal.isArchived ? 'Restore Item' : 'Archive Item'}
        message={deleteModal.isArchived
          ? `Restore "${deleteModal.itemName}" to active inventory?`
          : `Archive "${deleteModal.itemName}" from inventory? It can be restored later.`
        }
        confirmText={deleteModal.isArchived ? 'Restore' : 'Archive'}
        destructive={!deleteModal.isArchived}
        onConfirm={handleDelete}
        onCancel={() => setDeleteModal({ visible: false, itemId: null, itemName: '', isArchived: false })}
      />
    </SafeAreaView>
  );
};

const getStyles = (theme, insets) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: (insets?.top || 0) + 16, paddingBottom: 16,
    backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerTitle: { ...typography.h2, color: theme.textPrimary },
  headerSub: { ...typography.bodyXSmall, color: theme.textTertiary, marginTop: 2 },
  addBtn: { backgroundColor: theme.gold, padding: 10, borderRadius: borderRadius.md, ...shadows.button },

  // Alert
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.warningBg || 'rgba(245,158,11,0.1)', margin: 16, marginBottom: 0,
    padding: 12, borderRadius: borderRadius.md, borderWidth: 1, borderColor: theme.warning || '#f59e0b',
  },
  alertText: { ...typography.bodySmall, color: theme.warning, fontWeight: '700' },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.surfaceLight, margin: 16, marginBottom: 8,
    borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: theme.border,
  },
  searchInput: { flex: 1, ...typography.body, color: theme.textPrimary },

  // Filters
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  filterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.round, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.borderLight },
  filterPillActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  filterText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '600' },
  filterTextActive: { color: theme.backgroundDeep },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },

  // Item Card
  itemCard: {
    backgroundColor: theme.surface, padding: 16, borderRadius: borderRadius.xl,
    marginBottom: 10, borderWidth: 1, borderColor: theme.borderLight, ...shadows.subtle,
  },
  itemCardLow: { borderLeftWidth: 4, borderLeftColor: theme.warning },
  itemCardOut: { borderLeftWidth: 4, borderLeftColor: theme.error },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  itemTopLeft: { flex: 1, marginRight: 8 },
  itemName: { ...typography.body, fontWeight: '700', color: theme.textPrimary },
  itemCategory: { ...typography.bodyXSmall, color: theme.textTertiary, marginTop: 4 },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stockText: { ...typography.body, fontWeight: '800' },
  itemMeta: { flexDirection: 'row', gap: 16, marginTop: 10 },
  metaText: { ...typography.bodyXSmall, color: theme.textTertiary },
  itemActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  txBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, backgroundColor: theme.surfaceLight, borderRadius: borderRadius.md, borderWidth: 1, borderColor: theme.borderLight },
  txBtnText: { ...typography.bodyXSmall, fontWeight: '700' },
  iconActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 8, borderRadius: borderRadius.md, backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.borderLight },
  editBtn: { },
  delBtn: { },

  // Modal shared
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: theme.surface, borderRadius: borderRadius.xxl, padding: 24, maxHeight: '85%', ...shadows.cardStrong, borderWidth: 1, borderColor: theme.borderLight },
  modalOverlayFull: { flex: 1, backgroundColor: theme.background },
  modalCardFull: { flex: 1, backgroundColor: theme.surface },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingHorizontal: 20, paddingTop: 20 },
  modalTitle: { ...typography.h3, color: theme.textPrimary },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  inputLabel: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: 6 },
  input: {
    backgroundColor: theme.surfaceLight, color: theme.textPrimary,
    padding: 14, borderRadius: borderRadius.md, marginBottom: 12,
    ...typography.body, borderWidth: 1, borderColor: theme.border,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  typeBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: borderRadius.md, backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.borderLight },
  typeBtnActive: { backgroundColor: theme.gold, borderColor: theme.gold },
  typeText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700' },
  typeTextActive: { color: theme.backgroundDeep },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 16, borderRadius: borderRadius.md, backgroundColor: theme.surfaceLight, alignItems: 'center', borderWidth: 1, borderColor: theme.borderLight },
  cancelBtnText: { ...typography.button, color: theme.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 16, borderRadius: borderRadius.md, backgroundColor: theme.gold, alignItems: 'center', ...shadows.button },
  saveBtnText: { ...typography.button, color: theme.backgroundDeep },

  // TX modal
  txItemName: { ...typography.h4, color: theme.gold, marginBottom: 4 },
  txItemStock: { ...typography.bodySmall, color: theme.textSecondary, marginBottom: 16 },

  // Image Picker
  imagePicker: { width: 100, height: 100, borderRadius: borderRadius.xl, backgroundColor: theme.surfaceLight, borderWidth: 1, borderColor: theme.border, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  pickedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderText: { ...typography.bodyXSmall, color: theme.textTertiary, marginTop: 4 },

  actionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  actionGroup: { flexDirection: 'row', gap: 8 },
  iconBtnHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, paddingHorizontal: 12, borderRadius: borderRadius.md, borderWidth: 1, borderColor: theme.borderLight },
  iconBtnText: { ...typography.bodyXSmall, fontWeight: '700', color: theme.textPrimary },

  waterfallDropdown: {
    position: 'absolute', top: 58, left: 16, right: 16, backgroundColor: theme.surface,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: theme.borderLight, ...shadows.cardStrong,
  },
  waterfallItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.borderLight },
  waterfallText: { ...typography.bodySmall, color: theme.textSecondary },

  historyCard: { backgroundColor: theme.surfaceLight, padding: 12, borderRadius: borderRadius.md, marginBottom: 8, borderWidth: 1, borderColor: theme.borderLight },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  historyReason: { ...typography.bodySmall, color: theme.textPrimary, fontWeight: '600' },
  historyDate: { ...typography.bodyXSmall, color: theme.textTertiary },
  historyItem: { ...typography.bodyXSmall, color: theme.textSecondary },
  
  kitCard: { backgroundColor: theme.surfaceLight, padding: 12, borderRadius: borderRadius.md, marginBottom: 8, borderWidth: 1, borderColor: theme.borderLight },
  kitTitle: { ...typography.body, color: theme.textPrimary, fontWeight: '700', marginBottom: 4 },
  kitMeta: { ...typography.bodyXSmall, color: theme.textSecondary },
  sortDropdown: {
    position: 'absolute', top: 44, right: 0, backgroundColor: theme.surface, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: theme.border, ...shadows.cardStrong, zIndex: 100, minWidth: 170,
  },
  sortOption: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: theme.borderLight },
  sortOptionActive: { backgroundColor: theme.surfaceLight },
});
