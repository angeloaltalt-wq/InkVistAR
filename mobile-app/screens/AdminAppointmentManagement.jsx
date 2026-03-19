import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, TextInput, Modal, ScrollView, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAllAppointmentsForAdmin, updateAppointmentByAdmin, deleteAppointmentByAdmin } from '../src/utils/api';

export const AdminAppointmentManagement = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, confirmed, completed
  const [search, setSearch] = useState('');
  
  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPrice, setEditPrice] = useState('');

  const loadData = async () => {
    setLoading(true);
    const result = await getAllAppointmentsForAdmin();
    if (result.success) {
      setAppointments(result.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openModal = (appt) => {
    setSelectedAppt(appt);
    setEditDate(new Date(appt.appointment_date).toISOString().split('T')[0]);
    setEditTime(appt.start_time);
    setEditStatus(appt.status);
    setEditPrice(appt.price?.toString() || '0');
    setModalVisible(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedAppt) return;

    const result = await updateAppointmentByAdmin(selectedAppt.id, {
      status: editStatus,
      date: editDate,
      startTime: editTime,
      price: parseFloat(editPrice) || 0
    });

    if (result.success) {
      Alert.alert('Success', 'Appointment updated');
      setModalVisible(false);
      loadData();
    } else {
      Alert.alert('Error', result.message || 'Failed to update');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Appointment',
      'Are you sure you want to delete this appointment? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            const result = await deleteAppointmentByAdmin(selectedAppt.id);
            if (result.success) {
              setModalVisible(false);
              loadData();
            } else {
              Alert.alert('Error', 'Failed to delete');
            }
          } 
        },
      ]
    );
  };

  const filteredData = appointments.filter(a => {
    const matchesFilter = filter === 'all' || a.status === filter;
    const matchesSearch = search === '' || 
      (a.client_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.artist_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.design_title || '').toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getStatusColor = (status) => {
    switch(status) {
      case 'confirmed': return '#059669';
      case 'completed': return '#3b82f6';
      case 'cancelled': return '#dc2626';
      default: return '#d97706';
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => openModal(item)}>
      <View style={styles.cardHeader}>
        <Text style={styles.date}>{new Date(item.appointment_date).toDateString()}</Text>
        <TouchableOpacity>
          <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
          </View>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>{item.design_title || 'Tattoo Session'}</Text>
      <View style={styles.row}>
        <Ionicons name="person" size={14} color="#9ca3af" />
        <Text style={styles.detail}>Client: {item.client_name}</Text>
      </View>
      <View style={styles.row}>
        <Ionicons name="brush" size={14} color="#9ca3af" />
        <Text style={styles.detail}>Artist: {item.artist_name}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Appointments</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search client, artist, or design..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.filterRow}>
        {['all', 'pending', 'confirmed', 'completed'].map(f => (
          <TouchableOpacity 
            key={f} 
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredData}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} tintColor="#f59e0b" />}
      />

      {/* Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Appointment</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {selectedAppt && (
              <ScrollView>
                <View style={styles.infoSection}>
                  <Text style={styles.label}>Client</Text>
                  <Text style={styles.value}>{selectedAppt.client_name} ({selectedAppt.client_email})</Text>
                  
                  <Text style={styles.label}>Artist</Text>
                  <Text style={styles.value}>{selectedAppt.artist_name}</Text>

                  <Text style={styles.label}>Design</Text>
                  <Text style={styles.value}>{selectedAppt.design_title}</Text>

                  <Text style={styles.label}>Notes</Text>
                  <Text style={styles.value}>{selectedAppt.notes || 'No notes'}</Text>
                </View>

                <Text style={styles.sectionHeader}>Edit Details</Text>
                
                <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                <TextInput style={styles.input} value={editDate} onChangeText={setEditDate} />

                <Text style={styles.inputLabel}>Time (HH:MM:SS)</Text>
                <TextInput style={styles.input} value={editTime} onChangeText={setEditTime} />

                <Text style={styles.inputLabel}>Price (₱)</Text>
                <TextInput 
                  style={styles.input} 
                  value={editPrice} 
                  onChangeText={setEditPrice} 
                  keyboardType="numeric"
                  placeholder="0"
                />

                <Text style={styles.inputLabel}>Status</Text>
                <View style={styles.statusRow}>
                  {['pending', 'confirmed', 'completed', 'cancelled'].map(s => (
                    <TouchableOpacity 
                      key={s} 
                      style={[styles.statusBtn, editStatus === s && { backgroundColor: getStatusColor(s) }]}
                      onPress={() => setEditStatus(s)}
                    >
                      <Text style={[styles.statusBtnText, editStatus === s && { color: 'white' }]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                    <Ionicons name="trash-outline" size={20} color="white" />
                    <Text style={styles.btnText}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveChanges}>
                    <Ionicons name="save-outline" size={20} color="white" />
                    <Text style={styles.btnText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: '#1f2937' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#374151', margin: 15, marginBottom: 5, borderRadius: 10, paddingHorizontal: 10 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, height: 50, color: 'white' },
  filterRow: { flexDirection: 'row', padding: 15, gap: 10 },
  filterBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#374151' },
  filterBtnActive: { backgroundColor: '#f59e0b' },
  filterText: { color: '#9ca3af', fontSize: 12 },
  filterTextActive: { color: 'white', fontWeight: 'bold' },
  list: { padding: 15 },
  card: { backgroundColor: '#1f2937', padding: 15, borderRadius: 12, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  date: { color: '#f59e0b', fontWeight: 'bold' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: '#4b5563' },
  badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  title: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  detail: { color: '#d1d5db', marginLeft: 8, fontSize: 14 },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1f2937', borderRadius: 16, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  infoSection: { marginBottom: 20, backgroundColor: '#374151', padding: 15, borderRadius: 10 },
  label: { color: '#9ca3af', fontSize: 12, marginBottom: 2 },
  value: { color: 'white', fontSize: 16, marginBottom: 12, fontWeight: '500' },
  sectionHeader: { color: '#f59e0b', fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 10 },
  inputLabel: { color: '#9ca3af', marginBottom: 5 },
  input: { backgroundColor: '#374151', color: 'white', padding: 12, borderRadius: 8, marginBottom: 15 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statusBtn: { padding: 10, borderRadius: 8, backgroundColor: '#374151', minWidth: '45%', alignItems: 'center' },
  statusBtnText: { color: '#9ca3af', fontWeight: 'bold' },
  actionButtons: { flexDirection: 'row', gap: 15, marginTop: 10 },
  deleteBtn: { flex: 1, backgroundColor: '#dc2626', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveBtn: { flex: 1, backgroundColor: '#059669', padding: 15, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnText: { color: 'white', fontWeight: 'bold' }
});