import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Star, CheckCircle, XCircle } from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import './AdminStyles.css';
import { API_URL } from '../config';

function AdminReviews() {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pending');

    useEffect(() => {
        fetchReviews();
    }, []);

    const fetchReviews = async () => {
        try {
            setLoading(true);
            const res = await Axios.get(`${API_URL}/api/admin/reviews`);
            if (res.data.success) {
                setReviews(res.data.reviews || []);
            }
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const handleModeration = async (id, status) => {
        try {
            const res = await Axios.put(`${API_URL}/api/admin/reviews/${id}`, { status });
            if (res.data.success) {
                setReviews(reviews.map(r => r.id === id ? { ...r, status } : r));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const filteredReviews = reviews.filter(r => r.status === activeTab);

    return (
        <div className="admin-layout">
            <AdminSideNav />
            <div className="admin-main">
                <header className="admin-header">
                    <div className="header-title">
                        <h1>Review Moderation</h1>
                        <p>Approve or reject customer reviews before they appear on artist pages.</p>
                    </div>
                </header>

                <div className="admin-content">
                    <div className="settings-tabs" style={{ marginBottom: '20px' }}>
                        <button className={`tab-button ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>Pending ({reviews.filter(r=>r.status==='pending').length})</button>
                        <button className={`tab-button ${activeTab === 'approved' ? 'active' : ''}`} onClick={() => setActiveTab('approved')}>Approved</button>
                        <button className={`tab-button ${activeTab === 'rejected' ? 'active' : ''}`} onClick={() => setActiveTab('rejected')}>Rejected</button>
                    </div>

                    <div className="data-card">
                        {loading ? <p>Loading reviews...</p> : (
                            filteredReviews.length > 0 ? (
                                <div className="table-responsive">
                                    <table className="admin-table">
                                        <thead>
                                            <tr>
                                                <th>Client</th>
                                                <th>Artist</th>
                                                <th>Rating</th>
                                                <th>Comment</th>
                                                <th>Date</th>
                                                {activeTab === 'pending' && <th>Actions</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredReviews.map(r => (
                                                <tr key={r.id}>
                                                    <td style={{ fontWeight: 600 }}>{r.customer_name}</td>
                                                    <td>{r.artist_name}</td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                            {r.rating} <Star size={14} color="#f59e0b" fill="#f59e0b" />
                                                        </div>
                                                    </td>
                                                    <td style={{ maxWidth: '300px', whiteSpace: 'normal', fontSize: '0.9rem' }}>{r.comment || <span style={{color: '#94a3b8', fontStyle: 'italic'}}>No comment</span>}</td>
                                                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                                                    {activeTab === 'pending' && (
                                                        <td>
                                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                                <button onClick={() => handleModeration(r.id, 'approved')} className="action-btn" style={{ background: '#10b981', color: 'white', border: 'none', padding: '6px' }} title="Approve"><CheckCircle size={16} /></button>
                                                                <button onClick={() => handleModeration(r.id, 'rejected')} className="action-btn" style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px' }} title="Reject"><XCircle size={16} /></button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="no-data">No {activeTab} reviews found.</p>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AdminReviews;
