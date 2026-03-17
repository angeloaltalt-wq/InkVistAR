import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
    User, Mail, Phone, Calendar, Image, DollarSign, 
    BarChart3, Clock, Trash2, X, Save, Shield, Briefcase 
} from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import ManagerSideNav from '../components/ManagerSideNav';
import './AdminStaff.css';
import { API_URL } from '../config';

function AdminStaff() {
    const navigate = useNavigate();
    const location = useLocation();
    const isManagerView = location.pathname.startsWith('/manager');
    
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

    // Modal state for animations
    const [artistManagerModal, setArtistManagerModal] = useState({ mounted: false, visible: false });

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

    const handleDeleteWork = async (workId) => {
        if (window.confirm("Delete this portfolio item?")) {
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
                        onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                </div>
                <div className="form-group">
                    <label>Specialization</label>
                    <input 
                        type="text" 
                        className="form-input" 
                        value={formData.specialization || ''} 
                        onChange={e => setFormData({...formData, specialization: e.target.value})}
                    />
                </div>
                <div className="form-group">
                    <label>Hourly Rate (₱)</label>
                    <input 
                        type="number" 
                        className="form-input" 
                        value={formData.hourly_rate || 0} 
                        onChange={e => setFormData({...formData, hourly_rate: e.target.value})}
                    />
                </div>
                <div className="form-group">
                    <label>Experience (Years)</label>
                    <input 
                        type="number" 
                        className="form-input" 
                        value={formData.experience_years || 0} 
                        onChange={e => setFormData({...formData, experience_years: e.target.value})}
                    />
                </div>
                <div className="form-group">
                    <label>Commission Rate (%)</label>
                    <input 
                        type="number" 
                        className="form-input" 
                        value={(formData.commission_rate || 0) * 100} 
                        onChange={e => setFormData({...formData, commission_rate: parseFloat(e.target.value) / 100})}
                    />
                </div>
            </div>
            <button className="btn btn-primary" style={{marginTop: '20px'}} onClick={handleUpdateProfile}>
                <Save size={18} style={{marginRight:'8px'}}/> Save Changes
            </button>

            <div className="stats-row" style={{marginTop: '40px', padding: 0}}>
                <div className="stat-item">
                    <span className="stat-label">Total Appointments</span>
                    <span className="stat-count">{artistDetails.stats.total_appointments}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Rating</span>
                    <span className="stat-count">⭐ {artistDetails.stats.avg_rating || 'N/A'}</span>
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
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
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
                    <div key={work.id} className="gallery-item-admin">
                        <img src={work.image_url} alt={work.title} />
                        <div className="gallery-overlay">
                            <button className="delete-btn" onClick={() => handleDeleteWork(work.id)}>
                                <Trash2 size={16} />
                            </button>
                            <span>{work.title}</span>
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
                <div className="stats-row" style={{padding: 0, marginBottom: '20px'}}>
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
                                <td style={{color: '#10b981', fontWeight: 'bold'}}>₱{e.commission.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="admin-page-with-sidenav">
          {isManagerView ? <ManagerSideNav /> : <AdminSideNav />}
            <div className="admin-page page-container-enter">
            <header className="admin-header" style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: 'none' }}>
                <h1>Staff Management</h1>
            </header>

            <div className="filters-section">
                <div className="search-box" style={{ maxWidth: '300px' }}>
                    <input
                        type="text"
                        placeholder="Search staff..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>

                <div className="filter-controls">
                    <select 
                        value={roleFilter} 
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="select-input"
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="all">All Roles</option>
                        <option value="artist">Artist</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
            </div>

            <div className="table-card">
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
                                <tr><td colSpan="5" className="no-data" style={{textAlign: 'center', padding: '2rem'}}>Loading staff...</td></tr>
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
                                    <td colSpan="9" className="no-data">No staff members found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {filteredStaff.length > itemsPerPage && (
                    <div className="pagination-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label style={{fontSize: '0.85rem'}}>Per page:</label>
                            <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="form-input" style={{ width: '70px', padding: '2px 5px', height: 'auto' }}>
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{currentPage} / {totalPages}</span>
                            <div style={{display: 'flex', gap: '5px'}}>
                                <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</button>
                                <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: '0.8rem' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Detailed Artist Manager Overlay */}
            {artistManagerModal.mounted && selectedArtist && (
                <div className={`modal-overlay ${artistManagerModal.visible ? 'open' : ''}`} onClick={closeModal}>
                    <div className="modal-content" style={{maxWidth: '900px', width: '95%', height: '90vh', display: 'flex', flexDirection: 'column'}} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2>{selectedArtist.name}</h2>
                                <p style={{margin:0, color:'#666'}}>Artist Management Portal</p>
                            </div>
                            <button className="close-btn" onClick={closeModal}><X size={24}/></button>
                        </div>
                        
                        <div className="settings-tabs" style={{padding: '0 20px', borderBottom: '1px solid #eee'}}>
                            <button className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                                <User size={16} style={{marginRight:5}}/> Profile
                            </button>
                            <button className={`tab-button ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
                                <Calendar size={16} style={{marginRight:5}}/> Schedule
                            </button>
                            <button className={`tab-button ${activeTab === 'portfolio' ? 'active' : ''}`} onClick={() => setActiveTab('portfolio')}>
                                <Image size={16} style={{marginRight:5}}/> Portfolio
                            </button>
                            <button className={`tab-button ${activeTab === 'earnings' ? 'active' : ''}`} onClick={() => setActiveTab('earnings')}>
                                <DollarSign size={16} style={{marginRight:5}}/> Earnings
                            </button>
                        </div>

                        <div className="modal-body" style={{flex: 1, overflowY: 'auto'}}>
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
            </div>
        </div>
    );
}

export default AdminStaff;
