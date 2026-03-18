import React from 'react';
import { useLocation, Link } from 'react-router-dom';

const BookingConfirmation = () => {
    const location = useLocation();
    const { appointmentId } = location.state || {};

    return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
            <h2>Booking Confirmed!</h2>
            <p>Your appointment has been successfully booked and paid for.</p>
            {appointmentId && <p>Your Appointment ID is: <strong>{appointmentId}</strong></p>}
            <Link to="/">Go to Home</Link>
        </div>
    );
};

export default BookingConfirmation;
