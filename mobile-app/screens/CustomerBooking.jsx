import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  TextInput, 
  ActivityIndicator, 
  Alert, 
  Platform,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

// Use the consistent production API URL to prevent connection errors.
const API_URL = 'https://inkvistar-api.onrender.com';

export function CustomerBooking({ customerId, onBack }) {
  const [loading, setLoading] = useState(false);
  const [artists, setArtists] = useState([]);
  
  // Form State
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [designTitle, setDesignTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [bookedDates, setBookedDates] = useState({});
  const [image, setImage] = useState(null);

  // Load Artists on mount
  useEffect(() => {
    fetchArtists();
  }, []);

  const fetchArtists = async () => {
    try {
      const response = await fetch(`${API_URL}/api/customer/artists`);
      const data = await response.json();
      if (data.success) {
        setArtists(data.artists);
      }
    } catch (error) {
      console.log('Error fetching artists:', error);
      // Fallback mock data if server fails (for demo purposes)
      setArtists([
        { id: 1, name: 'Mike Chen', studio_name: 'Ink Masters', specialization: 'Realism', hourly_rate: 150 },
        { id: 2, name: 'Sarah Jones', studio_name: 'Art & Soul', specialization: 'Traditional', hourly_rate: 120 },
      ]);
    }
  };

  // Load Availability when artist changes
  useEffect(() => {
    if (selectedArtist) {
      fetchAvailability(selectedArtist.id);
    }
  }, [selectedArtist, currentMonth]);

  const fetchAvailability = async (artistId) => {
    try {
      const response = await fetch(`${API_URL}/api/artist/${artistId}/availability`);
      const data = await response.json();
      if (data.success) {
        const bookings = {};
        data.bookings.forEach(b => {
          // Handle date string directly to avoid timezone shifts
          const dateStr = typeof b.appointment_date === 'string' 
            ? b.appointment_date.substring(0, 10) 
            : new Date(b.appointment_date).toISOString().split('T')[0];
            
          if (!bookings[dateStr]) bookings[dateStr] = { count: 0 };
          bookings[dateStr].count += 1;
        });
        setBookedDates(bookings);
      }
    } catch (error) {
      console.log('Error fetching availability:', error);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
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
      // Prepend the necessary data URI scheme for the backend to process the base64 string
      setImage('data:image/jpeg;base64,' + result.assets[0].base64);
    }
  };

  const removeImage = () => {
    setImage(null);
  };

  // Determine if time picker should be shown based on service type
  const showTimePicker = designTitle !== 'Tattoo Session';

  const handleBook = async () => {
    if (!selectedArtist || !selectedDate || !designTitle) {
      Alert.alert('Missing Information', 'Please fill in all fields marked with *');
      return;
    }

    // Only require time for non-Tattoo Session types
    if (showTimePicker && !selectedTime) {
      Alert.alert('Missing Information', 'Please select a time slot.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/customer/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          artistId: selectedArtist.id,
          date: selectedDate,
          startTime: showTimePicker ? selectedTime : null,
          endTime: showTimePicker ? selectedTime : null,
          designTitle,
          notes,
          referenceImage: image
        })
      });

      const result = await response.json();
      
      if (result.success) {
        Alert.alert('Booking Successful', 'Your appointment request has been sent to the artist.', [
          { text: 'OK', onPress: onBack }
        ]);
      } else {
        Alert.alert('Booking Failed', result.message || 'Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to server.');
    } finally {
      setLoading(false);
    }
  };

  // Calendar Logic
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const days = [];
    
    // Empty slots
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateObj = new Date(year, month, i);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isSelected = selectedDate === dateStr;
      const isPast = dateObj < today;

      const dateData = bookedDates[dateStr] || { count: 0 };
      const isFull = dateData.count >= 3; // Assume 3 slots max per day for now
      const isBusy = dateData.count > 0;

      let statusColor = '#10b981'; // Green (Available)
      if (isFull) statusColor = '#ef4444'; // Red (Full)
      else if (isBusy) statusColor = '#f59e0b'; // Orange (Busy)
      
      days.push(
        <TouchableOpacity 
          key={i} 
          style={[
            styles.dayCell, 
            isSelected && styles.selectedDayCell,
            (isPast || isFull) && styles.disabledDayCell
          ]}
          disabled={isPast || isFull}
          onPress={() => setSelectedDate(dateStr)}
        >
          <Text style={[
            styles.dayText, 
            isSelected && styles.selectedDayText,
            (isPast || isFull) && styles.disabledDayText
          ]}>{i}</Text>
          {!isPast && (
            <View style={[styles.availabilityDot, { backgroundColor: statusColor }]} />
          )}
        </TouchableOpacity>
      );
    }
    return days;
  };

  const timeSlots = [
    { label: '1:00 PM', value: '13:00' },
    { label: '2:00 PM', value: '14:00' },
    { label: '3:00 PM', value: '15:00' },
    { label: '4:00 PM', value: '16:00' },
    { label: '5:00 PM', value: '17:00' },
    { label: '6:00 PM', value: '18:00' },
    { label: '7:00 PM', value: '19:00' },
    { label: '8:00 PM', value: '20:00' }
  ];

  const serviceTypes = ['Tattoo Session', 'Consultation', 'Piercing', 'Touch-up', 'Aftercare Check'];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Appointment</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {/* 1. Select Artist */}
        <Text style={styles.sectionTitle}>1. Select Artist *</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.artistList}>
          {artists.map((artist) => (
            <TouchableOpacity 
              key={artist.id} 
              style={[
                styles.artistCard, 
                selectedArtist?.id === artist.id && styles.selectedArtistCard
              ]}
              onPress={() => setSelectedArtist(artist)}
            >
              <View style={styles.artistAvatar}>
                <Text style={styles.artistInitials}>{artist.name.charAt(0)}</Text>
              </View>
              <Text style={styles.artistName}>{artist.name}</Text>
              <Text style={styles.artistStudio}>{artist.studio_name}</Text>
              <Text style={styles.artistRate}>${artist.hourly_rate}/hr</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 2. Select Date */}
        <Text style={styles.sectionTitle}>2. Select Date *</Text>
        <View style={styles.calendarContainer}>
          {/* Calendar Header */}
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthButton}>
              <Ionicons name="chevron-back" size={20} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.monthText}>
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthButton}>
              <Ionicons name="chevron-forward" size={20} color="#374151" />
            </TouchableOpacity>
          </View>

          {/* Weekday Headers */}
          <View style={styles.weekRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
              <Text key={index} style={styles.weekDayText}>{day}</Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.daysGrid}>
            {renderCalendar()}
          </View>

          {/* Legend */}
          <View style={styles.legendContainer}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#10b981' }]} /><Text style={styles.legendText}>Available</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} /><Text style={styles.legendText}>Busy</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} /><Text style={styles.legendText}>Full</Text></View>
          </View>
        </View>

        {/* 3. Service Type (moved before time so conditional visibility works) */}
        <Text style={styles.sectionTitle}>3. Service Type *</Text>
        <View style={styles.timeGrid}>
          {serviceTypes.map((type) => (
            <TouchableOpacity 
              key={type} 
              style={[
                styles.timeChip, 
                designTitle === type && styles.selectedTimeChip,
                { width: '48%' }
              ]}
              onPress={() => {
                setDesignTitle(type);
                // Clear time selection when switching to Tattoo Session
                if (type === 'Tattoo Session') {
                  setSelectedTime('');
                }
              }}
            >
              <Text style={[styles.timeText, designTitle === type && styles.selectedTimeText]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 4. Select Time — conditional on service type */}
        {showTimePicker ? (
          <>
            <Text style={styles.sectionTitle}>4. Select Time *</Text>
            <View style={styles.timeGrid}>
              {timeSlots.map((slot) => (
                <TouchableOpacity 
                  key={slot.value} 
                  style={[
                    styles.timeChip, 
                    selectedTime === slot.value && styles.selectedTimeChip
                  ]}
                  onPress={() => setSelectedTime(slot.value)}
                >
                  <Text style={[styles.timeText, selectedTime === slot.value && styles.selectedTimeText]}>
                    {slot.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : designTitle === 'Tattoo Session' ? (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#b8860b" />
            <Text style={styles.infoBoxText}>
              Time will be scheduled after artist reviews your booking request.
            </Text>
          </View>
        ) : null}

        {/* 5. Description & Notes */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description & Notes</Text>
          <TextInput 
            style={[styles.input, styles.textArea]} 
            placeholder="Describe size, placement, style..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Reference Image Picker */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Reference Image (Optional)</Text>
          {image ? (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: image }} style={styles.previewImage} />
              <TouchableOpacity onPress={removeImage} style={styles.removeImageButton}>
                <Ionicons name="trash-outline" size={20} color="white" />
                <Text style={styles.removeImageText}>Remove Image</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
              <View style={styles.imagePickerPlaceholder}>
                <Ionicons name="camera-outline" size={32} color="#9ca3af" />
                <Text style={styles.imagePickerText}>Tap to attach an image</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity 
          style={[styles.bookButton, loading && styles.disabledButton]} 
          onPress={handleBook}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.bookButtonText}>Request Appointment</Text>
          )}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    paddingTop: Platform.OS === 'android' ? 40 : 16
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  content: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#374151', marginTop: 20, marginBottom: 12 },
  
  artistList: { flexDirection: 'row', marginBottom: 8 },
  artistCard: {
    width: 120, padding: 12, backgroundColor: 'white', borderRadius: 12, marginRight: 12,
    alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2
  },
  selectedArtistCard: { borderColor: '#daa520', backgroundColor: '#fffdf5' },
  artistAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8
  },
  artistInitials: { fontSize: 18, fontWeight: 'bold', color: '#6b7280' },
  artistName: { fontSize: 14, fontWeight: '600', color: '#111', textAlign: 'center' },
  artistStudio: { fontSize: 12, color: '#6b7280', textAlign: 'center', marginBottom: 4 },
  artistRate: { fontSize: 12, fontWeight: 'bold', color: '#daa520' },

  calendarContainer: {
    backgroundColor: 'white', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8
  },
  calendarHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16
  },
  monthButton: { padding: 8 },
  monthText: { fontSize: 16, fontWeight: 'bold', color: '#111' },
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
  disabledDayCell: { opacity: 0.3 },
  disabledDayText: { color: '#9ca3af' },
  availabilityDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  legendContainer: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#6b7280' },

  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    width: '23%', paddingVertical: 10, backgroundColor: 'white', borderRadius: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb'
  },
  selectedTimeChip: { backgroundColor: '#daa520', borderColor: '#daa520' },
  timeText: { fontSize: 14, color: '#374151' },
  selectedTimeText: { color: 'white', fontWeight: 'bold' },

  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#4b5563', marginBottom: 6 },
  input: {
    backgroundColor: 'white', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 12, fontSize: 16, color: '#111'
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  imagePicker: {
    height: 150,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  imagePickerPlaceholder: {
    alignItems: 'center',
  },
  imagePickerText: {
    color: '#6b7280',
    marginTop: 8,
  },
  imagePreviewContainer: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  previewImage: { width: '100%', height: 200, resizeMode: 'cover' },
  removeImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ef4444',
    padding: 12,
  },
  removeImageText: { color: 'white', fontWeight: 'bold', marginLeft: 8 },

  bookButton: {
    backgroundColor: '#daa520', padding: 16, borderRadius: 12, alignItems: 'center',
    marginTop: 24, shadowColor: '#daa520', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
  },
  disabledButton: { opacity: 0.7 },
  bookButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  infoBoxText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
});