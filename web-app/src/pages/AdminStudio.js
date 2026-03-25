import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { MapPin, Clock, Users, Power, Trash2, Edit2, Plus, X, Search, Filter, SlidersHorizontal } from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import { API_URL } from '../config';
import ConfirmModal from '../components/ConfirmModal';
import './AdminUsers.css'; // Reusing styles

function AdminStudio() {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [branchModal, setBranchModal] = useState({ mounted: false, visible: false });
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
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
        } catch (error) {
            console.error("Error saving branch:", error);
            alert("Failed to save branch");
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
        setFormData({ name: '', address: '', phone: '', operating_hours: '09:00 - 20:00', capacity: 50 });
        openModal();
    };

    const filteredBranches = branches.filter(b => 
        b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.address.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
                <header className="admin-header" style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: 'none' }}>
                    <h1>Studio & Branch Management</h1>
                    <button className="btn btn-primary" onClick={openAddModal}><Plus size={18} style={{marginRight:'5px'}}/> Add Branch</button>
                </header>

                <div className="premium-filter-bar" style={{ margin: '0 2rem 1.5rem 2rem' }}>
                    <div className="premium-search-box">
                        <Search size={18} className="text-muted" />
                        <input
                            type="text"
                            placeholder="Search branches by name or address..."
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
                            className="premium-select-v2" 
                            value={filterStatus} 
                            onChange={(e) => setFilterStatus(e.target.value)} 
                        >
                            <option value="active">Active Branches</option>
                            <option value="deleted">Deleted Branches</option>
                        </select>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: '600', marginLeft: '0.5rem' }}>
                            <SlidersHorizontal size={16} />
                            <span>Sort:</span>
                        </div>
                        <select className="premium-select-v2">
                            <option value="name">Name</option>
                            <option value="capacity">Capacity</option>
                        </select>
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
                                            <th style={{ minWidth: '200px' }}>Branch Name</th>
                                            <th>Address</th>
                                            <th>Operating Hours</th>
                                            <th>Capacity Tracking</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="6" className="no-data" style={{textAlign: 'center', padding: '2rem'}}>Loading branches...</td></tr>
                                        ) : filteredBranches && filteredBranches.length > 0 ? filteredBranches.map((branch) => {
                                            if (!branch) return null;
                                            const capacity = Number(branch.capacity) || 1;
                                            const occupancy = Number(branch.current_occupancy) || 0;
                                            const occupancyPercent = Math.min((occupancy / capacity) * 100, 100);
                                            return (
                                                <tr key={branch.id}>
                                                    <td><strong>{branch.name}</strong><br/><small style={{color:'#666'}}>{branch.phone}</small></td>
                                                    <td><div style={{display:'flex', alignItems:'center', gap:'5px'}}><MapPin size={14}/> {branch.address}</div></td>
                                                    <td><div style={{display:'flex', alignItems:'center', gap:'5px'}}><Clock size={14}/> {branch.operating_hours}</div></td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{ width: '100px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow:'hidden' }}>
                                                                <div style={{ width: `${occupancyPercent || 0}%`, height: '100%', background: occupancyPercent > 90 ? '#ef4444' : '#10b981', borderRadius: '4px' }}></div>
                                                            </div>
                                                            <span style={{fontSize:'0.85rem'}}>{branch.current_occupancy}/{branch.capacity}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`badge status-${branch.status.toLowerCase() === 'open' ? 'active' : 'inactive'}`}>
                                                            {branch.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{display:'flex', gap:'5px'}}>
                                                            {filterStatus === 'active' ? (
                                                                <>
                                                                    <button className="action-btn" onClick={() => toggleStatus(branch)} title="Toggle Status" style={{backgroundColor: branch.status === 'Open' ? '#f59e0b' : '#10b981'}}><Power size={16}/></button>
                                                                    <button className="action-btn edit-btn" onClick={() => openEditModal(branch)}><Edit2 size={16}/></button>
                                                                    <button className="action-btn delete-btn" onClick={() => handleDelete(branch.id)}><Trash2 size={16}/></button>
                                                                </>
                                                            ) : (
                                                                <button className="action-btn view-btn" onClick={() => handleRestore(branch.id)} style={{backgroundColor: '#10b981'}}>Restore</button>
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
                                <h2>{editingId ? 'Edit Branch' : 'Add New Branch'}</h2>
                                <button className="close-btn" onClick={closeModal}><X size={20}/></button>
                            </div>
                            <form onSubmit={handleSave}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>Branch Name</label>
                                        <input type="text" className="form-input" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                                    </div>
                                    <div className="form-group">
                                        <label>Address</label>
                                        <input type="text" className="form-input" required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Phone</label>
                                            <input type="text" className="form-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                                        </div>
                                        <div className="form-group">
                                            <label>Capacity (Max People)</label>
                                            <input type="number" className="form-input" required value={formData.capacity} onChange={e => setFormData({...formData, capacity: e.target.value})} />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Operating Hours</label>
                                        <input type="text" className="form-input" placeholder="e.g. 09:00 - 20:00" value={formData.operating_hours} onChange={e => setFormData({...formData, operating_hours: e.target.value})} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">Save Branch</button>
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

export default AdminStudio;