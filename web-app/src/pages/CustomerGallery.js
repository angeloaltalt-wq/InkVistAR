import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { X, Calendar, Heart, Award, Search, Filter } from 'lucide-react';
import './PortalStyles.css';
import { API_URL } from '../config';
import CustomerSideNav from '../components/CustomerSideNav';

function CustomerGallery(){
    const [works, setWorks] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [myTattoos, setMyTattoos] = useState([]);
    const [viewMode, setViewMode] = useState('All'); // 'All', 'Favorites', 'My Tattoos'
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedWork, setSelectedWork] = useState(null);
    const navigate = useNavigate();
    
    const user = JSON.parse(localStorage.getItem('user'));
    const userId = user ? user.id : null;

    useEffect(() => {
        fetchInitialData();
    }, [userId, viewMode]);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            if (viewMode === 'All') {
                const res = await Axios.get(`${API_URL}/api/gallery/works`);
                if (res.data.success) setWorks(res.data.works || []);
                
                // Also fetch user's favorites to show heart status
                if (userId) {
                    const favRes = await Axios.get(`${API_URL}/api/customer/${userId}/favorites`);
                    if (favRes.data.success) {
                        setFavorites(favRes.data.favorites.map(f => f.id));
                    }
                }
            } else if (viewMode === 'Favorites') {
                const res = await Axios.get(`${API_URL}/api/customer/${userId}/favorites`);
                if (res.data.success) {
                    setWorks(res.data.favorites || []);
                    setFavorites(res.data.favorites.map(f => f.id));
                }
            } else if (viewMode === 'My Tattoos') {
                const res = await Axios.get(`${API_URL}/api/customer/${userId}/my-tattoos`);
                if (res.data.success) setMyTattoos(res.data.tattoos || []);
            }
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const toggleFavorite = async (e, workId) => {
        e.stopPropagation();
        if (!userId) return navigate('/login');
        
        try {
            const res = await Axios.post(`${API_URL}/api/customer/favorites`, { userId, workId });
            if (res.data.success) {
                if (res.data.favorited) {
                    setFavorites(prev => [...prev, workId]);
                } else {
                    setFavorites(prev => prev.filter(id => id !== workId));
                    if (viewMode === 'Favorites') {
                        setWorks(prev => prev.filter(w => w.id !== workId));
                    }
                }
            }
        } catch (error) {
            console.error("Error toggling favorite:", error);
        }
    };

    const displayItems = viewMode === 'My Tattoos' ? myTattoos : works;

    const filteredItems = displayItems.filter(w => 
        (w.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (w.artist_name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
                <header className="portal-header">
                    <div className="header-title">
                        <h1>Inspiration Gallery</h1>
                        <p className="header-subtitle">Discover your next masterpiece</p>
                    </div>
                    
                    <div className="header-actions">
                        <div className="search-box">
                            <Search size={18} className="search-icon" />
                            <input 
                                type="text" 
                                placeholder="Search tattoos..." 
                                className="search-input"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </header>

                <div className="portal-content">
                    {/* View Tabs */}
                    <div className="gallery-tabs">
                        <button 
                            className={`tab-btn ${viewMode === 'All' ? 'active' : ''}`}
                            onClick={() => setViewMode('All')}
                        >
                            All Artwork
                        </button>
                        <button 
                            className={`tab-btn ${viewMode === 'Favorites' ? 'active' : ''}`}
                            onClick={() => setViewMode('Favorites')}
                        >
                            <Heart size={16} fill={viewMode === 'Favorites' ? "#C19A6B" : "none"} />
                            My Favorites
                        </button>
                        <button 
                            className={`tab-btn ${viewMode === 'My Tattoos' ? 'active' : ''}`}
                            onClick={() => setViewMode('My Tattoos')}
                        >
                            <Award size={16} />
                            My Tattoos
                        </button>
                    </div>

                    {loading ? (
                        <div className="no-data">
                            <div className="spinner"></div>
                            <p>Curating your gallery...</p>
                        </div>
                    ) : (
                        <div className="gallery-grid">
                            {filteredItems.length ? filteredItems.map(item => (
                                <div key={item.id} className="gallery-item" onClick={() => setSelectedWork(item)}>
                                    <div className="image-container">
                                        <img src={item.image_url} alt={item.title} loading="lazy" />
                                        
                                        {/* Favorite Toggle Button (not for My Tattoos mode) */}
                                        {viewMode !== 'My Tattoos' && (
                                            <button 
                                                className={`favorite-btn ${favorites.includes(item.id) ? 'active' : ''}`}
                                                onClick={(e) => toggleFavorite(e, item.id)}
                                            >
                                                <Heart size={20} fill={favorites.includes(item.id) ? "#ff4d4d" : "rgba(0,0,0,0.3)"} color={favorites.includes(item.id) ? "#ff4d4d" : "white"} />
                                            </button>
                                        )}

                                        {viewMode === 'My Tattoos' && (
                                            <div className="verified-badge">
                                                <Award size={14} />
                                                Verified Ink
                                            </div>
                                        )}
                                    </div>
                                    <div className="gallery-info">
                                        <h3>{item.title || (viewMode === 'My Tattoos' ? 'Tattoo Session' : 'Artwork')}</h3>
                                        <p>by {item.artist_name}</p>
                                        {viewMode === 'My Tattoos' && (
                                            <p className="ink-date">{new Date(item.appointment_date).toLocaleDateString()}</p>
                                        )}
                                    </div>
                                </div>
                            )) : (
                                <div className="empty-state">
                                    <p className="no-data">
                                        {viewMode === 'Favorites' 
                                            ? "You haven't favorited any tattoos yet." 
                                            : viewMode === 'My Tattoos' 
                                                ? "You haven't received any tattoos yet. Ready for your first one?" 
                                                : "No matching artwork found."}
                                    </p>
                                    {viewMode !== 'All' && (
                                        <button className="action-btn" onClick={() => setViewMode('All')}>Browse All Artwork</button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Premium Artwork Modal */}
            {selectedWork && (
                <div className="modal-overlay open" onClick={() => setSelectedWork(null)}>
                    <div className="modal-content gallery-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-inner">
                            {/* Image side */}
                            <div className="modal-image-side">
                                <img src={selectedWork.image_url} alt={selectedWork.title} />
                            </div>
                            
                            {/* Content side */}
                            <div className="modal-info-side">
                                <div className="modal-header">
                                    <div className="title-group">
                                        <h2>{selectedWork.title || 'Classic Tattoo'}</h2>
                                        <p className="artist-by">with <span className="artist-highlight">{selectedWork.artist_name}</span></p>
                                    </div>
                                    <button className="close-modal" onClick={() => setSelectedWork(null)}>
                                        <X size={24}/>
                                    </button>
                                </div>
                                
                                <div className="modal-body">
                                    {selectedWork.category && (
                                        <span className="category-badge">{selectedWork.category}</span>
                                    )}
                                    
                                    <div className="description-container">
                                        <h3>Story behind the ink</h3>
                                        <p>{selectedWork.description || 'A unique piece of art crafted by our resident specialists.'}</p>
                                    </div>

                                    {viewMode === 'My Tattoos' && selectedWork.appointment_date && (
                                        <div className="session-details">
                                            <h3>Session Details</h3>
                                            <p>Received on: <strong>{new Date(selectedWork.appointment_date).toLocaleDateString()}</strong></p>
                                        </div>
                                    )}

                                    {selectedWork.price_estimate && viewMode !== 'My Tattoos' && (
                                        <div className="price-estimate-box">
                                            <p className="price-label">Estimated Price</p>
                                            <p className="price-value">₱{Number(selectedWork.price_estimate).toLocaleString()}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="modal-footer">
                                    {viewMode !== 'My Tattoos' ? (
                                        <>
                                            <button 
                                                className="booking-btn"
                                                onClick={() => navigate('/book', { state: { artistId: selectedWork.artist_id, designTitle: selectedWork.title } })}
                                            >
                                                <Calendar size={18} />
                                                Book This Tattoo
                                            </button>
                                            <button 
                                                className={`fav-toggle-btn ${favorites.includes(selectedWork.id) ? 'active' : ''}`}
                                                onClick={(e) => toggleFavorite(e, selectedWork.id)}
                                            >
                                                <Heart size={18} fill={favorites.includes(selectedWork.id) ? "#ff4d4d" : "none"} />
                                                {favorites.includes(selectedWork.id) ? 'Saved to Favorites' : 'Save to Favorites'}
                                            </button>
                                        </>
                                    ) : (
                                        <button className="booking-btn" onClick={() => navigate('/customer/book')}>
                                            <Calendar size={18} />
                                            Book New Session
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomerGallery;
