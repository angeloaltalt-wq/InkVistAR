import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  ScrollView, SafeAreaView, Image, Alert, ActivityIndicator 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { API_URL } from '../src/config';

export function ArtistActiveSession({ appointment, onBack, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(appointment?.status || 'confirmed');
  const [sessionData, setSessionData] = useState({
    notes: appointment?.notes || '',
    beforePhoto: null,
    afterPhoto: null
  });

  const [sessionMaterials, setSessionMaterials] = useState([]);
  const [sessionCost, setSessionCost] = useState(0);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [addingMaterial, setAddingMaterial] = useState(false);

  useEffect(() => {
    fetchInventory();
    if (status === 'in_progress') {
      fetchSessionMaterials();
    }
  }, [appointment?.id, status]);

  const fetchInventory = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/inventory`);
      const data = await response.json();
      if (data.success && data.inventory) {
        // Find top items or just grab the first few things like gloves, caps for quick add
        setInventoryItems(data.inventory.filter(item => item.current_stock > 0));
      }
    } catch (e) { console.error('Error fetching inventory', e); }
  };

  const fetchSessionMaterials = async () => {
    if (!appointment?.id) return;
    try {
      const response = await fetch(`${API_URL}/api/appointments/${appointment.id}/materials`);
      const data = await response.json();
      if (data.success) {
        setSessionMaterials(data.materials || []);
        setSessionCost(data.totalCost || 0);
      }
    } catch (e) { console.error('Error fetching materials', e); }
  };

  const handleQuickAdd = async (inventoryId, quantity = 1) => {
    setAddingMaterial(true);
    try {
      const response = await fetch(`${API_URL}/api/appointments/${appointment.id}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory_id: inventoryId, quantity })
      });
      const data = await response.json();
      if (data.success) {
        fetchSessionMaterials();
      } else {
        Alert.alert('Error', data.message || 'Failed to add material. Check stock.');
      }
    } catch (e) {
      Alert.alert('Error', 'Connection failed');
    } finally {
      setAddingMaterial(false);
    }
  };

  const pickImage = async (type) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need access to your photos to upload.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      setSessionData(prev => ({ 
        ...prev, 
        [type]: `data:image/jpeg;base64,${result.assets[0].base64}` 
      }));
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/appointments/${appointment.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await response.json();
      if (data.success) {
        setStatus(newStatus);
        
        if (newStatus === 'completed') {
          // Alert artist of the cost of the session
          Alert.alert(
            'Session Completed',
            `Session finished! Total material cost: ₱${sessionCost.toLocaleString()}.\nThis cost has been recorded.`,
            [{ text: 'OK', onPress: () => { onComplete && onComplete(); } }]
          );
        } else if (newStatus === 'in_progress') {
          // Give the backend a second to load the kit, then fetch materials
          setTimeout(fetchSessionMaterials, 1000);
        }
      } else {
        Alert.alert('Error', 'Failed to update status');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!appointment?.id) return;
    setLoading(true);
    try {
      // Materials are tracked dynamically now, so just save notes
      const response = await fetch(`${API_URL}/api/appointments/${appointment.id}/details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: combinedNotes,
          beforePhoto: sessionData.beforePhoto,
          afterPhoto: sessionData.afterPhoto
        })
      });
      
      const data = await response.json();
      if (data.success) {
        Alert.alert('Success', 'Session details saved successfully!');
      } else {
        Alert.alert('Error', 'Failed to save details');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Connection failed');
    } finally {
      setLoading(false);
    }
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
            <Text style={styles.headerTitle}>Active Session</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.clientOverview}>
            <Text style={styles.clientName}>{appointment?.client_name}</Text>
            <Text style={styles.designTitle}>{appointment?.design_title}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Text style={{ color: 'white', opacity: 0.8, fontSize: 13 }}>₱{parseFloat(appointment?.price || 0).toLocaleString()}</Text>
                <Text style={{ 
                    color: appointment?.payment_status === 'paid' ? '#4ade80' : '#fbbf24', 
                    fontSize: 13, 
                    fontWeight: 'bold' 
                }}>
                    {(appointment?.payment_status || 'unpaid').toUpperCase()}
                </Text>
            </View>
            <View style={[styles.statusBadge, styles[status]]}>
              <Text style={styles.statusText}>{status.toUpperCase()}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Action Buttons */}
          <View style={styles.actionSection}>
            {status === 'confirmed' && (
              <TouchableOpacity 
                style={[styles.primaryButton, styles.startButton]}
                onPress={() => handleUpdateStatus('in_progress')}
                disabled={loading}
              >
                <Ionicons name="play" size={20} color="white" />
                <Text style={styles.buttonText}>Start Session</Text>
              </TouchableOpacity>
            )}
            {status === 'in_progress' && (
              <TouchableOpacity 
                style={[styles.primaryButton, styles.completeButton]}
                onPress={() => handleUpdateStatus('completed')}
                disabled={loading}
              >
                <Ionicons name="checkmark-circle" size={20} color="white" />
                <Text style={styles.buttonText}>Complete Session</Text>
              </TouchableOpacity>
            )}
            {loading && <ActivityIndicator color="#daa520" style={{ marginTop: 10 }} />}
          </View>

          {/* Photo Section */}
          <Text style={styles.sectionTitle}>Session Media</Text>
          <View style={styles.photoGrid}>
            <TouchableOpacity style={styles.photoBox} onPress={() => pickImage('beforePhoto')}>
              {sessionData.beforePhoto ? (
                <Image source={{ uri: sessionData.beforePhoto }} style={styles.uploadedPhoto} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={32} color="#9ca3af" />
                  <Text style={styles.photoLabel}>Before Photo</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoBox} onPress={() => pickImage('afterPhoto')}>
              {sessionData.afterPhoto ? (
                <Image source={{ uri: sessionData.afterPhoto }} style={styles.uploadedPhoto} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={32} color="#9ca3af" />
                  <Text style={styles.photoLabel}>After Photo</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Advanced Session Materials */}
          {status === 'in_progress' && (
            <>
              <Text style={styles.sectionTitle}>Session Materials (Cost: ₱{sessionCost.toLocaleString()})</Text>
              
              {/* Used Materials List */}
              <View style={styles.inputCard}>
                {sessionMaterials.length === 0 ? (
                  <Text style={{ color: '#6b7280', fontStyle: 'italic', marginBottom: 15 }}>No materials logged for this session.</Text>
                ) : (
                  <View style={{ marginBottom: 15 }}>
                    {sessionMaterials.map((mat) => (
                      <View key={mat.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
                        <Text style={{ color: '#1f2937', fontWeight: '500' }}>{mat.item_name}</Text>
                        <Text style={{ color: '#6b7280' }}>{mat.quantity} {mat.unit}</Text>
                      </View>
                    ))}
                  </View>
                )}
                
                {/* Quick Add Buttons */}
                <Text style={{ color: '#1f2937', fontWeight: 'bold', marginBottom: 10 }}>Quick Add Item (+1)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row' }}>
                  {inventoryItems.slice(0, 8).map(item => (
                    <TouchableOpacity 
                      key={item.id}
                      style={{ 
                        backgroundColor: '#f3f4f6', 
                        paddingHorizontal: 16, 
                        paddingVertical: 10, 
                        borderRadius: 20, 
                        marginRight: 10,
                        borderWidth: 1,
                        borderColor: '#d1d5db'
                      }}
                      onPress={() => handleQuickAdd(item.id, 1)}
                      disabled={addingMaterial}
                    >
                      <Text style={{ color: '#374151', fontSize: 13, fontWeight: '600' }}>{item.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {inventoryItems.length === 0 && <Text style={{ color: '#9ca3af' }}>No stock available</Text>}
                </ScrollView>
                {addingMaterial && <ActivityIndicator size="small" color="#daa520" style={{ marginTop: 10 }} />}
              </View>
            </>
          )}

          {/* Notes */}
          <Text style={styles.sectionTitle}>Session Notes</Text>
          <View style={styles.inputCard}>
            <View style={styles.inputGroup}>
              <TextInput
                style={[styles.input, styles.textArea, { marginBottom: 0 }]}
                placeholder="Record session details, skin reaction, etc..."
                value={sessionData.notes}
                onChangeText={(text) => setSessionData(prev => ({...prev, notes: text}))}
                multiline
                numberOfLines={4}
              />
            </View>

            <TouchableOpacity 
              style={styles.saveButton}
              onPress={handleSaveDetails}
              disabled={loading}
            >
              <LinearGradient
                colors={['#000000', '#daa520']}
                style={styles.saveButtonGradient}
              >
                <Ionicons name="save-outline" size={20} color="white" />
                <Text style={styles.saveButtonText}>Save Details</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
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
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  clientOverview: {
    alignItems: 'center',
    marginBottom: 10,
  },
  clientName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4,
  },
  designTitle: {
    fontSize: 16,
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  confirmed: { backgroundColor: '#3b82f6' },
  in_progress: { backgroundColor: '#daa520' },
  completed: { backgroundColor: '#10b981' },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  content: { padding: 20 },
  actionSection: {
    marginBottom: 30,
    alignItems: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  startButton: { backgroundColor: '#000000' },
  completeButton: { backgroundColor: '#10b981' },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 15,
  },
  photoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  photoBox: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  uploadedPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    alignItems: 'center',
  },
  photoLabel: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  inputCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    marginTop: 10,
  },
  saveButtonGradient: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
