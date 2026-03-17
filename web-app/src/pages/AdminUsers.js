import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import AdminSideNav from '../components/AdminSideNav';
import ManagerSideNav from '../components/ManagerSideNav';
import './AdminUsers.css';
import { API_URL } from '../config';

function AdminUsers() {
    const navigate = useNavigate();
    const location = useLocation();
    const isManagerView = location.pathname.startsWith('/manager');
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [filterStatus, setFilterStatus] = useState('active');
    const [sortBy, setSortBy] = useState('name');
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Modal state for animations
    const [userModal, setUserModal] = useState({ mounted: false, visible: false });

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        user_type: 'customer',
        status: 'active',
        password: ''
    });
    
    // Modal animation handlers
    const openModal = () => {
        setUserModal({ mounted: true, visible: false });
        setTimeout(() => setUserModal({ mounted: true, visible: true }), 10);
    };

    const closeModal = () => {
        setUserModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setUserModal({ mounted: false, visible: false });
            setSelectedUser(null);
        }, 400); // Match CSS transition duration
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        filterAndSortUsers();
    }, [users, searchTerm, filterRole, filterStatus, sortBy]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const response = await Axios.get(`${API_URL}/api/admin/users?status=${filterStatus}`);
            if (response.data.success) {
                setUsers(response.data.data);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching users:", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [filterStatus]); // Refetch when status filter changes

    const filterAndSortUsers = () => {
        let filtered = users.filter(user => {
            const matchesSearch =
                user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (user.phone && user.phone.includes(searchTerm));
            
            const matchesRole = filterRole === 'all' || user.user_type === filterRole;
            
            return matchesSearch && matchesRole;
        });

        // Sort
        if (sortBy === 'name') {
            filtered.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === 'email') {
            filtered.sort((a, b) => a.email.localeCompare(b.email));
        } else if (sortBy === 'role') {
            filtered.sort((a, b) => a.user_type.localeCompare(b.user_type));
        }

        setFilteredUsers(filtered);
        setCurrentPage(1); // Reset to first page on filter change
    };

    // Pagination logic
    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleEdit = (user) => {
        setSelectedUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            user_type: user.user_type,
            status: user.status || 'active',
            password: ''
        });
        openModal();
    };

    const handleDelete = async (userId) => {
        if (window.confirm('Are you sure you want to deactivate this user?')) {
            try {
                await Axios.delete(`${API_URL}/api/admin/users/${userId}`);
                setUsers(users.filter(u => u.id !== userId));
                alert('User deactivated successfully');
            } catch (error) {
                console.error("Error deactivating user:", error);
                alert('Failed to deactivate user');
            }
        }
    };

    const handleRestore = async (userId) => {
        try {
            await Axios.put(`${API_URL}/api/admin/users/${userId}/restore`);
            setUsers(users.filter(u => u.id !== userId));
            alert('User restored successfully');
        } catch (error) {
            console.error("Error restoring user:", error);
        }
    };

    const handlePermanentDelete = async (userId) => {
        if (window.confirm('This will PERMANENTLY delete the user and cannot be undone. Continue?')) {
            try {
                await Axios.delete(`${API_URL}/api/admin/users/${userId}/permanent`);
                setUsers(users.filter(u => u.id !== userId));
            } catch (error) {
                console.error("Error deleting user:", error);
                alert('Failed to delete user. They may have linked data (appointments, etc).');
            }
        }
    };

    const handleSave = async () => {
        try {
            if (selectedUser) {
                // Update existing user via API
                await Axios.put(`${API_URL}/api/admin/users/${selectedUser.id}`, {
                    name: formData.name,
                    email: formData.email,
                    type: formData.user_type
                });
                alert('User updated successfully');
            } else {
                // Add new user via API
                if (!formData.password) {
                    alert('Password is required for new users');
                    return;
                }
                await Axios.post(`${API_URL}/api/admin/users`, {
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    type: formData.user_type
                });
                alert('User added successfully');
            }
            fetchUsers(); // Refresh list from database
            closeModal();
            setSelectedUser(null);
            setFormData({
                name: '',
                email: '',
                phone: '',
                user_type: 'customer',
                status: 'active',
                password: ''
            });
        } catch (error) {
            console.error("Error saving user:", error);
            alert('Error saving user: ' + (error.response?.data?.message || error.message));
        }
    };

    const handleAddNew = () => {
        setSelectedUser(null);
        setFormData({
            name: '',
            email: '',
            phone: '',
            user_type: 'customer',
            status: 'active',
            password: ''
        });
        openModal();
    };

    return (
        <div className="admin-page-with-sidenav">
            {isManagerView ? <ManagerSideNav /> : <AdminSideNav />}
            <div className="admin-page page-container-enter">
            <header className="admin-header" style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: 'none' }}>
                <h1>User Management</h1>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-primary" onClick={handleAddNew}>
                        + Add New User
                    </button>
                </div>
            </header>

            <div className="filters-section">
                <div className="search-box" style={{ maxWidth: '300px' }}>
                    <input
                        type="text"
                        placeholder="Search by name, email, or phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>

                <div className="filter-controls">
                    <select 
                        value={filterRole} 
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="select-input"
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="all">All Roles</option>
                        <option value="admin">Admin</option>
                        <option value="artist">Artist</option>
                        <option value="manager">Manager</option>
                        <option value="customer">Customer</option>
                    </select>

                    <select 
                        value={filterStatus} 
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="select-input"
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="active">Active Users</option>
                        <option value="deleted">Deactivated Users</option>
                    </select>

                    <select 
                        value={sortBy} 
                        onChange={(e) => setSortBy(e.target.value)}
                        className="select-input"
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="name">Sort by Name</option>
                        <option value="email">Sort by Email</option>
                        <option value="role">Sort by Role</option>
                    </select>
                </div>
            </div>

            <div className="stats-row">
                <div className="stat-item">
                    <span className="stat-label">Total Users</span>
                    <span className="stat-count">{users.length}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Filtered Results</span>
                    <span className="stat-count">{filteredUsers.length}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Active Artists</span>
                    <span className="stat-count">{users.filter(u => u.user_type === 'artist').length}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Total Customers</span>
                    <span className="stat-count">{users.filter(u => u.user_type === 'customer').length}</span>
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
                                    <th>Phone</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" className="no-data" style={{textAlign: 'center', padding: '2rem'}}>Loading users...</td></tr>
                                ) : paginatedUsers.length > 0 ? (
                                    paginatedUsers.map((user) => (
                                        <tr key={user.id}>
                                            <td>#{user.id}</td>
                                            <td>{user.name}</td>
                                            <td>{user.email}</td>
                                            <td>{user.phone || '-'}</td>
                                            <td>
                                                <span className={`badge role-${user.user_type}`}>
                                                    {user.user_type}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge status-${user.is_deleted ? 'inactive' : 'active'}`}>
                                                    {user.is_deleted ? 'Deactivated' : 'Active'}
                                                </span>
                                            </td>
                                            <td className="actions-cell">
                                                <button className="action-btn edit-btn" onClick={() => handleEdit(user)}>
                                                    Edit
                                                </button>
                                                {!user.is_deleted ? (
                                                    <button className="action-btn delete-btn" onClick={() => handleDelete(user.id)}>
                                                        Deactivate
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button className="action-btn view-btn" onClick={() => handleRestore(user.id)} style={{backgroundColor: '#10b981'}}>Restore</button>
                                                        <button className="action-btn delete-btn" onClick={() => handlePermanentDelete(user.id)} style={{backgroundColor: '#991b1b'}}>Delete</button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="no-data">No users found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination Controls */}
                {filteredUsers.length > 10 && (
                    <div className="pagination-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', padding: '1rem', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label>Items per page:</label>
                            <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="select-input" style={{ width: '80px', padding: '4px' }}>
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Page {currentPage} of {totalPages} ({filteredUsers.length} users)</span>
                            <button className="btn btn-secondary" style={{ padding: '5px 15px' }} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</button>
                            <button className="btn btn-secondary" style={{ padding: '5px 15px' }} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</button>
                        </div>
                    </div>
                )}

            {/* Modal */}
            {userModal.mounted && (
                <div className={`modal-overlay ${userModal.visible ? 'open' : ''}`} onClick={closeModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedUser ? 'Edit User' : 'Add New User'}</h2>
                            <button className="close-btn" onClick={closeModal}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Name *</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    className="form-input"
                                />
                            </div>
                            <div className="form-group">
                                <label>Email *</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    className="form-input"
                                />
                            </div>
                            {!selectedUser && (
                                <div className="form-group">
                                    <label>Password *</label>
                                    <input
                                        type="password"
                                        value={formData.password || ''}
                                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                                        className="form-input"
                                        placeholder="Enter password"
                                    />
                                </div>
                            )}
                            <div className="form-group">
                                <label>Phone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                    className="form-input"
                                />
                            </div>
                            <div className="form-group">
                                <label>Role *</label>
                                <select 
                                    value={formData.user_type}
                                    onChange={(e) => setFormData({...formData, user_type: e.target.value})}
                                    className="form-input"
                                    disabled={selectedUser?.email === 'admin@inkvistar.com'}
                                >
                                    <option value="customer">Customer</option>
                                    <option value="artist">Artist</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                </select>
                                {selectedUser?.email === 'admin@inkvistar.com' && (
                                    <small style={{color: '#ef4444', fontSize: '0.8rem'}}>Cannot change role of system admin</small>
                                )}
                            </div>
                            <div className="form-group">
                                <label>Status</label>
                                <select 
                                    value={formData.status}
                                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                                    className="form-input"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="suspended">Suspended</option>
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeModal}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                {selectedUser ? 'Update User' : 'Add User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}

export default AdminUsers;
