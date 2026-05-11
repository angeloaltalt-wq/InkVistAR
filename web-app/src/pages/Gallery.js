import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_URL } from '../config';
import './Gallery.css';
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';
import Footer from '../components/Footer';
import { TATTOO_STYLES } from '../constants/tattooStyles';
import ImageLightbox from '../components/ImageLightbox';

const Gallery = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeArtistId, setActiveArtistId] = useState('All');
  const [artistsList, setArtistsList] = useState([]);
  const [categories, setCategories] = useState(['All', ...TATTOO_STYLES]);
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 500000 });
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const [debouncedPriceRange, setDebouncedPriceRange] = useState({ min: 0, max: 500000 });

  // Parse query params for artist filter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const artistId = params.get('artistId');
    
    if (artistId) {
      setActiveArtistId(artistId);
    } else {
      setActiveArtistId('All');
    }
  }, [location.search]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;



  
  // Fetch artists
  useEffect(() => {
    fetch(`${API_URL}/api/customer/artists`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.artists) {
          const activeArtists = data.artists.filter(a => a.portfolio_count > 0);
          setArtistsList(activeArtists);
        }
      })
      .catch(err => console.error('Error fetching artists:', err));
  }, []);

  // Fetch categories from backend
  useEffect(() => {
    fetch(`${API_URL}/api/gallery/categories`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.categories) {
          setCategories(data.categories);
        }
      })
      .catch(err => console.error('Error fetching categories:', err));
  }, []);

  // Debounce price filter
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedPriceRange(priceRange);
    }, 400);
    return () => clearTimeout(handler);
  }, [priceRange]);

  // Update categories list if works contain categories not in the style filter
  useEffect(() => {
    if (works.length > 0) {
      const uniqueCategories = [...new Set(works.map(item => item.category).filter(Boolean))];
      setCategories(prev => {
        const combined = [...new Set([...prev, ...uniqueCategories])];
        return combined;
      });
    }
  }, [works]);

  // Fetch works from backend (re-fetch when category or artist changes)
  useEffect(() => {


    setLoading(true);
    let url = `${API_URL}/api/gallery/works?`;
    
    const queryParams = new URLSearchParams();
    if (activeCategory && activeCategory !== 'All') {
      queryParams.append('category', activeCategory);
    }
    if (activeArtistId && activeArtistId !== 'All') {
      queryParams.append('artistId', activeArtistId);
    }
    queryParams.append('minPrice', debouncedPriceRange.min);
    queryParams.append('maxPrice', debouncedPriceRange.max);
    
    url += queryParams.toString();
    console.log(`[GALLERY] Fetching from URL: ${url}`);

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.works) {
          setWorks(data.works);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching works:', err);
        setLoading(false);
      });
  }, [activeCategory, activeArtistId, location.search, debouncedPriceRange]);

  // Reset page when category or artist changes
  useEffect(() => {
     setCurrentPage(1);
  }, [activeCategory, activeArtistId, debouncedPriceRange]);

  // Pagination logic
  const totalPages = Math.ceil(works.length / itemsPerPage);
  const paginatedWorks = works.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
      <Navbar />

      <div className="gallery-page page-transition-wrapper">
      {/* Header Section */}
      <header className="gallery-header">
        <h1>OUR ARTWORK SPEAKS VOLUMES</h1>

        <div className="filter-nav-container">
          <span className="filter-label">STYLE FILTER:</span>
          <div className="filter-nav">
            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              style={{
                padding: '8px 20px',
                paddingRight: '40px',
                borderRadius: '50px',
                border: '1px solid #be9055',
                background: '#1a1a1a',
                color: '#be9055',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 0.3s ease',
                minWidth: '200px',
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23C19A6B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center'
              }}
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={activeArtistId}
              onChange={(e) => setActiveArtistId(e.target.value)}
              style={{
                padding: '8px 20px',
                paddingRight: '40px',
                borderRadius: '50px',
                border: '1px solid #be9055',
                background: '#1a1a1a',
                color: '#be9055',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 0.3s ease',
                minWidth: '150px',
                appearance: 'none',
                WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23C19A6B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center',
                marginLeft: '10px'
              }}
            >
              <option value="All">All Artists</option>
              {artistsList.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              className={`filter-btn price-toggle-btn ${showPriceFilter ? 'active' : ''}`}
              onClick={() => setShowPriceFilter(!showPriceFilter)}
            >
              PRICE RANGE
            </button>
          </div>
        </div>

        {/* Price Slider Filter */}
        {showPriceFilter && (
          <div className="price-filter-wrapper fade-in" style={{ marginTop: '15px', display: 'flex', justifyContent: 'center' }}>
            <div className="glass-price-container">
              <div className="price-info">
                <span className="price-label">ESTIMATED PRICE RANGE</span>
                <span className="price-values">
                  ₱{priceRange.min.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} - ₱{priceRange.max.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{priceRange.max >= 500000 ? '+' : ''}
                </span>
              </div>
              
              <div className="multi-range-slider">
                <input
                  type="range"
                  min="0"
                  max="500000"
                  step="5000"
                  value={priceRange.min}
                  onChange={(e) => {
                    const val = Math.min(parseInt(e.target.value), priceRange.max - 5000);
                    setPriceRange({ ...priceRange, min: val });
                  }}
                  className="thumb thumb-left"
                  style={{ zIndex: priceRange.min > 400000 ? '5' : '3' }}
                />
                <input
                  type="range"
                  min="0"
                  max="500000"
                  step="5000"
                  value={priceRange.max}
                  onChange={(e) => {
                    const val = Math.max(parseInt(e.target.value), priceRange.min + 5000);
                    setPriceRange({ ...priceRange, max: val });
                  }}
                  className="thumb thumb-right"
                />
                <div className="slider-track" />
                <div 
                  className="slider-range" 
                  style={{
                    left: `${(priceRange.min / 500000) * 100}%`,
                    width: `${((priceRange.max - priceRange.min) / 500000) * 100}%`
                  }}
                />
              </div>
              <p className="price-hint">
                Adjust both ends to filter by budget
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Portfolio Grid */}
      <section className="portfolio-grid">
        {loading ? (
          <div className="gallery-loading">Loading artwork...</div>
        ) : works.length === 0 ? (
          <div className="gallery-empty">No artwork found in this category.</div>
        ) : (
          paginatedWorks.map(item => (
            <div key={item.id} className="image-card" onClick={() => setSelectedImage(item)}>
              {item.category && <span className="image-card-category">{item.category}</span>}
              <img 
                src={item.image_url} 
                alt={item.title || item.category || 'Tattoo artwork'} 
                loading="lazy"
                style={{ aspectRatio: '4/5', objectFit: 'cover', width: '100%', display: 'block' }}
              />
              <div className="image-card-overlay">
                {item.title && <h3 className="image-card-title">{item.title}</h3>}
                {item.artist_name && <p className="image-card-artist">by {item.artist_name}</p>}
              </div>
              <div className="watermark">INKVICTUS</div>
              <div className="glow-overlay"></div>
            </div>
          ))
        )}
      </section>

      {/* Pagination Controls */}
      {!loading && works.length > itemsPerPage && (
          <div className="gallery-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '2rem 0' }}>
              <button className="filter-btn" style={{ padding: '8px 20px' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</button>
              <span style={{ color: '#fff', fontSize: '1rem' }}>Page {currentPage} of {totalPages}</span>
              <button className="filter-btn" style={{ padding: '8px 20px' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</button>
          </div>
      )}

      {/* Centered Modal */}
      {selectedImage && (
        <div className="gallery-modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="gallery-modal-content modal-animate-in" onClick={(e) => e.stopPropagation()}>
            <button className="gallery-modal-close" onClick={() => setSelectedImage(null)}>&times;</button>
            <div className="gallery-modal-image-container">
              <img 
                src={selectedImage.image_url} 
                alt={selectedImage.title || 'Tattoo artwork'} 
                className="lightbox-trigger"
                style={{ cursor: 'zoom-in' }}
                onClick={() => setLightboxSrc(selectedImage.image_url)}
              />
            </div>
            <div className="gallery-modal-info">
              {selectedImage.title && <h2>{selectedImage.title}</h2>}
              {selectedImage.artist_name && <p className="modal-artist">Artist: <strong>{selectedImage.artist_name}</strong></p>}
              {selectedImage.category && <p className="modal-category">Category: <strong>{selectedImage.category}</strong></p>}
              {selectedImage.description && <p className="modal-description">{selectedImage.description}</p>}
              
              <button 
                className="filter-btn" 
                style={{ marginTop: '30px', width: '100%', padding: '15px', fontWeight: 'bold', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}
                onClick={() => navigate('/book', { state: { designTitle: selectedImage.title } })}
              >
                Consult About This Design
              </button>
            </div>
          </div>
        </div>
      )}

        <Footer />
      </div>
      <ChatWidget />
      <ImageLightbox src={lightboxSrc} alt="Gallery artwork" onClose={() => setLightboxSrc(null)} />
    </>
  );
};

export default Gallery;