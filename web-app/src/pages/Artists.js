import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Axios from 'axios';
import { API_URL } from '../config';
import './Artists.css';
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';
import Footer from '../components/Footer';

function Artists() {
    const navigate = useNavigate();
    const [artists, setArtists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isScrolled, setIsScrolled] = useState(false);

    const STYLES = ['All', 'Traditional', 'Realism', 'Watercolor', 'Tribal', 'New School', 'Neo Traditional', 'Japanese', 'Blackwork', 'Minimalist'];
    const [activeFilter, setActiveFilter] = useState('All');

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
        const fetchArtists = async () => {
            try {
                setLoading(true);
                const res = await Axios.get(`${API_URL}/api/customer/artists`);
                if (res.data.success) {
                    setArtists(res.data.artists);
                }
                setLoading(false);
            } catch (error) {
                console.error("Error fetching artists:", error);
                setLoading(false);
            }
        };
        fetchArtists();
    }, []);

    const filteredArtists = artists.filter(artist => {
        if (activeFilter === 'All') return true;
        const spec = artist.specialization || '';
        return spec.toLowerCase().includes(activeFilter.toLowerCase());
    });

    return (
        <>
            <Navbar />
            <div className="artists-page page-transition-wrapper">

            {/* Hero Section */}
            <header className="artists-hero">
                <div className="artists-hero-overlay"></div>
                <div className="artists-hero-content">
                    <h1>Our Elite Artists</h1>
                    <div className="team-photo-container">
                        <div className="team-photo-placeholder">
                            <span>Insert Team Photo Here</span>
                        </div>
                        <div className="team-badge">BGC'S FINEST</div>
                    </div>
                </div>
            </header>

            {/* Artist Portfolio Grid */}
            <section className="artists-grid-section">
                <p className="artists-intro">
                    Inkvictus would not be possible without the talent and creativity of our skilled artists
                </p>

                <div className="filter-bar" style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '40px' }}>
                    {STYLES.map(style => (
                        <button 
                            key={style}
                            onClick={() => setActiveFilter(style)}
                            className={`filter-btn ${activeFilter === style ? 'active' : ''}`}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '20px',
                                border: '1px solid #e2e8f0',
                                background: activeFilter === style ? '#daa520' : 'white',
                                color: activeFilter === style ? 'white' : '#64748b',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                fontWeight: activeFilter === style ? 'bold' : 'normal'
                            }}
                        >
                            {style}
                        </button>
                    ))}
                </div>

                <div className="artists-grid-container">
                    {loading ? (
                        <div className="loading-text">Loading artists...</div>
                    ) : (
                        filteredArtists.length > 0 ? (
                            filteredArtists.map((artist, index) => (
                                <div key={artist.id || index} className="artist-card fade-in-up">
                                    <div className="artist-image-wrapper">
                                        <img 
                                            src={artist.profile_image || "https://images.unsplash.com/photo-1598371839696-5c5bb00bdc28?auto=format&fit=crop&q=80&w=600"} 
                                            alt={artist.name} 
                                        />
                                        <div className="artist-brand-overlay">V</div>
                                    </div>
                                    <div className="artist-info">
                                        <div className="artist-name-group">
                                            <h2>{artist.name}</h2>
                                            <div className="name-underline"></div>
                                        </div>
                                        <p className="artist-specialty">{artist.specialization || 'Tattoo Artist'}</p>
                                        <button 
                                            className="view-portfolio-btn" 
                                            onClick={() => navigate(`/artist/${artist.id || artist.user_id}`)}
                                        >
                                            View Profile
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                No artists found matching "{activeFilter}" style.
                            </div>
                        )
                    )}
                </div>
            </section>
                <Footer />
            </div>
            <ChatWidget />
        </>
    );
}

export default Artists;