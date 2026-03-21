import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
    const navigate = useNavigate();
    const location = useLocation();
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

    const isActive = (path) => location.pathname === path;

    return (
        <nav className={`home-nav ${isScrolled ? 'is-scrolled' : ''}`}>
            <Link to="/" className="home-logo">INKVICTUS</Link>
            <div className="home-nav-links">
                <Link to="/about" className={isActive('/about') ? 'active-link' : ''}>About</Link>
                <Link to="/artists" className={isActive('/artists') ? 'active-link' : ''}>Artists</Link>
                <Link to="/gallery" className={isActive('/gallery') ? 'active-link' : ''}>Gallery</Link>
                <Link to="/book" className={isActive('/book') ? 'active-link' : ''}>Booking</Link>
                <Link to="/contact" className={isActive('/contact') ? 'active-link' : ''}>Contact</Link>
            </div>
            <div className="home-auth-buttons">
                <Link to="/login" className="login-link">Log In</Link>
                <button onClick={() => navigate('/register')} className="signup-btn">Sign Up</button>
            </div>
        </nav>
    );
};

export default Navbar;
