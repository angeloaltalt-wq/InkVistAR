import React, { useEffect, useState, useRef } from 'react';
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';
import './Home.css'; // Reuse Home styles for consistency

const About = () => {
    const sectionRef = useRef(null);

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
                }
            });
        }, observerOptions);

        if (sectionRef.current) observer.observe(sectionRef.current);

        return () => {
            if (sectionRef.current) observer.unobserve(sectionRef.current);
        };
    }, []);

    return (
        <div className="home-container" style={{ paddingTop: '80px' }}>
            <Navbar />
            
            <header className="about-header-v2" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <h1 className="about-title" style={{ fontSize: '4rem', marginBottom: '1rem' }}>Our Story</h1>
                <p style={{ color: '#C19A6B', fontSize: '1.2rem', fontWeight: '600', letterSpacing: '2px' }}>CRAFTING TIMELESS ART IN BGC</p>
            </header>

            <section className="about-section is-visible" ref={sectionRef} style={{ padding: '2rem 2rem 8rem' }}>
                <div className="about-image-container">
                    <img src="https://images.unsplash.com/photo-1605218427368-35b0f99846b1?auto=format&fit=crop&q=80&w=1200" alt="Studio Interior" className="about-image" />
                </div>
                <div className="glass-text-box">
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
            </section>

            <ChatWidget />
        </div>
    );
};

export default About;
