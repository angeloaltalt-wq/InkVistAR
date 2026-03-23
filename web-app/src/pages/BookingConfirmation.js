import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';
import { CheckCircle, Clock, AlertCircle, ArrowRight, Home } from 'lucide-react';

const BookingConfirmation = () => {
    const location = useLocation();
    const [appointmentId, setAppointmentId] = useState(null);
    const [verificationStatus, setVerificationStatus] = useState('verifying'); // verifying, success, timeout, failed, idle

    useEffect(() => {
        let id = null;
        if (location.state?.appointmentId) {
            id = location.state.appointmentId;
        } else {
            const params = new URLSearchParams(location.search);
            id = params.get('appointmentId');
        }

        if (id) {
            setAppointmentId(id);
            verifyPayment(id);
        } else {
            setVerificationStatus('idle');
        }
    }, [location]);

    const verifyPayment = async (id) => {
        setVerificationStatus('verifying');
        let attempts = 0;
        const maxAttempts = 6;
        
        const poll = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/appointments/${id}/payment-status`);
                if (res.data.success && (res.data.payment_status === 'paid' || res.data.payment_status === 'downpayment_paid')) {
                    setVerificationStatus('success');
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(poll, 3000); 
                } else {
                    setVerificationStatus('timeout');
                }
            } catch (err) {
                console.error("Verification error:", err);
                setVerificationStatus('failed');
            }
        };

        poll();
    };

    const styles = {
        pageWrapper: {
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            position: 'relative',
            overflow: 'hidden',
        },
        blob1: {
            position: 'absolute',
            top: '-10%',
            right: '-10%',
            width: '400px',
            height: '400px',
            background: 'rgba(59, 130, 246, 0.1)',
            borderRadius: '50%',
            filter: 'blur(100px)',
            animation: 'blobFloat 20s infinite alternate',
        },
        blob2: {
            position: 'absolute',
            bottom: '-10%',
            left: '-10%',
            width: '400px',
            height: '400px',
            background: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '50%',
            filter: 'blur(100px)',
            animation: 'blobFloat 25s infinite alternate-reverse',
        },
        card: {
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '32px',
            padding: '48px 32px',
            width: '100%',
            maxWidth: '520px',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
            zIndex: 1,
            animation: 'cardIn 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        },
        iconWrapper: {
            width: '80px',
            height: '80px',
            borderRadius: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            animation: 'iconBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        },
        idBadge: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9rem',
            fontWeight: '600',
            color: '#64748b',
            background: '#ffffff',
            padding: '8px 16px',
            borderRadius: '99px',
            border: '1px solid #e2e8f0',
            marginBottom: '32px',
        },
        actions: {
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
        },
        primaryBtn: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '16px 32px',
            background: '#0f172a',
            color: 'white',
            borderRadius: '16px',
            textDecoration: 'none',
            fontWeight: '600',
            transition: 'all 0.2s',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
        },
        secondaryBtn: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '16px 32px',
            background: 'transparent',
            color: '#475569',
            borderRadius: '16px',
            textDecoration: 'none',
            fontWeight: '600',
            transition: 'all 0.2s',
            border: '1px solid #e2e8f0',
        }
    };

    return (
        <div style={styles.pageWrapper}>
            <div style={styles.blob1}></div>
            <div style={styles.blob2}></div>
            
            <style>{`
                @keyframes blobFloat { from { transform: translate(0,0); } to { transform: translate(40px, 40px); } }
                @keyframes cardIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes iconBounce { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .btn-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.1) !important; filter: brightness(1.1); }
                .btn-secondary-hover:hover { background: #f8fafc !important; border-color: #cbd5e1 !important; }
            `}</style>

            <div style={styles.card}>
                {verificationStatus === 'verifying' ? (
                    <>
                        <div style={{ ...styles.iconWrapper, background: '#eff6ff', color: '#3b82f6' }}>
                            <div style={{ width: '40px', height: '40px', border: '3px solid #bfdbfe', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        </div>
                        <h2 style={{ fontSize: '1.75rem', color: '#0f172a', marginBottom: '12px' }}>Verifying Payment</h2>
                        <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '32px' }}>
                            We're just confirming your transaction with PayMongo. Hang tight!
                        </p>
                    </>
                ) : (verificationStatus === 'timeout' || verificationStatus === 'failed') ? (
                    <>
                        <div style={{ ...styles.iconWrapper, background: '#fffbeb', color: '#f59e0b' }}>
                            <Clock size={40} />
                        </div>
                        <h2 style={{ fontSize: '1.75rem', color: '#0f172a', marginBottom: '12px' }}>Still Verifying</h2>
                        <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '32px' }}>
                            Confirmation is taking longer than expected. Don't worry, your booking is safe. Please check back later.
                        </p>
                    </>
                ) : (
                    <>
                        <div style={{ ...styles.iconWrapper, background: '#ecfdf5', color: '#10b981' }}>
                            <CheckCircle size={40} />
                        </div>
                        <h2 style={{ fontSize: '2rem', color: '#0f172a', marginBottom: '12px' }}>Booking Confirmed!</h2>
                        <p style={{ color: '#64748b', lineHeight: '1.6', marginBottom: '32px' }}>
                            Awesome! Your payment was successful and your slot is now reserved. See you soon!
                        </p>
                    </>
                )}

                {appointmentId && (
                    <div style={styles.idBadge}>
                        <span style={{ color: '#94a3b8' }}>ID</span>
                        <span>#{appointmentId}</span>
                    </div>
                )}

                <div style={styles.actions}>
                    <Link to="/customer/bookings" className="btn-hover" style={styles.primaryBtn}>
                        Manage My Bookings <ArrowRight size={18} />
                    </Link>
                    <Link to="/" className="btn-secondary-hover" style={styles.secondaryBtn}>
                        <Home size={18} /> Back to Home
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default BookingConfirmation;
