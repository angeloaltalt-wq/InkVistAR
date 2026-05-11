import React, { useState, useEffect, useRef } from 'react';
import Axios from 'axios';
import AdminSideNav from '../components/AdminSideNav';
import './PortalStyles.css';
import './AdminStyles.css';
import { API_URL } from '../config';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import { getDisplayCode, formatStatus } from '../utils/formatters';
import './AdminUsers.css';
import { User, Calendar, FileText, Edit2, Trash2, Save, X, RotateCcw, Search, Filter, SlidersHorizontal, Users, UserCheck, UserMinus, Clock } from 'lucide-react';

function AdminClients() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    
    const [selectedClient, setSelectedClient] = useState(null);
    const [clientModal, setClientModal] = useState({ mounted: false, visible: false });
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    const [activeTab, setActiveTab] = useState('profile');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [clientDetails, setClientDetails] = useState({
        profile: {},
        appointments: [],
        notes: ''
    });
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [formData, setFormData] = useState({});
    const [filterStatus, setFilterStatus] = useState('active');
    const [errors, setErrors] = useState({});

    const validateField = (field, value) => {
        let errorMsg = "";
        if ((field === 'name' || field === 'email' || field === 'phone') && !value) {
            errorMsg = "This field is required";
        } else if (field === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errorMsg = "Invalid email format";
        }
        setErrors(prev => ({ ...prev, [field]: errorMsg }));
        return errorMsg === "";
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        validateField(field, value);
    };

    useEffect(() => {
        fetchClients();
    }, [filterStatus]);

    // Modal animation handlers
    const openModal = () => {
        setClientModal({ mounted: true, visible: false });
        setTimeout(() => setClientModal({ mounted: true, visible: true }), 10);
    };

    const closeModal = () => {
        setClientModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setClientModal({ mounted: false, visible: false });
            setSelectedClient(null);
        }, 400);
    };

    const fetchClients = async () => {
        try {
            const response = await Axios.get(`${API_URL}/api/debug/users`);
            if (response.data && response.data.success && Array.isArray(response.data.users)) {
                // Filter only customers and ensure valid objects
                const customerList = response.data.users.filter(u => u && u.user_type === 'customer' && (filterStatus === 'active' ? !u.is_deleted : u.is_deleted));
                setClients(customerList);
            } else {
                setClients([]);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching clients:", error);
            setLoading(false);
        }
    };

    const filteredClients = clients.filter(c => 
        c && (
            (c.id || '').toString().includes(searchTerm) || 
            (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
            (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
        )
    );

    // Reset page on search
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterStatus]);

    // Pagination logic
    const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
    const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const openManageModal = async (client) => {
        setSelectedClient(client);
        openModal();
        setLoadingDetails(true);
        setActiveTab('profile');

        try {
            const [profileRes, historyRes, posRes] = await Promise.all([
                Axios.get(`${API_URL}/api/customer/profile/${client.id}`),
                Axios.get(`${API_URL}/api/customer/${client.id}/appointments`),
                Axios.get(`${API_URL}/api/admin/invoices`) // We'll filter this locally for the client
            ]);

            const profile = profileRes.data.success ? profileRes.data.profile : {};
            const appointments = (historyRes.data.success ? historyRes.data.appointments : []).map(a => ({ ...a, recordType: 'Session' }));
            const posSales = (posRes.data.success ? posRes.data.data : [])
                .filter(inv => inv.customer_id === client.id)
                .map(inv => ({ ...inv, appointment_date: inv.created_at, design_title: inv.service_type, status: inv.status, recordType: 'Retail' }));

            const combinedHistory = [...appointments, ...posSales].sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date));

            setClientDetails({ profile, appointments: combinedHistory, notes: profile.notes || '' });
            setFormData(profile);
            setErrors({});

        } catch (error) {
            console.error("Error fetching client details:", error);
        }
        setLoadingDetails(false);
    };

    const handleSaveClient = async () => {
        if (!selectedClient) return;

        let valid = true;
        valid = validateField('name', formData.name) && valid;
        valid = validateField('email', formData.email) && valid;
        valid = validateField('phone', formData.phone) && valid;

        if (!valid) return;

        try {
            await Axios.put(`${API_URL}/api/customer/profile/${selectedClient.id}`, formData);
            alert('Client profile updated!');
            closeModal();
            fetchClients();
        } catch (error) {
            console.error("Error updating client:", error);
        }
    };

    const handleDeactivateClient = () => {
        if (!selectedClient) return;
        setConfirmDialog({
            isOpen: true,
            title: 'Deactivate Client',
            message: `Are you sure you want to deactivate ${selectedClient.name}?`,
            type: 'danger',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                await Axios.delete(`${API_URL}/api/admin/users/${selectedClient.id}`);
                closeModal();
                fetchClients();
            }
        });
    };

    const handleRestoreClient = async (id) => {
        try {
            await Axios.put(`${API_URL}/api/admin/users/${id}/restore`);
            fetchClients();
        } catch (error) {
            console.error("Error restoring client:", error);
        }
    };

    const handlePermanentDelete = (id) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Permanent Deletion',
            message: 'This will PERMANENTLY delete the client. Continue?',
            confirmText: 'Permanently Delete',
            type: 'danger',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                try {
                    await Axios.delete(`${API_URL}/api/admin/users/${id}/permanent`);
                    fetchClients();
                } catch (error) {
                    console.error("Error deleting client:", error);
                }
            }
        });
    };

    // Compute autocomplete suggestions dynamically from the dataset
    const searchSuggestions = Array.from(new Set([
        ...clients.map(c => (c.id || '').toString()),
        ...clients.map(c => (c.name || '').trim()),
        ...clients.map(c => (c.email || '').trim())
    ])).filter(Boolean);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
                <header className="portal-header">
                    <div className="header-title">
                        <h1>Client Management</h1>
                    </div>
                </header>
                <p className="header-subtitle">Maintain client relationships and session history</p>

                <div className="premium-filter-bar">
                    <div className="premium-search-box" ref={searchRef}>
                        <Search size={18} className="text-muted" />
                        <input
                            type="text"
                            placeholder="Search clients by name, email, or id..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                        />
                        {showSuggestions && searchTerm && searchSuggestions.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 && (
                            <div className="autocomplete-dropdown waterfall-dropdown">
                                {searchSuggestions
                                    .filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .slice(0, 8)
                                    .map((suggestion, index) => (
                                        <div 
                                            key={suggestion} 
                                            className="autocomplete-item waterfall-item"
                                            style={{ animationDelay: `${index * 0.05}s` }}
                                            onClick={() => {
                                                setSearchTerm(suggestion);
                                                setShowSuggestions(false);
                                            }}
                                        >
                                            {suggestion}
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                    <div className="premium-filters-group">
                        <div className="filter-label-group">
                            <Filter size={16} />
                            <span>Status:</span>
                        </div>
                        <select 
                            value={filterStatus} 
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="premium-select-v2"
                        >
                            <option value="active">Active Clients</option>
                            <option value="deleted">Deactivated Clients</option>
                        </select>

                        <div className="filter-label-group admin-st-60006981">
                            <SlidersHorizontal size={16} />
                            <span>Sort:</span>
                        </div>
                        <select className="premium-select-v2">
                            <option value="name">Name</option>
                            <option value="join_date">Join Date</option>
                        </select>
                    </div>
                </div>

                <div className="users-stats-grid">
                    <div className="stat-card-v2 glass-card">
                        <div className="stat-icon-wrapper blue">
                            <Users size={24} />
                        </div>
                        <div className="stat-info-v2">
                            <span className="stat-label-v2">Total Clients</span>
                            <h3 className="stat-value-v2">{clients.length}</h3>
                            <div className="stat-trend-v2">All-time Base</div>
                        </div>
                    </div>
                    <div className="stat-card-v2 glass-card">
                        <div className="stat-icon-wrapper green">
                            <UserCheck size={24} />
                        </div>
                        <div className="stat-info-v2">
                            <span className="stat-label-v2">Active Members</span>
                            <h3 className="stat-value-v2">{clients.filter(c => !c.is_deleted).length}</h3>
                            <div className="stat-trend-v2">Verified Status</div>
                        </div>
                    </div>
                    <div className="stat-card-v2 glass-card">
                        <div className="stat-icon-wrapper purple">
                            <Clock size={24} />
                        </div>
                        <div className="stat-info-v2">
                            <span className="stat-label-v2">Total Visits</span>
                            <h3 className="stat-value-v2">{clients.reduce((acc, c) => acc + (c.appointment_count || 0), 0)}</h3>
                            <div className="stat-trend-v2">Studio Sessions</div>
                        </div>
                    </div>
                    <div className="stat-card-v2 glass-card">
                        <div className="stat-icon-wrapper orange">
                            <UserMinus size={24} />
                        </div>
                        <div className="stat-info-v2">
                            <span className="stat-label-v2">Deactivated</span>
                            <h3 className="stat-value-v2">{clients.filter(c => c.is_deleted).length}</h3>
                            <div className="stat-trend-v2">Inactive Profiles</div>
                        </div>
                    </div>
                </div>

                <div className="table-card-container glass-card">
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="4" className="no-data admin-st-3927920f">Loading clients...</td></tr>
                                ) : paginatedClients.map(client => (
                                    <tr key={client.id}>
                                        <td>#{client.id}</td>
                                        <td><strong>{client.name}</strong></td>
                                        <td>{client.email}</td>
                                        
                                        <td className="actions-cell">
                                            {filterStatus === 'active' ? (
                                                <button className="btn btn-primary" onClick={() => openManageModal(client)}>
                                                    Manage
                                                </button>
                                            ) : (
                                                <div className="admin-st-ce770332">
                                                    <button 
                                                        className="action-btn view-btn admin-st-a1f52a0b" 
                                                        onClick={() => handleRestoreClient(client.id)} 
                                                        title="Restore Client"
                                                    >
                                                        <RotateCcw size={14}/> Restore
                                                    </button>
                                                    <button 
                                                        className="action-btn delete-btn admin-st-efbab0dd" 
                                                        onClick={() => handlePermanentDelete(client.id)} 
                                                        title="Permanently Delete Client"
                                                    >
                                                        <Trash2 size={14}/> Delete
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
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
                        totalItems={filteredClients.length}
                        unit="clients"
                    />
                </div>

                {clientModal.mounted && selectedClient && (
                    <div className={`modal-overlay ${clientModal.visible ? 'open' : ''}`} onClick={closeModal}>
                        <div className="modal-content large" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="admin-flex-center admin-gap-15">
                                    <div className="admin-st-c911153f">
                                        <User size={20} className="text-bronze" />
                                    </div>
                                    <div>
                                        <h2 className="admin-m-0">Client Profile: {selectedClient.name}</h2>
                                        <p className="admin-st-925e4e02">Account ID: #CLI-{selectedClient.id.toString().padStart(5, '0')}</p>
                                    </div>
                                </div>
                                <button className="close-btn" onClick={closeModal}><X size={24}/></button>
                            </div>
                            
                            <div className="settings-tabs admin-st-13b83aa7">
                                <button className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                                    <User size={16}/> Personal Information
                                </button>
                                <button className={`tab-button ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                                    <Calendar size={16}/> Visit History
                                </button>
                            </div>

                            <div className="modal-body admin-st-d6e6b0a9">
                                {loadingDetails ? (
                                    <div className="admin-st-e70dab8d">
                                        <div className="loading-spinner"></div>
                                    </div>
                                ) : (
                                    <div className="fade-in">
                                        {activeTab === 'profile' ? (
                                            <div className="admin-st-e7646dcc">
                                                <div className="admin-st-ff43421e">
                                                    <div className="form-group">
                                                        <label className="admin-st-19644797">Legal Name</label>
                                                        <input type="text" className={`form-input ${errors.name ? 'error' : ''}`} value={formData.name || ''} onChange={e => handleInputChange('name', e.target.value)} />
                                                        {errors.name && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.name}</small>}
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="admin-st-19644797">Direct Link (Email)</label>
                                                        <input type="email" className={`form-input ${errors.email ? 'error' : ''}`} value={formData.email || ''} onChange={e => handleInputChange('email', e.target.value)} />
                                                        {errors.email && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.email}</small>}
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="admin-st-19644797">Primary Contact</label>
                                                        <input type="text" className={`form-input ${errors.phone ? 'error' : ''}`} value={formData.phone || ''} onChange={e => handleInputChange('phone', e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '').slice(0, 15))} />
                                                        {errors.phone && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.phone}</small>}
                                                    </div>
                                                </div>
                                                <div className="admin-st-ff43421e">
                                                    <div className="form-group">
                                                        <label className="admin-st-19644797">Internal Confidential Notes</label>
                                                        <textarea 
                                                            className="form-input admin-st-6c845e15" 
                                                            rows="8" 
                                                            placeholder="Record specific sensitivities, design preferences, or billing history notes..." 
                                                            value={formData.notes || ''} 
                                                            onChange={e => setFormData({...formData, notes: e.target.value})}
                                                        ></textarea>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="table-responsive admin-st-59cb08dc">
                                                <table className="portal-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Procedure Date</th>
                                                            <th>Artist</th>
                                                            <th>Design Project</th>
                                                            <th>Outcome</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                    {clientDetails.appointments.length > 0 ? clientDetails.appointments.map(apt => (
                                                        <tr key={apt.id}>
                                                            <td className="admin-fw-600">{new Date(apt.appointment_date).toLocaleDateString()}</td>
                                                            <td>{apt.artist_name}</td>
                                                            <td>{apt.design_title}</td>
                                                            <td><span className={`status-badge ${apt.status}`}>{formatStatus(apt.status)}</span></td>
                                                        </tr>
                                                    )) : (
                                                        <tr><td colSpan="4" className="no-data">This client has no recorded procedures in the archive.</td></tr>
                                                    )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button className="action-btn delete-btn admin-st-47451e19" onClick={handleDeactivateClient}>
                                    <Trash2 size={16}/> Archive Account
                                </button>
                                <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                <button className="btn btn-primary admin-st-f9a92399" onClick={handleSaveClient} >
                                    <Save size={18}/> Commit Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <ConfirmModal 
                    {...confirmDialog} 
                    onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} 
                />
            </div>
        </div>
    );
}

export default AdminClients;