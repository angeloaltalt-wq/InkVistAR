import './CustomerStyles.css';
import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Calendar, Heart, Award, Search, Filter, Loader } from 'lucide-react';
import './PortalStyles.css';
import { API_URL } from '../config';
import CustomerSideNav from '../components/CustomerSideNav';
import ImageLightbox from '../components/ImageLightbox';
import { TATTOO_STYLES } from '../constants/tattooStyles';

function CustomerGallery(){
    const [works, setWorks] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [myTattoos, setMyTattoos] = useState([]);
    const navigate = useNavigate();
    const location = useLocation();
    const [viewMode, setViewMode] = useState(location.state?.initialViewMode || 'All'); // 'All', 'Favorites', 'My Tattoos'
    
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedWork, setSelectedWork] = useState(null);
    const [toggling, setToggling] = useState(false);
    const [activeCategory, setActiveCategory] = useState('All');
    const [activeArtistId, setActiveArtistId] = useState('All');
    const [artistsList, setArtistsList] = useState([]);
    const [priceRange, setPriceRange] = useState({ min: 0, max: 500000 });
    const [showPriceFilter, setShowPriceFilter] = useState(false);
    const [categories, setCategories] = useState(['All', ...TATTOO_STYLES]);
    const [lightboxSrc, setLightboxSrc] = useState(null);

    useEffect(() => {
        // Clear navigation state after consumed
        if (location.state?.initialViewMode) {
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const user = JSON.parse(localStorage.getItem('user'));
    const userId = user ? user.id : null;

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await Axios.get(`${API_URL}/api/gallery/categories`);
                if (res.data.success && res.data.categories) {
                    setCategories(['All', ...res.data.categories]);
                }
            } catch (e) { console.error(e); }
        };
        fetchCategories();

        const fetchArtists = async () => {
            try {
                const res = await Axios.get(`${API_URL}/api/customer/artists`);
                if (res.data.success && res.data.artists) {
                    setArtistsList(res.data.artists.filter(a => a.portfolio_count > 0));
                }
            } catch (e) { console.error(e); }
        };
        fetchArtists();
    }, []);

    useEffect(() => {
        if (works.length > 0) {
            const uniqueCategories = [...new Set(works.map(item => item.category).filter(Boolean))];
            setCategories(prev => [...new Set([...prev, ...uniqueCategories])]);
        }
    }, [works]);

    useEffect(() => {
        fetchInitialData();
    }, [userId, viewMode]);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            if (viewMode === 'All') {
                const res = await Axios.get(`${API_URL}/api/gallery/works`);
                if (res.data.success) {
                    const worksData = res.data.works || [];
                    setWorks(worksData);
                }
                
                // Also fetch user's favorites to show heart status
                if (userId) {
                    try {
                        const favRes = await Axios.get(`${API_URL}/api/customer/${userId}/favorites`);
                        if (favRes.data.success) {
                            setFavorites(favRes.data.favorites.map(f => f.id));
                        }
                    } catch (favErr) {
                        console.error('Error fetching favorites:', favErr);
                    }
                }
            } else if (viewMode === 'Favorites') {
                if (!userId) {
                    setWorks([]);
                    setFavorites([]);
                } else {
                    const res = await Axios.get(`${API_URL}/api/customer/${userId}/favorites`);
                    if (res.data.success) {
                        setWorks(res.data.favorites || []);
                        setFavorites(res.data.favorites.map(f => f.id) || []);
                    }
                }
            } else if (viewMode === 'My Tattoos') {
                if (!userId) {
                    setMyTattoos([]);
                } else {
                    const res = await Axios.get(`${API_URL}/api/customer/${userId}/my-tattoos`);
                    if (res.data.success) setMyTattoos(res.data.tattoos || []);
                }
            }
            setLoading(false);
        } catch (e) {
            console.error('Error fetching initial data:', e);
            setLoading(false);
        }
    };

    const toggleFavorite = async (e, workId) => {
        e.stopPropagation();
        if (!userId) return navigate('/login');
        
        setToggling(true);
        try {
            const res = await Axios.post(`${API_URL}/api/customer/favorites`, { userId, workId });
            if (res.data.success) {
                if (res.data.favorited) {
                    // Adding to favorites
                    setFavorites(prev => [...prev, workId]);
                } else {
                    // Removing from favorites
                    setFavorites(prev => prev.filter(id => id !== workId));
                    if (viewMode === 'Favorites') {
                        // Remove from displayed works when in favorites view
                        setWorks(prev => prev.filter(w => w.id !== workId));
                        // Also update selected work if it's currently displayed
                        if (selectedWork && selectedWork.id === workId) {
                            setSelectedWork(null);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error toggling favorite:", error);
        } finally {
            setToggling(false);
        }
    };

    const displayItems = viewMode === 'My Tattoos' ? myTattoos : works;

    const filteredItems = displayItems.filter(w => {
        const matchesSearch = (w.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (w.artist_name || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = activeCategory === 'All' || w.category === activeCategory;
        const matchesArtist = activeArtistId === 'All' || w.artist_id?.toString() === activeArtistId.toString();
        const price = w.price_estimate ? Number(w.price_estimate) : null;
        const matchesPrice = price === null || (price >= priceRange.min && (priceRange.max >= 500000 || price <= priceRange.max));
        return matchesSearch && matchesCategory && matchesArtist && matchesPrice;
    });

    return (
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
                <header className="portal-header">
                    <div className="header-title">
                        <h1>Inspiration Gallery</h1>
                    </div>
                    
                    <div className="header-actions">
                        <div className="header-search glass-card customer-st-85bcdeca" >
                            <Search className="customer-st-7cc777b1" size={18} />
                            <input className="customer-st-baadca45" type="text" placeholder="Search styles, artists..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                    </div>
                </header>

                <p className="header-subtitle customer-st-5c2e40e1" >Explore verified artwork and save your favorites</p>

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
                            <Heart size={16} fill={viewMode === 'Favorites' ? "#be9055" : "none"} />
                            My Favorites ({favorites.length})
                        </button>
                        <button 
                            className={`tab-btn ${viewMode === 'My Tattoos' ? 'active' : ''}`}
                            onClick={() => setViewMode('My Tattoos')}
                        >
                            <Award size={16} />
                            My Tattoos
                        </button>
                    </div>

                    {/* Category Filter Dropdown */}
                    {categories.length > 1 && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            marginBottom: '20px'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                flexWrap: 'wrap'
                            }}>
                                {/* Style Filter */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                        <Filter size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Style:
                                    </label>
                                    <select
                                        value={activeCategory}
                                        onChange={(e) => setActiveCategory(e.target.value)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.12)',
                                            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', color: '#1e293b',
                                            fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
                                            minWidth: '150px', appearance: 'none',
                                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '36px'
                                        }}
                                    >
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Artist Filter */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                        Artist:
                                    </label>
                                    <select
                                        value={activeArtistId}
                                        onChange={(e) => setActiveArtistId(e.target.value)}
                                        style={{
                                            padding: '8px 16px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.12)',
                                            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', color: '#1e293b',
                                            fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
                                            minWidth: '150px', appearance: 'none',
                                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '36px'
                                        }}
                                    >
                                        <option value="All">All Artists</option>
                                        {artistsList.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Price Range Toggle */}
                                <button
                                    onClick={() => setShowPriceFilter(!showPriceFilter)}
                                    style={{
                                        padding: '8px 16px', borderRadius: '10px', border: showPriceFilter ? '1px solid #be9055' : '1px solid rgba(0,0,0,0.12)',
                                        background: showPriceFilter ? 'rgba(193, 154, 107, 0.1)' : 'rgba(255,255,255,0.85)', color: showPriceFilter ? '#be9055' : '#1e293b',
                                        fontSize: '0.88rem', fontWeight: '600', cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
                                    }}
                                >
                                    PRICE RANGE
                                </button>
                            </div>

                            {/* Price Slider UI */}
                            {showPriceFilter && (
                                <div style={{ 
                                    background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '12px', padding: '16px',
                                    maxWidth: '400px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                                        <span>ESTIMATED PRICE</span>
                                        <span style={{ color: '#be9055' }}>
                                            ₱{priceRange.min.toLocaleString()} - ₱{priceRange.max.toLocaleString()}{priceRange.max >= 500000 ? '+' : ''}
                                        </span>
                                    </div>
                                    <div style={{ position: 'relative', height: '30px', display: 'flex', alignItems: 'center' }}>
                                        <div style={{ position: 'absolute', width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px' }} />
                                        <div style={{ 
                                            position: 'absolute', height: '4px', background: '#be9055', borderRadius: '2px',
                                            left: `${(priceRange.min / 500000) * 100}%`, width: `${((priceRange.max - priceRange.min) / 500000) * 100}%`
                                        }} />
                                        <input
                                            type="range" min="0" max="500000" step="5000" value={priceRange.min}
                                            onChange={(e) => {
                                                const val = Math.min(parseInt(e.target.value), priceRange.max - 5000);
                                                setPriceRange({ ...priceRange, min: val });
                                            }}
                                            style={{ position: 'absolute', width: '100%', appearance: 'none', pointerEvents: 'none', background: 'transparent', zIndex: priceRange.min > 400000 ? 5 : 3 }}
                                            className="custom-range-slider"
                                        />
                                        <input
                                            type="range" min="0" max="500000" step="5000" value={priceRange.max}
                                            onChange={(e) => {
                                                const val = Math.max(parseInt(e.target.value), priceRange.min + 5000);
                                                setPriceRange({ ...priceRange, max: val });
                                            }}
                                            style={{ position: 'absolute', width: '100%', appearance: 'none', pointerEvents: 'none', background: 'transparent', zIndex: 4 }}
                                            className="custom-range-slider"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <div className="no-data">
                            <Loader className="customer-st-b915c9ab" size={40} />
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
                                                disabled={toggling}
                                                title={favorites.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'}
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
                                <img src={selectedWork.image_url} alt={selectedWork.title} className="lightbox-trigger" onClick={(e) => { e.stopPropagation(); setLightboxSrc(selectedWork.image_url); }} />
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
                                            <p className="price-value">₱{Number(selectedWork.price_estimate).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="modal-footer">
                                    {viewMode !== 'My Tattoos' ? (
                                        <>
                                            <button 
                                                className="booking-btn"
                                                onClick={() => navigate('/customer/bookings', { state: { artistId: selectedWork.artist_id, designTitle: selectedWork.title, autoOpenBooking: true } })}
                                            >
                                                <Calendar size={18} />
                                                Book This Tattoo
                                            </button>
                                            <button 
                                                className={`fav-toggle-btn ${favorites.includes(selectedWork.id) ? 'active' : ''}`}
                                                onClick={(e) => toggleFavorite(e, selectedWork.id)}
                                                disabled={toggling}
                                            >
                                                <Heart size={18} fill={favorites.includes(selectedWork.id) ? "#ff4d4d" : "none"} color={favorites.includes(selectedWork.id) ? "#ff4d4d" : "white"} />
                                                {favorites.includes(selectedWork.id) ? 'Saved to Favorites' : 'Save to Favorites'}
                                            </button>
                                        </>
                                    ) : (
                                        <button className="booking-btn" onClick={() => navigate('/customer/bookings', { state: { autoOpenBooking: true } })}>
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

            <ImageLightbox src={lightboxSrc} alt="Gallery artwork" onClose={() => setLightboxSrc(null)} />

            
            <style>
                {`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    .custom-range-slider::-webkit-slider-thumb {
                        pointer-events: all;
                        width: 18px;
                        height: 18px;
                        -webkit-appearance: none;
                        background: white;
                        border: 2px solid #be9055;
                        border-radius: 50%;
                        cursor: pointer;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                    }
                `}
            </style>
        </div>
    );
}

export default CustomerGallery;
