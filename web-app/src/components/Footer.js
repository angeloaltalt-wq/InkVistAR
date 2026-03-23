import React from 'react';
import { Mail, Phone, MapPin, Instagram, Facebook, Twitter } from 'lucide-react';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-section">
                    <h2 className="footer-logo">INKVICTUS</h2>
                    <p className="footer-description">
                        BGC's Premier Luxury Tattoo Studio. 
                        Elevating the art of tattooing through 
                        sophistication and elite craftsmanship.
                    </p>
                </div>

                <div className="footer-section">
                    <h3>Quick Links</h3>
                    <ul>
                        <li><a href="/">Home</a></li>
                        <li><a href="/about">About Us</a></li>
                        <li><a href="/artists">Artists</a></li>
                        <li><a href="/gallery">Gallery</a></li>
                        <li><a href="/book">Book Session</a></li>
                    </ul>
                </div>

                <div className="footer-section">
                    <h3>Contact Us</h3>
                    <div className="contact-item">
                        <MapPin size={18} />
                        <span>W Tower, 5th Ave, BGC, Taguig</span>
                    </div>
                    <div className="contact-item">
                        <Phone size={18} />
                        <span>+63 917 123 4567</span>
                    </div>
                    <div className="contact-item">
                        <Mail size={18} />
                        <span>hello@inkvictus.com</span>
                    </div>
                </div>

                <div className="footer-section">
                    <h3>Follow Us</h3>
                    <div className="social-links">
                        <a href="#"><Instagram size={24} /></a>
                        <a href="#"><Facebook size={24} /></a>
                        <a href="#"><Twitter size={24} /></a>
                    </div>
                    <div className="footer-hours">
                        <h4>Studio Hours</h4>
                        <p>Mon - Sat: 11:00 AM - 9:00 PM</p>
                        <p>Sun: By Appointment Only</p>
                    </div>
                </div>
            </div>
            
            <div className="footer-bottom">
                <p>&copy; {new Date().getFullYear()} InkVistAR / Inkvictus Tattoo Studio. All Rights Reserved.</p>
                <div className="footer-legal">
                    <a href="#">Privacy Policy</a>
                    <a href="#">Terms of Service</a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
