import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Trash2, Edit2, Plus, X, Globe, Lock, Video, Image, PlaySquare } from 'lucide-react';
import { API_URL } from '../config';
import ConfirmModal from './ConfirmModal';
import '../pages/AdminUsers.css'; // Reusing established admin styles

function AdminTestimonials() {
    const [testimonials, setTestimonials] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState({ mounted: false, visible: false });
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    const [editingId, setEditingId] = useState(null);
    
    const [formData, setFormData] = useState({
        customer_name: '',
        content: '',
        rating: 5,
        media_url: '',
        media_type: 'none',
        is_active: true
    });

    useEffect(() => {
        fetchTestimonials();
    }, []);

    const fetchTestimonials = async () => {
        try {
            setLoading(true);
            const res = await Axios.get(`${API_URL}/api/admin/testimonials`);
            if (res.data && res.data.success) {
                setTestimonials(res.data.testimonials || []);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching testimonials:", error);
            setLoading(false);
        }
    };

    const openModal = () => {
        setModal({ mounted: true, visible: false });
        setTimeout(() => setModal({ mounted: true, visible: true }), 10);
    };

    const closeModal = () => {
        setModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => setModal({ mounted: false, visible: false }), 400);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await Axios.put(`${API_URL}/api/admin/testimonials/${editingId}`, formData);
            } else {
                await Axios.post(`${API_URL}/api/admin/testimonials`, formData);
            }
            closeModal();
            setEditingId(null);
            resetForm();
            fetchTestimonials();
        } catch (error) {
            console.error("Error saving testimonial:", error);
            alert("Failed to save testimonial.");
        }
    };

    const handleDelete = (id) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Testimonial',
            message: 'Are you sure you want to permanently delete this testimonial?',
            onConfirm: async () => {
                setConfirmDialog({ isOpen: false });
                try {
                    await Axios.delete(`${API_URL}/api/admin/testimonials/${id}`);
                    fetchTestimonials();
                } catch (error) {
                    console.error("Error deleting testimonial:", error);
                }
            }
        });
    };

    const toggleStatus = async (item) => {
        try {
            const updated = { ...item, is_active: !item.is_active };
            await Axios.put(`${API_URL}/api/admin/testimonials/${item.id}`, updated);
            fetchTestimonials();
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const openEditModal = (item) => {
        setEditingId(item.id);
        setFormData({
            customer_name: item.customer_name,
            content: item.content || '',
            rating: item.rating || 5,
            media_url: item.media_url || '',
            media_type: item.media_type || 'none',
            is_active: item.is_active === 1 || item.is_active === true
        });
        openModal();
    };

    const openAddModal = () => {
        setEditingId(null);
        resetForm();
        openModal();
    };

    const resetForm = () => {
        setFormData({
            customer_name: '',
            content: '',
            rating: 5,
            media_url: '',
            media_type: 'none',
            is_active: true
        });
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // In a real app, you'd upload the file to a cloud bucket like AWS S3 or Supabase and get a URL back.
        // Or send it directly as base64 to the backend. Given this system uses LONGTEXT for base64
        // in previous implementations (e.g. portfolio_works), we'll read as base64.
        const reader = new FileReader();
        reader.onloadend = () => {
            setFormData({ ...formData, media_url: reader.result });
        };
        reader.readAsDataURL(file);
    };

    return (
        <div style={{ padding: '0 2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                <button className="btn btn-primary" onClick={openAddModal}>
                    <Plus size={18} style={{marginRight: '5px'}}/> Add Testimonial
                </button>
            </div>

            <div className="table-card">
                <div className="table-responsive">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Testimonial</th>
                                <th>Media Type</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" className="no-data" style={{textAlign: 'center', padding: '2rem'}}>Loading testimonials...</td></tr>
                            ) : testimonials.length > 0 ? (
                                testimonials.map(item => (
                                    <tr key={item.id}>
                                        <td><strong>{item.customer_name}</strong><br/><small style={{color:'#f59e0b'}}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</small></td>
                                        <td>
                                            <div style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.content || <span className="text-muted">No text content</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {item.media_type === 'video' ? <Video size={16} color="#3b82f6"/> : item.media_type === 'image' ? <Image size={16} color="#10b981"/> : <span className="text-muted">None</span>}
                                                <span style={{textTransform:'capitalize'}}>{item.media_type}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <button 
                                                className={`badge status-${item.is_active ? 'active' : 'inactive'}`} 
                                                style={{ border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                onClick={() => toggleStatus(item)}
                                            >
                                                {item.is_active ? <Globe size={12}/> : <Lock size={12}/>}
                                                {item.is_active ? 'Public' : 'Hidden'}
                                            </button>
                                        </td>
                                        <td>
                                            <div style={{display:'flex', gap:'5px'}}>
                                                <button className="action-btn edit-btn" onClick={() => openEditModal(item)}><Edit2 size={16}/></button>
                                                <button className="action-btn delete-btn" onClick={() => handleDelete(item.id)}><Trash2 size={16}/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="5" className="no-data">No testimonials found. Add one to show on the Home carousel.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {modal.mounted && (
                <div className={`modal-overlay ${modal.visible ? 'open' : ''}`} onClick={closeModal}>
                    <div className="modal-content" style={{maxWidth: '600px'}} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingId ? 'Edit Testimonial' : 'New Testimonial'}</h2>
                            <button className="close-btn" onClick={closeModal}><X size={20}/></button>
                        </div>
                        <form onSubmit={handleSave}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Customer Name</label>
                                    <input type="text" className="form-input" required value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} />
                                </div>
                                <div className="form-group">
                                    <label>Rating (1-5)</label>
                                    <input type="number" min="1" max="5" className="form-input" required value={formData.rating} onChange={e => setFormData({...formData, rating: parseInt(e.target.value)})} />
                                </div>
                                <div className="form-group">
                                    <label>Text Content / Review</label>
                                    <textarea className="form-input" rows="4" value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} placeholder="What did the customer say..."></textarea>
                                </div>
                                
                                <div className="form-group">
                                    <label>Media Attachment Type</label>
                                    <select className="form-input" value={formData.media_type} onChange={e => setFormData({...formData, media_type: e.target.value, media_url: ''})}>
                                        <option value="none">Text Only (No Media)</option>
                                        <option value="image">Image Attachment</option>
                                        <option value="video">Video Attachment</option>
                                    </select>
                                </div>

                                {formData.media_type !== 'none' && (
                                    <div className="form-group">
                                        <label>{formData.media_type === 'video' ? 'Video File' : 'Image File'}</label>
                                        <input 
                                            type="file" 
                                            accept={formData.media_type === 'video' ? "video/mp4,video/webm" : "image/*"} 
                                            onChange={handleFileUpload} 
                                            className="form-input" 
                                        />
                                        {formData.media_url && formData.media_type === 'image' && (
                                            <div style={{ marginTop: '10px', borderRadius: '8px', overflow: 'hidden', height: '150px', background: '#000' }}>
                                                <img src={formData.media_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            </div>
                                        )}
                                        {formData.media_url && formData.media_type === 'video' && (
                                            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', background: '#ecfdf5', padding: '10px', borderRadius: '8px' }}>
                                                <PlaySquare size={20} />
                                                <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Video parsed and ready for upload</span>
                                            </div>
                                        )}
                                        <p style={{fontSize: '0.8rem', color: '#64748b', marginTop: '5px'}}>
                                            * Due to database constraints, keep the file size very small (under 2MB), or provide an optimized base64 string.
                                        </p>
                                    </div>
                                )}
                                
                                <div className="form-group" style={{marginTop: '15px'}}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} style={{width: 'auto'}} />
                                        <span>Visible on Home Page Carousel</span>
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingId ? 'Update Review' : 'Publish Review'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmModal {...confirmDialog} onClose={() => setConfirmDialog({ isOpen: false })} />
        </div>
    );
}

export default AdminTestimonials;
