import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

const PaymentSimulation = () => {
    const [status, setStatus] = useState('pending');
    const navigate = useNavigate();
    const location = useLocation();
    const { appointmentId } = location.state || {};

    const handlePayment = async () => {
        if (!appointmentId) {
            alert('Error: No appointment ID found.');
            return;
        }

        setStatus('processing');
        // Simulate API call to an external payment gateway
        setTimeout(async () => {
            try {
                // This is where you would normally get a token from the payment gateway
                const paymentToken = 'dummy-payment-token-' + Math.random().toString(36).substr(2, 9);

                // Send the token to your backend for verification
                await axios.post('http://localhost:3001/api/payments/verify', {
                    appointmentId,
                    paymentToken,
                });

                setStatus('success');
                alert('Payment Successful!');
                navigate('/booking-confirmation', { state: { appointmentId } });

            } catch (error) {
                console.error('Payment verification failed:', error);
                setStatus('failed');
                alert('Payment Failed. Please try again.');
            }
        }, 2000); // 2-second delay to simulate network latency
    };

    return (
        <div style={{ padding: '20px', maxWidth: '400px', margin: 'auto' }}>
            <h2>PayMongo Simulation</h2>
            <p>Appointment ID: {appointmentId || 'N/A'}</p>
            <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
                <h4>Enter Dummy Card Details</h4>
                <input type="text" placeholder="Card Number" style={{ width: '100%', padding: '8px', marginBottom: '10px' }} />
                <input type="text" placeholder="MM/YY" style={{ width: '48%', padding: '8px', marginRight: '4%' }} />
                <input type="text" placeholder="CVC" style={{ width: '48%', padding: '8px' }} />
            </div>
            <button onClick={handlePayment} disabled={status === 'processing'} style={{ width: '100%', padding: '10px', marginTop: '20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}>
                {status === 'processing' ? 'Processing...' : `Pay Now`}
            </button>
        </div>
    );
};

export default PaymentSimulation;
