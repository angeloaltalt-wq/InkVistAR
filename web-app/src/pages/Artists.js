import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Axios from 'axios';
import { API_URL } from '../config';
import './Artists.css';
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';

function Artists() {
    const navigate = useNavigate();
    const [artists, setArtists] = useState([]);
    const [loading, setLoading] = useState(true);
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

                <div className="artists-grid-container">
                    {loading ? (
                        <div className="loading-text">Loading artists...</div>
                    ) : (
                        artists.map((artist, index) => (
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
                                    <div className="artist-stats">
                                        <span>{artist.experience_years || 0} Years Exp.</span>
                                        <span className="stat-divider">|</span>
                                        <span>★ {artist.rating || '5.0'}</span>
                                    </div>
                                    <button 
                                        className="view-portfolio-btn" 
                                        onClick={() => navigate(`/gallery?artistId=${artist.id}&artistName=${encodeURIComponent(artist.name)}`)}
                                    >
                                        View Portfolio
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>
            <ChatWidget />
        </div>
        </>
    );
}

export default Artists;