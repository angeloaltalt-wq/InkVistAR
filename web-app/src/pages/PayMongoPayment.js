import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';
import { CreditCard, ShieldCheck, ArrowLeft, RefreshCw } from 'lucide-react';
import './PortalStyles.css';

const PayMongoPayment = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const stateData = location.state || { appointmentId: null, price: 0, type: null, remainingBalance: 0 };
    const { appointmentId, price, type } = stateData;

    const [status, setStatus] = useState(type === 'balance' ? 'initializing' : 'selection'); // selection, initializing, ready, processing, failed
    const [paymentType, setPaymentType] = useState(type === 'balance' ? 'balance' : 'deposit');
    const [checkoutUrl, setCheckoutUrl] = useState(null);

    const depositPrice = Math.max(100, Math.round(price * 0.3));

    useEffect(() => {
        if (type === 'balance') {
            initializeSession('balance');
        }
    }, [type, appointmentId]);

    const initializeSession = async (overrideType) => {
        const finalType = (typeof overrideType === 'string') ? overrideType : paymentType;
        if (!appointmentId) {
            alert('Error: No appointment ID found. Cannot proceed with payment.');
            navigate('/customer/bookings');
            return;
        }

        setStatus('initializing');
        try {
            // Defensively cast all values to scalar types to avoid circular references (like React events)
            const payload = {
                appointmentId: appointmentId ? String(appointmentId) : null,
                price: price ? Number(price) : 0,
                paymentType: (typeof finalType === 'string') ? finalType : 'deposit'
            };
            
            console.log('[Checkout] Payload:', payload);
            const response = await axios.post(`${API_URL}/api/payments/create-checkout-session`, payload);

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
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
        padding: '20px'
    };

    const cardStyles = {
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '24px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.1)',
        padding: '40px',
        width: '100%',
        maxWidth: '480px',
        border: '1px solid rgba(255, 255, 255, 0.5)',
        position: 'relative',
        overflow: 'hidden'
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

    const optionCard = (optType, label, amount, description) => (
        <div 
            onClick={() => setPaymentType(optType)}
            className="glass-card"
            style={{
                padding: '20px',
                borderRadius: '16px',
                border: `2px solid ${paymentType === optType ? '#C19A6B' : 'rgba(226, 232, 240, 0.5)'}`,
                backgroundColor: paymentType === optType ? 'rgba(193, 154, 107, 0.05)' : 'white',
                cursor: 'pointer',
                marginBottom: '16px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: paymentType === optType ? 'scale(1.02)' : 'scale(1)',
                boxShadow: paymentType === optType ? '0 10px 20px rgba(193, 154, 107, 0.1)' : 'none'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: paymentType === optType ? '#1e293b' : '#64748b' }}>{label}</span>
                <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#1e293b' }}>₱{amount.toLocaleString()}</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', lineHeight: '1.5' }}>{description}</p>
        </div>
    );

    return (
        <div style={pageStyles}>
            <div style={cardStyles}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, #1e293b, #C19A6B)' }}></div>
                
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{ 
                        width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '12px', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        margin: '0 auto 16px', color: '#1e293b' 
                    }}>
                        <ShieldCheck size={28} />
                    </div>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: '1.75rem', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.025em' }}>InkVistAR Checkout</h2>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem', fontWeight: '500' }}>Appointment <span style={{ color: '#1e293b', fontWeight: '700' }}>#{appointmentId}</span></p>
                </div>

                {status === 'selection' ? (
                    <>
                        <h4 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '1px' }}>Select Payment</h4>
                        {optionCard('deposit', 'Downpayment', depositPrice, 'Secure your slot with a 30% initial payment.')}
                        {optionCard('full', 'Full Payment', price, 'Complete your payment now for a seamless session.')}
                        
                        <button 
                            onClick={() => initializeSession()} 
                            className="btn btn-primary"
                            style={{ ...btnBase, marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            Confirm Selection <CreditCard size={18} />
                        </button>
                    </>
                ) : status === 'initializing' || status === 'processing' ? (
                    <div style={{ textAlign: 'center', padding: '48px 0' }}>
                        <div className="spinner" style={{ margin: '0 auto 24px auto' }}></div>
                        <p style={{ fontWeight: '600', color: '#1e293b' }}>{status === 'initializing' ? 'Securing your session...' : 'Redirecting to payment gateway...'}</p>
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '8px' }}>Please do not close this window.</p>
                    </div>
                ) : status === 'ready' ? (
                    <>
                        <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '20px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ color: '#64748b', fontWeight: '500' }}>Selected Plan:</span>
                                <span style={{ fontWeight: '700', color: '#1e293b' }}>{paymentType === 'deposit' ? 'Downpayment' : paymentType === 'balance' ? 'Remaining Balance' : 'Full Payment'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <span style={{ color: '#64748b', fontWeight: '500' }}>Amount to Pay:</span>
                                <span style={{ fontWeight: '800', fontSize: '1.75rem', color: '#1e293b' }}>
                                    ₱{(paymentType === 'deposit' ? depositPrice : location.state?.remainingBalance || price).toLocaleString()}
                                </span>
                            </div>
                        </div>
                        <button onClick={handlePayment} className="btn btn-primary" style={{ ...btnBase, backgroundColor: '#10b981' }}>
                            Proceed to PayMongo
                        </button>
                        <button 
                            onClick={() => setStatus('selection')} 
                            className="btn btn-secondary"
                            style={{ ...btnBase, background: 'transparent', color: '#64748b', marginTop: '12px', fontSize: '0.9rem', border: '1px solid #e2e8f0' }}
                        >
                            Change Payment Method
                        </button>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', padding: '24px' }}>
                        <div style={{ color: '#ef4444', marginBottom: '20px' }}>
                            <RefreshCw size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                            <p style={{ fontWeight: '600' }}>Payment initialization failed.</p>
                        </div>
                        <button 
                            onClick={() => paymentType === 'balance' ? initializeSession('balance') : setStatus('selection')} 
                            className="btn btn-primary"
                            style={{ ...btnBase, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <ArrowLeft size={18} /> Try Again
                        </button>
                    </div>
                )}
                
                <div style={{ textAlign: 'center', marginTop: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: 0.6 }}>
                    <div style={{ width: '40px', height: '1px', background: '#cbd5e1' }}></div>
                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Secure Checkout</span>
                    <div style={{ width: '40px', height: '1px', background: '#cbd5e1' }}></div>
                </div>
            </div>
        </div>
    );
};

export default PayMongoPayment;