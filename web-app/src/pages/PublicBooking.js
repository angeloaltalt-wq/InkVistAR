import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomerBookingWizard from '../components/CustomerBookingWizard';
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';

function PublicBooking() {
    const navigate = useNavigate();
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 50) {
                setIsScrolled(true);
            } else {
                setIsScrolled(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div style={{ backgroundColor: '#0D0D0D', minHeight: '100vh', color: '#fff', paddingBottom: '50px' }}>
            <Navbar />

            <div style={{ maxWidth: '800px', margin: '140px auto 0', padding: '0 20px' }}>
                <header style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <h1 style={{ color: '#C19A6B', fontFamily: '"Playfair Display", serif', fontSize: '3rem', margin: '0 0 10px 0' }}>BOOK AN APPOINTMENT</h1>
                    <p style={{ color: '#aaa', fontSize: '1.1rem' }}>Select your artist, date, and let us know what you want to create.</p>
                </header>

                <div style={{ backgroundColor: '#fff', borderRadius: '15px', color: '#000', overflow: 'hidden' }}>
                    <CustomerBookingWizard 
                        customerId={null} 
                        isPublic={true}
                        onBack={() => navigate(-1)} 
                    />
                </div>
            </div>

            <ChatWidget />
        </div>
    );
}

export default PublicBooking;
