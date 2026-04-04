import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAdminInventory, createAdminInventory, updateAdminInventory, deleteAdminInventory } from '../src/utils/api';

export const AdminInventory = ({ navigation }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    category: 'ink',
    currentStock: '0',
    unit: 'pcs',
    cost: '0',
    retailPrice: '0',
    minStock: '5',
    maxStock: '100',
  });

  const loadInventory = async () => {
    setLoading(true);
    const result = await getAdminInventory();
    if (result.success && result.data) {
      setItems(result.data.filter(item => item.is_deleted === 0));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const openModal = (item = null) => {
    if (item) {
      setSelectedItem(item);
      setFormData({
        name: item.name,
        category: item.category,
        currentStock: item.current_stock.toString(),
        unit: item.unit,
        cost: item.cost.toString(),
        retailPrice: (item.retail_price || 0).toString(),
        minStock: (item.min_stock || 0).toString(),
        maxStock: (item.max_stock || 0).toString(),
      });
    } else {
      setSelectedItem(null);
      setFormData({
        name: '', category: 'ink', currentStock: '0', unit: 'pcs',
        cost: '0', retailPrice: '0', minStock: '5', maxStock: '100',
      });
    }
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    
    setIsSaving(true);
    const payload = {
      ...formData,
      currentStock: Number(formData.currentStock) || 0,
      cost: Number(formData.cost) || 0,
      retailPrice: Number(formData.retailPrice) || 0,
      minStock: Number(formData.minStock) || 0,
      maxStock: Number(formData.maxStock) || 0,
    };

    let result;
    if (selectedItem) {
      result = await updateAdminInventory(selectedItem.id, payload);
    } else {
      result = await createAdminInventory(payload);
    }

    if (result.success) {
      Alert.alert('Success', 'Inventory updated successfully');
      setModalVisible(false);
      loadInventory();
    } else {
      Alert.alert('Error', result.message || 'Failed to save');
    }
    setIsSaving(false);
  };

  const handleDelete = () => {
    if (!selectedItem) return;
    Alert.alert('Details', 'Are you sure you want to delete this item?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setIsSaving(true);
        const result = await deleteAdminInventory(selectedItem.id);
        if (result.success) {
          setModalVisible(false);
          loadInventory();
        } else {
          Alert.alert('Error', 'Failed to delete');
        }
        setIsSaving(false);
      }}
    ]);
  };

  const getStatus = (current, min) => {
    if (current === 0) return { label: 'OUT', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)' };
    if (current <= min) return { label: 'LOW', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' };
    return { label: 'GOOD', color: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' };
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Ionicons name="cube" size={24} color="#ec4899" style={{ marginRight: 10 }} />
          <Text style={styles.headerTitle}>Inventory</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => openModal()}>
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#ec4899" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.map(item => {
            const status = getStatus(item.current_stock, item.min_stock);
            return (
              <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => openModal(item)}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemStock}>Stock: {item.current_stock} {item.unit} (Min: {item.min_stock})</Text>
                  <Text style={styles.itemStock}>Cost: ₱{item.cost}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#6b7280" style={{marginLeft: 10}} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedItem ? 'Edit Item' : 'Add Item'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: '80%' }}>
              <Text style={styles.inputLabel}>Item Name</Text>
              <TextInput style={styles.input} value={formData.name} onChangeText={(text) => setFormData({...formData, name: text})} />

              <Text style={styles.inputLabel}>Category</Text>
              <TextInput style={styles.input} value={formData.category} onChangeText={(text) => setFormData({...formData, category: text})} />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 5 }}>
                  <Text style={styles.inputLabel}>Current Stock</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.currentStock} onChangeText={(text) => setFormData({...formData, currentStock: text})} />
                </View>
                <View style={{ flex: 1, marginLeft: 5 }}>
                  <Text style={styles.inputLabel}>Unit (e.g. pcs, oz)</Text>
                  <TextInput style={styles.input} value={formData.unit} onChangeText={(text) => setFormData({...formData, unit: text})} />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 5 }}>
                  <Text style={styles.inputLabel}>Cost</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.cost} onChangeText={(text) => setFormData({...formData, cost: text})} />
                </View>
                <View style={{ flex: 1, marginLeft: 5 }}>
                  <Text style={styles.inputLabel}>Retail Price</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.retailPrice} onChangeText={(text) => setFormData({...formData, retailPrice: text})} />
                </View>
              </View>

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 5 }}>
                  <Text style={styles.inputLabel}>Low Stock Alert At</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.minStock} onChangeText={(text) => setFormData({...formData, minStock: text})} />
                </View>
                <View style={{ flex: 1, marginLeft: 5 }}>
                  <Text style={styles.inputLabel}>Max Capacity</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={formData.maxStock} onChangeText={(text) => setFormData({...formData, maxStock: text})} />
                </View>
              </View>

              <View style={styles.actionButtons}>
                {selectedItem && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={isSaving}>
                    <Ionicons name="trash-outline" size={20} color="white" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.saveBtn, selectedItem && {flex: 1}]} onPress={handleSave} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Save Item</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 50, backgroundColor: '#1f2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  backButton: { padding: 8 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  addButton: { padding: 8 },
  content: { padding: 20 },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', padding: 16, borderRadius: 12, marginBottom: 12 },
  itemInfo: { flex: 1 },
  itemName: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  itemStock: { color: '#9ca3af', fontSize: 14 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1f2937', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  inputLabel: { color: '#9ca3af', marginBottom: 5, fontSize: 14 },
  input: { backgroundColor: '#374151', color: 'white', padding: 12, borderRadius: 8, marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  actionButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  deleteBtn: { backgroundColor: '#dc2626', padding: 15, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  saveBtn: { flex: 1, backgroundColor: '#ec4899', padding: 15, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
