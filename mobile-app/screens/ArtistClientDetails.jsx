import { useState, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, 
  ScrollView, SafeAreaView, Image, ActivityIndicator, Alert, Linking 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fetchAPI } from '../src/utils/api';

export function ArtistClientDetails({ route, onBack }) {
  const { client, session } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);
  const [appointments, setAppointments] = useState([]);

  // Determine IDs and display info based on whether we came from Client List or Session List
  const targetId = client?.id || session?.customer_id;
  const displayClientName = client?.name || session?.client_name || 'Client Name';
  const displayClientEmail = client?.email || session?.client_email || 'email@example.com';

  useEffect(() => {
    if (targetId) {
      fetchClientFullDetails(targetId);
    }
  }, [targetId]);

  const fetchClientFullDetails = async (id) => {
    try {
      setLoading(true);
      // Fetch customer profile
      const profileResult = await fetchAPI(`/customer/profile/${id}`);
      if (profileResult.success) {
        setDetails(profileResult.profile);
      }

      // Fetch client appointments with this artist
      // Assuming we might need a specific endpoint or just filter all appointments
      // สำหรับตอนนี้ใช้ข้อมูลที่มีอยู่
      setLoading(false);
    } catch (error) {
      console.error('Error fetching client details:', error);
      setLoading(false);
    }
  };

  const handleCall = () => {
    if (details?.phone || client?.phone) {
      Linking.openURL(`tel:${details?.phone || client?.phone}`);
    } else {
      Alert.alert('Not Available', 'No phone number provided for this client.');
    }
  };

  const handleEmail = () => {
    Linking.openURL(`mailto:${client?.email}`);
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
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#ffffff" />
          </TouchableOpacity>
          
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {client?.name ? client.name.charAt(0).toUpperCase() : '?'}
                </Text>
              </View>
              <View style={styles.statusDot} />
            </View>
            <Text style={styles.clientName}>{displayClientName}</Text>
            <Text style={styles.clientEmail}>{displayClientEmail}</Text>
            
            <View style={styles.quickActions}>
              <TouchableOpacity style={styles.quickActionButton} onPress={handleCall}>
                <Ionicons name="call" size={20} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionButton} onPress={handleEmail}>
                <Ionicons name="mail" size={20} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionButton}>
                <Ionicons name="chatbubble-ellipses" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Session Details Section (Visible if navigated from Schedule/Today's Sessions) */}
          {session && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Session Details</Text>
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Ionicons name="pricetag" size={20} color="#daa520" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Session Price</Text>
                    <Text style={styles.infoText}>₱{session.price ? Number(session.price).toLocaleString() : '0'}</Text>
                  </View>
                </View>
                
                <View style={styles.infoRow}>
                  <View style={styles.infoIcon}>
                    <Ionicons name="time" size={20} color="#daa520" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Time</Text>
                    <Text style={styles.infoText}>{session.start_time} - {session.appointment_date}</Text>
                  </View>
                </View>

                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <View style={styles.infoIcon}>
                    <Ionicons name="document-text" size={20} color="#daa520" />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>Design</Text>
                    <Text style={styles.infoText}>{session.design_title}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{details?.appointment_count || client?.appointment_count || 0}</Text>
              <Text style={styles.statLabel}>Total Sessions</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>₱{(details?.total_spent || client?.total_spent || 0).toLocaleString()}</Text>
              <Text style={styles.statLabel}>Total Paid</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="call-outline" size={20} color="#daa520" />
                </View>
                <View>
                  <Text style={styles.infoLabel}>Phone Number</Text>
                  <Text style={styles.infoText}>{details?.phone || client?.phone || 'Not provided'}</Text>
                </View>
              </View>
              
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons name="location-outline" size={20} color="#daa520" />
                </View>
                <View>
                  <Text style={styles.infoLabel}>Location</Text>
                  <Text style={styles.infoText}>{details?.location || 'Not provided'}</Text>
                </View>
              </View>

              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <View style={styles.infoIcon}>
                  <Ionicons name="calendar-outline" size={20} color="#daa520" />
                </View>
                <View>
                  <Text style={styles.infoLabel}>Member Since</Text>
                  <Text style={styles.infoText}>
                    {client?.created_at ? new Date(client.created_at).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Client Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>
                {details?.notes || 'No specific notes recorded for this client yet. Notes help in providing personalized service during tattoo sessions.'}
              </Text>
              <TouchableOpacity style={styles.editNotesButton}>
                <Text style={styles.editNotesText}>Edit Notes</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.bookButton} onPress={() => Alert.alert('Action', 'Initialize new appointment for this client.')}>
            <LinearGradient
              colors={['#000000', '#daa520']}
              style={styles.bookButtonGradient}
            >
              <Ionicons name="calendar" size={20} color="#ffffff" />
              <Text style={styles.bookButtonText}>Create New Appointment</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scrollView: { flex: 1 },
  header: {
    padding: 24,
    paddingTop: 60,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    marginTop: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#daa520',
  },
  statusDot: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: '#000',
  },
  clientName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  clientEmail: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.8,
    marginBottom: 20,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 16,
  },
  quickActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
    marginTop: -40,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  infoLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  infoText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  notesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  notesText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4b5563',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  editNotesButton: {
    alignSelf: 'flex-end',
  },
  editNotesText: {
    fontSize: 14,
    color: '#daa520',
    fontWeight: '600',
  },
  bookButton: {
    marginTop: 10,
  },
  bookButtonGradient: {
    flexDirection: 'row',
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#daa520',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  bookButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
});
