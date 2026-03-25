import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import AdminSideNav from '../components/AdminSideNav';
import { API_URL } from '../config';
import ConfirmModal from '../components/ConfirmModal';
import './AdminUsers.css';
import { User, Calendar, FileText, Edit2, Trash2, Save, X, RotateCcw, Search, Filter, SlidersHorizontal } from 'lucide-react';

function AdminClients() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
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
            const [profileRes, historyRes] = await Promise.all([
                Axios.get(`${API_URL}/api/customer/profile/${client.id}`),
                Axios.get(`${API_URL}/api/customer/${client.id}/appointments`)
            ]);

            const profile = profileRes.data.success ? profileRes.data.profile : {};
            const appointments = historyRes.data.success ? historyRes.data.appointments : [];

            setClientDetails({ profile, appointments, notes: profile.notes || '' });
            setFormData(profile);

        } catch (error) {
            console.error("Error fetching client details:", error);
        }
        setLoadingDetails(false);
    };

    const handleSaveClient = async () => {
        if (!selectedClient) return;
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
            onConfirm: async () => {
                setConfirmDialog({ isOpen: false });
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
            onConfirm: async () => {
                setConfirmDialog({ isOpen: false });
                try {
                    await Axios.delete(`${API_URL}/api/admin/users/${id}/permanent`);
                    fetchClients();
                } catch (error) {
                    console.error("Error deleting client:", error);
                }
            }
        });
    };

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
                <header className="admin-header" style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: 'none' }}>
                    <h1>Client Management</h1>
                </header>

                <div className="premium-filter-bar">
                    <div className="premium-search-box">
                        <Search size={18} className="text-muted" />
                        <input
                            type="text"
                            placeholder="Search clients..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="premium-filters-group">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: '600' }}>
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

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: '600', marginLeft: '0.5rem' }}>
                            <SlidersHorizontal size={16} />
                            <span>Sort:</span>
                        </div>
                        <select className="premium-select-v2">
                            <option value="name">Name</option>
                            <option value="join_date">Join Date</option>
                        </select>
                    </div>
                </div>

                <div className="table-card">
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
                                    <tr><td colSpan="4" className="no-data" style={{textAlign: 'center', padding: '2rem'}}>Loading clients...</td></tr>
                                ) : paginatedClients.map(client => (
                                    <tr key={client.id}>
                                        <td>#{client.id}</td>
                                        <td><strong>{client.name}</strong></td>
                                        <td>{client.email}</td>
                                        <td>
                                            {filterStatus === 'active' ? (
                                                <button className="action-btn view-btn" onClick={() => openManageModal(client)}>
                                                    Manage
                                                </button>
                                            ) : (
                                                <div style={{display: 'flex', gap: '5px'}}>
                                                    <button className="action-btn view-btn" onClick={() => handleRestoreClient(client.id)} style={{backgroundColor: '#10b981'}} title="Restore"><RotateCcw size={16}/></button>
                                                    <button className="action-btn delete-btn" onClick={() => handlePermanentDelete(client.id)} title="Permanent Delete"><Trash2 size={16}/></button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {filteredClients.length > itemsPerPage && (
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

                {clientModal.mounted && selectedClient && (
                    <div className={`modal-overlay ${clientModal.visible ? 'open' : ''}`} onClick={closeModal}>
                        <div className="modal-content" style={{maxWidth: '700px'}} onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Manage Client: {selectedClient.name}</h2>
                                <button className="close-btn" onClick={closeModal}><X/></button>
                            </div>
                            <div className="settings-tabs" style={{padding: '0 1.5rem'}}>
                                <button className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}><User size={16}/> Profile</button>
                                <button className={`tab-button ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}><Calendar size={16}/> History</button>
                            </div>
                            <div className="modal-body">
                                {loadingDetails ? <p>Loading details...</p> : (
                                    activeTab === 'profile' ? (
                                        <div>
                                            <div className="form-row">
                                                <div className="form-group">
                                                    <label>Name</label>
                                                    <input type="text" className="form-input" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
                                                </div>
                                                <div className="form-group">
                                                    <label>Email</label>
                                                    <input type="email" className="form-input" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label>Phone</label>
                                                <input type="text" className="form-input" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                                            </div>
                                            <div className="form-group">
                                                <label>Admin Notes</label>
                                                <textarea className="form-input" rows="3" placeholder="Add private notes about the client..." value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})}></textarea>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="table-responsive" style={{maxHeight: '400px'}}>
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Artist</th>
                                                        <th>Service</th>
                                                        <th>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                {clientDetails.appointments.length > 0 ? clientDetails.appointments.map(apt => (
                                                    <tr key={apt.id}>
                                                        <td>{new Date(apt.appointment_date).toLocaleDateString()}</td>
                                                        <td>{apt.artist_name}</td>
                                                        <td>{apt.design_title}</td>
                                                        <td><span className={`badge status-${apt.status}`}>{apt.status}</span></td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan="4" className="no-data">No appointment history.</td></tr>
                                                )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                )}
                            </div>
                            <div className="modal-footer" style={{justifyContent: 'space-between'}}>
                                <button className="btn btn-secondary" style={{backgroundColor: '#fee2e2', color: '#991b1b'}} onClick={handleDeactivateClient}><Trash2 size={16}/> Deactivate</button>
                                <div>
                                    <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                    <button className="btn btn-primary" onClick={handleSaveClient}><Save size={16}/> Save Changes</button>
                                </div>
                            </div>
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

export default AdminClients;