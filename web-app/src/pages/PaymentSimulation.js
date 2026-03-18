import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';

const PaymentSimulation = () => {
    const [status, setStatus] = useState('pending');
    const [checkoutUrl, setCheckoutUrl] = useState(null);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Accept data from navigation state, query params, or sessionStorage fallback
    const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const stateAppointment = location.state?.appointmentId || null;
    const statePrice = location.state?.price || null;
    const paramAppointment = urlParams.get('appointmentId');
    const paramPrice = urlParams.get('price');
    const stored = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('pendingPayment') || '{}'); } catch { return {}; }
    }, []);

    const appointmentId = stateAppointment || paramAppointment || stored.appointmentId || null;
    const price = Number(statePrice || paramPrice || stored.price || 50);

    useEffect(() => {
        // Fast fail if API_URL is not configured in production builds
        if (!API_URL) {
            setError('API URL is not configured. Please set REACT_APP_API_URL to your backend URL and redeploy.');
            setStatus('failed');
            return;
        }

        if (!appointmentId) {
            setError('Missing appointment. Please return to your bookings and try again.');
            setStatus('failed');
            return;
        }

        const initCheckout = async () => {
            setStatus('processing');
            try {
                const response = await axios.post(`${API_URL}/api/payments/create-checkout-session`, {
                    appointmentId,
                });

                if (response.data?.checkoutUrl) {
                    setCheckoutUrl(response.data.checkoutUrl);
                    setStatus('ready');
                    // keep latest session for refresh resiliency
                    sessionStorage.setItem('pendingPayment', JSON.stringify({ appointmentId, price }));
                } else {
                    throw new Error('No checkout URL returned');
                }
            } catch (err) {
                // Bubble up server-provided message when available to aid debugging
                const serverMessage = err?.response?.data?.message || err?.message;
                console.error('Failed to start payment:', serverMessage, err?.response?.data);
                setError(serverMessage || 'Failed to start payment. Please try again or contact support.');
                setStatus('failed');
            }
        };

        initCheckout();
    }, [appointmentId, price]);

    const handleRedirect = () => {
        if (!checkoutUrl) return;
        setStatus('redirecting');
        window.location.href = checkoutUrl;
    };

    const pageStyles = {
        backgroundColor: '#f7f8fa',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    };

    const cardStyles = {
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        padding: '32px',
        width: '100%',
        maxWidth: '400px',
    };

    const headerStyles = {
        textAlign: 'center',
        marginBottom: '24px',
    };
    
    const inputStyles = {
        width: '100%',
        padding: '12px',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        fontSize: '16px',
        boxSizing: 'border-box', // Important for padding and width to work together
    };

    const buttonStyles = {
        width: '100%',
        padding: '12px',
        marginTop: '24px',
        backgroundColor: status === 'ready' ? '#3b82f6' : '#9ca3af',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: status === 'ready' ? 'pointer' : 'not-allowed',
        transition: 'background-color 0.2s ease',
    };

    return (
        <div style={pageStyles}>
            <div style={cardStyles}>
                <div style={headerStyles}>
                    <h2 style={{ margin: '0 0 8px 0' }}>InkVistAR</h2>
                    <p style={{ margin: 0, color: '#6b7280' }}>Appointment ID: {appointmentId || 'N/A'}</p>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '16px 0 0 0' }}>
                        PHP {Number(price || 0).toFixed(2)}
                    </p>
                </div>

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '12px' }}>Secure payment</h4>
                    <p style={{ margin: 0, color: '#6b7280' }}>
                        You will be redirected to PayMongo's hosted checkout to complete your payment.
                    </p>
                    {error && <p style={{ color: '#dc2626', marginTop: '12px' }}>{error}</p>}
                    {API_URL === '' && (
                        <p style={{ marginTop: '12px', color: '#92400e', background:'#fffbeb', padding:'8px', borderRadius:'6px', border:'1px solid #fbbf24' }}>
                            API URL is not configured for production. Set REACT_APP_API_URL to your backend URL.
                        </p>
                    )}
                </div>

                <button
                    onClick={status === 'failed' ? () => window.location.reload() : handleRedirect}
                    disabled={status !== 'ready' && status !== 'failed'}
                    style={buttonStyles}
                >
                    {status === 'ready' && `Pay PHP ${Number(price || 0).toFixed(2)}`}
                    {status === 'redirecting' && 'Redirecting...'}
                    {status === 'failed' && 'Retry'}
                    {status !== 'ready' && status !== 'redirecting' && status !== 'failed' && 'Initializing...'}
                </button>
                <button
                    onClick={() => navigate('/customer/bookings')}
                    style={{ ...buttonStyles, backgroundColor: '#111827', marginTop: '12px', cursor: 'pointer' }}
                >
                    Back to Bookings
                </button>
            </div>
        </div>
    );
};

export default PaymentSimulation;
