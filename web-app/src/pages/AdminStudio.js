import React, { useState, useEffect, useCallback, useRef } from 'react';
import Axios from 'axios';
import { useLocation } from 'react-router-dom';
import { MapPin, Clock, Users, Power, Trash2, Edit2, Plus, X, Search, Filter, SlidersHorizontal, Mail, MessageSquare, Shield } from 'lucide-react';
import MarketingEmailModal from '../components/MarketingEmailModal';
import AdminSideNav from '../components/AdminSideNav';
import './PortalStyles.css';
import './AdminStyles.css';
import { API_URL } from '../config';
import ConfirmModal from '../components/ConfirmModal';


import AdminReviews from './AdminReviews';
import AdminAftercare from './AdminAftercare';
import AdminReports from './AdminReports';
import AdminSettingsTab from '../components/AdminSettingsTab';
import './AdminUsers.css'; // Reusing styles

function AdminStudio() {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState('branches');

    // Handle incoming URL tab parameter (e.g. from notifications)
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const tab = queryParams.get('tab');
        if (tab) {
            setActiveTab(tab);
        }
    }, [location.search]);

    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [branchModal, setBranchModal] = useState({ mounted: false, visible: false });
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'info', isAlert: false });
    const [errors, setErrors] = useState({});
    const [unreadReportCount, setUnreadReportCount] = useState(0);

    const searchRef = useRef(null);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Poll unread report count for notification dot
    const fetchUnreadReportCount = useCallback(async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/admin/reports/unread-count`);
            if (res.data.success) setUnreadReportCount(res.data.count || 0);
        } catch { /* silent */ }
    }, []);
    useEffect(() => {
        fetchUnreadReportCount();
        const interval = setInterval(fetchUnreadReportCount, 30000);
        return () => clearInterval(interval);
    }, [fetchUnreadReportCount]);

    const validateField = (name, value) => {
        let errorMsg = "";
        if (name === 'name' && !value) errorMsg = "Branch Name is required";
        if (name === 'address' && !value) errorMsg = "Address is required";
        if (name === 'capacity') {
            if (!value) errorMsg = "Capacity is required";
            else if (isNaN(value) || value <= 0) errorMsg = "Capacity must be a positive number";
        }
        if (name === 'operating_hours' && !value) errorMsg = "Operating hours are required";
        setErrors(prev => ({ ...prev, [name]: errorMsg }));
        return errorMsg === "";
    };

    const showAlert = (title, message, type = 'info') => {
        setConfirmDialog({ isOpen: true, title, message, type, isAlert: true, onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })) });
    };
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        phone: '',
        operating_hours: '09:00 - 20:00',
        capacity: 50
    });
    const [editingId, setEditingId] = useState(null);
    const [filterStatus, setFilterStatus] = useState('active');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchBranches();
    }, [filterStatus]);

    // Modal animation handlers
    const openModal = () => {
        setBranchModal({ mounted: true, visible: false });
        setTimeout(() => setBranchModal({ mounted: true, visible: true }), 10);
    };

    const closeModal = () => {
        setErrors({});
        setBranchModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setBranchModal({ mounted: false, visible: false });
        }, 400);
    };

    const fetchBranches = async () => {
        try {
            setLoading(true);
            const res = await Axios.get(`${API_URL}/api/admin/branches?status=${filterStatus}`);
            if (res.data && res.data.success && Array.isArray(res.data.data)) {
                setBranches(res.data.data);
            } else {
                setBranches([]);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching branches:", error);
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        
        const isNameValid = validateField('name', formData.name);
        const isAddressValid = validateField('address', formData.address);
        const isCapacityValid = validateField('capacity', formData.capacity);
        const isOpsValid = validateField('operating_hours', formData.operating_hours);
        
        if (!isNameValid || !isAddressValid || !isCapacityValid || !isOpsValid) return;
        
        try {
            if (editingId) {
                await Axios.put(`${API_URL}/api/admin/branches/${editingId}`, formData);
            } else {
                await Axios.post(`${API_URL}/api/admin/branches`, formData);
            }
            closeModal();
            setEditingId(null);
            setFormData({ name: '', address: '', phone: '', operating_hours: '09:00 - 20:00', capacity: 50 });
            fetchBranches();
            showAlert("Success", "Branch saved successfully", "success");
        } catch (error) {
            console.error("Error saving branch:", error);
            showAlert("Error", "Failed to save branch", "danger");
        }
    };

    const toggleStatus = async (branch) => {
        const newStatus = branch.status === 'Open' ? 'Closed' : 'Open';
        try {
            await Axios.put(`${API_URL}/api/admin/branches/${branch.id}`, { status: newStatus });
            fetchBranches();
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const handleDelete = (id) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Branch',
            message: 'Are you sure you want to delete this branch?',
            onConfirm: async () => {
                setConfirmDialog({ isOpen: false });
                try {
                    await Axios.delete(`${API_URL}/api/admin/branches/${id}`);
                    fetchBranches();
                } catch (error) {
                    console.error("Error deleting branch:", error);
                }
            }
        });
    };

    const handleRestore = async (id) => {
        try {
            await Axios.put(`${API_URL}/api/admin/branches/${id}/restore`);
            fetchBranches();
        } catch (error) {
            console.error("Error restoring branch:", error);
        }
    };

    const openEditModal = (branch) => {
        setEditingId(branch.id);
        setErrors({});
        setFormData({
            name: branch.name,
            address: branch.address,
            phone: branch.phone,
            operating_hours: branch.operating_hours,
            capacity: branch.capacity
        });
        openModal();
    };

    const openAddModal = () => {
        setEditingId(null);
        setErrors({});
        setFormData({ name: '', address: '', phone: '', operating_hours: '09:00 - 20:00', capacity: 50 });
        openModal();
    };

    const filteredBranches = branches.filter(b => 
        b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.address.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ── Marketing Email Tab ─────────────────────────────────────────
    const [showMarketingModal, setShowMarketingModal] = useState(false);

    const MarketingEmailTab = () => (
        <div className="portal-content" style={{ paddingTop: '24px' }}>
            {/* Hero Banner */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(190, 144, 85, 0.9), rgba(138, 108, 74, 0.95))',
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px', padding: '32px', marginBottom: '28px',
                position: 'relative', overflow: 'hidden',
                border: '1.5px solid rgba(255, 255, 255, 0.25)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)'
            }}>
                <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                    <div style={{ background: 'rgba(255, 255, 255, 0.2)', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                        <Mail size={32} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                        <h2 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 700, fontFamily: "'Playfair Display', serif", color: '#ffffff' }}>
                            Email Marketing Center
                        </h2>
                        <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                            Compose and send promotional emails to all subscribed customers. Attach promo images and craft compelling subject lines.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowMarketingModal(true)}
                        style={{
                            background: '#ffffff', color: '#1e293b', border: 'none',
                            padding: '12px 28px', borderRadius: '10px', fontWeight: 700,
                            cursor: 'pointer', fontSize: '0.95rem', flexShrink: 0,
                            display: 'flex', alignItems: 'center', gap: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                    >
                        <Mail size={18} />
                        Compose Broadcast
                    </button>
                </div>
            </div>

            {/* Info Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '16px', marginBottom: '28px' }}>
                {[
                    {
                        title: 'Subscriber Targeting',
                        desc: 'Emails are sent only to verified users who opted in to marketing communications during registration.',
                        icon: <Users size={24} />
                    },
                    {
                        title: 'Promo Image Support',
                        desc: 'Attach a banner image (up to 2MB) that appears prominently at the top of the email, right after the subject.',
                        icon: <Mail size={24} />
                    },
                    {
                        title: 'Branded Template',
                        desc: 'All broadcasts use the InkVistAR dark luxury email template with your studio logo and footer automatically.',
                        icon: <Filter size={24} />
                    }
                ].map((card, i) => (
                    <div key={i} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                        gap: '12px', padding: '24px 16px', background: '#fff',
                        borderRadius: '12px', border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                    }}>
                        <div style={{ color: '#be9055', background: 'rgba(190, 144, 85, 0.1)', padding: '14px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {card.icon}
                        </div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>{card.title}</h4>
                        <span style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: '1.5' }}>{card.desc}</span>
                    </div>
                ))}
            </div>

            {/* Advisory */}
            <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px',
                padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '12px'
            }}>
                <Mail size={18} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: '0.82rem', color: '#92400e', lineHeight: 1.6 }}>
                    <strong>Spam/Junk Advisory:</strong> Please also check your Spam/Junk folder for OTPs, invoices, and booking status emails. 
                    Remind your customers to whitelist <strong>eloaltalt@gmail.com</strong> to ensure delivery.
                </div>
            </div>

            {/* Marketing Modal (opens on top) */}
            <MarketingEmailModal
                isOpen={showMarketingModal}
                onClose={() => setShowMarketingModal(false)}
            />
        </div>
    );

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
                <header className="portal-header">
                    <h1>Studio Settings</h1>
                    {activeTab === 'branches' && (
                        <button className="btn btn-primary" onClick={openAddModal}><Plus size={18} className="admin-st-c02c7d9c"/> Add Branch</button>
                    )}
                </header>

                <div className="admin-st-d14eab7d">
                    {[
                        { key: 'branches', label: 'Branches Directory' },
                        { key: 'settings', label: 'System Preferences' },
                        { key: 'reviews', label: 'Customer Reviews' },
                        { key: 'aftercare', label: 'Aftercare Schedule' },
                        { key: 'marketing', label: 'Marketing Emails' },
                        { key: 'reports', label: 'Customer Reports' }
                    ].map(tab => (
                        <button
                            key={tab.key}
                            style={{
                                padding: '0.85rem 1.2rem',
                                background: activeTab === tab.key ? 'rgba(190, 144, 85, 0.1)' : 'transparent',
                                border: 'none',
                                borderBottom: activeTab === tab.key ? '2px solid #be9055' : '2px solid transparent',
                                color: activeTab === tab.key ? '#1e293b' : '#64748b',
                                fontWeight: activeTab === tab.key ? 700 : 600,
                                cursor: 'pointer',
                                outline: 'none',
                                borderRadius: activeTab === tab.key ? '8px 8px 0 0' : '0',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.key === 'marketing' && <Mail size={16} />}
                            {tab.key === 'reports' && <MessageSquare size={16} />}
                            {tab.key === 'settings' && <SlidersHorizontal size={16} />}
                            {tab.label}
                            {tab.key === 'reports' && unreadReportCount > 0 && (
                                <span style={{
                                    background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 700,
                                    minWidth: '18px', height: '18px', borderRadius: '9px', display: 'inline-flex',
                                    alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                                    marginLeft: '4px', lineHeight: 1
                                }}>{unreadReportCount > 99 ? '99+' : unreadReportCount}</span>
                            )}
                        </button>
                    ))}
                </div>

                {activeTab === 'branches' ? (
                    <>
                        <div className="premium-filter-bar premium-filter-bar--stacked">
                    <div className="premium-search-box premium-search-box--full" ref={searchRef} style={{ position: 'relative' }}>
                        <Search size={16} className="text-muted" />
                        <input
                            type="text"
                            placeholder="Search branches by name or address..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                        />
                        {showSuggestions && searchTerm && filteredBranches.length > 0 && (
                            <div className="autocomplete-dropdown waterfall-dropdown">
                                {filteredBranches.slice(0, 5).map((branch, index) => (
                                    <div 
                                        key={branch.id} 
                                        className="autocomplete-item waterfall-item"
                                        style={{ animationDelay: `${index * 0.05}s` }}
                                        onClick={() => {
                                            setSearchTerm(branch.name);
                                            setShowSuggestions(false);
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: 600, color: '#1e293b' }}>{branch.name}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{branch.address}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="premium-filters-row">
                        <div className="premium-filter-item">
                            <Filter size={16} />
                            <span>Status:</span>
                            <select
                                className="premium-select-v2"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                            >
                                <option value="active">Active Branches</option>
                                <option value="deleted">Deleted Branches</option>
                            </select>
                        </div>

                        <div className="premium-filter-item">
                            <SlidersHorizontal size={16} />
                            <span>Sort:</span>
                            <select className="premium-select-v2">
                                <option value="name">Name</option>
                                <option value="capacity">Capacity</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="stats-row">
                    <div className="stat-item">
                        <span className="stat-label">Total Branches</span>
                        <span className="stat-count">{branches.length}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Open Now</span>
                        <span className="stat-count">{branches.filter(b => b.status === 'Open').length}</span>
                    </div>
                </div>

                <div className="portal-content">
                        <div className="table-card">
                            <div className="table-responsive">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th className="admin-st-a06603ef">Branch Name</th>
                                            <th>Address</th>
                                            <th>Operating Hours</th>
                                            <th>Capacity Tracking</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="6" className="no-data admin-st-3927920f">Loading branches...</td></tr>
                                        ) : filteredBranches && filteredBranches.length > 0 ? filteredBranches.map((branch) => {
                                            if (!branch) return null;
                                            const capacity = Number(branch.capacity) || 1;
                                            const occupancy = Number(branch.current_occupancy) || 0;
                                            const occupancyPercent = Math.min((occupancy / capacity) * 100, 100);
                                            return (
                                                <tr key={branch.id}>
                                                    <td><strong>{branch.name}</strong><br/><small className="admin-st-169f06e0">{branch.phone}</small></td>
                                                    <td><div className="admin-st-5e3a23bb"><MapPin size={14}/> {branch.address}</div></td>
                                                    <td><div className="admin-st-5e3a23bb"><Clock size={14}/> {branch.operating_hours}</div></td>
                                                    <td>
                                                        <div className="admin-flex-center admin-gap-10">
                                                            <div className="admin-st-e03150eb">
                                                                <div style={{ width: `${occupancyPercent || 0}%`, height: '100%', background: occupancyPercent > 90 ? '#ef4444' : '#10b981', borderRadius: '4px' }}></div>
                                                            </div>
                                                            <span className="admin-st-e7992da2">{branch.current_occupancy}/{branch.capacity}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`badge status-${branch.status.toLowerCase() === 'open' ? 'active' : 'inactive'}`}>
                                                            {branch.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="admin-st-ce770332">
                                                            {filterStatus === 'active' ? (
                                                                <>
                                                                    <button className="action-btn" onClick={() => toggleStatus(branch)} title="Toggle Status" style={{backgroundColor: branch.status === 'Open' ? '#f59e0b' : '#10b981'}}><Power size={16}/></button>
                                                                    <button className="action-btn edit-btn" onClick={() => openEditModal(branch)}><Edit2 size={16}/></button>
                                                                    <button className="action-btn delete-btn" onClick={() => handleDelete(branch.id)}><Trash2 size={16}/></button>
                                                                </>
                                                            ) : (
                                                                <button className="action-btn view-btn admin-st-f1f5ea52" onClick={() => handleRestore(branch.id)}>Restore</button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr><td colSpan="6" className="no-data">No branches found. Add one to get started.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                </div>

                {/* Add/Edit Modal */}
                {branchModal.mounted && (
                    <div className={`modal-overlay ${branchModal.visible ? 'open' : ''}`} onClick={closeModal}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="admin-flex-center admin-gap-15">
                                    <div className="admin-st-c911153f">
                                        <MapPin size={20} className="text-bronze" />
                                    </div>
                                    <div>
                                        <h2 className="admin-m-0">{editingId ? 'Modify Studio Branch' : 'Establish New Branch'}</h2>
                                        <p className="admin-st-925e4e02">Configure operational studio location</p>
                                    </div>
                                </div>
                                <button className="close-btn" onClick={closeModal}><X size={24}/></button>
                            </div>
                            <form onSubmit={handleSave}>
                                <div className="modal-body admin-st-7cea880d">
                                    <div className="form-group admin-mb-20">
                                        <label className="premium-label">Official Branch Designation</label>
                                        <input type="text" name="name" className={`form-input ${errors.name ? 'error' : ''}`} required value={formData.name} onChange={e => { setFormData({...formData, name: e.target.value}); validateField('name', e.target.value); }} placeholder="e.g., Downtown Sanctuary, Westside Hub" />
                                        {errors.name && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.name}</small>}
                                    </div>
                                    <div className="form-group admin-mb-20">
                                        <label className="premium-label">Geographic Location (Full Address)</label>
                                        <input type="text" name="address" className={`form-input ${errors.address ? 'error' : ''}`} required value={formData.address} onChange={e => { setFormData({...formData, address: e.target.value}); validateField('address', e.target.value); }} />
                                        {errors.address && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.address}</small>}
                                    </div>
                                    <div className="admin-st-c200c71d">
                                        <div className="form-group">
                                            <label className="premium-label">Contact Hotlink (Phone)</label>
                                            <input type="text" name="phone" className={`form-input ${errors.phone ? 'error' : ''}`} value={formData.phone} onChange={e => { const val = e.target.value.replace(/\\D/g, '').replace(/^0+/, '').slice(0, 15); setFormData({...formData, phone: val}); validateField('phone', val); }} />
                                            {errors.phone && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.phone}</small>}
                                        </div>
                                        <div className="form-group">
                                            <label className="premium-label">Operational Capacity</label>
                                            <input type="number" min="0" name="capacity" className={`form-input ${errors.capacity ? 'error' : ''}`} required value={formData.capacity} onChange={e => { setFormData({...formData, capacity: e.target.value}); validateField('capacity', e.target.value); }} />
                                            {errors.capacity && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.capacity}</small>}
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="premium-label">Standard Operating Protocol (Hours)</label>
                                        <input type="text" name="operating_hours" className={`form-input ${errors.operating_hours ? 'error' : ''}`} placeholder="e.g. 09:00 - 20:00" value={formData.operating_hours} onChange={e => { setFormData({...formData, operating_hours: e.target.value}); validateField('operating_hours', e.target.value); }} />
                                        {errors.operating_hours && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.operating_hours}</small>}
                                    </div>
                                    
                                    <div className="glass-panel admin-st-194b571d">
                                        <p className="admin-st-76a35748">
                                            * Modifying branch details will update all associated staff records and public-facing portal listings instantly.
                                        </p>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary admin-st-6948e5f9">
                                        {editingId ? 'Update Branch' : 'Finalize Creation'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
                </>
                ) : activeTab === 'settings' ? (
                    <AdminSettingsTab />
                ) : activeTab === 'reviews' ? (
                    <AdminReviews />
                ) : activeTab === 'aftercare' ? (
                    <AdminAftercare />
                ) : activeTab === 'marketing' ? (
                    <MarketingEmailTab />
                ) : activeTab === 'reports' ? (
                    <AdminReports />
                ) : null}

                <ConfirmModal 
                    {...confirmDialog} 
                    onClose={() => setConfirmDialog({ isOpen: false })} 
                />
            </div>
        </div>
    );
}

export default AdminStudio;