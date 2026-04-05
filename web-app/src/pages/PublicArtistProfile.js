import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useParams, Link } from 'react-router-dom';
import { Star, ArrowLeft, ArrowRight, CheckCircle, Image as ImageIcon } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { API_URL } from '../config';

const PublicArtistProfile = () => {
    const { id } = useParams();
    const [artist, setArtist] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [portfolio, setPortfolio] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchArtistData = async () => {
            try {
                setLoading(true);
                const [artistRes, reviewsRes, portfolioRes] = await Promise.all([
                    Axios.get(`${API_URL}/api/artists/${id}/public`),
                    Axios.get(`${API_URL}/api/artists/${id}/reviews`),
                    Axios.get(`${API_URL}/api/portfolio/${id}`) // Assuming portfolio endpoint already exists
                ]);
                
                if (artistRes.data.success) setArtist(artistRes.data.artist);
                if (reviewsRes.data.success) setReviews(reviewsRes.data.reviews);
                if (portfolioRes.data.success) setPortfolio(portfolioRes.data.portfolio || []);
                
            } catch (error) {
                console.error("Error fetching artist details:", error);
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchArtistData();
    }, [id]);

    if (loading) {
        return (
            <div className="public-layout">
                <Navbar />
                <div style={{ minHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="premium-loader"></div>
                </div>
                <Footer />
            </div>
        );
    }

    if (!artist) {
        return (
            <div className="public-layout">
                <Navbar />
                <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '50px' }}>
                    <h2>Artist Not Found</h2>
                    <p style={{ color: '#64748b', marginBottom: '20px' }}>The artist profile you're looking for doesn't exist.</p>
                    <Link to="/artists" className="premium-btn primary" style={{ textDecoration: 'none' }}>Back to Artists</Link>
                </div>
                <Footer />
            </div>
        );
    }

    return (
        <div className="public-layout">
            <Navbar />
            
            <div className="artist-profile-header" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white', padding: '80px 20px 40px', textAlign: 'center' }}>
                <div className="container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '20px' }}>
                        <Link to="/artists" style={{ color: '#94a3b8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
                            <ArrowLeft size={16} /> Back to Artists
                        </Link>
                    </div>
                    
                    <div className="artist-avatar" style={{ width: '120px', height: '120px', borderRadius: '50%', background: '#334155', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 'bold', color: '#cbd5e1', border: '4px solid rgba(255,255,255,0.1)' }}>
                        {artist.name ? artist.name.charAt(0).toUpperCase() : 'A'}
                    </div>
                    
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>{artist.name}</h1>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap', marginBottom: '20px' }}>
                        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '5px 15px', borderRadius: '20px', fontSize: '0.9rem' }}>{artist.specialization || 'Tattoo Artist'}</span>
                        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '5px 15px', borderRadius: '20px', fontSize: '0.9rem' }}>{artist.experience_years ? `${artist.experience_years} Years Exp.` : 'Professional'}</span>
                        <span style={{ background: 'rgba(255,255,255,0.1)', padding: '5px 15px', borderRadius: '20px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Star size={14} color="#fcd34d" fill="#fcd34d" /> {parseFloat(artist.rating).toFixed(1)} / 5.0 ({artist.total_reviews || 0} Reviews)
                        </span>
                    </div>
                    
                    <Link to={`/book`} className="premium-btn highlight" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: '#daa520', color: 'white', padding: '12px 30px', borderRadius: '30px', fontWeight: 'bold' }}>
                        Book With Me <ArrowRight size={18} />
                    </Link>
                </div>
            </div>

            <div className="container" style={{ maxWidth: '1000px', margin: '0 auto', padding: '50px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '40px' }}>
                    
                    {/* Portfolio Section */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}><ImageIcon size={24} color="#6366f1" /> Portfolio</h2>
                        </div>
                        
                        {portfolio && portfolio.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                                {portfolio.map((item, index) => (
                                    <div key={index} style={{ borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', background: 'white' }}>
                                        <img src={item.image_url} alt="Tattoo Portfolio" style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ background: '#f8fafc', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                                <ImageIcon size={40} color="#94a3b8" style={{ marginBottom: '10px' }} />
                                <p style={{ color: '#64748b', margin: 0 }}>Portfolio images are coming soon.</p>
                            </div>
                        )}
                    </div>

                    {/* Reviews Section */}
                    <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}><Star size={24} color="#f59e0b" fill="#f59e0b" /> Client Reviews</h2>
                        </div>
                        
                        {reviews.length > 0 ? (
                            <div style={{ display: 'grid', gap: '20px' }}>
                                {reviews.map(review => (
                                    <div key={review.id} style={{ background: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: '1px solid #f1f5f9' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b' }}>
                                                    {review.customer_name ? review.customer_name.charAt(0) : 'C'}
                                                </div>
                                                <div>
                                                    <h4 style={{ margin: '0 0 4px 0' }}>{review.customer_name || 'Verified Client'}</h4>
                                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <CheckCircle size={12} color="#10b981" /> Verified Appointment • {new Date(review.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '2px' }}>
                                                {[...Array(5)].map((_, i) => (
                                                    <Star key={i} size={16} color={i < review.rating ? '#f59e0b' : '#e2e8f0'} fill={i < review.rating ? '#f59e0b' : 'transparent'} />
                                                ))}
                                            </div>
                                        </div>
                                        {review.comment && (
                                            <p style={{ color: '#475569', lineHeight: '1.6', margin: 0, fontStyle: 'italic' }}>"{review.comment}"</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ background: '#f8fafc', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
                                <Star size={40} color="#cbd5e1" style={{ marginBottom: '10px' }} />
                                <p style={{ color: '#64748b', margin: 0 }}>This artist doesn't have any reviews yet. Be the first!</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <Footer />
        </div>
    );
};

export default PublicArtistProfile;
