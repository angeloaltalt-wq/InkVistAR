import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    User, Mail, Phone, Calendar, Image, DollarSign,
    BarChart3, Clock, Trash2, X, Save, Shield, Briefcase,
    Search, Filter, SlidersHorizontal, Globe, Lock
} from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import './AdminStaff.css';
import { API_URL } from '../config';

function AdminStaff() {
    const navigate = useNavigate();
    const location = useLocation();

    // Main List State
    const [staff, setStaff] = useState([]);
    const [filteredStaff, setFilteredStaff] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [loading, setLoading] = useState(true);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Detailed View State
    const [selectedArtist, setSelectedArtist] = useState(null);
    const [activeTab, setActiveTab] = useState('profile');
    const [artistDetails, setArtistDetails] = useState({
        profile: {},
        appointments: [],
        portfolio: [],
        stats: {}
    });
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Edit Form State
    const [formData, setFormData] = useState({});

    // Portfolio Edit State
    const [selectedWork, setSelectedWork] = useState(null);
    const [editWorkModal, setEditWorkModal] = useState({ mounted: false, visible: false });
    const [workFormData, setWorkFormData] = useState({
        title: '',
        description: '',
        category: 'Realism',
        isPublic: true,
        priceEstimate: ''
    });

    // Modal state for animations
    const [artistManagerModal, setArtistManagerModal] = useState({ mounted: false, visible: false });
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

    useEffect(() => {
        fetchStaff();
    }, []);

    useEffect(() => {
        filterStaff();
    }, [staff, searchTerm, roleFilter]);

    const fetchStaff = async () => {
        try {
            setLoading(true);
            const response = await Axios.get(`${API_URL}/api/debug/users`);
            if (response.data.success) {
                const staffMembers = response.data.users
                    .filter(u => (u.user_type === 'artist' || u.user_type === 'manager' || u.user_type === 'admin') && !u.is_deleted)
                    .map(u => ({
                        ...u,
                        role: u.user_type.charAt(0).toUpperCase() + u.user_type.slice(1),
                        status: 'active' // Mock status for now
                    }));
                setStaff(staffMembers);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching staff:", error);
            setLoading(false);
        }
    };

    const filterStaff = () => {
        let filtered = staff.filter(s => {
            const matchesSearch =
                (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (s.email || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = roleFilter === 'all' || s.role.toLowerCase() === roleFilter.toLowerCase();
            return matchesSearch && matchesRole;
        });
        setFilteredStaff(filtered);
        setCurrentPage(1); // Reset page on filter change
    };

    // Pagination logic
    const totalPages = Math.ceil(filteredStaff.length / itemsPerPage);
    const paginatedStaff = filteredStaff.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Modal animation handlers
    const openModal = () => {
        setArtistManagerModal({ mounted: true, visible: false });
        setTimeout(() => setArtistManagerModal({ mounted: true, visible: true }), 10);
    };

    const closeModal = () => {
        setArtistManagerModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setArtistManagerModal({ mounted: false, visible: false });
            setSelectedArtist(null);
        }, 400); // Match CSS transition duration
    };

    const openEditWork = (work) => {
        setSelectedWork(work);
        setWorkFormData({
            title: work.title || '',
            description: work.description || '',
            category: work.category || 'Realism',
            isPublic: work.is_public === 1 || work.is_public === true,
            priceEstimate: work.price_estimate || ''
        });
        setEditWorkModal({ mounted: true, visible: false });
        setTimeout(() => setEditWorkModal({ mounted: true, visible: true }), 10);
    };

    const closeEditWork = () => {
        setEditWorkModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => setEditWorkModal({ mounted: false, visible: false }), 400);
    };

    // --- Artist Management Functions ---

    const openArtistManager = async (artist) => {
        setSelectedArtist(artist);
        setLoadingDetails(true);
        setActiveTab('profile');
        openModal(); // Open modal immediately to show loading state

        try {
            const [dashboardRes, portfolioRes] = await Promise.all([
                Axios.get(`${API_URL}/api/artist/dashboard/${artist.id}`),
                Axios.get(`${API_URL}/api/artist/${artist.id}/portfolio`)
            ]);

            if (dashboardRes.data.success && portfolioRes.data.success) {
                const data = dashboardRes.data;
                setArtistDetails({
                    profile: data.artist,
                    appointments: data.appointments || [],
                    portfolio: portfolioRes.data.works || [],
                    stats: data.stats || {}
                });
                setFormData({
                    name: data.artist.name,
                    specialization: data.artist.specialization,
                    hourly_rate: data.artist.hourly_rate,
                    experience_years: data.artist.experience_years,
                    commission_rate: data.artist.commission_rate
                });
            } else {
                throw new Error(dashboardRes.data.message || portfolioRes.data.message || 'Failed to fetch artist details.');
            }
        } catch (error) {
            console.error("Error fetching artist details:", error);
            const errorMessage = error.response?.data?.message || error.message || "An unknown error occurred.";
            alert(`Could not load artist details: ${errorMessage}`);
            closeModal();
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleUpdateProfile = async () => {
        try {
            await Axios.put(`${API_URL}/api/artist/profile/${selectedArtist.id}`, formData);
            alert('Profile updated successfully');
            // Refresh local data
            setArtistDetails(prev => ({
                ...prev,
                profile: { ...prev.profile, ...formData }
            }));
            fetchStaff(); // Refresh main list name if changed
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("Failed to update profile");
        }
    };

    const handleSaveWork = async (e) => {
        if (e) e.preventDefault();
        try {
            await Axios.put(`${API_URL}/api/artist/portfolio/${selectedWork.id}`, {
                title: workFormData.title,
                description: workFormData.description,
                category: workFormData.category,
                priceEstimate: workFormData.priceEstimate,
                isPublic: workFormData.isPublic
            });

            // Update local state
            setArtistDetails(prev => ({
                ...prev,
                portfolio: prev.portfolio.map(w =>
                    w.id === selectedWork.id
                        ? {
                            ...w,
                            ...workFormData,
                            is_public: workFormData.isPublic ? 1 : 0
                        }
                        : w
                )
            }));
            closeEditWork();
        } catch (error) {
            console.error("Error updating portfolio work:", error);
            alert("Failed to update portfolio item");
        }
    };

    const handleDeleteWork = (workId) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Portfolio Item',
            message: 'Delete this portfolio item?',
            onConfirm: async () => {
                setConfirmDialog({ isOpen: false });
                try {
                    await Axios.delete(`${API_URL}/api/artist/portfolio/${workId}`);
                    setArtistDetails(prev => ({
                        ...prev,
                        portfolio: prev.portfolio.filter(w => w.id !== workId)
                    }));
                } catch (error) {
                    console.error("Error deleting work:", error);
                }
            }
        });
    };

    const handleBlockDate = async () => {
        const date = prompt("Enter date to block (YYYY-MM-DD):");
        if (date) {
            try {
                await Axios.post(`${API_URL}/api/admin/appointments`, {
                    customerId: selectedArtist.id, // Self-booking for block
                    artistId: selectedArtist.id,
                    date: date,
                    startTime: '09:00',
                    endTime: '17:00',
                    designTitle: 'BLOCKED',
                    status: 'cancelled', // Using cancelled/blocked status
                    notes: 'Day off / Unavailable'
                });
                alert("Date blocked successfully");
                // Refresh would be ideal here
            } catch (error) {
                console.error("Error blocking date:", error);
            }
        }
    };

    // --- Render Helpers ---

    const renderProfileTab = () => (
        <div className="tab-content">
            <div className="form-grid">
                <div className="form-group">
                    <label>Name</label>
                    <input
                        type="text"
                        className="form-input"
                        value={formData.name || ''}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                </div>
                <div className="form-group">
                    <label>Specialization</label>
                    <input
                        type="text"
                        className="form-input"
                        value={formData.specialization || ''}
                        onChange={e => setFormData({ ...formData, specialization: e.target.value })}
                    />
                </div>
                <div className="form-group">
                    <label>Experience (Years)</label>
                    <input
                        type="number"
                        className="form-input"
                        value={formData.experience_years || 0}
                        onChange={e => setFormData({ ...formData, experience_years: e.target.value })}
                    />
                </div>
                <div className="form-group">
                    <label>Commission Rate (%)</label>
                    <input
                        type="number"
                        className="form-input"
                        value={(formData.commission_rate || 0) * 100}
                        onChange={e => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) / 100 })}
                    />
                </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: '20px' }} onClick={handleUpdateProfile}>
                <Save size={18} style={{ marginRight: '8px' }} /> Save Changes
            </button>

            <div className="stats-row" style={{ marginTop: '40px', padding: 0 }}>
                <div className="stat-item">
                    <span className="stat-label">Total Appointments</span>
                    <span className="stat-count">{artistDetails.stats.total_appointments}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Est. Revenue</span>
                    <span className="stat-count">₱{artistDetails.stats.total_earnings?.toLocaleString()}</span>
                </div>
            </div>
        </div>
    );

    const renderScheduleTab = () => (
        <div className="tab-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3>Upcoming Schedule</h3>
                <button className="btn btn-secondary" onClick={handleBlockDate}>Block Date</button>
            </div>
            <div className="table-responsive">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Client</th>
                            <th>Service</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {artistDetails.appointments.map(apt => (
                            <tr key={apt.id}>
                                <td>{new Date(apt.appointment_date).toLocaleDateString()}</td>
                                <td>{apt.start_time}</td>
                                <td>{apt.client_name}</td>
                                <td>{apt.design_title}</td>
                                <td><span className={`badge status-${apt.status}`}>{apt.status}</span></td>
                            </tr>
                        ))}
                        {artistDetails.appointments.length === 0 && <tr><td colSpan="5" className="no-data">No appointments found</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderPortfolioTab = () => (
        <div className="tab-content">
            <div className="gallery-grid-admin">
                {artistDetails.portfolio.map(work => (
                    <div key={work.id} className="gallery-item-admin" onClick={() => openEditWork(work)} style={{ cursor: 'pointer' }}>
                        <img src={work.image_url} alt={work.title} />
                        <div className="gallery-overlay">
                            <button className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteWork(work.id); }}>
                                <Trash2 size={16} />
                            </button>
                            <span>{work.title}</span>
                            {work.price_estimate && <span style={{ color: '#daa520', fontSize: '0.8rem', fontWeight: '600' }}>₱{Number(work.price_estimate).toLocaleString()}</span>}
                        </div>
                    </div>
                ))}
                {artistDetails.portfolio.length === 0 && <p className="no-data">Portfolio is empty.</p>}
            </div>
        </div>
    );

    const renderEarningsTab = () => {
        const earnings = artistDetails.appointments
            .filter(a => a.status === 'completed')
            .map(a => ({
                ...a,
                amount: a.price || 0, // Use actual price from appointment
                commission: (a.price || 0) * (artistDetails.profile.commission_rate || 0.6)
            }));

        return (
            <div className="tab-content">
                <div className="stats-row" style={{ padding: 0, marginBottom: '20px' }}>
                    <div className="stat-item">
                        <span className="stat-label">Total Commission</span>
                        <span className="stat-count">₱{earnings.reduce((sum, e) => sum + e.commission, 0).toLocaleString()}</span>
                    </div>
                </div>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Client</th>
                            <th>Total Amount</th>
                            <th>Artist Commission ({((artistDetails.profile.commission_rate || 0.6) * 100)}%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {earnings.map(e => (
                            <tr key={e.id}>
                                <td>{new Date(e.appointment_date).toLocaleDateString()}</td>
                                <td>{e.client_name}</td>
                                <td>₱{e.amount.toLocaleString()}</td>
                                <td style={{ color: '#10b981', fontWeight: 'bold' }}>₱{e.commission.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
                <header className="admin-header" style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: 'none' }}>
                    <h1>Staff Management</h1>
                </header>

                <div className="premium-filter-bar">
                    <div className="premium-search-box">
                        <Search size={18} className="text-muted" />
                        <input
                            type="text"
                            placeholder="Search staff by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="premium-filters-group">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: '600' }}>
                            <Filter size={16} />
                            <span>Filter by:</span>
                        </div>
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="premium-select-v2"
                        >
                            <option value="all">All Roles</option>
                            <option value="artist">Artist</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                        </select>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: '600', marginLeft: '0.5rem' }}>
                            <SlidersHorizontal size={16} />
                            <span>Sort:</span>
                        </div>
                        <select
                            className="premium-select-v2"
                            defaultValue="name"
                        >
                            <option value="name">Name</option>
                            <option value="email">Email</option>
                        </select>
                    </div>
                </div>

                <div className="table-card-container">
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="5" className="no-data" style={{ textAlign: 'center', padding: '2rem' }}>Loading staff...</td></tr>
                                ) : paginatedStaff.length > 0 ? (
                                    paginatedStaff.map((member) => (
                                        <tr key={member.id}>
                                            <td><strong>{member.name}</strong></td>
                                            <td>{member.email}</td>
                                            <td><span className={`badge role-${member.user_type}`}>{member.role}</span></td>
                                            <td><span className="badge status-active">Active</span></td>
                                            <td>
                                                {member.user_type === 'artist' && (
                                                    <button className="action-btn view-btn" onClick={() => openArtistManager(member)}>
                                                        Manage Artist
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="no-data">No staff members found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        itemsPerPage={itemsPerPage}
                        onItemsPerPageChange={(newVal) => {
                            setItemsPerPage(newVal);
                            setCurrentPage(1);
                        }}
                        totalItems={filteredStaff.length}
                        unit="staff"
                    />
                </div>

                {/* Detailed Artist Manager Overlay */}
                {artistManagerModal.mounted && selectedArtist && (
                    <div className={`modal-overlay ${artistManagerModal.visible ? 'open' : ''}`} onClick={closeModal}>
                        <div className="modal-content" style={{ maxWidth: '900px', width: '95%', height: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <div>
                                    <h2>{selectedArtist.name}</h2>
                                    <p style={{ margin: 0, color: '#666' }}>Artist Management Portal</p>
                                </div>
                                <button className="close-btn" onClick={closeModal}><X size={24} /></button>
                            </div>

                            <div className="settings-tabs" style={{ padding: '0 20px', borderBottom: '1px solid #eee' }}>
                                <button className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                                    <User size={16} style={{ marginRight: 5 }} /> Profile
                                </button>
                                <button className={`tab-button ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
                                    <Calendar size={16} style={{ marginRight: 5 }} /> Schedule
                                </button>
                                <button className={`tab-button ${activeTab === 'portfolio' ? 'active' : ''}`} onClick={() => setActiveTab('portfolio')}>
                                    <Image size={16} style={{ marginRight: 5 }} /> Portfolio
                                </button>
                                <button className={`tab-button ${activeTab === 'earnings' ? 'active' : ''}`} onClick={() => setActiveTab('earnings')}>
                                    <DollarSign size={16} style={{ marginRight: 5 }} /> Earnings
                                </button>
                            </div>

                            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                                {loadingDetails ? <div className="no-data">Loading details...</div> : (
                                    <>
                                        {activeTab === 'profile' && renderProfileTab()}
                                        {activeTab === 'schedule' && renderScheduleTab()}
                                        {activeTab === 'portfolio' && renderPortfolioTab()}
                                        {activeTab === 'earnings' && renderEarningsTab()}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Portfolio Content Editor Modal */}
                {editWorkModal.mounted && selectedWork && (
                    <div className={`modal-overlay ${editWorkModal.visible ? 'open' : ''}`} onClick={closeEditWork} style={{ zIndex: 1100 }}>
                        <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Edit Portfolio Item</h2>
                                <button className="close-btn" onClick={closeEditWork}><X size={24} /></button>
                            </div>
                            <form onSubmit={handleSaveWork}>
                                <div className="modal-body">
                                    <div style={{ width: '100%', height: '200px', backgroundColor: '#f1f5f9', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
                                        <img src={selectedWork.image_url} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                    <div className="form-group">
                                        <label>Title</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={workFormData.title}
                                            onChange={e => setWorkFormData({ ...workFormData, title: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Category</label>
                                            <select
                                                className="form-input"
                                                value={workFormData.category}
                                                onChange={e => setWorkFormData({ ...workFormData, category: e.target.value })}
                                            >
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
                                                value={workFormData.priceEstimate}
                                                onChange={e => setWorkFormData({ ...workFormData, priceEstimate: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Description</label>
                                        <textarea
                                            className="form-input"
                                            rows="3"
                                            value={workFormData.description}
                                            onChange={e => setWorkFormData({ ...workFormData, description: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={workFormData.isPublic}
                                                onChange={e => setWorkFormData({ ...workFormData, isPublic: e.target.checked })}
                                            />
                                            Visible in Public Gallery
                                        </label>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={closeEditWork}>Cancel</button>
                                    <button type="submit" className="btn btn-primary"><Save size={18} style={{ marginRight: '8px' }} /> Update Content</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <ConfirmModal
                    {...confirmDialog}
                    onCancel={() => setConfirmDialog({ isOpen: false })}
                />
            </div>
        </div>
    );
}

export default AdminStaff;
