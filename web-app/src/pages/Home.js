import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import './Home.css'; // New CSS file
import ChatWidget from '../components/ChatWidget';

function Home() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isScrolled, setIsScrolled] = useState(false);
    
    // Refs for animated sections
    const aboutRef = useRef(null);
    const testimonialsRef = useRef(null);

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

    useEffect(() => {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.15
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    // Optional: stop observing once visible if you only want it to fade in once
                    // observer.unobserve(entry.target); 
                } else {
                    // Remove if you want it to fade out when scrolling up
                    entry.target.classList.remove('is-visible');
                }
            });
        }, observerOptions);

        if (aboutRef.current) observer.observe(aboutRef.current);
        if (testimonialsRef.current) observer.observe(testimonialsRef.current);

        return () => {
            if (aboutRef.current) observer.unobserve(aboutRef.current);
            if (testimonialsRef.current) observer.unobserve(testimonialsRef.current);
        };
    }, []);

    // Handle initial hash routing since standard a href="#about" might not jump correctly if the page just loaded
    useEffect(() => {
        if (location.hash) {
            const id = location.hash.replace('#', '');
            const element = document.getElementById(id);
            if (element) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
        }
    }, [location]);

    return (
        <div className="home-container">
            {/* Navigation */}
            <nav className={`home-nav ${isScrolled ? 'is-scrolled' : ''}`}>
                <a href="/" className="home-logo">INKVICTUS</a>
                <div className="home-nav-links">
                    <a href="/#about">About</a>
                    <Link to="/artists">Artists</Link>
                    <Link to="/gallery">Gallery</Link>
                    <Link to="/book">Booking</Link>
                    <Link to="/contact">Contact</Link>
                </div>
                <div className="home-auth-buttons">
                    <a href="/login" className="login-link">Log In</a>
                    <button onClick={() => navigate('/register')} className="signup-btn">Sign Up</button>
                </div>
            </nav>

            {/* Section 1: Hero Screen */}
            <header className="hero-header">
                <div className="hero-section">
                    <div className="hero-column">
                        <img src="https://images.unsplash.com/photo-1598371839696-5c5bb00bdc28?auto=format&fit=crop&q=80&w=800" alt="Tattooing close up" />
                    </div>
                    <div className="hero-column">
                        <img src="https://images.unsplash.com/photo-1562962230-16e4623d36e6?auto=format&fit=crop&q=80&w=800" alt="Tattoo artist at work" />
                    </div>
                    <div className="hero-column">
                        <img src="https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?auto=format&fit=crop&q=80&w=800" alt="Detailed tattoo art" />
                    </div>
                </div>
                <div className="hero-overlay"></div>
                
                <div className="hero-content">
                    <div className="glass-hero-box">
                        <h1 className="hero-title">INKVICTUS TATTOO</h1>
                        <h2 className="hero-subtitle">BGC’s Premier Luxury Tattoo Studio</h2>
                        <button onClick={() => navigate('/register')} className="hero-cta">Inquire Now</button>
                    </div>
                </div>
                
                <div className="ghost-text">W TOWER, BGC.</div>
            </header>

            {/* Section 2: About / Studio Showcase */}
            <section id="about" className="about-section fade-section" ref={aboutRef}>
                <h2 className="about-title">BGC’s Premier Luxury Tattoo Studio</h2>
                <div className="about-image-container">
                    <img src="https://images.unsplash.com/photo-1605218427368-35b0f99846b1?auto=format&fit=crop&q=80&w=1200" alt="Studio Interior" className="about-image" />
                </div>
                <div className="glass-text-box">
                    <p className="about-text">
                        Inkvictus Tattoo is more than just a studio; it is a sanctuary for art and expression. Located in the heart of BGC, we offer a premium experience that combines world-class artistry with the highest standards of hygiene and comfort. Our mission is to transform your vision into a timeless masterpiece.
                    </p>
                </div>
            </section>

            {/* Section 3: Testimonials */}
            <section id="testimonials" className="testimonials-section fade-section" ref={testimonialsRef}>
                <div className="testimonials-background">
                    <img src="https://images.unsplash.com/photo-1536059540012-f2ed455f229d?auto=format&fit=crop&q=80&w=1200" alt="Studio Ambience" />
                </div>
                <div className="testimonials-overlay"></div>
                
                <div className="testimonials-content">
                    <h2 className="testimonials-title">Satisfying Our Clients</h2>
                    
                    <div className="testimonials-grid">
                        <div className="testimonial-card side"></div>
                        <div className="testimonial-card center">
                            <h3 className="testimonial-quote">"An Experience Worth Attending"</h3>
                            <div className="testimonial-stars">★★★★★</div>
                            <p className="testimonial-author">Cornelius Cornwall</p>
                            <p className="testimonial-body">
                                "Absolutely stunning work. The atmosphere is incredibly professional and relaxing. I wouldn't trust anyone else with my skin."
                            </p>
                        </div>
                        <div className="testimonial-card side"></div>
                    </div>

                    <p className="testimonials-tagline">Inkvictus pride’s itself on elevating what getting a tattoo stands for.</p>
                    <button onClick={() => navigate('/register')} className="hero-cta">Inquire Now</button>
                </div>
            </section>

            <ChatWidget />
        </div>
    );
}

export default Home;
