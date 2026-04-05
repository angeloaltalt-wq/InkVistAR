import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import './Home.css'; // New CSS file
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';
import Footer from '../components/Footer';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { API_URL } from '../config';

function Home() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isScrolled, setIsScrolled] = useState(false);
    
    const [scrollPercentage, setScrollPercentage] = useState(0);
    const pathRef1 = useRef(null);
    const pathRef2 = useRef(null);
    const [pathLength1, setPathLength1] = useState(0);
    const [pathLength2, setPathLength2] = useState(0);

    // Refs for animated sections
    const aboutRef = useRef(null);
    const testimonialsRef = useRef(null);

    // Carousel State
    const [testimonials, setTestimonials] = useState([]);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);

    useEffect(() => {
        if (pathRef1.current) setPathLength1(pathRef1.current.getTotalLength());
        if (pathRef2.current) setPathLength2(pathRef2.current.getTotalLength());
    }, []);

    useEffect(() => {
        fetch(`${API_URL}/api/testimonials`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.testimonials.length > 0) {
                    setTestimonials(data.testimonials);
                } else {
                    // Fallback dummy data if db is empty
                    setTestimonials([
                        { id: 1, customer_name: 'Cornelius Cornwall', rating: 5, content: 'Absolutely stunning work. The atmosphere is incredibly professional and relaxing. I wouldn\'t trust anyone else with my skin.', media_type: 'none' },
                        { id: 2, customer_name: 'Genevieve Winters', rating: 5, content: 'Inkvictus redefined what getting a tattoo means for me. The luxury, the care, the artistic vision—unparalleled in BGC.', media_type: 'none' }
                    ]);
                }
            })
            .catch(err => console.error("Error fetching testimonials:", err));
    }, []);

    const nextSlide = useCallback(() => {
        setCurrentSlide(prev => (prev === testimonials.length - 1 ? 0 : prev + 1));
    }, [testimonials.length]);

    const prevSlide = useCallback(() => {
        setCurrentSlide(prev => (prev === 0 ? testimonials.length - 1 : prev - 1));
    }, [testimonials.length]);

    useEffect(() => {
        let interval;
        if (isAutoPlaying && testimonials.length > 1) {
            interval = setInterval(nextSlide, 5000);
        }
        return () => clearInterval(interval);
    }, [isAutoPlaying, nextSlide, testimonials.length]);

    useEffect(() => {
        const handleScroll = () => {
            const scrollTotal = document.documentElement.scrollHeight - window.innerHeight;
            const scrollProgress = scrollTotal > 0 ? (window.scrollY / scrollTotal) : 0;
            setScrollPercentage(scrollProgress);

            if (window.scrollY > 50) {
                setIsScrolled(true);
            } else {
                setIsScrolled(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        // Trigger once to set initial state correctly
        handleScroll();
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
        <>
            <Navbar />
            <div className="home-container page-transition-wrapper">
                {/* Scroll Animation Background SVGs */}
                <svg className="scroll-bg-svg" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 0, pointerEvents: 'none', opacity: 0.5 }}>
                    <path 
                        ref={pathRef1}
                        d="M 10,0 C 90,20 100,50 10,70 C -60,95 50,110 50,110"
                        fill="none" 
                        stroke="#C19A6B" 
                        strokeWidth="0.5" 
                        style={{ 
                            strokeDasharray: pathLength1, 
                            strokeDashoffset: pathLength1 - (scrollPercentage * pathLength1),
                            transition: 'stroke-dashoffset 0.1s ease-out'
                        }} 
                    />
                    <path 
                        ref={pathRef2}
                        d="M 90,0 C 10,30 10,60 90,80 C 170,105 45,110 45,110"
                        fill="none" 
                        stroke="#8a6c4a" 
                        strokeWidth="0.2" 
                        style={{ 
                            strokeDasharray: pathLength2, 
                            strokeDashoffset: pathLength2 - (scrollPercentage * pathLength2),
                            transition: 'stroke-dashoffset 0.1s ease-out'
                        }} 
                    />
                </svg>

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
                    <h1 className="hero-title">INKVICTUS TATTOO</h1>
                    <h2 className="hero-subtitle">BGC’s Premier Luxury Tattoo Studio</h2>
                    <button onClick={() => navigate('/register')} className="hero-cta">Inquire Now</button>
                </div>
                
                <div className="ghost-text">W TOWER, BGC.</div>
            </header>

            {/* Section 2: About / Studio Showcase */}
            <section id="about" className="about-section fade-section" ref={aboutRef}>
                <h2 className="about-title">The Art of Inkvictus</h2>
                <div className="about-image-container">
                    <img className="about-image" src="https://images.unsplash.com/photo-1550684376-efcbd6e3f031?auto=format&fit=crop&q=80&w=1200" alt="Inkvictus Studio" />
                </div>
                <p className="about-text">
                    Located in the heart of BGC, Inkvictus offers a sanitary, luxurious and professional space where world-class artists bring your vision to life.
                </p>
                
                {/* Extended About Section Content (Merged from About.js) */}
                <div className="extended-about" style={{ marginTop: '6rem', maxWidth: '1200px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h2 className="about-title" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Our Story</h2>
                    <p style={{ color: '#C19A6B', fontSize: '1rem', fontWeight: '600', letterSpacing: '2px', marginBottom: '3rem', textTransform: 'uppercase' }}>Crafting Timeless Art in BGC</p>
                    
                    <div className="about-image-container" style={{ maxWidth: '800px', marginBottom: '3rem' }}>
                        <img src="https://images.unsplash.com/photo-1605218427368-35b0f99846b1?auto=format&fit=crop&q=80&w=1200" alt="Studio Interior" className="about-image" />
                    </div>
                    
                    <div style={{ maxWidth: '800px', textAlign: 'center' }}>
                        <p className="about-text">
                            Inkvictus Tattoo is more than just a studio; it is a sanctuary for art and expression. Located in the heart of BGC, we offer a premium experience that combines world-class artistry with the highest standards of hygiene and comfort.
                        </p>
                        <p className="about-text" style={{ marginTop: '1.5rem' }}>
                            Our team of award-winning artists specializes in a wide range of styles, from hyper-realism and traditional Japanese art to minimalist fine-line work. We believe that every tattoo is a collaboration between the artist and the client, ensuring that each piece is a unique reflection of your vision.
                        </p>
                        <p className="about-text" style={{ marginTop: '1.5rem' }}>
                            At Inkvictus, we pride ourselves on our state-of-the-art facility, where luxury meets clinical precision. Every session is designed to be an experience worth attending, set in a professional and relaxing atmosphere that elevates what getting a tattoo stands for.
                        </p>
                    </div>
                </div>

                {/* Micro-animation SVG detail */}
                <div style={{ marginTop: '5rem' }}>
                    <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="50" cy="50" r="40" stroke="#C19A6B" strokeWidth="1" strokeDasharray="5 5" className="spin-slow" />
                        <path d="M50 20 L50 80 M20 50 L80 50 M30 30 L70 70 M30 70 L70 30" stroke="#C19A6B" strokeWidth="0.5" className="fade-pulse" />
                    </svg>
                </div>
            </section>

            {/* Section 3: Testimonials */}
            <section id="testimonials" className="testimonials-section fade-section" ref={testimonialsRef}>
                <div className="testimonials-background">
                    <img src="https://images.unsplash.com/photo-1536059540012-f2ed455f229d?auto=format&fit=crop&q=80&w=1200" alt="Studio Ambience" />
                </div>
                <div className="testimonials-overlay"></div>
                
                <div className="testimonials-content" 
                     onMouseEnter={() => setIsAutoPlaying(false)}
                     onMouseLeave={() => setIsAutoPlaying(true)}
                >
                    <h2 className="testimonials-title">Satisfying Our Clients</h2>
                    
                    <div className="premium-carousel-container">
                        <div className="carousel-track" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
                            {testimonials.map((testimony, idx) => (
                                <div key={testimony.id} className={`carousel-slide ${idx === currentSlide ? 'active' : ''}`}>
                                    <div className="premium-testimonial-card">
                                        
                                        {testimony.media_type === 'video' && testimony.media_url && (
                                            <div className="media-container">
                                                <video src={testimony.media_url} controls muted loop playsInline disablePictureInPicture />
                                            </div>
                                        )}
                                        {testimony.media_type === 'image' && testimony.media_url && (
                                            <div className="media-container">
                                                <img src={testimony.media_url} alt="Review attachment" />
                                            </div>
                                        )}

                                        <div className="testimonial-stars">
                                            {'★'.repeat(testimony.rating || 5)}{'☆'.repeat(5 - (testimony.rating || 5))}
                                        </div>
                                        <p className="testimonial-author">{testimony.customer_name}</p>
                                        <p className="testimonial-body">
                                            "{testimony.content}"
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {testimonials.length > 1 && (
                            <>
                                <div className="carousel-controls">
                                    <button className="carousel-btn" onClick={prevSlide}><ChevronLeft size={24} /></button>
                                    <div className="carousel-indicators">
                                        {testimonials.map((_, idx) => (
                                            <button 
                                                key={idx} 
                                                className={`indicator-dot ${idx === currentSlide ? 'active' : ''}`}
                                                onClick={() => setCurrentSlide(idx)}
                                                aria-label={`Go to slide ${idx + 1}`}
                                            />
                                        ))}
                                    </div>
                                    <button className="carousel-btn" onClick={nextSlide}><ChevronRight size={24} /></button>
                                </div>
                            </>
                        )}
                    </div>

                    <p className="testimonials-tagline">Inkvictus pride’s itself on elevating what getting a tattoo stands for.</p>
                    <button onClick={() => navigate('/register')} className="hero-cta">Inquire Now</button>
                </div>
            </section>

                <Footer />
            </div>
            <ChatWidget />
        </>
    );
}

export default Home;
