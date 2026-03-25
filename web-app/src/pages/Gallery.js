import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { API_URL } from '../config';
import './Gallery.css';
import Navbar from '../components/Navbar';
import ChatWidget from '../components/ChatWidget';
import Footer from '../components/Footer';

const Gallery = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [categories, setCategories] = useState(['All']);
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 20000 });
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Parse query params for artist filter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const artistId = params.get('artistId');
    const artistName = params.get('artistName');
    
    if (artistId) {
      setSelectedArtist({ id: artistId, name: artistName || 'Artist' });
    } else {
      setSelectedArtist(null);
    }
  }, [location.search]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

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

  // Fetch works from backend (re-fetch when category or artist changes)
  useEffect(() => {
    // If we have an artistId in the URL but selectedArtist state hasn't updated yet, 
    // skip this fetch to avoid "flash" of all works
    const params = new URLSearchParams(location.search);
    const artistIdInUrl = params.get('artistId');
    if (artistIdInUrl && (!selectedArtist || selectedArtist.id !== artistIdInUrl)) {
      return;
    }

    setLoading(true);
    let url = `${API_URL}/api/gallery/works?`;
    
    const queryParams = new URLSearchParams();
    if (activeCategory && activeCategory !== 'All') {
      queryParams.append('category', activeCategory);
    }
    if (selectedArtist) {
      queryParams.append('artistId', selectedArtist.id);
    }
    queryParams.append('minPrice', priceRange.min);
    queryParams.append('maxPrice', priceRange.max);
    
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
  }, [activeCategory, selectedArtist, location.search, priceRange]);

  // Reset page when category or artist changes
  useEffect(() => {
     setCurrentPage(1);
  }, [activeCategory, selectedArtist, priceRange]);

  // Pagination logic
  const totalPages = Math.ceil(works.length / itemsPerPage);
  const paginatedWorks = works.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
      <Navbar />

      <div className="gallery-page page-transition-wrapper">
      {/* Header Section */}
      <header className="gallery-header">
        <h1>{selectedArtist ? `PORTFOLIO: ${selectedArtist.name.toUpperCase()}` : 'OUR ARTWORK SPEAKS VOLUMES'}</h1>
        
        {selectedArtist && (
          <div className="artist-filter-badge" style={{ 
            margin: '10px 0 20px', 
            background: 'rgba(193, 154, 107, 0.1)', 
            border: '1px solid #C19A6B',
            padding: '8px 20px',
            borderRadius: '50px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '12px',
            color: '#C19A6B',
            fontWeight: '600'
          }}>
            <span>Showing works by {selectedArtist.name}</span>
            <button 
              onClick={() => navigate('/gallery')}
              style={{ 
                background: '#C19A6B', 
                border: 'none', 
                color: 'black', 
                borderRadius: '50%', 
                width: '20px', 
                height: '20px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold'
              }}
            >
              &times;
            </button>
          </div>
        )}

        <div className="filter-nav-container">
          <span className="filter-label">STYLE FILTER:</span>
          <div className="filter-nav">
            {categories.map(cat => (
              <button
                key={cat}
                className={`filter-btn ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Price Slider Filter */}
        <div className="price-filter-wrapper" style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
          <div className="glass-price-container" style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(12px) saturate(180%)',
            WebkitBackdropFilter: 'blur(12px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
            padding: '20px 30px',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '500px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <span style={{ color: '#DAA520', fontWeight: 'bold', fontSize: '0.8rem', letterSpacing: '1px' }}>ESTIMATED PRICE RANGE</span>
              <span style={{ color: '#fff', fontSize: '0.9rem', fontWeight: '600' }}>
                ₱{priceRange.min.toLocaleString()} - ₱{priceRange.max.toLocaleString()}{priceRange.max >= 20000 ? '+' : ''}
              </span>
            </div>
            <div style={{ position: 'relative', height: '30px', display: 'flex', alignItems: 'center' }}>
              <input
                type="range"
                min="0"
                max="20000"
                step="500"
                value={priceRange.max}
                onChange={(e) => setPriceRange({ ...priceRange, max: parseInt(e.target.value) })}
                style={{
                  width: '100%',
                  accentColor: '#DAA520',
                  cursor: 'pointer',
                  background: 'rgba(218, 165, 32, 0.2)',
                  height: '6px',
                  borderRadius: '3px',
                  appearance: 'none',
                  outline: 'none'
                }}
              />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', marginTop: '10px', textAlign: 'center' }}>
              Slide to filter designs based on artist's starting price estimates
            </p>
          </div>
        </div>
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
              <img src={selectedImage.image_url} alt={selectedImage.title || 'Tattoo artwork'} />
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
    </>
  );
};

export default Gallery;