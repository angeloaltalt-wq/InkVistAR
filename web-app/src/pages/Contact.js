import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Mail, Clock, Bell, User } from 'lucide-react';
import './Contact.css';
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';

const Contact = () => {
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
    <>
      <Navbar />

      <div className="contact-page">
      {/* Header Section */}
      <header className="contact-header">
        <h1>Get In Touch</h1>
        <p>Stop by our studio or reach out to us</p>
      </header>

      {/* Primary Contact Section */}
      <div className="contact-content">
        {/* Left Column: Map */}
        <div className="map-column">
            <iframe
              title="Studio Location"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.442111088198!2d121.0544491758839!3d14.55887038982025!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397c900427e03a9%3A0x619a86a0023020e0!2sInkvictus!5e0!3m2!1sen!2sus!4v1716321980123!5m2!1sen!2sus"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen=""
              loading="lazy"
            ></iframe>
        </div>

        {/* Right Column: Information Cards */}
        <div className="info-column">
          <div className="info-card">
            <div className="info-icon"><MapPin size={24} /></div>
            <div className="info-text">
              <h3>Address</h3>
              <p>32nd Street, corner 9th Ave, Taguig, 1634 Metro Manila, Philippines</p>
            </div>
          </div>

          <div className="info-card">
            <div className="info-icon"><Mail size={24} /></div>
            <div className="info-text">
              <h3>Email</h3>
              <p>info@inkvictus.com</p>
            </div>
          </div>

          <div className="info-card">
            <div className="info-icon"><Clock size={24} /></div>
            <div className="info-text">
              <h3>Hours</h3>
              <p>Monday - Saturday: 1:00 PM - 8:00 PM</p>
              <p>Sunday: Closed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Getting Here Directions */}
      <div className="directions-container">
        <h2>Getting Here</h2>
        <div className="directions-grid">
          <div className="direction-column">
            <h3>By Car</h3>
            <p>Street parking is available along 36th Street. Secure parking is also available at the 2nd Street garage, just a block away from W Tower.</p>
          </div>
          <div className="direction-column">
            <h3>By Metro</h3>
            <p>Take the Red Line to Downtown Station. From there, it's a pleasant 5-minute walk past the High Street shops to our building.</p>
          </div>
          <div className="direction-column">
            <h3>By Bus</h3>
            <p>Bus lines 10, 20, and 45 all have stops within two blocks of the studio. Look for the W Tower stop.</p>
          </div>
        </div>
      </div>
    </div>
    <ChatWidget />
    </>
  );
};

export default Contact;