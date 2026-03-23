import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';

const BookingConfirmation = () => {
    const location = useLocation();
    const [appointmentId, setAppointmentId] = useState(null);
    const [verificationStatus, setVerificationStatus] = useState('verifying'); // verifying, success, timeout, failed, idle

    useEffect(() => {
        // 1. Try to get ID from navigation state (internal navigation)
        let id = null;
        if (location.state?.appointmentId) {
            id = location.state.appointmentId;
        } else {
            // 2. Fallback to URL Query Params (PayMongo redirect)
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
                    setTimeout(poll, 3000); // Poll every 3 seconds
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

    // Inline styles to match the app's theme without relying on external CSS classes
    const containerStyle = {
        textAlign: 'center',
        padding: '60px 20px',
        maxWidth: '600px',
        margin: '0 auto',
        fontFamily: 'Inter, sans-serif'
    };

    const buttonStyle = {
        display: 'inline-block',
        backgroundColor: '#0f172a',
        color: 'white',
        padding: '12px 24px',
        borderRadius: '8px',
        textDecoration: 'none',
        fontWeight: 'bold',
        marginTop: '20px',
        marginRight: '10px'
    };

    const secondaryButtonStyle = {
        ...buttonStyle,
        backgroundColor: '#f1f5f9',
        color: '#475569'
    };

    return (
        <div style={containerStyle}>
            {verificationStatus === 'verifying' ? (
                <div style={{ padding: '40px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto 20px auto', width: '50px', height: '50px', border: '5px solid #f3f3f3', borderTop: '5px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <h2 style={{ color: '#1e293b' }}>Verifying Payment...</h2>
                    <p style={{ color: '#64748b' }}>Please wait while we confirm your transaction with PayMongo.</p>
                </div>
            ) : (verificationStatus === 'timeout' || verificationStatus === 'failed') ? (
                <div style={{ padding: '40px 0' }}>
                    <div style={{ color: '#f59e0b', marginBottom: '20px' }}>
                        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                    </div>
                    <h2 style={{ color: '#1e293b' }}>Still Verifying...</h2>
                    <p style={{ color: '#64748b' }}>We haven't received confirmation from PayMongo yet. Don't worry, your booking is safe. Please check back in a few minutes.</p>
                </div>
            ) : (
                <>
                    <div style={{ color: '#10b981', marginBottom: '20px' }}>
                        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                    </div>
                    
                    <h2 style={{ fontSize: '2rem', marginBottom: '10px', color: '#1f2937' }}>Booking Confirmed!</h2>
                    
                    <p style={{ color: '#6b7280', marginBottom: '30px', fontSize: '1.1rem' }}>
                        Your payment was successful and your appointment has been confirmed.
                    </p>
                </>
            )}
            
            {appointmentId && (
                <div style={{ background: '#f8fafc', padding: '15px 30px', borderRadius: '12px', display: 'inline-block', marginBottom: '30px', border: '1px solid #e2e8f0' }}>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Appointment ID</p>
                    <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', fontSize: '1.5rem', color: '#1e293b' }}>#{appointmentId}</p>
                </div>
            )}

            <div>
                <Link to="/customer/bookings" style={buttonStyle}>
                    View My Bookings
                </Link>
                <Link to="/" style={secondaryButtonStyle}>
                    Back to Home
                </Link>
            </div>
        </div>
    );
};

export default BookingConfirmation;
