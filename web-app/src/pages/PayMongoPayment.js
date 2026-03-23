import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';

const PayMongoPayment = () => {
    const [status, setStatus] = useState('selection'); // selection, initializing, ready, processing, failed
    const [paymentType, setPaymentType] = useState('deposit');
    const [checkoutUrl, setCheckoutUrl] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();
    const { appointmentId, price, type } = location.state || { appointmentId: null, price: 0, type: null };

    const depositPrice = Math.max(100, Math.round(price * 0.3));

    useEffect(() => {
        if (type === 'balance') {
            setPaymentType('balance');
            initializeSession('balance');
        }
    }, [type]);

    const initializeSession = async (overrideType) => {
        const finalType = overrideType || paymentType;
        if (!appointmentId) {
            alert('Error: No appointment ID found. Cannot proceed with payment.');
            navigate('/customer/bookings');
            return;
        }

        setStatus('initializing');
        try {
            const response = await axios.post(`${API_URL}/api/payments/create-checkout-session`, {
                appointmentId: appointmentId,
                price: price,
                paymentType: finalType
            });

            if (response.data.success && response.data.checkoutUrl) {
                setCheckoutUrl(response.data.checkoutUrl);
                setStatus('ready');
            } else {
                throw new Error(response.data.message || 'Failed to get checkout URL');
            }
        } catch (error) {
            console.error('Failed to create checkout session:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Failed to initialize payment.';
            setStatus('failed');
            alert(`Error: ${errorMsg}\n\nPlease try again or contact support.`);
        }
    };

    const handlePayment = async () => {
        if (!checkoutUrl) {
            alert('Payment is not yet initialized. Please wait.');
            return;
        }

        setStatus('processing');
        window.location.href = checkoutUrl;
    };

    const pageStyles = {
        backgroundColor: '#f1f5f9',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
        padding: '20px'
    };

    const cardStyles = {
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.05)',
        padding: '32px',
        width: '100%',
        maxWidth: '450px',
        border: '1px solid #e2e8f0'
    };

    const btnBase = {
        width: '100%',
        padding: '14px',
        borderRadius: '10px',
        fontSize: '16px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: 'none'
    };

    const optionCard = (type, label, amount, description) => (
        <div 
            onClick={() => setPaymentType(type)}
            style={{
                padding: '16px',
                borderRadius: '12px',
                border: `2px solid ${paymentType === type ? '#3b82f6' : '#e2e8f0'}`,
                backgroundColor: paymentType === type ? '#eff6ff' : 'transparent',
                cursor: 'pointer',
                marginBottom: '12px',
                transition: 'all 0.2s'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: paymentType === type ? '#1e40af' : '#1e293b' }}>{label}</span>
                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>₱{amount.toLocaleString()}</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>{description}</p>
        </div>
    );

    return (
        <div style={pageStyles}>
            <div style={cardStyles}>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', color: '#0f172a' }}>InkVistAR Checkout</h2>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Secure payment for Appointment #{appointmentId}</p>
                </div>

                {status === 'selection' ? (
                    <>
                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>Choose Payment Option:</h4>
                        {optionCard('deposit', 'Pay Downpayment', depositPrice, 'Pay 30% to confirm your booking slot immediately.')}
                        {optionCard('full', 'Pay Full Amount', price, 'Pay the total amount now to skip the balance later.')}
                        
                        <button 
                            onClick={initializeSession} 
                            style={{ ...btnBase, backgroundColor: '#0f172a', color: 'white', marginTop: '12px' }}
                        >
                            Continue to Secure Payment
                        </button>
                    </>
                ) : status === 'initializing' || status === 'processing' ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div className="spinner" style={{ margin: '0 auto 20px auto', width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        <p>{status === 'initializing' ? 'Initializing Secure Session...' : 'Redirecting to Payment Provider...'}</p>
                        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : status === 'ready' ? (
                    <>
                        <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ color: '#64748b' }}>Type:</span>
                                <span style={{ fontWeight: 600 }}>{paymentType === 'deposit' ? 'Downpayment' : paymentType === 'balance' ? 'Remaining Balance' : 'Full Payment'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}>Amount:</span>
                                <span style={{ fontWeight: 700, fontSize: '1.2rem', color: '#0f172a' }}>₱{(paymentType === 'deposit' ? depositPrice : paymentType === 'balance' ? price : price).toLocaleString()}</span>
                            </div>
                        </div>
                        <button onClick={handlePayment} style={{ ...btnBase, backgroundColor: '#10b981', color: 'white' }}>
                            Pay with PayMongo
                        </button>
                        <button 
                            onClick={() => setStatus('selection')} 
                            style={{ ...btnBase, backgroundColor: 'transparent', color: '#64748b', marginTop: '8px', fontSize: '0.9rem' }}
                        >
                            Change amount
                        </button>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        <p style={{ color: '#ef4444' }}>Payment failed to initialize.</p>
                        <button onClick={() => setStatus('selection')} style={{ ...btnBase, backgroundColor: '#3b82f6', color: 'white' }}>Try Again</button>
                    </div>
                )}
                
                <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.8rem', color: '#94a3b8' }}>
                    Powered by PayMongo Secure Checkout
                </div>
            </div>
        </div>
    );
};

export default PayMongoPayment;