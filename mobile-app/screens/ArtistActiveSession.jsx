/**
 * ArtistActiveSession.jsx -- Live Tattoo Session Manager (Gilded Noir v2)
 * Theme-aware, animated, haptic feedback. Materials tracking, photos, notes, status transitions.
 */
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Keyboard,
  ScrollView, SafeAreaView, Image, ActivityIndicator, Modal, TouchableOpacity, Platform, Dimensions
} from 'react-native';
import {
  ArrowLeft, Play, CheckCircle2, Camera, Package, Palette,
  XCircle, Briefcase, Zap, Plus, Save, Clock, ChevronUp, ShieldAlert, X
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { typography } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { API_BASE_URL, API_URL } from '../src/utils/api';

export function ArtistActiveSession({ appointment, onBack, onComplete }) {
  const { theme: colors, hapticsEnabled } = useTheme();
  const styles = getStyles(colors);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(appointment?.status || 'confirmed');
  const [sessionData, setSessionData] = useState({ notes: appointment?.notes || '', beforePhoto: null, afterPhoto: null });
  const [sessionMaterials, setSessionMaterials] = useState([]);
  const [sessionCost, setSessionCost] = useState(0);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [serviceKits, setServiceKits] = useState({});
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [alertModal, setAlertModal] = useState({ visible: false, title: '', message: '', onDismiss: null });
  const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [trackerVisible, setTrackerVisible] = useState(false);
  const [medicalNotes, setMedicalNotes] = useState(null);
  const [draftImage, setDraftImage] = useState(null);
  const [refImage, setRefImage] = useState(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef(null);
  const notesYRef = useRef(0);
  const [fullscreenImage, setFullscreenImage] = useState(null);

  useEffect(() => { 
    fetchInventory(); 
    fetchServiceKits(); 
    fetchCustomerHealth();
    fetchSessionImages();
    if (status === 'in_progress') fetchSessionMaterials(); 
  }, [appointment?.id, status]);

  // Keyboard visibility tracking (for extra bottom padding)
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const scrollToNotes = () => {
    // When user focuses on notes, wait for keyboard to appear then scroll the view up
    setTimeout(() => {
      if (notesYRef.current && notesYRef.current.measureInWindow) {
        notesYRef.current.measureInWindow((x, y) => {
          // If the notes section is in the bottom half of the screen (behind keyboard),
          // scroll the ScrollView up by that amount
          const screenH = Dimensions.get('window').height;
          const visibleH = screenH * 0.45; // area above the keyboard
          if (y > visibleH) {
            const currentOffset = y - visibleH + 60;
            scrollViewRef.current?.scrollTo({ y: currentOffset, animated: true });
          }
        });
      } else {
        // Fallback: just scroll to end
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    }, 400);
  };

  const fetchCustomerHealth = async () => {
    if (!appointment?.customer_id) return;
    try {
      // Primary: fetch profile which has the 'notes' column
      const r = await (await fetch(`${API_URL}/customer/profile/${appointment.customer_id}`)).json();
      if (r.success && r.profile?.notes) {
        try {
          const parsed = JSON.parse(r.profile.notes);
          if (parsed.medicalNotes) {
            setMedicalNotes(parsed.medicalNotes);
            return;
          } else if (parsed.allergies || parsed.skinConditions) {
            setMedicalNotes(parsed);
            return;
          }
        } catch (e) { /* notes is plain text, not medical JSON */ }
      }
      // Fallback: try the dashboard endpoint which may also return medicalNotes
      const d = await (await fetch(`${API_URL}/customer/${appointment.customer_id}/dashboard`)).json();
      if (d.success && d.customer?.medicalNotes) {
        setMedicalNotes(d.customer.medicalNotes);
      }
    } catch (e) { console.error('Error fetching customer health:', e); }
  };

  const fetchSessionImages = async () => {
    if (!appointment?.id) return;
    try {
      // Primary: dedicated details endpoint (may not be deployed yet)
      const r = await (await fetch(`${API_URL}/appointments/${appointment.id}/details`)).json();
      if (r.success && r.appointment) {
        if (r.appointment.draft_image) setDraftImage(r.appointment.draft_image);
        if (r.appointment.reference_image) setRefImage(r.appointment.reference_image);
        return;
      }
    } catch (e) { /* endpoint may not exist yet on production */ }

    // Fallback 1: Re-fetch from artist appointments list (includes ap.*)
    try {
      if (appointment?.artist_id) {
        const r2 = await (await fetch(`${API_URL}/artist/${appointment.artist_id}/appointments`)).json();
        if (r2.success && r2.appointments) {
          const match = r2.appointments.find(a => a.id === appointment.id);
          if (match) {
            if (match.draft_image) setDraftImage(match.draft_image);
            if (match.reference_image) setRefImage(match.reference_image);
            return;
          }
        }
      }
    } catch (e) { /* fallback failed too */ }

    // Fallback 2: from passed props (usually truncated but worth trying)
    if (appointment?.draft_image) setDraftImage(appointment.draft_image);
    if (appointment?.reference_image) setRefImage(appointment.reference_image);
  };

  // Timer logic
  useEffect(() => {
    let interval;
    if (status === 'in_progress') {
      interval = setInterval(() => setElapsedSeconds(p => p + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  const formatTime = (totalSecs) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const fetchInventory = async () => { try { const r = await (await fetch(`${API_URL}/admin/inventory`)).json(); if (r.success && r.data) setInventoryItems(r.data.filter(i => i.current_stock > 0)); } catch (e) { console.error(e); } };
  const fetchServiceKits = async () => { try { const r = await (await fetch(`${API_URL}/admin/service-kits`)).json(); if (r.success) setServiceKits(r.data || {}); } catch (e) { console.error(e); } };
  const fetchSessionMaterials = async () => { if (!appointment?.id) return; try { const r = await (await fetch(`${API_URL}/appointments/${appointment.id}/materials`)).json(); if (r.success) { setSessionMaterials(r.materials || []); setSessionCost(r.totalCost || 0); } } catch (e) { console.error(e); } };

  const showAlert = (title, message, onDismiss) => setAlertModal({ visible: true, title, message, onDismiss });

  const handleQuickAdd = async (inventoryId, quantity = 1) => {
    setAddingMaterial(true);
    try { const r = await (await fetch(`${API_URL}/appointments/${appointment.id}/materials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inventory_id: inventoryId, quantity }) })).json(); if (r.success) fetchSessionMaterials(); else showAlert('Error', r.message || 'Failed. Check stock.'); }
    catch (e) { showAlert('Error', 'Connection failed'); } finally { setAddingMaterial(false); }
  };

  const handleQuickAddKit = async (kitItems) => {
    if (!appointment?.id || !kitItems?.length) return;
    setAddingMaterial(true);
    try { for (const item of kitItems) await fetch(`${API_URL}/appointments/${appointment.id}/materials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inventory_id: item.inventory_id, quantity: item.default_quantity }) }); fetchSessionMaterials(); showAlert('Kit Added', 'All items added.'); }
    catch (e) { showAlert('Error', 'Failed to add kit.'); } finally { setAddingMaterial(false); }
  };

  const handleReleaseMaterial = (materialId) => {
    if (!appointment?.id || !materialId) return;
    setConfirmModal({
      visible: true, title: 'Return to Stock', message: 'Return this item to inventory?',
      onConfirm: async () => {
        try { const r = await (await fetch(`${API_URL}/appointments/${appointment.id}/release-material`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialId: Number(materialId) }) })).json(); r.success ? showAlert('Success', 'Returned.') : showAlert('Error', r.message || 'Failed.'); }
        catch (e) { showAlert('Error', 'Connection failed'); } finally { fetchSessionMaterials(); }
      },
    });
  };

  const pickImage = async (type) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert('Permission Denied', 'Photo access is required.'); return; }
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, quality: 0.5, base64: true });
    if (!result.canceled) setSessionData(p => ({ ...p, [type]: `data:image/jpeg;base64,${result.assets[0].base64}` }));
  };

  const processStatusUpdate = async (newStatus, isFullyComplete = true) => {
    setLoading(true);
    try {
      if (newStatus === 'completed' && (sessionData.notes || sessionData.beforePhoto || sessionData.afterPhoto)) {
        await fetch(`${API_URL}/appointments/${appointment.id}/details`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: sessionData.notes, beforePhoto: sessionData.beforePhoto, afterPhoto: sessionData.afterPhoto })
        });
      }

      const r = await (await fetch(`${API_URL}/appointments/${appointment.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, isFullyComplete })
      })).json();

      if (r.success) {
        setStatus(newStatus);
        if (newStatus === 'completed') showAlert('Session Completed', `Session marked as complete. Total material cost: P${sessionCost.toLocaleString()}.`, () => onComplete?.());
        else if (newStatus === 'in_progress') setTimeout(fetchSessionMaterials, 1000);
      } else showAlert('Error', r.message || 'Failed to update status');
    } catch (e) { showAlert('Error', 'Connection failed'); } finally { setLoading(false); }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (newStatus === 'in_progress') {
      if (!sessionData.beforePhoto) {
        showAlert('Before Photo Required', 'Please upload a "Before" photo documenting the client\'s current state before starting.');
        return;
      }
    }

    if (newStatus === 'completed') {
      if (!sessionData.beforePhoto) {
        showAlert('Validation Error', 'Please upload a "Before" photo documenting the client\'s state before the procedure.');
        return;
      }
      if (!sessionData.afterPhoto) {
        showAlert('Validation Error', 'Please upload an "After" photo documenting the completed work.');
        return;
      }
      if (!sessionData.notes || sessionData.notes.trim().length < 10) {
        showAlert('Validation Error', 'Please provide at least 10 characters of procedure notes before completing.');
        return;
      }
      if (sessionMaterials.length === 0) {
        showAlert('Validation Error', 'Please log the supplies and materials consumed during this session.');
        return;
      }

      const materialsList = sessionMaterials.map(m => `${m.quantity}x ${m.item_name}`).join(', ');
      setConfirmModal({
        visible: true,
        title: 'Session Completion Status',
        message: `Does this piece need another session, or is the tattoo fully complete?\n\nStuff Used: ${materialsList || 'None'}\n(Total material cost: P${sessionCost.toLocaleString()})`,
        confirmText: 'Fully Complete',
        cancelText: 'Needs Another',
        onConfirm: () => processStatusUpdate('completed', true),
        onCancel: () => processStatusUpdate('completed', false)
      });
      return;
    }

    await processStatusUpdate(newStatus, true);
  };

  const handleSaveDetails = async () => {
    if (!appointment?.id) return;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const r = await (await fetch(`${API_URL}/appointments/${appointment.id}/details`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: sessionData.notes, beforePhoto: sessionData.beforePhoto, afterPhoto: sessionData.afterPhoto }) })).json();
      r.success ? showAlert('Success', 'Session details saved!') : showAlert('Error', 'Failed to save.');
    } catch (e) { showAlert('Error', 'Connection failed'); } finally { setLoading(false); }
  };

  const getStatusBg = (s) => { switch (s) { case 'confirmed': return colors.info; case 'in_progress': return colors.gold; case 'completed': return colors.success; default: return colors.textTertiary; } };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: keyboardVisible ? 340 : 0 }}>
        {/* Header */}
        <View style={styles.header}>
          <AnimatedTouchable onPress={onBack} style={styles.backBtn}><ArrowLeft size={20} color={colors.textPrimary} /></AnimatedTouchable>
          <Text style={styles.headerTitle}>Active Session</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Client Overview Card */}
        <View style={styles.clientCard}>
          <View style={styles.goldStripe} />
          <View style={styles.clientOverview}>
            <Text style={styles.clientName}>{appointment?.client_name}</Text>
            <Text style={styles.designTitle}>{appointment?.design_title}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>P{parseFloat(appointment?.price || 0).toLocaleString()}</Text>
              <Text style={{ color: appointment?.payment_status === 'paid' ? colors.success : colors.warning, fontSize: 13, fontWeight: '700' }}>{(appointment?.payment_status || 'unpaid').toUpperCase()}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusBg(status) }]}><Text style={styles.statusText}>{status.toUpperCase()}</Text></View>
          </View>
        </View>

        <View style={styles.content}>
          {/* Action Buttons & Timer */}
          <View style={styles.actionSection}>
            {status === 'confirmed' && (
              <AnimatedTouchable style={[styles.actionBtn, { backgroundColor: colors.gold }]} onPress={() => handleUpdateStatus('in_progress')} disabled={loading}>
                <View style={{ marginRight: 10 }}><Play size={18} color={colors.backgroundDeep} /></View>
                <Text style={[styles.actionBtnText, { color: colors.backgroundDeep }]}>Start Session</Text>
              </AnimatedTouchable>
            )}

            {status === 'in_progress' && (
              <View style={styles.timerContainer}>
                <View style={styles.statusRing}>
                  <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
                  <Text style={styles.timerLabel}>SESSION DURATION</Text>
                </View>
                <AnimatedTouchable style={[styles.actionBtn, { backgroundColor: colors.success, marginTop: 24 }]} onPress={() => handleUpdateStatus('completed')} disabled={loading}>
                  <View style={{ marginRight: 10 }}><CheckCircle2 size={18} color="#ffffff" /></View>
                  <Text style={styles.actionBtnText}>Complete Session</Text>
                </AnimatedTouchable>
              </View>
            )}

            {status === 'completed' && (
              <View style={styles.timerContainer}>
                <View style={[styles.statusRing, { borderColor: colors.success }]}>
                  <Text style={[styles.timerText, { color: colors.success }]}>{formatTime(elapsedSeconds)}</Text>
                  <Text style={styles.timerLabel}>FINAL DURATION</Text>
                </View>
              </View>
            )}

            {loading && <ActivityIndicator color={colors.gold} style={{ marginTop: 10 }} />}
          </View>

          {/* Health & Safety Banner */}
          {medicalNotes && (
            <View style={styles.medicalBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <ShieldAlert size={18} color={colors.error} style={{ marginRight: 6 }} />
                <Text style={styles.medicalBannerTitle}>Client Medical Alerts</Text>
              </View>
              {medicalNotes.allergies ? (
                <Text style={styles.medicalText}><Text style={{ fontWeight: '700' }}>Allergies:</Text> {medicalNotes.allergies}</Text>
              ) : null}
              {medicalNotes.skinConditions ? (
                <Text style={styles.medicalText}><Text style={{ fontWeight: '700' }}>Skin Conditions:</Text> {medicalNotes.skinConditions}</Text>
              ) : null}
            </View>
          )}

          {/* Reference & Draft Images */}
          {(draftImage || refImage) && (
            <View style={{ marginBottom: 24 }}>
              <Text style={styles.sectionTitle}>Reference Artwork</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {draftImage && (
                  <TouchableOpacity style={styles.artworkBox} onPress={() => setFullscreenImage({ uri: draftImage, label: 'Approved Draft' })} activeOpacity={0.85}>
                    <Image source={{ uri: draftImage }} style={styles.artworkImage} />
                    <Text style={styles.artworkLabel}>Approved Draft</Text>
                  </TouchableOpacity>
                )}
                {refImage && (
                  <TouchableOpacity style={styles.artworkBox} onPress={() => setFullscreenImage({ uri: refImage, label: 'Reference Image' })} activeOpacity={0.85}>
                    <Image source={{ uri: refImage }} style={styles.artworkImage} />
                    <Text style={styles.artworkLabel}>Reference Image</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          )}

          {/* Photos */}
          <Text style={styles.sectionTitle}>Session Media</Text>
          <View style={styles.photoGrid}>
            {['beforePhoto', 'afterPhoto'].map(type => (
              <TouchableOpacity key={type} style={styles.photoBox} onPress={() => pickImage(type)} activeOpacity={0.8}>
                {sessionData[type] ? <Image source={{ uri: sessionData[type] }} style={styles.uploadedPhoto} /> : (
                  <View style={styles.photoPlaceholder}><Camera size={28} color={colors.textTertiary} /><Text style={styles.photoLabel}>{type === 'beforePhoto' ? 'Before Photo' : 'After Photo'}</Text></View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Materials Button */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={styles.sectionTitle}>Session Materials</Text>
            <View style={styles.costBadge}><Text style={styles.costBadgeText}>P{sessionCost.toLocaleString()}</Text></View>
          </View>
          <AnimatedTouchable style={styles.trackerBtn} onPress={() => setTrackerVisible(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Package size={20} color={colors.gold} />
              <Text style={styles.trackerBtnText}>{sessionMaterials.length} Items Tracked</Text>
            </View>
            <ChevronUp size={20} color={colors.textTertiary} />
          </AnimatedTouchable>

          {/* Notes */}
          <View ref={r => { notesYRef.current = r; }}>
            <Text style={styles.sectionTitle}>Session Notes</Text>
            <View style={styles.notesCard}>
              <TextInput style={styles.notesInput} placeholder="Record session details, skin reaction, etc..." placeholderTextColor={colors.textTertiary} value={sessionData.notes} onChangeText={t => setSessionData(p => ({ ...p, notes: t }))} multiline numberOfLines={4} onFocus={scrollToNotes} />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveDetails} disabled={loading} activeOpacity={0.8}>
                <View style={{ marginRight: 10 }}><Save size={18} color={colors.backgroundDeep} /></View>
                <Text style={styles.saveBtnText}>Save Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Material Tracker Slide-Up */}
      <Modal visible={trackerVisible} animationType="slide" transparent>
        <View style={styles.trackerOverlay}>
          <View style={styles.trackerSheet}>
            <View style={styles.trackerHandle} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ ...typography.h3, color: colors.textPrimary }}>Material Tracker</Text>
              <AnimatedTouchable onPress={() => setTrackerVisible(false)} style={styles.closeTrackerBtn}><XCircle size={24} color={colors.textSecondary} /></AnimatedTouchable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={styles.materialsWrap}>
                {sessionMaterials.length === 0 ? (
                  <View style={styles.emptyMat}><Package size={28} color={colors.textTertiary} /><Text style={styles.emptyMatText}>No materials logged.</Text></View>
                ) : (
                  <View style={styles.matList}>
                    {sessionMaterials.map(mat => (
                      <View key={mat.id} style={styles.matCard}>
                        <View style={styles.matIcon}><Palette size={16} color={colors.gold} /></View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.matName}>{mat.item_name}</Text>
                          <Text style={styles.matUnit}>{mat.unit}</Text>
                        </View>
                        <View style={styles.matQty}><Text style={styles.matQtyText}>{mat.quantity}</Text></View>
                        {mat.status === 'hold' && <AnimatedTouchable onPress={() => handleReleaseMaterial(mat.id)} style={{ marginLeft: 8 }}><XCircle size={18} color={colors.error} /></AnimatedTouchable>}
                      </View>
                    ))}
                  </View>
                )}

                {/* Quick Add Section */}
                <View style={styles.quickSection}>
                  {Object.keys(serviceKits).length > 0 && (
                    <View style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}><Briefcase size={14} color={colors.gold} /><Text style={styles.quickTitle}>Apply Service Kit</Text></View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                        {Object.keys(serviceKits).map(kitName => (
                          <AnimatedTouchable key={kitName} style={[styles.quickChip, { backgroundColor: colors.gold }]} onPress={() => handleQuickAddKit(serviceKits[kitName])}>
                            <Text style={[styles.quickChipText, { color: colors.backgroundDeep }]} numberOfLines={1}>{kitName}</Text>
                          </AnimatedTouchable>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}><Zap size={14} color={colors.gold} /><Text style={styles.quickTitle}>Quick Add Item (+1)</Text></View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                    {inventoryItems.slice(0, 8).map(item => (
                      <AnimatedTouchable key={item.id} style={styles.quickChip} onPress={() => handleQuickAdd(item.id, 1)} disabled={addingMaterial}>
                        <Text style={styles.quickChipText} numberOfLines={1}>{item.name}</Text>
                        <View style={styles.quickPlusIcon}><Plus size={12} color="#ffffff" /></View>
                      </AnimatedTouchable>
                    ))}
                    {inventoryItems.length === 0 && <Text style={{ color: colors.textTertiary, padding: 10 }}>No stock available</Text>}
                  </ScrollView>
                  {addingMaterial && <ActivityIndicator size="small" color={colors.gold} style={{ marginTop: 8 }} />}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Alert Modal */}
      <Modal visible={alertModal.visible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' }}>{alertModal.title}</Text>
            <Text style={{ ...typography.body, color: colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>{alertModal.message}</Text>
            <AnimatedTouchable style={styles.modalBtn} onPress={() => { setAlertModal({ ...alertModal, visible: false }); alertModal.onDismiss?.(); }}>
              <Text style={styles.modalBtnText}>OK</Text>
            </AnimatedTouchable>
          </View>
        </View>
      </Modal>

      {/* Confirm Modal */}
      <Modal visible={confirmModal.visible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={{ ...typography.h3, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' }}>{confirmModal.title}</Text>
            <Text style={{ ...typography.body, color: colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>{confirmModal.message}</Text>
            <View style={{ flexDirection: 'row', width: '100%' }}>
              <TouchableOpacity style={[styles.modalBtn, { flex: 1, backgroundColor: colors.surfaceLight, marginRight: 6 }]} onPress={() => { setConfirmModal({ ...confirmModal, visible: false }); confirmModal.onCancel ? confirmModal.onCancel() : null; }} activeOpacity={0.8}>
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>{confirmModal.cancelText || 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { flex: 1, marginLeft: 6 }]} onPress={() => { setConfirmModal({ ...confirmModal, visible: false }); confirmModal.onConfirm?.(); }} activeOpacity={0.8}>
                <Text style={styles.modalBtnText}>{confirmModal.confirmText || 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Image Viewer */}
      <Modal visible={!!fullscreenImage} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.fullscreenOverlay}>
          <View style={styles.fullscreenHeader}>
            <Text style={styles.fullscreenLabel}>{fullscreenImage?.label}</Text>
            <TouchableOpacity onPress={() => setFullscreenImage(null)} style={styles.fullscreenCloseBtn} title="Close" aria-label="Close fullscreen image">
              <X size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
          {fullscreenImage && (
            <Image source={{ uri: fullscreenImage.uri }} style={styles.fullscreenImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 20 : 52, paddingBottom: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  headerTitle: { ...typography.h3, color: colors.textPrimary },
  clientCard: {
    marginHorizontal: 20, borderRadius: 16, overflow: 'hidden',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 20,
  },
  goldStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.gold },
  clientOverview: { alignItems: 'center', padding: 20 },
  clientName: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  designTitle: { ...typography.body, color: colors.textSecondary, marginBottom: 10 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginTop: 8 },
  statusText: { color: '#ffffff', ...typography.bodyXSmall, fontWeight: '700' },
  content: { padding: 20 },
  actionSection: { marginBottom: 28, alignItems: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, width: '100%' },
  actionBtnText: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
  sectionTitle: { ...typography.h4, color: colors.textPrimary, marginBottom: 14 },
  photoGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28 },
  photoBox: { width: '48%', aspectRatio: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  uploadedPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: { alignItems: 'center' },
  photoLabel: { marginTop: 6, ...typography.bodyXSmall, color: colors.textTertiary, fontWeight: '600' },
  costBadge: { backgroundColor: colors.iconGoldBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.borderGold },
  costBadgeText: { color: colors.gold, fontWeight: '700', ...typography.bodySmall },
  materialsWrap: { marginBottom: 28 },
  emptyMat: { backgroundColor: colors.surface, borderRadius: 16, padding: 28, alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  emptyMatText: { color: colors.textTertiary, marginTop: 8, ...typography.bodySmall },
  matList: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  matCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceLight, borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  matIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.iconGoldBg, justifyContent: 'center', alignItems: 'center' },
  matName: { ...typography.bodySmall, fontWeight: '600', color: colors.textPrimary },
  matUnit: { ...typography.bodyXSmall, color: colors.textTertiary, marginTop: 1 },
  matQty: { backgroundColor: colors.gold, width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  matQtyText: { color: colors.backgroundDeep, fontWeight: '700', ...typography.bodyXSmall },
  quickSection: { marginTop: 4 },
  quickTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.textSecondary },
  quickChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: 140, backgroundColor: colors.surface, paddingLeft: 14, paddingRight: 6, paddingVertical: 7, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  quickChipText: { flex: 1, color: colors.textPrimary, ...typography.bodyXSmall, fontWeight: '600', marginRight: 6 },
  quickPlusIcon: { backgroundColor: colors.success, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  notesCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 40 },
  notesInput: { backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, ...typography.body, color: colors.textPrimary, height: 100, textAlignVertical: 'top', marginBottom: 14 },
  saveBtn: { borderRadius: 12, backgroundColor: colors.gold, flexDirection: 'row', height: 52, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { color: colors.backgroundDeep, ...typography.button, fontSize: 16 },
  // Modals
  // Timer & Ring
  timerContainer: { alignItems: 'center', marginVertical: 20 },
  statusRing: {
    width: 220, height: 220, borderRadius: 110, borderWidth: 4, borderColor: colors.gold,
    justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface,
    shadowColor: colors.gold, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 10,
  },
  timerText: { fontSize: 44, fontWeight: '800', color: colors.gold, letterSpacing: 2, fontFamily: 'Georgia' },
  timerLabel: { ...typography.bodyXSmall, color: colors.textTertiary, letterSpacing: 2, marginTop: 4 },

  // Tracker UI
  trackerBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surfaceLight, padding: 16, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: 30,
  },
  trackerBtnText: { ...typography.body, fontWeight: '700', color: colors.textPrimary, marginLeft: 10 },
  trackerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  trackerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%', borderWidth: 1, borderColor: colors.borderLight },
  trackerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  closeTrackerBtn: { padding: 4 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 24, width: '85%', borderWidth: 1, borderColor: colors.border },
  modalBtn: { backgroundColor: colors.gold, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalBtnText: { ...typography.button, color: colors.backgroundDeep, fontSize: 16 },

  medicalBanner: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', borderRadius: 12, padding: 16, marginBottom: 24 },
  medicalBannerTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.error },
  medicalText: { ...typography.bodySmall, color: colors.textPrimary, marginBottom: 4 },
  
  artworkBox: { width: 160, height: 200, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  artworkImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  artworkLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 6, textAlign: 'center', ...typography.bodyXSmall, color: '#ffffff', fontWeight: '700' },

  // Fullscreen Image Viewer
  fullscreenOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  fullscreenHeader: {
    position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, zIndex: 10,
  },
  fullscreenLabel: { ...typography.body, fontWeight: '700', color: '#ffffff', letterSpacing: 0.3 },
  fullscreenCloseBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  fullscreenImg: { width: '100%', height: '80%' },
});
