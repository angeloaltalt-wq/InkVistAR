import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';

const BookingConfirmation = () => {
    const location = useLocation();
    const [appointmentId, setAppointmentId] = useState(null);

    useEffect(() => {
        // 1. Try to get ID from navigation state (internal navigation)
        if (location.state?.appointmentId) {
            setAppointmentId(location.state.appointmentId);
        } else {
            // 2. Fallback to URL Query Params (PayMongo redirect)
            const params = new URLSearchParams(location.search);
            const id = params.get('appointmentId');
            if (id) setAppointmentId(id);
        }
    }, [location]);

    // Inline styles to match the app's theme without relying on external CSS classes
    const containerStyle = {
        textAlign: 'center',
        padding: '60px 20px',
        maxWidth: '600px',
        margin: '0 auto',
        fontFamily: 'sans-serif'
    };

    const buttonStyle = {
        display: 'inline-block',
        backgroundColor: '#daa520', // Gold theme color
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
            <div style={{ color: '#10b981', marginBottom: '20px' }}>
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
            </div>
            
            <h2 style={{ fontSize: '2rem', marginBottom: '10px', color: '#1f2937' }}>Booking Confirmed!</h2>
            
            <p style={{ color: '#6b7280', marginBottom: '30px', fontSize: '1.1rem' }}>
                Your appointment has been successfully booked and paid for.
            </p>
            
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
