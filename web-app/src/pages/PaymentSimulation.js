import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config'; // Assuming you have a config file for your API URL

const PaymentSimulation = () => {
    const [status, setStatus] = useState('pending');
    const navigate = useNavigate();
    const location = useLocation();
    const { appointmentId, price } = location.state || { appointmentId: null, price: 50 }; // Default price for display

    const handlePayment = async () => {
        if (!appointmentId) {
            alert('Error: No appointment ID found. Cannot proceed with payment.');
            navigate('/customer/bookings'); // Redirect to a safe page
            return;
        }

        setStatus('processing');
        // Simulate API call to an external payment gateway
        setTimeout(async () => {
            try {
                // This is where you would normally get a payment intent or token from PayMongo
                const paymentToken = 'dummy-payment-token-' + Math.random().toString(36).substr(2, 9);

                // Send the token to your backend for verification
                await axios.post(`${API_URL}/api/payments/verify`, {
                    appointmentId,
                    paymentToken,
                });

                setStatus('success');
                // Don't alert here, the confirmation page is enough
                navigate('/booking-confirmation', { state: { appointmentId } });

            } catch (error) {
                console.error('Payment verification failed:', error);
                setStatus('failed');
                alert('Payment Failed. Please try again or contact support.');
            }
        }, 2000); // 2-second delay to simulate network latency
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
        backgroundColor: status === 'processing' ? '#60a5fa' : '#3b82f6', // A nice blue
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: status === 'processing' ? 'not-allowed' : 'pointer',
    };

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
                    <h4 style={{ marginTop: 0, marginBottom: '16px' }}>Pay with Card</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <input type="text" placeholder="Card Number" style={inputStyles} />
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <input type="text" placeholder="MM / YY" style={{ ...inputStyles, width: '50%' }} />
                            <input type="text" placeholder="CVC" style={{ ...inputStyles, width: '50%' }} />
                        </div>
                    </div>
                </div>

                <button onClick={handlePayment} disabled={status === 'processing'} style={buttonStyles}>
                    {status === 'processing' ? 'Processing...' : `Pay PHP ${price.toFixed(2)}`}
                </button>
            </div>
        </div>
    );
};

export default PaymentSimulation;
