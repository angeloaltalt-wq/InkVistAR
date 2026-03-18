import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';

const PayMongoPayment = () => {
    const [status, setStatus] = useState('pending');
    const [checkoutUrl, setCheckoutUrl] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();
    const { appointmentId, price } = location.state || { appointmentId: null, price: 50 };

    useEffect(() => {
        if (!appointmentId) {
            alert('Error: No appointment ID found. Cannot proceed with payment.');
            navigate('/customer/bookings');
            return;
        }

        const initializeSession = async () => {
            try {
                // Updated to match server.js endpoint
                const response = await axios.post(`${API_URL}/api/payments/create-checkout-session`, {
                    appointmentId: appointmentId,
                    price: price
                });

                if (response.data.success && response.data.checkoutUrl) {
                    setCheckoutUrl(response.data.checkoutUrl);
                } else {
                    throw new Error(response.data.message || 'Failed to get checkout URL');
                }
            } catch (error) {
                console.error('Failed to create checkout session:', error);
                setStatus('failed');
                alert('Failed to initialize payment. Please try again.');
            }
        };

        initializeSession();
    }, [appointmentId, price, navigate]);

    const handlePayment = async () => {
        if (!checkoutUrl) {
            alert('Payment is not yet initialized. Please wait.');
            return;
        }

        setStatus('processing');
        
        // Redirect to PayMongo Hosted Checkout
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

    const buttonStyles = {
        width: '100%',
        padding: '12px',
        marginTop: '24px',
        backgroundColor: status === 'processing' ? '#60a5fa' : '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: status === 'processing' ? 'not-allowed' : 'pointer',
    };

    if (!checkoutUrl && status !== 'failed') {
        return (
            <div style={pageStyles}>
                <div style={cardStyles}>
                    <p>Initializing payment...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={pageStyles}>
            <div style={cardStyles}>
                <div style={headerStyles}>
                    <h2 style={{ margin: '0 0 8px 0' }}>InkVistAR</h2>
                    <p style={{ margin: 0, color: '#6b7280' }}>Appointment ID: {appointmentId || 'N/A'}</p>
                    <p style={{ fontSize: '24px', fontWeight: 'bold', margin: '16px 0 0 0' }}>
                        PHP {price.toFixed(2)}
                    </p>
                </div>

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Redirecting to PayMongo...</h4>
                    <p>You will be redirected to a secure payment page to complete your payment.</p>
                </div>

                <button onClick={handlePayment} disabled={status === 'processing'} style={buttonStyles}>
                    {status === 'processing' ? 'Processing...' : `Pay PHP ${price.toFixed(2)}`}
                </button>
            </div>
        </div>
    );
};

export default PayMongoPayment;