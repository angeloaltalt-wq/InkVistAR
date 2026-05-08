import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated, ScrollView, ActivityIndicator } from 'react-native';
import { AlertTriangle, X, ChevronRight, FileText, Clock, CreditCard } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography, shadows } from '../../theme';
import { API_URL } from '../../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function CustomerPaymentAlertOverlay({ customerId, onPayOnline }) {
  const { theme: colors } = useTheme();
  const styles = getStyles(colors);
  
  const [alerts, setAlerts] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [popupDismissed, setPopupDismissed] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const hasShownOnLoginRef = useRef(false);
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!customerId) return;
    
    const fetchPendingPayments = async () => {
      try {
        const response = await fetch(`${API_URL}/customer/${customerId}/appointments`);
        const res = await response.json();
        
        if (res.success && Array.isArray(res.appointments)) {
          const unpaidAlerts = res.appointments.filter(a => 
            ['pending', 'confirmed', 'scheduled', 'completed'].includes((a.status || '').toLowerCase()) 
            && Number(a.price) > 0 
            && ['unpaid', 'downpayment_paid'].includes(a.payment_status)
          );
          
          if (unpaidAlerts.length > 0) {
            setAlerts(unpaidAlerts);
            setSelectedAlert(prev => {
              if (!prev) return unpaidAlerts[0];
              const stillExists = unpaidAlerts.find(a => a.id === prev.id);
              return stillExists || unpaidAlerts[0];
            });
            
            const alreadyShown = await AsyncStorage.getItem('customerPaymentAlertShown');
            if (alreadyShown !== 'true' && !hasShownOnLoginRef.current) {
              setShowPopup(true);
              hasShownOnLoginRef.current = true;
            } else if (!hasShownOnLoginRef.current) {
              setPopupDismissed(true);
              hasShownOnLoginRef.current = true;
            }
          } else {
            setAlerts([]);
            setSelectedAlert(null);
            setShowPopup(false);
            setPopupDismissed(false);
            await AsyncStorage.removeItem('customerPaymentAlertShown');
          }
        }
      } catch (e) {
        console.error('Error fetching pending payments:', e);
      }
    };

    fetchPendingPayments();
    const interval = setInterval(fetchPendingPayments, 15000); // 15s polling
    return () => clearInterval(interval);
  }, [customerId]);

  // Animate persistent toast when it appears
  useEffect(() => {
    if (!showPopup && popupDismissed && alerts.length > 0) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [showPopup, popupDismissed, alerts.length]);

  const handleDismissPopup = async () => {
    setShowPopup(false);
    setPopupDismissed(true);
    await AsyncStorage.setItem('customerPaymentAlertShown', 'true');
  };

  const handleGoToAppointment = (alertItem) => {
    if (isInitiatingPayment) return;
    setIsInitiatingPayment(true);
    setShowPopup(false);
    
    // Call the parent handler to navigate to checkout
    if (onPayOnline) {
      onPayOnline(alertItem);
    }
    
    setTimeout(() => setIsInitiatingPayment(false), 2000);
  };

  if (alerts.length === 0) return null;

  const remaining = selectedAlert ? Math.max(0, Number(selectedAlert.price || 0) - Number(selectedAlert.total_paid || 0)) : 0;

  return (
    <>
      {/* POPUP MODAL */}
      <Modal visible={showPopup && !!selectedAlert} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconWrap}>
                  <AlertTriangle size={24} color="#fff" />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Unpaid Balance Notice</Text>
                  <Text style={styles.headerSubtitle}>
                    You have {alerts.length} session{alerts.length > 1 ? 's' : ''} pending payment
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={handleDismissPopup}>
                <X size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Alert selector (if multiple) */}
            {alerts.length > 1 && (
              <View style={styles.selectorContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorScroll}>
                  {alerts.map(a => (
                    <TouchableOpacity 
                      key={a.id} 
                      onPress={() => setSelectedAlert(a)}
                      style={[
                        styles.selectorBtn,
                        selectedAlert?.id === a.id && styles.selectorBtnActive
                      ]}
                    >
                      <Text style={[
                        styles.selectorText,
                        selectedAlert?.id === a.id && styles.selectorTextActive
                      ]}>
                        Session #{a.id}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Body */}
            <View style={styles.modalBody}>
              <View style={styles.infoGrid}>
                <View style={styles.infoBox}>
                  <View style={styles.infoLabelWrap}>
                    <FileText size={10} color={colors.textTertiary} style={{ marginRight: 4 }} />
                    <Text style={styles.infoLabel}>DESIGN</Text>
                  </View>
                  <Text style={styles.infoValue} numberOfLines={1}>{selectedAlert?.design_title || 'Untitled'}</Text>
                </View>
                <View style={styles.infoBox}>
                  <View style={styles.infoLabelWrap}>
                    <Clock size={10} color={colors.textTertiary} style={{ marginRight: 4 }} />
                    <Text style={styles.infoLabel}>DATE</Text>
                  </View>
                  <Text style={styles.infoValue}>
                    {selectedAlert?.appointment_date ? new Date(selectedAlert.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                  </Text>
                </View>
              </View>

              <View style={styles.financialBox}>
                <View style={styles.financialCol}>
                  <Text style={styles.financialLabel}>TOTAL PRICE</Text>
                  <Text style={styles.financialValue}>
                    ₱{Number(selectedAlert?.price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={[styles.financialCol, { alignItems: 'center' }]}>
                  <Text style={styles.financialLabel}>PAID</Text>
                  <Text style={styles.financialValuePaid}>
                    ₱{Number(selectedAlert?.total_paid || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={[styles.financialCol, { alignItems: 'flex-end' }]}>
                  <Text style={[styles.financialLabel, { color: '#f59e0b' }]}>REMAINING</Text>
                  <Text style={styles.financialValueRemaining}>
                    ₱{remaining.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Footer Actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.dismissBtn} onPress={handleDismissPopup}>
                <Text style={styles.dismissBtnText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.payBtn, isInitiatingPayment && { opacity: 0.7 }]} 
                onPress={() => handleGoToAppointment(selectedAlert)}
                disabled={isInitiatingPayment}
              >
                {isInitiatingPayment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <CreditCard size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.payBtnText}>Pay Online</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* COMPACT FLOATING PILL (bottom-right, above tab bar) */}
      {!showPopup && popupDismissed && alerts.length > 0 && (
        <Animated.View style={[
          styles.floatingPill,
          {
            transform: [{
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [80, 0]
              })
            }]
          }
        ]}>
          <TouchableOpacity 
            style={styles.pillBtn} 
            activeOpacity={0.8}
            onPress={() => setShowPopup(true)}
          >
            <AlertTriangle size={16} color="#fff" />
            <Text style={styles.pillText}>
              {alerts.length} unpaid
            </Text>
            <View style={styles.pillDivider} />
            <Text style={styles.pillAction}>Pay</Text>
            <ChevronRight size={14} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </>
  );
}

const getStyles = (colors) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    ...shadows.large,
  },
  modalHeader: {
    backgroundColor: '#f59e0b',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIconWrap: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 10,
    borderRadius: 12,
    marginRight: 12,
  },
  headerTitle: {
    ...typography.h4,
    color: '#fff',
    marginBottom: 2,
  },
  headerSubtitle: {
    ...typography.bodyXSmall,
    color: 'rgba(255,255,255,0.9)',
  },
  closeBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  selectorContainer: {
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  selectorScroll: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  selectorBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: 'transparent',
    marginRight: 8,
  },
  selectorBtnActive: {
    borderWidth: 2,
    borderColor: '#f59e0b',
    backgroundColor: '#fff',
  },
  selectorText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: '#b45309',
  },
  selectorTextActive: {
    color: '#d97706',
  },
  modalBody: {
    padding: 20,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  infoBox: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  infoLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoLabel: {
    ...typography.labelSmall,
    color: colors.textTertiary,
  },
  infoValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  financialBox: {
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  financialCol: {
    flex: 1,
  },
  financialLabel: {
    ...typography.labelSmall,
    color: colors.textTertiary,
    marginBottom: 6,
  },
  financialValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  financialValuePaid: {
    ...typography.h3,
    color: '#10b981',
  },
  financialValueRemaining: {
    ...typography.h3,
    color: '#f59e0b',
  },
  modalFooter: {
    padding: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  dismissBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
  },
  dismissBtnText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#f59e0b',
    borderRadius: 10,
  },
  payBtnText: {
    ...typography.button,
    color: '#fff',
  },
  // Compact floating pill (bottom-right, above tab bar)
  floatingPill: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    zIndex: 100,
    backgroundColor: '#d97706',
    borderRadius: 24,
    ...shadows.medium,
    elevation: 6,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  pillText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: '#fff',
  },
  pillDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 2,
  },
  pillAction: {
    ...typography.bodySmall,
    fontWeight: '800',
    color: '#fff',
  },
});
