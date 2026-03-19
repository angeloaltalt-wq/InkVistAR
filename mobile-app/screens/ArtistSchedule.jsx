import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getArtistAppointments, updateAppointmentStatus, createArtistAppointment, updateAppointmentDetails } from '../src/utils/api';

export function ArtistSchedule({ onBack, artistId, navigation }) {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' = Oldest first, 'desc' = Newest first
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);
  
  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTime, setNewTime] = useState('10:00');
  const [newDesign, setNewDesign] = useState('');

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'today', label: 'Today' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'pending', label: 'Pending' },
    { id: 'completed', label: 'Finished' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  useEffect(() => {
    loadAppointments();
  }, [artistId]);

  const loadAppointments = async () => {
    if (!artistId) return;
    setLoading(true);
    const result = await getArtistAppointments(artistId);
    if (result.success) {
      console.log('📅 Appointments loaded:', result.appointments?.length);
      setAppointments(result.appointments || []);
    }
    setLoading(false);
  };

  const handleStatusUpdate = async (id, newStatus) => {
    const result = await updateAppointmentStatus(id, newStatus);
    if (result.success) {
      loadAppointments();
    } else {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleAddAppointment = async () => {
    if (!newClientEmail || !newDate || !newTime) {
      Alert.alert('Missing Fields', 'Please fill in all required fields');
      return;
    }

    const result = await createArtistAppointment({
      artistId,
      clientEmail: newClientEmail,
      date: newDate,
      startTime: newTime,
      designTitle: newDesign || 'Consultation'
    });

    if (result.success) {
      Alert.alert('Success', 'Appointment scheduled!');
      setModalVisible(false);
      loadAppointments();
    } else {
      Alert.alert('Error', result.message || 'Failed to schedule');
    }
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth(now);
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    if (selectedFilter === 'today') setSelectedFilter('all');
  };

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + 10);
  };

  // Calendar Logic
  const changeMonth = (increment) => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + increment);
    setCurrentMonth(newDate);
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    
    const days = [];
    
    // Empty slots
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Days
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
        if (appsOnDay.some(a => a.status === 'confirmed')) dotColor = '#b8860b';
        else if (appsOnDay.some(a => a.status === 'pending')) dotColor = '#ef4444';
        else dotColor = '#9ca3af';
      }

      days.push(
        <TouchableOpacity 
          key={i} 
          style={[styles.dayCell, isSelected && styles.selectedDayCell]}
          onPress={() => {
            setSelectedDate(isSelected ? null : dateStr);
            if (selectedFilter === 'today') setSelectedFilter('all');
          }}
        >
          <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>{i}</Text>
          {dotColor && <View style={[styles.calendarDot, { backgroundColor: dotColor }]} />}
        </TouchableOpacity>
      );
    }
    return days;
  };

  // Filter appointments based on selected tab
  const filteredAppointments = appointments.filter(apt => {
    if (selectedFilter === 'today') {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      return apt.appointment_date && apt.appointment_date.startsWith(todayStr);
    }

    if (selectedDate && (!apt.appointment_date || !apt.appointment_date.startsWith(selectedDate))) {
      return false;
    }

    if (selectedFilter === 'all') return true;
    const status = apt.status ? apt.status.toLowerCase() : 'pending';
    
    if (selectedFilter === 'upcoming') return status === 'confirmed';
    if (selectedFilter === 'pending') return status === 'pending';
    if (selectedFilter === 'completed') return status === 'completed';
    if (selectedFilter === 'cancelled') return status === 'cancelled';
    
    return true;
  }).sort((a, b) => {
    const getDateObj = (dateStr, timeStr) => {
      const d = new Date(dateStr);
      if (timeStr) {
        const [hours, minutes] = timeStr.split(':');
        d.setHours(parseInt(hours || 0, 10), parseInt(minutes || 0, 10), 0, 0);
      }
      return d;
    };

    const dateA = getDateObj(a.appointment_date, a.start_time);
    const dateB = getDateObj(b.appointment_date, b.start_time);
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });

  const toggleSort = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
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
            <Text style={styles.headerTitle}>My Schedule</Text>
            {/* <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setModalVisible(true)}
            >
              <Ionicons name="add" size={24} color="#ffffff" />
            </TouchableOpacity> */}
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBadge}>
              <Ionicons name="calendar" size={16} color="#ffffff" />
              <Text style={styles.statBadgeText}>{appointments.length} Total</Text>
            </View>
            <View style={styles.statBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
              <Text style={styles.statBadgeText}>{appointments.filter(a => a.status === 'confirmed').length} Confirmed</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.sortButton} onPress={toggleSort}>
              <Ionicons name={sortOrder === 'asc' ? "arrow-up" : "arrow-down"} size={16} color="#6b7280" />
              <Text style={styles.sortButtonText}>Date: {sortOrder === 'asc' ? 'Oldest' : 'Newest'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContainer}
          >
            {filters.map((filter) => (
              <TouchableOpacity
                key={filter.id}
                onPress={() => {
                  if (filter.id === 'today') {
                    const now = new Date();
                    setCurrentMonth(now); // Refresh calendar to current month
                    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    setSelectedDate(dateStr); // Mark yellow
                    setSelectedFilter('today');
                  } else {
                    setSelectedFilter(filter.id);
                    setSelectedDate(null);
                  }
                  setVisibleCount(10); // Reset pagination on filter change
                }}
                style={[
                  styles.filterButton,
                  selectedFilter === filter.id && styles.filterButtonActive
                ]}
              >
                <Text style={[
                  styles.filterText,
                  selectedFilter === filter.id && styles.filterTextActive
                ]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Calendar View */}
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

          {loading && <ActivityIndicator size="large" color="#daa520" />}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Appointments</Text>
            {filteredAppointments.length === 0 && (
              <Text style={{ color: '#999', fontStyle: 'italic', marginTop: 10 }}>No appointments found for this filter.</Text>
            )}
            {filteredAppointments.slice(0, visibleCount).map((apt) => (
              <TouchableOpacity 
                key={apt.id} 
                style={styles.appointmentCard}
                onPress={() => setSelectedAppointment(apt)}
              >
                <View style={styles.appointmentHeader}>
                  <View style={styles.appointmentTime}>
                    <Ionicons name="time" size={20} color="#daa520" />
                    <Text style={styles.timeText}>
                      {apt.start_time}
                    </Text>
                    <View style={styles.dateBadge}>
                      <Text style={styles.dateText}>
                        {new Date(apt.appointment_date).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    apt.status === 'confirmed' ? styles.statusConfirmed : 
                    apt.status === 'completed' ? styles.statusCompleted :
                    apt.status === 'cancelled' ? styles.statusCancelled :
                    styles.statusPending
                  ]}>
                    <Text style={[
                      styles.statusText,
                      apt.status === 'confirmed' ? styles.statusTextConfirmed : 
                      apt.status === 'completed' ? styles.statusTextCompleted :
                      apt.status === 'cancelled' ? styles.statusTextCancelled :
                      styles.statusTextPending
                    ]}>
                      {apt.status ? apt.status.charAt(0).toUpperCase() + apt.status.slice(1) : 'Pending'}
                    </Text>
                  </View>
                </View>

                <View style={styles.appointmentDetails}>
                  <View style={styles.clientInfo}>
                    <View style={styles.clientAvatar}>
                      <Ionicons name="person" size={20} color="#6b7280" />
                    </View>
                    <View style={styles.clientDetails}>
                      <Text style={styles.clientName}>{apt.client_name}</Text>
                      <Text style={styles.appointmentType}>{apt.design_title || 'Consultation'}</Text>
                    </View>
                  </View>
                  <View style={styles.durationBadge}>
                    <Ionicons name="time-outline" size={14} color="#6b7280" />
                    <Text style={styles.durationText}>1h</Text>
                  </View>
                </View>

                {/* Added Price and Payment Status below client info */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                  <Text style={{ fontWeight: 'bold', color: '#111827' }}>₱{parseFloat(apt.price || 0).toLocaleString()}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ 
                      width: 8, 
                      height: 8, 
                      borderRadius: 4, 
                      backgroundColor: apt.payment_status === 'paid' ? '#10b981' : (apt.payment_status === 'pending' ? '#f59e0b' : '#9ca3af'),
                      marginRight: 4
                    }} />
                    <Text style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', fontWeight: '600' }}>
                      {apt.payment_status || 'unpaid'}
                    </Text>
                  </View>
                </View>

                <View style={styles.appointmentActions}>
                  {(apt.status === 'confirmed' || apt.status === 'in_progress') && (
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.actionButtonPrimary]}
                      onPress={() => navigation.navigate('artist-active-session', { appointment: apt })}
                    >
                      <Ionicons name="play-circle" size={18} color="#ffffff" />
                      <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary]}>Manage Session</Text>
                    </TouchableOpacity>
                  )}
                  {/* {apt.status === 'confirmed' && (
                    <TouchableOpacity 
                      style={[styles.actionButton, { backgroundColor: '#059669', borderColor: '#059669' }]}
                      onPress={() => handleStatusUpdate(apt.id, 'completed')}
                    >
                      <Text style={[styles.actionButtonText, { color: '#fff' }]}>Mark Complete</Text>
                    </TouchableOpacity>
                  )} */}
                </View>
              </TouchableOpacity>
            ))}
            {visibleCount < filteredAppointments.length && (
              <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                <Text style={styles.loadMoreText}>Load More</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* <TouchableOpacity 
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <LinearGradient
          colors={['#000000', '#daa520']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fabGradient}
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </LinearGradient>
      </TouchableOpacity> */}

      {/* Add Appointment Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Appointment</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.label}>Client Email</Text>
            <TextInput 
              style={styles.input} 
              placeholder="client@email.com" 
              value={newClientEmail}
              onChangeText={setNewClientEmail}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
            <TextInput 
              style={styles.input} 
              placeholder="2024-01-30" 
              value={newDate}
              onChangeText={setNewDate}
            />

            <Text style={styles.label}>Time (HH:MM)</Text>
            <TextInput 
              style={styles.input} 
              placeholder="14:00" 
              value={newTime}
              onChangeText={setNewTime}
            />

            <Text style={styles.label}>Design / Type</Text>
            <TextInput 
              style={styles.input} 
              placeholder="Sleeve (Session 1/4), Touch-up..." 
              value={newDesign}
              onChangeText={setNewDesign}
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleAddAppointment}>
              <Text style={styles.saveButtonText}>Schedule</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Appointment Details Modal */}
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
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            
            {selectedAppointment && (
              <ScrollView>
                <Text style={styles.label}>Client</Text>
                <Text style={styles.value}>{selectedAppointment.client_name}</Text>
                <Text style={styles.subValue}>{selectedAppointment.client_email}</Text>

                <Text style={styles.label}>Date & Time</Text>
                <Text style={styles.value}>{new Date(selectedAppointment.appointment_date).toDateString()} at {selectedAppointment.start_time}</Text>

                <Text style={styles.label}>Service</Text>
                <Text style={styles.value}>{selectedAppointment.design_title}</Text>

                <Text style={styles.label}>Price</Text>
                <Text style={[styles.value, { fontWeight: 'bold' }]}>₱{parseFloat(selectedAppointment.price || 0).toLocaleString()}</Text>

                <Text style={styles.label}>Status</Text>
                <Text style={[styles.value, {color: '#daa520', fontWeight: 'bold'}]}>{selectedAppointment.status.toUpperCase()}</Text>

                <Text style={styles.label}>Payment Status</Text>
                <Text style={[styles.value, { 
                    color: selectedAppointment.payment_status === 'paid' ? '#16a34a' : 
                           selectedAppointment.payment_status === 'pending' ? '#b45309' : '#6b7280', 
                    fontWeight: 'bold' 
                }]}>
                    {(selectedAppointment.payment_status || 'unpaid').toUpperCase()}
                </Text>

                {selectedAppointment.notes && (
                  <>
                    <Text style={styles.label}>Notes</Text>
                    <Text style={styles.value}>{selectedAppointment.notes}</Text>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statBadgeText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 80,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
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
  filtersContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterButtonActive: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  filterText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  calendarContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  monthButton: { padding: 4 },
  monthText: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  todayButton: { backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  todayButtonText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  weekDayText: { width: '14.28%', textAlign: 'center', fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center',
    borderRadius: 20, marginBottom: 4
  },
  selectedDayCell: { backgroundColor: '#daa520' },
  dayText: { fontSize: 14, color: '#374151' },
  selectedDayText: { color: 'white', fontWeight: 'bold' },
  calendarDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearDateButton: {
    marginTop: 12,
    alignItems: 'center',
    padding: 8,
  },
  clearDateText: {
    color: '#daa520',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  appointmentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  appointmentTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  dateBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusConfirmed: {
    backgroundColor: '#fef3c7',
  },
  statusPending: {
    backgroundColor: '#fee2e2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextConfirmed: {
    color: '#b8860b',
  },
  statusTextPending: {
    color: '#dc2626',
  },
  statusCompleted: {
    backgroundColor: '#d1fae5',
  },
  statusTextCompleted: {
    color: '#059669',
  },
  statusCancelled: {
    backgroundColor: '#f3f4f6',
  },
  statusTextCancelled: {
    color: '#6b7280',
  },
  appointmentDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  clientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  clientDetails: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  appointmentType: {
    fontSize: 14,
    color: '#6b7280',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  durationText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  appointmentActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  actionButtonPrimary: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  actionButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '600',
  },
  actionButtonTextPrimary: {
    color: '#ffffff',
  },
  loadMoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#333' },
  value: { fontSize: 16, color: '#111', marginBottom: 12 },
  subValue: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
