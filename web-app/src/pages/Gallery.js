import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_URL } from '../config';
import './Gallery.css';
import ChatWidget from '../components/ChatWidget';

const Gallery = () => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('All');
  const [categories, setCategories] = useState(['All']);
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);

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

  // Fetch works from backend (re-fetch when category changes)
  useEffect(() => {
    setLoading(true);
    const url = activeCategory && activeCategory !== 'All'
      ? `${API_URL}/api/gallery/works?category=${encodeURIComponent(activeCategory)}`
      : `${API_URL}/api/gallery/works`;

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
  }, [activeCategory]);

  // Reset page when category changes
  useEffect(() => {
     setCurrentPage(1);
  }, [activeCategory]);

  // Pagination logic
  const totalPages = Math.ceil(works.length / itemsPerPage);
  const paginatedWorks = works.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <>
      {/* Navigation Bar */}
      <nav className={`home-nav ${isScrolled ? 'is-scrolled' : ''}`}>
          <a href="/" className="home-logo">INKVICTUS</a>
          <div className="home-nav-links">
              <a href="/#about">About</a>
              <Link to="/artists">Artists</Link>
              <Link to="/gallery" className="active-link">Gallery</Link>
              <Link to="/book">Booking</Link>
              <Link to="/contact">Contact</Link>
          </div>
          <div className="home-auth-buttons">
              <a href="/login" className="login-link">Log In</a>
              <button onClick={() => navigate('/register')} className="signup-btn">Sign Up</button>
          </div>
      </nav>

      <div className="gallery-page">
      {/* Header Section */}
      <header className="gallery-header">
        <h1>OUR ARTWORK SPEAKS VOLUMES</h1>
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
              <img src={item.image_url} alt={item.title || item.category || 'Tattoo artwork'} />
              <div className="image-card-overlay">
                {item.title && <h3 className="image-card-title">{item.title}</h3>}
                {item.artist_name && <p className="image-card-artist">by {item.artist_name}</p>}
                {item.category && <span className="image-card-category">{item.category}</span>}
                {item.price_estimate && <span className="image-card-category" style={{backgroundColor: 'rgba(218, 165, 32, 0.3)', color: '#ffd700', marginTop: '4px'}}>₱{Number(item.price_estimate).toLocaleString()} est.</span>}
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
          <div className="gallery-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="gallery-modal-close" onClick={() => setSelectedImage(null)}>&times;</button>
            <div className="gallery-modal-image-container">
              <img src={selectedImage.image_url} alt={selectedImage.title || 'Tattoo artwork'} />
            </div>
            <div className="gallery-modal-info">
              {selectedImage.title && <h2>{selectedImage.title}</h2>}
              {selectedImage.artist_name && <p className="modal-artist">Artist: <strong>{selectedImage.artist_name}</strong></p>}
              {selectedImage.category && <p className="modal-category">Category: <strong>{selectedImage.category}</strong></p>}
              {selectedImage.description && <p className="modal-description">{selectedImage.description}</p>}
              {selectedImage.price_estimate && <p className="modal-category" style={{color: '#daa520'}}>Estimated Price: <strong>₱{Number(selectedImage.price_estimate).toLocaleString()}</strong></p>}
            </div>
          </div>
        </div>
      )}

      <ChatWidget />
    </div>
    </>
  );
};

export default Gallery;