import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  SafeAreaView, ActivityIndicator, Modal, Platform, Alert, FlatList, RefreshControl, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCustomerAppointments, updateAppointmentStatus, createCheckoutSession } from '../src/utils/api';

const ITEMS_PER_PAGE = 5;

export function CustomerAppointments({ customerId, onBack, onBookNew }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  useEffect(() => {
    if (customerId) fetchAppointments();
  }, [customerId]);

  const fetchAppointments = async () => {
    try {
      if (!refreshing) setLoading(true);
      const response = await getCustomerAppointments(customerId);
      if (response.success) {
        setAppointments(response.appointments || []);
      }
    } catch (error) {
      console.log('Error fetching appointments:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedAppointment) return;
    
    try {
      setPaymentLoading(true);
      const res = await createCheckoutSession(selectedAppointment.id, selectedAppointment.price);
      if (res.success && res.checkoutUrl) {
        await Linking.openURL(res.checkoutUrl);
        setSelectedAppointment(null);
      } else {
        Alert.alert('Payment Error', res.message || 'Could not initiate payment.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to payment gateway.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAppointments();
  };

  const changeMonth = (increment) => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + increment);
    setCurrentMonth(newDate);
  };

  const handleCancel = async (appointmentId) => {
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this appointment?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await updateAppointmentStatus(appointmentId, 'cancelled');
              if (response.success) {
                Alert.alert('Cancelled', 'Your appointment has been cancelled.');
                setSelectedAppointment(null);
                fetchAppointments();
              } else {
                Alert.alert('Error', response.message || 'Failed to cancel appointment.');
              }
            } catch (error) {
              Alert.alert('Error', 'Could not connect to server.');
            }
          }
        }
      ]
    );
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isSelected = selectedDate === dateStr;
      
      const appsOnDay = appointments.filter(a => {
        if (!a.appointment_date) return false;
        const apptDate = typeof a.appointment_date === 'string' ? a.appointment_date.substring(0, 10) : new Date(a.appointment_date).toISOString().split('T')[0];
        return apptDate === dateStr;
      });

      let dotColor = null;
      if (appsOnDay.length > 0) {
        if (appsOnDay.some(a => a.status === 'confirmed')) dotColor = '#10b981';
        else if (appsOnDay.some(a => a.status === 'pending')) dotColor = '#f59e0b';
        else dotColor = '#9ca3af';
      }

      days.push(
        <TouchableOpacity 
          key={i} 
          style={[styles.dayCell, isSelected && styles.selectedDayCell]}
          onPress={() => setSelectedDate(isSelected ? null : dateStr)}
        >
          <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>{i}</Text>
          {dotColor && <View style={[styles.calendarDot, { backgroundColor: dotColor }]} />}
        </TouchableOpacity>
      );
    }
    return days;
  };

  // --- Filter & Pagination Logic ---
  const getFilteredAppointments = () => {
    let filtered = appointments;

    // 1. Status Filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(apt => apt.status && apt.status.toLowerCase() === statusFilter);
    }

    // 2. Date Filter (only for Calendar mode)
    if (viewMode === 'calendar' && selectedDate) {
      filtered = filtered.filter(apt => {
        const apptDate = typeof apt.appointment_date === 'string' ? apt.appointment_date.substring(0, 10) : new Date(apt.appointment_date).toISOString().split('T')[0];
        return apptDate === selectedDate;
      });
    }

    return filtered;
  };

  const allFiltered = getFilteredAppointments();
  const totalPages = Math.ceil(allFiltered.length / ITEMS_PER_PAGE) || 1;
  
  // Paginate only if in List mode
  const displayedAppointments = viewMode === 'list' 
    ? allFiltered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
    : allFiltered;

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, viewMode]);

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'confirmed': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'completed': return '#3b82f6';
      case 'cancelled': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const renderAppointmentItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.appointmentCard}
      onPress={() => setSelectedAppointment(item)}
    >
      <View style={styles.cardLeft}>
        <View style={styles.dateBox}>
          <Text style={styles.dateDay}>{new Date(item.appointment_date).getDate()}</Text>
          <Text style={styles.dateMonth}>
            {new Date(item.appointment_date).toLocaleString('default', { month: 'short' })}
          </Text>
        </View>
      </View>
      <View style={styles.cardCenter}>
        <Text style={styles.serviceText}>{item.design_title || 'Appointment'}</Text>
        <Text style={styles.artistName}>with {item.artist_name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <Text style={styles.timeText}>{item.start_time ? item.start_time.substring(0, 5) : 'TBD'}</Text>
          <Text style={[styles.timeText, { marginLeft: 8, fontWeight: 'bold', color: '#111' }]}>₱{parseFloat(item.price || 0).toLocaleString()}</Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.statusPill, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusPillText, { color: getStatusColor(item.status) }]}>
            {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Pending'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#daa520" style={{ marginTop: 8 }} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>My Appointments</Text>
          <TouchableOpacity onPress={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')} style={styles.headerButton}>
            <Ionicons name={viewMode === 'list' ? 'calendar' : 'list'} size={24} color="#111" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        {['all', 'pending', 'confirmed'].map(filter => (
          <TouchableOpacity 
            key={filter}
            style={[styles.tab, statusFilter === filter && styles.activeTab]} 
            onPress={() => setStatusFilter(filter)}
          >
            <Text style={[styles.tabText, statusFilter === filter && styles.activeTabText]}>
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={{ paddingBottom: 100, paddingTop: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {viewMode === 'calendar' && (
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthButton}>
                <Ionicons name="chevron-back" size={20} color="#374151" />
              </TouchableOpacity>
              <Text style={styles.monthText}>
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthButton}>
                <Ionicons name="chevron-forward" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
            <View style={styles.weekRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <Text key={index} style={styles.weekDayText}>{day}</Text>
              ))}
            </View>
            <View style={styles.daysGrid}>
              {renderCalendar()}
            </View>
            {selectedDate && (
              <TouchableOpacity onPress={() => setSelectedDate(null)} style={styles.clearDateButton}>
                <Text style={styles.clearDateText}>Clear Date Filter</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#daa520" style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.listContainer}>
            {displayedAppointments.length > 0 ? (
              displayedAppointments.map((item) => renderAppointmentItem({ item }))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>No appointments found.</Text>
                <TouchableOpacity style={styles.bookButton} onPress={onBookNew}>
                  <Text style={styles.bookButtonText}>Book New Appointment</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Pagination Controls (Only in List Mode) */}
        {viewMode === 'list' && allFiltered.length > 0 && (
          <View style={styles.paginationContainer}>
            <TouchableOpacity 
              style={[styles.pageButton, currentPage === 1 && styles.disabledButton]}
              onPress={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? "#9ca3af" : "#1f2937"} />
            </TouchableOpacity>
            
            <Text style={styles.pageInfo}>Page {currentPage} of {totalPages}</Text>
            
            <TouchableOpacity 
              style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]}
              onPress={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              <Ionicons name="chevron-forward" size={20} color={currentPage === totalPages ? "#9ca3af" : "#1f2937"} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button for New Booking */}
      <TouchableOpacity style={styles.fab} onPress={onBookNew}>
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>

      {/* Details Modal */}
      <Modal
        visible={!!selectedAppointment}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedAppointment(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Appointment Details</Text>
              <TouchableOpacity onPress={() => setSelectedAppointment(null)}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            
            {selectedAppointment && (
              <ScrollView>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedAppointment.status) + '20', alignSelf: 'flex-start' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(selectedAppointment.status) }]}>
                      {selectedAppointment.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Payment Status</Text>
                  <View style={[styles.statusBadge, { backgroundColor: selectedAppointment.payment_status === 'paid' ? '#dcfce7' : '#fef3c7', alignSelf: 'flex-start' }]}>
                    <Text style={[styles.statusText, { color: selectedAppointment.payment_status === 'paid' ? '#059669' : '#b45309' }]}>
                      {(selectedAppointment.payment_status || 'unpaid').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date & Time</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedAppointment.appointment_date).toLocaleDateString()} at {selectedAppointment.start_time}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Artist</Text>
                  <Text style={styles.detailValue}>{selectedAppointment.artist_name}</Text>
                  <Text style={styles.detailSubValue}>{selectedAppointment.studio_name}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Price</Text>
                  <Text style={[styles.detailValue, { color: '#b45309', fontWeight: 'bold' }]}>₱{parseFloat(selectedAppointment.price || 0).toLocaleString()}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Service / Design</Text>
                  <Text style={styles.detailValue}>{selectedAppointment.design_title}</Text>
                </View>

                {selectedAppointment.notes && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.detailValue}>{selectedAppointment.notes}</Text>
                  </View>
                )}
              </ScrollView>
            )}

            {(selectedAppointment?.status === 'pending' || selectedAppointment?.status === 'confirmed' || selectedAppointment?.status === 'pending_schedule' || selectedAppointment?.status === 'completed') && selectedAppointment?.payment_status !== 'paid' && (
              <TouchableOpacity 
                style={[styles.closeButton, { backgroundColor: '#daa520', marginBottom: 10 }]} 
                onPress={handlePayment}
                disabled={paymentLoading}
              >
                {paymentLoading ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={[styles.closeButtonText, { color: 'white' }]}>Pay Now (₱{parseFloat(selectedAppointment?.price || 0).toLocaleString()})</Text>
                )}
              </TouchableOpacity>
            )}

            {(selectedAppointment?.status === 'pending' || selectedAppointment?.status === 'confirmed' || selectedAppointment?.status === 'pending_schedule') && (
              <TouchableOpacity 
                style={[styles.closeButton, { backgroundColor: '#fee2e2', marginBottom: 10 }]} 
                onPress={() => handleCancel(selectedAppointment.id)}
              >
                <Text style={[styles.closeButtonText, { color: '#ef4444' }]}>Cancel Appointment</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={() => setSelectedAppointment(null)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    padding: 20, paddingTop: Platform.OS === 'android' ? 50 : 20,
    backgroundColor: 'white',
    borderBottomWidth: 1, 
    borderBottomColor: '#f3f4f6',
  },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#111' },
  headerButton: { padding: 8 },
  
  // Tabs
  tabsContainer: { flexDirection: 'row', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 20, marginHorizontal: 4, backgroundColor: '#f3f4f6' },
  activeTab: { backgroundColor: '#111' },
  tabText: { color: '#6b7280', fontWeight: '600' },
  activeTabText: { color: 'white' },

  content: { flex: 1, paddingHorizontal: 16 },
  
  // Calendar Styles
  calendarContainer: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2 },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  monthButton: { padding: 8 },
  monthText: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  weekDayText: { width: '14.28%', textAlign: 'center', fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 20, marginBottom: 4 },
  selectedDayCell: { backgroundColor: '#daa520' },
  dayText: { fontSize: 14, color: '#374151' },
  selectedDayText: { color: 'white', fontWeight: 'bold' },
  calendarDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearDateButton: { marginTop: 12, alignItems: 'center', padding: 8 },
  clearDateText: { color: '#daa520', fontSize: 14, fontWeight: '600' },

  // New List Card Styles
  listContainer: { paddingBottom: 10 },
  appointmentCard: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 },
  cardLeft: { marginRight: 12, justifyContent: 'center' },
  dateBox: { alignItems: 'center', backgroundColor: '#fef3c7', padding: 8, borderRadius: 8, width: 50 },
  dateDay: { fontSize: 18, fontWeight: 'bold', color: '#b45309' },
  dateMonth: { fontSize: 12, color: '#b45309', textTransform: 'uppercase' },
  cardCenter: { flex: 1, justifyContent: 'center' },
  serviceText: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
  artistName: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  timeText: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  cardRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusPillText: { fontSize: 10, fontWeight: 'bold', textTransform: 'capitalize' },

  // Pagination
  paginationContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginBottom: 40 },
  pageButton: { padding: 8, borderRadius: 8, backgroundColor: '#f3f4f6' },
  disabledButton: { opacity: 0.5 },
  pageInfo: { fontSize: 14, color: '#6b7280' },

  emptyState: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#9ca3af', fontSize: 16, marginTop: 10, marginBottom: 20 },
  bookButton: { backgroundColor: '#daa520', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  bookButtonText: { color: 'white', fontWeight: 'bold' },

  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#daa520', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 16, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  detailRow: { marginBottom: 16 },
  detailLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' },
  detailValue: { fontSize: 16, color: '#111', fontWeight: '500' },
  detailSubValue: { fontSize: 14, color: '#6b7280' },
  closeButton: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  closeButtonText: { color: '#374151', fontWeight: 'bold' },
});