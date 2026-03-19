import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Trash2, Plus, X, Eye, Lock, Globe } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import './PortalStyles.css';
import { API_URL } from '../config';

function ArtistGallery() {
    const [works, setWorks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedWork, setSelectedWork] = useState(null);

    // Modal states for animations
    const [addWorkModal, setAddWorkModal] = useState({ mounted: false, visible: false });
    const [viewWorkModal, setViewWorkModal] = useState({ mounted: false, visible: false });

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        imageUrl: '',
        category: 'Realism',
        isPublic: true,
        priceEstimate: ''
    });
    
    // Get the real logged-in user ID
    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    // Modal animation handlers
    const openModal = (setter, item = null) => {
        if (item) setSelectedWork(item);
        setter({ mounted: true, visible: false });
        setTimeout(() => setter({ mounted: true, visible: true }), 10);
    };

    const closeModal = (setter) => {
        setter(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setter({ mounted: false, visible: false });
            setSelectedWork(null);
        }, 400); // Match CSS transition duration
    };

    useEffect(() => {
        fetchPortfolio();
    }, []);

    const fetchPortfolio = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/artist/${artistId}/portfolio`);
            if (res.data.success) setWorks(res.data.works);
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData({ ...formData, imageUrl: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await Axios.post(`${API_URL}/api/artist/portfolio`, {
                artistId,
                ...formData
            });
            closeModal(setAddWorkModal);
            // Reset form correctly (preserving defaults)
            setFormData({ 
                title: '', 
                description: '', 
                imageUrl: '',
                category: 'Realism',
                isPublic: true,
                priceEstimate: ''
            });
            fetchPortfolio();
        } catch (error) {
            console.error("Error adding work:", error);
            // Show the actual error message from the server
            alert(error.response?.data?.message || "Failed to add work");
        }
    };

    const handleDelete = async (id) => {
        // e.stopPropagation is handled in the button onClick
        if (window.confirm('Are you sure you want to delete this work?')) {
            try {
                await Axios.delete(`${API_URL}/api/artist/portfolio/${id}`);
                setWorks(works.filter(w => w.id !== id));
            } catch (error) {
                console.error("Error deleting work:", error);
            }
        }
    };

  return (
    <div className="portal-layout">
        <ArtistSideNav />
        <div className="portal-container artist-portal page-container-enter">
            <header className="portal-header">
                <h1>My Portfolio</h1>
                <button className="btn btn-primary" onClick={() => openModal(setAddWorkModal)}>
                    <Plus size={18} /> Add Work
                </button>
            </header>

            <div className="portal-content">
                {loading ? <div className="no-data">Loading...</div> : (
                    <div className="gallery-grid">
                        {works.length > 0 ? works.map(work => (
                            <div key={work.id} className="gallery-item" onClick={() => openModal(setViewWorkModal, work)} style={{cursor: 'pointer'}}>
                                <img 
                                    src={work.image_url} 
                                    alt={work.title} 
                                    style={{width: '100%', height: '250px', objectFit: 'cover'}} 
                                />
                                <div className="gallery-overlay">
                                    <h3>{work.title}</h3>
                                    <p>{work.category}</p>
                                    {work.price_estimate && <p style={{color: '#daa520', fontWeight: '600', fontSize: '0.9rem'}}>₱{Number(work.price_estimate).toLocaleString()} est.</p>}
                                    <button className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDelete(work.id); }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        )) : (
                            <div className="no-data">No works in portfolio. Add some!</div>
                        )}
                    </div>
                )}
            </div>

            {/* View Work Modal */}
            {viewWorkModal.mounted && selectedWork && (
                <div className={`modal-overlay ${viewWorkModal.visible ? 'open' : ''}`} onClick={() => closeModal(setViewWorkModal)}>
                    <div className="modal-content" style={{maxWidth: '900px', width: '90%', maxHeight: '90vh', overflowY: 'auto'}} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedWork.title}</h2>
                            <button className="close-btn" onClick={() => closeModal(setViewWorkModal)}><X size={20}/></button>
                        </div>
                        <div className="modal-body" style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                            <div style={{width: '100%', backgroundColor: '#f8fafc', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center'}}>
                                <img src={selectedWork.image_url} alt={selectedWork.title} style={{maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain'}} />
                            </div>
                            <div className="work-details">
                                <div style={{display: 'flex', gap: '15px', marginBottom: '10px'}}>
                                    <span className="badge" style={{backgroundColor: '#e0e7ff', color: '#4338ca'}}>{selectedWork.category || 'Uncategorized'}</span>
                                    <span className="badge" style={{display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: selectedWork.is_public ? '#dcfce7' : '#f3f4f6', color: selectedWork.is_public ? '#166534' : '#4b5563'}}>
                                        {selectedWork.is_public ? <><Globe size={14}/> Public</> : <><Lock size={14}/> Private</>}
                                    </span>
                                </div>
                                <p style={{lineHeight: '1.6', color: '#374151'}}>{selectedWork.description}</p>
                                {selectedWork.price_estimate && (
                                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', padding: '10px 14px', backgroundColor: '#fef9ee', borderRadius: '8px', border: '1px solid #f5deb3'}}>
                                        <span style={{fontSize: '1.1rem'}}>💰</span>
                                        <span style={{fontWeight: '600', color: '#92400e'}}>Estimated Price: ₱{Number(selectedWork.price_estimate).toLocaleString()}</span>
                                    </div>
                                )}
                                <p style={{fontSize: '0.85rem', color: '#9ca3af', marginTop: '15px'}}>Uploaded on {new Date(selectedWork.created_at).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {addWorkModal.mounted && (
                <div className={`modal-overlay ${addWorkModal.visible ? 'open' : ''}`} onClick={() => closeModal(setAddWorkModal)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Add New Work</h2>
                            <button className="close-btn" onClick={() => closeModal(setAddWorkModal)}><X size={20}/></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Title</label>
                                    <input 
                                        type="text" 
                                        className="form-input"
                                        value={formData.title}
                                        onChange={e => setFormData({...formData, title: e.target.value})}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea 
                                        className="form-input"
                                        value={formData.description}
                                        onChange={e => setFormData({...formData, description: e.target.value})}
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Category</label>
                                        <select className="form-input" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                                            <option value="Realism">Realism</option>
                                            <option value="Traditional">Traditional</option>
                                            <option value="Japanese">Japanese</option>
                                            <option value="Tribal">Tribal</option>
                                            <option value="Fine Line">Fine Line</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Price Estimate (₱)</label>
                                        <input 
                                            type="number" 
                                            className="form-input"
                                            placeholder="e.g. 2500"
                                            value={formData.priceEstimate}
                                            onChange={e => setFormData({...formData, priceEstimate: e.target.value})}
                                            min="0"
                                            step="100"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Visibility</label>
                                    <div style={{ marginTop: '10px' }}>
                                        <label><input type="checkbox" checked={formData.isPublic} onChange={e => setFormData({...formData, isPublic: e.target.checked})} /> Public Gallery</label>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Image</label>
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="form-input"
                                        required
                                    />
                                    {formData.imageUrl && (
                                        <img src={formData.imageUrl} alt="Preview" style={{width: '100%', marginTop: '10px', borderRadius: '8px'}} />
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => closeModal(setAddWorkModal)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Upload</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
}

export default ArtistGallery;
