import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User as UserIcon } from 'lucide-react';
import './Navbar.css';

const Navbar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isScrolled, setIsScrolled] = useState(false);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
            setUser(JSON.parse(savedUser));
        }

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

    const handleProfileClick = () => {
        if (!user) return;
        if (user.type === 'admin') navigate('/admin/dashboard');
        else if (user.type === 'manager') navigate('/manager');
        else if (user.type === 'artist') navigate('/artist');
        else if (user.type === 'customer') navigate('/customer');
        else navigate('/');
    };

    const isActive = (path) => location.pathname === path;

    return (
        <nav className={`home-nav ${isScrolled ? 'is-scrolled' : ''}`}>
            <Link to="/" className="home-logo">INKVICTUS</Link>
            <div className="home-nav-links">
                <a href="/#about" className="nav-anchor">About</a>
                <Link to="/artists" className={isActive('/artists') ? 'active-link' : ''}>Artists</Link>
                <Link to="/gallery" className={isActive('/gallery') ? 'active-link' : ''}>Gallery</Link>
                <Link to="/book" className={isActive('/book') ? 'active-link' : ''}>Book Consultation</Link>
                <Link to="/contact" className={isActive('/contact') ? 'active-link' : ''}>Contact</Link>
            </div>
            <div className="home-auth-buttons">
                {user ? (
                    <div className="logged-user-container" onClick={handleProfileClick} title="My Dashboard">
                        <div className="user-icon-circle">
                            <UserIcon size={20} color="#daa520" />
                        </div>
                        <span className="user-display-name">{user.name || 'Account'}</span>
                    </div>
                ) : (
                    <>
                        <Link to="/login" className="login-link">Log In</Link>
                        <button onClick={() => navigate('/register')} className="signup-btn">Sign Up</button>
                    </>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
