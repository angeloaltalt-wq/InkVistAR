import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import AdminSideNav from '../components/AdminSideNav';
import './AdminUsers.css';
import './PortalStyles.css';
import './AdminStyles.css';
import './AdminStaff.css';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import { API_URL } from '../config';
import { getDisplayCode, formatTime12Hour, formatStatus } from '../utils/formatters';
import { TATTOO_STYLES } from '../constants/tattooStyles';
import { getPhoneParts } from '../constants/countryCodes';
import CountryCodeSelect from '../components/CountryCodeSelect';
import MultiSelectDropdown from '../components/MultiSelectDropdown';
import CustomSelect from '../components/CustomSelect';
import { filterName, filterDigits, clampNumber } from '../utils/validation';

import {
    Search, Filter, SlidersHorizontal, UserPlus, Users, Palette, UserCircle, CheckCircle, X,
    User, Calendar, Save, Trash2, Image, Shield, Clock, RotateCcw, FileText,
    Eye, EyeOff, Camera, ChevronUp, ChevronDown, AlertTriangle
} from 'lucide-react';
import PhilippinePeso from '../components/PhilippinePeso';

function AdminUsers() {
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = JSON.parse(localStorage.getItem('user')) || {};

    // ─── Main List State ───
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
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
    const [filterRole, setFilterRole] = useState('all');
    const [filterStatus, setFilterStatus] = useState('active');
    const [sortBy, setSortBy] = useState('newest');
    const [loading, setLoading] = useState(true);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // ─── Admin Edit Modal (existing) ───
    const [selectedUser, setSelectedUser] = useState(null);
    const [userModal, setUserModal] = useState({ mounted: false, visible: false });
    const [formData, setFormData] = useState({
        name: '', email: '', phone: '', user_type: 'customer', status: 'active', password: ''
    });

    // ─── Client (Customer) Modal ───
    const [clientModal, setClientModal] = useState({ mounted: false, visible: false });
    const [selectedClient, setSelectedClient] = useState(null);
    const [clientActiveTab, setClientActiveTab] = useState('profile');
    const [clientDetails, setClientDetails] = useState({ profile: {}, appointments: [], notes: '' });
    const [expandedRecordId, setExpandedRecordId] = useState(null);
    const [clientFormData, setClientFormData] = useState({});
    const [loadingClientDetails, setLoadingClientDetails] = useState(false);

    // ─── Artist Modal ───
    const [artistModal, setArtistModal] = useState({ mounted: false, visible: false });
    const [selectedArtist, setSelectedArtist] = useState(null);
    const [artistActiveTab, setArtistActiveTab] = useState('profile');
    const [artistDetails, setArtistDetails] = useState({ profile: {}, appointments: [], portfolio: [], stats: {} });
    const [artistFormData, setArtistFormData] = useState({});
    const [loadingArtistDetails, setLoadingArtistDetails] = useState(false);
    const artistOriginalFormData = useRef({});

    // Portfolio Editor Sub-Modal
    const [selectedWork, setSelectedWork] = useState(null);
    const [editWorkModal, setEditWorkModal] = useState({ mounted: false, visible: false });
    const [workFormData, setWorkFormData] = useState({
        title: '', description: '', category: 'Realism', isPublic: true, priceEstimate: ''
    });

    // ─── Create User Modal ───
    const [createModal, setCreateModal] = useState({ mounted: false, visible: false });
    const [createFormData, setCreateFormData] = useState({
        firstName: '', lastName: '', suffix: '', email: '', phone: '', countryCode: '+63',
        password: '', confirmPassword: '', user_type: 'customer',
        profileImage: '', age: ''
    });
    const [createErrors, setCreateErrors] = useState({});
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [showCreateConfirmPassword, setShowCreateConfirmPassword] = useState(false);
    const [createPasswordFocused, setCreatePasswordFocused] = useState(false);
    const [createPasswordFeedback, setCreatePasswordFeedback] = useState({
        hasMinLength: false, hasUppercase: false, hasLowercase: false,
        hasNumber: false, hasSymbol: false
    });
    const [profileImagePreview, setProfileImagePreview] = useState(null);

    // ─── Confirm Dialog ───
    const [confirmDialog, setConfirmDialog] = useState({
        isOpen: false, title: '', message: '', onConfirm: null, type: 'danger', isAlert: false
    });

    // ─── Status Management Modal ───
    const [statusModal, setStatusModal] = useState({ mounted: false, visible: false, user: null });
    const [statusFormData, setStatusFormData] = useState({ status: 'active', reason: '', adminNote: '', duration: '7 days' });

    // ─── Destructive Delete Confirmation with Countdown ───
    const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, title: '', message: '', onConfirm: null, countdown: 3 });
    const deleteCountdownRef = useRef(null);

    const openStatusModalAnim = (user) => {
        setStatusModal({ mounted: true, visible: false, user });
        const currentStatus = user.account_status || 'active';
        const defaultDuration = '7 days';
        let defaultReason = '';
        if (currentStatus === 'deactivated') {
            defaultReason = `Your account has been temporarily suspended by an administrator for ${defaultDuration}.`;
        } else if (currentStatus === 'banned') {
            defaultReason = 'Your account has been permanently banned due to policy violations.';
        }
        setStatusFormData({ status: currentStatus, reason: defaultReason, adminNote: '', duration: defaultDuration });
        setTimeout(() => setStatusModal(prev => ({ ...prev, visible: true })), 10);
    };
    const closeStatusModal = () => {
        setStatusModal({ mounted: false, visible: false, user: null });
    };
    const showAlert = (title, message, type = 'info') => {
        setConfirmDialog({
            isOpen: true, title, message, type, isAlert: true,
            onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false }))
        });
    };

    // ═══════════════════════════════════════════════════════════
    // MODAL ANIMATION HELPERS
    // ═══════════════════════════════════════════════════════════

    const openAdminModal = () => {
        setUserModal({ mounted: true, visible: false });
        setTimeout(() => setUserModal({ mounted: true, visible: true }), 10);
    };
    const closeAdminModal = () => {
        setUserModal({ mounted: false, visible: false }); 
        setSelectedUser(null);
    };

    const openClientModalAnim = () => {
        setClientModal({ mounted: true, visible: false });
        setTimeout(() => setClientModal({ mounted: true, visible: true }), 10);
    };
    const closeClientModal = () => {
        setClientModal({ mounted: false, visible: false });
        setSelectedClient(null);
        setExpandedRecordId(null);
    };

    const openArtistModalAnim = () => {
        setArtistModal({ mounted: true, visible: false });
        setTimeout(() => setArtistModal({ mounted: true, visible: true }), 10);
    };
    const closeArtistModal = () => {
        setArtistModal({ mounted: false, visible: false }); 
        setSelectedArtist(null);
    };

    const isArtistFormDirty = () => {
        const orig = artistOriginalFormData.current;
        return Object.keys(orig).some(key => String(artistFormData[key] ?? '') !== String(orig[key] ?? ''));
    };

    const handleCloseArtistModal = () => {
        if (artistActiveTab === 'profile' && isArtistFormDirty()) {
            setConfirmDialog({
                isOpen: true,
                title: 'Unsaved Changes',
                message: 'You have unsaved changes on the Profile tab. Save before closing?',
                confirmText: 'Save & Close',
                cancelText: 'Discard & Close',
                type: 'warning',
                isAlert: false,
                onConfirm: async () => {
                    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    await handleUpdateArtistProfile();
                    closeArtistModal();
                },
                onClose: () => {
                    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    closeArtistModal();
                }
            });
        } else {
            closeArtistModal();
        }
    };

    const openCreateModalAnim = () => {
        setCreateModal({ mounted: true, visible: false });
        setTimeout(() => setCreateModal({ mounted: true, visible: true }), 10);
    };
    const closeCreateModal = () => {
        setCreateModal({ mounted: false, visible: false });
        setCreateFormData({ firstName: '', lastName: '', suffix: '', email: '', phone: '', countryCode: '+63', password: '', confirmPassword: '', user_type: 'customer', profileImage: '', age: '' });
        setCreateErrors({});
        setShowCreatePassword(false);
        setShowCreateConfirmPassword(false);
        setCreatePasswordFocused(false);
        setCreatePasswordFeedback({ hasMinLength: false, hasUppercase: false, hasLowercase: false, hasNumber: false, hasSymbol: false });
        setProfileImagePreview(null);
    };

    const openEditWork = (work) => {
        setSelectedWork(work);
        setWorkFormData({
            title: work.title || '', description: work.description || '',
            category: work.category || 'Realism',
            isPublic: work.is_public === 1 || work.is_public === true,
            priceEstimate: work.price_estimate || ''
        });
        setEditWorkModal({ mounted: true, visible: false });
        setTimeout(() => setEditWorkModal({ mounted: true, visible: true }), 10);
    };
    const closeEditWork = () => {
        setEditWorkModal({ mounted: false, visible: false });
    };

    // ═══════════════════════════════════════════════════════════
    // DATA FETCHING
    // ═══════════════════════════════════════════════════════════

    useEffect(() => { fetchUsers(); }, []);
    useEffect(() => { fetchUsers(); }, [filterStatus]);
    useEffect(() => { filterAndSortUsers(); }, [users, searchTerm, filterRole, filterStatus, sortBy]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const response = await Axios.get(`${API_URL}/api/admin/users?status=${filterStatus}`);
            if (response.data.success) setUsers(response.data.data);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching users:", error);
            setLoading(false);
        }
    };

    const filterAndSortUsers = () => {
        let filtered = users.filter(user => {
            const matchesSearch =
                (user.id || '').toString().includes(searchTerm) ||
                (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (user.phone && user.phone.includes(searchTerm));
            const matchesRole = filterRole === 'all' || user.user_type === filterRole;
            return matchesSearch && matchesRole;
        });
        if (sortBy === 'name_asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
        else if (sortBy === 'name_desc') filtered.sort((a, b) => b.name.localeCompare(a.name));
        else if (sortBy === 'newest') filtered.sort((a, b) => b.id - a.id);
        else if (sortBy === 'oldest') filtered.sort((a, b) => a.id - b.id);
        setFilteredUsers(filtered);
        setCurrentPage(1);
    };

    const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
    const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // ═══════════════════════════════════════════════════════════
    // ROLE-AWARE MODAL ROUTER
    // ═══════════════════════════════════════════════════════════

    const handleManage = (user) => {
        if (user.user_type === 'customer') {
            openClientManageModal(user);
        } else if (user.user_type === 'artist') {
            openArtistManageModal(user);
        } else {
            // admin (and legacy manager) — use existing flat edit modal
            handleEdit(user);
        }
    };

    // ═══════════════════════════════════════════════════════════
    // ADMIN EDIT (existing logic preserved)
    // ═══════════════════════════════════════════════════════════

    const handleEdit = (user) => {
        setSelectedUser(user);
        const { code, currentNo } = getPhoneParts(user.phone || '');
        setFormData({
            name: user.name, email: user.email, phone: currentNo,
            countryCode: code,
            user_type: user.user_type, status: user.is_deleted ? 'inactive' : 'active', password: ''
        });
        openAdminModal();
    };

    const handleSave = async () => {
        try {
            if (selectedUser) {
                const fullPhone = (formData.countryCode || '+63') + (formData.phone || '').replace(/^0+/, '');
                await Axios.put(`${API_URL}/api/admin/users/${selectedUser.id}`, {
                    name: formData.name, email: formData.email, type: formData.user_type,
                    phone: fullPhone, status: formData.status
                }, {
                    headers: { 'X-User-Email': currentUser.email || '' }
                });
                showAlert("Success", "User updated successfully!", "success");
            }
            fetchUsers();
            closeAdminModal();
            setSelectedUser(null);
        } catch (error) {
            console.error("Error saving user:", error);
            showAlert("Error", 'Error saving user: ' + (error.response?.data?.message || error.message), "danger");
        }
    };

    // ═══════════════════════════════════════════════════════════
    // STATUS MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    const handleManageStatusClick = (user) => {
        if (user.is_superadmin) {
            showAlert("Restricted", "Cannot change the status of the system super admin.", "danger");
            return;
        }
        openStatusModalAnim(user);
    };

    const submitStatusChange = async () => {
        if (statusFormData.status === 'banned' && !statusFormData.reason.trim()) {
            showAlert("Error", "A reason is required when banning a user.", "danger");
            return;
        }
        if (statusFormData.status === 'deactivated' && !statusFormData.reason.trim()) {
            showAlert("Error", "A reason is required when deactivating a user.", "danger");
            return;
        }

        try {
            const response = await Axios.put(`${API_URL}/api/admin/users/${statusModal.user.id}/status`, statusFormData, {
                headers: { 'X-User-Email': currentUser.email || '' }
            });
            if (response.data.success) {
                // Update local state without refetching immediately
                setUsers(users.map(u => 
                    u.id === statusModal.user.id 
                    ? { ...u, account_status: statusFormData.status, status_reason: statusFormData.reason || statusFormData.adminNote } 
                    : u
                ));
                showAlert("Success", "User status updated and email dispatched.", "success");
                closeStatusModal();
            }
        } catch (error) {
            console.error("Error updating status:", error);
            showAlert("Error", error.response?.data?.message || 'Error updating status.', "danger");
        }
    };

    // ═══════════════════════════════════════════════════════════
    // SOFT DELETE / RESTORE / PERMANENT DELETE
    // ═══════════════════════════════════════════════════════════

    const handleSoftDelete = (user) => {
        if (user.is_superadmin) {
            showAlert("Restricted", "Cannot delete the system super admin.", "danger");
            return;
        }
        openDestructiveConfirm(
            'Soft Delete User',
            `This will mark ${user.name}'s account as deleted. They will no longer be able to log in, but their data will be preserved. You can restore this account later.`,
            async () => {
                try {
                    const res = await Axios.delete(`${API_URL}/api/admin/users/${user.id}`, {
                        headers: { 'X-User-Email': currentUser.email || '' }
                    });
                    if (res.data.success) {
                        showAlert("Success", `${user.name} has been soft deleted. You can restore this account from the 'Soft Deleted' filter.`, "success");
                        closeStatusModal();
                        fetchUsers();
                    }
                } catch (error) {
                    showAlert("Error", error.response?.data?.message || 'Failed to soft delete user.', "danger");
                }
            }
        );
    };

    const handleRestoreUser = (user) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Restore User Account',
            message: `Restore ${user.name}'s account? They will be able to log in again with 'Active' status.`,
            type: 'info',
            confirmText: 'Restore Account',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                try {
                    const res = await Axios.put(`${API_URL}/api/admin/users/${user.id}/restore`, {}, {
                        headers: { 'X-User-Email': currentUser.email || '' }
                    });
                    if (res.data.success) {
                        showAlert("Success", `${user.name}'s account has been restored.`, "success");
                        fetchUsers();
                    }
                } catch (error) {
                    showAlert("Error", error.response?.data?.message || 'Failed to restore user.', "danger");
                }
            }
        });
    };

    const handlePermanentDelete = (user) => {
        if (user.is_superadmin) {
            showAlert("Restricted", "Cannot permanently delete the system super admin.", "danger");
            return;
        }
        openDestructiveConfirm(
            'Permanently Delete User',
            `WARNING: This action is IRREVERSIBLE. All data for ${user.name} (${user.email}) will be permanently erased from the database, including profile, appointments, and payment records.`,
            async () => {
                try {
                    const res = await Axios.delete(`${API_URL}/api/admin/users/${user.id}/permanent`, {
                        headers: { 'X-User-Email': currentUser.email || '' }
                    });
                    if (res.data.success) {
                        showAlert("Success", `${user.name} has been permanently deleted.`, "success");
                        closeStatusModal();
                        fetchUsers();
                    }
                } catch (error) {
                    showAlert("Error", error.response?.data?.message || 'Failed to permanently delete user.', "danger");
                }
            }
        );
    };

    // Opens the destructive confirm dialog with a 3-second countdown
    const openDestructiveConfirm = (title, message, onConfirm) => {
        setDeleteConfirm({ isOpen: true, title, message, onConfirm, countdown: 3 });
        if (deleteCountdownRef.current) clearInterval(deleteCountdownRef.current);
        let count = 3;
        deleteCountdownRef.current = setInterval(() => {
            count -= 1;
            if (count <= 0) {
                clearInterval(deleteCountdownRef.current);
                setDeleteConfirm(prev => ({ ...prev, countdown: 0 }));
            } else {
                setDeleteConfirm(prev => ({ ...prev, countdown: count }));
            }
        }, 1000);
    };

    const closeDestructiveConfirm = () => {
        if (deleteCountdownRef.current) clearInterval(deleteCountdownRef.current);
        setDeleteConfirm({ isOpen: false, title: '', message: '', onConfirm: null, countdown: 3 });
    };

    // ═══════════════════════════════════════════════════════════
    // CLIENT (CUSTOMER) MODAL — from AdminClients.js
    // ═══════════════════════════════════════════════════════════

    const openClientManageModal = async (client) => {
        setSelectedClient(client);
        openClientModalAnim();
        setLoadingClientDetails(true);
        setClientActiveTab('profile');

        try {
            const [profileRes, historyRes, posRes] = await Promise.all([
                Axios.get(`${API_URL}/api/customer/profile/${client.id}`),
                Axios.get(`${API_URL}/api/customer/${client.id}/appointments`),
                Axios.get(`${API_URL}/api/admin/invoices`)
            ]);

            const profile = profileRes.data.success ? profileRes.data.profile : {};
            const appointments = (historyRes.data.success ? historyRes.data.appointments : []).map(a => ({ ...a, recordType: 'Session' }));
            const posSales = (posRes.data.success ? posRes.data.data : [])
                .filter(inv => inv.customer_id === client.id)
                .map(inv => ({ ...inv, appointment_date: inv.created_at, design_title: inv.service_type, status: inv.status, recordType: 'Retail' }));

            const combinedHistory = [...appointments, ...posSales].sort((a, b) => new Date(b.appointment_date) - new Date(a.appointment_date));
            setClientDetails({ profile, appointments: combinedHistory, notes: profile.notes || '' });
            setClientFormData(profile);
        } catch (error) {
            console.error("Error fetching client details:", error);
        }
        setLoadingClientDetails(false);
    };

    const handleSaveClient = async () => {
        if (!selectedClient) return;
        try {
            await Axios.put(`${API_URL}/api/customer/profile/${selectedClient.id}`, clientFormData);
            showAlert("Success", "Client profile updated!", "success");
            closeClientModal();
            fetchUsers();
        } catch (error) {
            console.error("Error updating client:", error);
            showAlert("Error", "Failed to update client profile", "danger");
        }
    };

    const handleDeactivateClient = () => {
        if (!selectedClient) return;
        setConfirmDialog({
            isOpen: true, title: 'Deactivate Client',
            message: `Are you sure you want to deactivate ${selectedClient.name}?`,
            type: 'danger',
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                await Axios.delete(`${API_URL}/api/admin/users/${selectedClient.id}`);
                closeClientModal();
                fetchUsers();
            }
        });
    };

    // ═══════════════════════════════════════════════════════════
    // ARTIST MODAL — from AdminStaff.js
    // ═══════════════════════════════════════════════════════════

    const openArtistManageModal = async (artist) => {
        setSelectedArtist(artist);
        setLoadingArtistDetails(true);
        setArtistActiveTab('profile');
        openArtistModalAnim();

        try {
            const [dashboardRes, portfolioRes] = await Promise.all([
                Axios.get(`${API_URL}/api/artist/dashboard/${artist.id}`),
                Axios.get(`${API_URL}/api/artist/${artist.id}/portfolio`)
            ]);

            if (dashboardRes.data.success && portfolioRes.data.success) {
                const data = dashboardRes.data;
                setArtistDetails({
                    profile: data.artist, appointments: data.appointments || [],
                    portfolio: portfolioRes.data.works || [], stats: data.stats || {}
                });
                setArtistFormData({
                    name: data.artist.name, specialization: data.artist.specialization,
                    hourly_rate: data.artist.hourly_rate, experience_years: data.artist.experience_years,
                    commission_rate: data.artist.commission_rate
                });
                artistOriginalFormData.current = {
                    name: data.artist.name, specialization: data.artist.specialization,
                    hourly_rate: data.artist.hourly_rate, experience_years: data.artist.experience_years,
                    commission_rate: data.artist.commission_rate
                };
            } else {
                throw new Error(dashboardRes.data.message || portfolioRes.data.message || 'Failed to fetch artist details.');
            }
        } catch (error) {
            console.error("Error fetching artist details:", error);
            showAlert("Load Failed", `Could not load artist details: ${error.response?.data?.message || error.message}`, "danger");
            closeArtistModal();
        } finally {
            setLoadingArtistDetails(false);
        }
    };

    const handleUpdateArtistProfile = async () => {
        try {
            await Axios.put(`${API_URL}/api/artist/profile/${selectedArtist.id}`, artistFormData);
            showAlert("Success", "Profile updated successfully", "success");
            setArtistDetails(prev => ({ ...prev, profile: { ...prev.profile, ...artistFormData } }));
            artistOriginalFormData.current = { ...artistFormData };
            fetchUsers();
        } catch (error) {
            console.error("Error updating profile:", error);
            showAlert("Error", "Failed to update profile", "danger");
        }
    };

    const handleSaveWork = async (e) => {
        if (e) e.preventDefault();
        try {
            await Axios.put(`${API_URL}/api/artist/portfolio/${selectedWork.id}`, {
                title: workFormData.title, description: workFormData.description,
                category: workFormData.category, priceEstimate: workFormData.priceEstimate,
                isPublic: workFormData.isPublic
            });
            setArtistDetails(prev => ({
                ...prev,
                portfolio: prev.portfolio.map(w => w.id === selectedWork.id ? { ...w, ...workFormData, is_public: workFormData.isPublic ? 1 : 0 } : w)
            }));
            closeEditWork();
            showAlert("Success", "Portfolio item updated", "success");
        } catch (error) {
            console.error("Error updating portfolio work:", error);
            showAlert("Error", "Failed to update portfolio item", "danger");
        }
    };

    const handleDeleteWork = (workId) => {
        setConfirmDialog({
            isOpen: true, title: 'Delete Portfolio Item', message: 'Delete this portfolio item?',
            onConfirm: async () => {
                setConfirmDialog({ isOpen: false });
                try {
                    await Axios.delete(`${API_URL}/api/artist/portfolio/${workId}`);
                    setArtistDetails(prev => ({ ...prev, portfolio: prev.portfolio.filter(w => w.id !== workId) }));
                } catch (error) { console.error("Error deleting work:", error); }
            }
        });
    };

    const handleBlockDate = async () => {
        const date = prompt("Enter date to block (YYYY-MM-DD):");
        if (date) {
            try {
                await Axios.post(`${API_URL}/api/admin/appointments`, {
                    customerId: selectedArtist.id, artistId: selectedArtist.id,
                    date, startTime: '09:00', endTime: '17:00',
                    designTitle: 'BLOCKED', status: 'cancelled', notes: 'Day off / Unavailable'
                });
                showAlert("Success", "Date blocked successfully", "success");
            } catch (error) {
                console.error("Error blocking date:", error);
                showAlert("Error", "Failed to block date", "danger");
            }
        }
    };

    // ─── Artist Tab Renderers ───

    const renderArtistProfileTab = () => (
        <div className="tab-content">
            <div className="form-grid">
                <div className="form-group">
                    <label>Name</label>
                    <input type="text" className="form-input" value={artistFormData.name || ''} onChange={e => setArtistFormData({ ...artistFormData, name: filterName(e.target.value).slice(0, 50) })} maxLength={50} />
                </div>
                <div className="form-group">
                    <label>Specialization / Styles</label>
                    <MultiSelectDropdown 
                        options={TATTOO_STYLES}
                        selectedStr={artistFormData.specialization}
                        onChange={(newVal) => setArtistFormData({ ...artistFormData, specialization: newVal })}
                        placeholder="Select styles"
                    />
                </div>
                <div className="form-group">
                    <label>Experience (Years)</label>
                    <input type="number" className="form-input" value={artistFormData.experience_years || 0} onChange={e => setArtistFormData({ ...artistFormData, experience_years: clampNumber(e.target.value, 0, 50) })} min="0" max="50" />
                </div>
                <div className="form-group">
                    <label>Commission Rate (%)</label>
                    <input className="form-input admin-st-10bc60ad" type="text" value="30" disabled />
                </div>
            </div>
            <div className="stats-row admin-st-40088812">
                <div className="stat-item">
                    <span className="stat-label">Total Appointments</span>
                    <span className="stat-count">{artistDetails.stats.total_appointments}</span>
                </div>
                <div className="stat-item">
                    <span className="stat-label">Est. Revenue</span>
                    <span className="stat-count">₱{artistDetails.stats.total_earnings?.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            </div>
        </div>
    );

    const renderScheduleTab = () => (
        <div className="tab-content">
            <div className="admin-st-07952507">
                <h3>Upcoming Schedule</h3>
                <button className="btn btn-secondary" onClick={handleBlockDate}>Block Date</button>
            </div>
            <div className="table-responsive">
                <table className="data-table">
                    <thead><tr><th>Date</th><th>Time</th><th>Client</th><th>Service</th><th>Status</th></tr></thead>
                    <tbody>
                        {artistDetails.appointments.map(apt => (
                            <tr key={apt.id}>
                                <td>{new Date(apt.appointment_date).toLocaleDateString()}</td>
                                <td>{formatTime12Hour(apt.start_time)}</td>
                                <td>{apt.client_name}</td>
                                <td>{apt.design_title}</td>
                                <td><span className={`badge status-${apt.status}`}>{formatStatus(apt.status)}</span></td>
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
                    <div key={work.id} className="gallery-item-admin admin-st-24b531c6" onClick={() => openEditWork(work)}>
                        <img src={work.image_url} alt={work.title} />
                        <div className="gallery-overlay">
                            <button className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteWork(work.id); }}>
                                <Trash2 size={14} />
                            </button>
                            <h4 style={{ margin: '0 0 3px', fontSize: '0.85rem', fontWeight: 600, color: '#be9055', fontFamily: "'Playfair Display', serif" }}>{work.title}</h4>
                            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', letterSpacing: '0.5px' }}>{work.category || 'Uncategorized'}</span>
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
                ...a, amount: a.price || 0,
                commission: (a.price || 0) * (artistDetails.profile.commission_rate || 0.30)
            }));

        return (
            <div className="tab-content">
                <div className="stats-row admin-st-129729d4">
                    <div className="stat-item">
                        <span className="stat-label">Total Commission</span>
                        <span className="stat-count">₱{earnings.reduce((sum, e) => sum + e.commission, 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                </div>
                <table className="data-table">
                    <thead><tr><th>Date</th><th>Client</th><th>Total Amount</th><th>Artist Commission ({((artistDetails.profile.commission_rate || 0.30) * 100)}%)</th></tr></thead>
                    <tbody>
                        {earnings.map(e => (
                            <tr key={e.id}>
                                <td>{new Date(e.appointment_date).toLocaleDateString()}</td>
                                <td>{e.client_name}</td>
                                <td>₱{e.amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="admin-st-9e10b928">₱{Number(e.commission).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════
    // CREATE USER MODAL — with inline validations
    // ═══════════════════════════════════════════════════════════

    const handleAddNew = () => {
        setCreateFormData({ firstName: '', lastName: '', suffix: '', email: '', phone: '', countryCode: '+63', password: '', confirmPassword: '', user_type: 'customer', profileImage: '', age: '' });
        setCreateErrors({});
        setShowCreatePassword(false);
        setShowCreateConfirmPassword(false);
        setCreatePasswordFocused(false);
        setCreatePasswordFeedback({ hasMinLength: false, hasUppercase: false, hasLowercase: false, hasNumber: false, hasSymbol: false });
        setProfileImagePreview(null);
        openCreateModalAnim();
    };

    const handleProfileImageChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            setCreateErrors(prev => ({ ...prev, profileImage: 'Image must be under 5MB' }));
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            setProfileImagePreview(ev.target.result);
            setCreateFormData(prev => ({ ...prev, profileImage: ev.target.result }));
            setCreateErrors(prev => ({ ...prev, profileImage: '' }));
        };
        reader.readAsDataURL(file);
    };

    const validateCreateField = (name, value) => {
        let error = '';
        if (name === 'firstName') {
            if (!value.trim()) error = 'First name is required';
            else if (!/^[a-zA-Z\s-]+$/.test(value)) error = 'Letters, spaces, and hyphens only';
        }
        if (name === 'lastName') {
            if (!value.trim()) error = 'Last name is required';
            else if (!/^[a-zA-Z\s-]+$/.test(value)) error = 'Letters, spaces, and hyphens only';
        }
        if (name === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!value) error = 'Email is required';
            else if (!emailRegex.test(value)) error = 'Please enter a valid email';
        }
        if (name === 'phone') {
            if (!value) error = 'Phone number is required';
            else if (!/^\d+$/.test(value)) error = 'Digits only';
            else if (value.length !== 11) error = 'Phone number must be exactly 11 digits';
        }
        if (name === 'password') {
            const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
            if (!value) error = 'Password is required';
            else if (value.length < 8) error = 'Must be at least 8 characters';
            else if (!strongRegex.test(value)) error = 'Needs uppercase, lowercase, number, and symbol';
        }
        if (name === 'confirmPassword') {
            if (!value) error = 'Please confirm your password';
            else if (value !== createFormData.password) error = 'Passwords do not match';
        }
        if (name === 'age' && value) {
            const num = parseInt(value);
            if (isNaN(num) || num < 1 || num > 120) error = 'Enter a valid age (1–120)';
        }
        if (name === 'countryCode') {
            if (!value) error = 'Country code is required';
        }
        setCreateErrors(prev => ({ ...prev, [name]: error }));
        return error === '';
    };

    const handleCreateFieldChange = (name, value) => {
        let sanitized = value;
        if (name === 'firstName' || name === 'lastName') sanitized = filterName(value).slice(0, 50);
        else if (name === 'suffix') sanitized = filterName(value).slice(0, 5);
        else if (name === 'email') sanitized = value.replace(/\s/g, '').slice(0, 254);
        else if (name === 'phone') sanitized = filterDigits(value).slice(0, 11);
        else if (name === 'password' || name === 'confirmPassword') sanitized = value.slice(0, 128);
        else if (name === 'age') sanitized = filterDigits(value).slice(0, 3);
        setCreateFormData(prev => ({ ...prev, [name]: sanitized }));

        // Live password strength feedback
        if (name === 'password') {
            setCreatePasswordFeedback({
                hasMinLength: value.length >= 8,
                hasUppercase: /[A-Z]/.test(value),
                hasLowercase: /[a-z]/.test(value),
                hasNumber: /[0-9]/.test(value),
                hasSymbol: /[@$!%*?&#]/.test(value)
            });
        }

        if (createErrors[name]) setCreateErrors(prev => ({ ...prev, [name]: '' }));
    };

    const handleCreateBlur = (name) => {
        validateCreateField(name, createFormData[name]);
    };

    const isCreatePasswordStrong = () => {
        return createPasswordFeedback.hasMinLength &&
            createPasswordFeedback.hasUppercase &&
            createPasswordFeedback.hasLowercase &&
            createPasswordFeedback.hasNumber &&
            createPasswordFeedback.hasSymbol;
    };

    const isCreateFormValid = () => {
        return createFormData.firstName.trim() &&
            createFormData.lastName.trim() &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createFormData.email) &&
            createFormData.phone.length === 11 &&
            createFormData.countryCode &&
            isCreatePasswordStrong() &&
            createFormData.confirmPassword === createFormData.password;
    };

    const handleCreateSave = async () => {
        // Validate all fields
        const firstOk = validateCreateField('firstName', createFormData.firstName);
        const lastOk = validateCreateField('lastName', createFormData.lastName);
        const emailOk = validateCreateField('email', createFormData.email);
        const phoneOk = validateCreateField('phone', createFormData.phone);
        const passOk = validateCreateField('password', createFormData.password);
        const confirmOk = validateCreateField('confirmPassword', createFormData.confirmPassword);
        const codeOk = validateCreateField('countryCode', createFormData.countryCode);
        if (!firstOk || !lastOk || !emailOk || !phoneOk || !passOk || !confirmOk || !codeOk) return;

        const suffixPart = createFormData.suffix.trim();
        const fullName = suffixPart
            ? `${createFormData.firstName.trim()} ${createFormData.lastName.trim()} ${suffixPart}`
            : `${createFormData.firstName.trim()} ${createFormData.lastName.trim()}`;

        const fullPhone = createFormData.countryCode + createFormData.phone.trim().replace(/^0+/, '');

        try {
            await Axios.post(`${API_URL}/api/admin/users`, {
                name: fullName, email: createFormData.email,
                password: createFormData.password, type: createFormData.user_type,
                phone: fullPhone, status: 'active',
                profileImage: createFormData.profileImage || null,
                age: createFormData.age ? parseInt(createFormData.age) : null,
                is_verified: 1
            });
            showAlert("Success", "User account created and verified. They can log in immediately.", "success");
            fetchUsers();
            closeCreateModal();
        } catch (error) {
            console.error("Error creating user:", error);
            const message = error.response?.data?.message || error.message;
            if (message.toLowerCase().includes('email')) {
                setCreateErrors(prev => ({ ...prev, email: message }));
            } else {
                showAlert("Error", 'Error creating user: ' + message, "danger");
            }
        }
    };

    // ═══════════════════════════════════════════════════════════
    // SEARCH SUGGESTIONS
    // ═══════════════════════════════════════════════════════════

    const searchSuggestions = Array.from(new Set([
        ...users.map(u => (u.id || '').toString()),
        ...users.map(u => (u.name || '').trim()),
        ...users.map(u => (u.email || '').trim())
    ])).filter(Boolean);

    // ═══════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
                <header className="portal-header">
                    <div className="header-title">
                        <h1>User Management</h1>
                    </div>
                    <div className="header-actions">
                        <button className="btn btn-primary" onClick={handleAddNew}>
                            <UserPlus size={18} /> Add New User
                        </button>
                    </div>
                </header>
                <p className="header-subtitle">Manage platform users, roles, and account status</p>

                {/* Filter Bar */}
                <div className="premium-filter-bar premium-filter-bar--stacked">
                    <div className="premium-search-box premium-search-box--full" ref={searchRef}>
                        <Search size={16} className="text-muted" />
                        <input 
                            type="text" 
                            placeholder="Search by name, email, id..."
                            value={searchTerm} 
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            maxLength={100} 
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
                    <div className="premium-filters-row">
                        <CustomSelect 
                            value={filterRole} 
                            onChange={setFilterRole} 
                            icon={Filter}
                            label="Filter by:"
                            options={[
                                { value: 'all', label: 'All Roles' },
                                { value: 'admin', label: 'Admin' },
                                { value: 'artist', label: 'Artist' },
                                { value: 'customer', label: 'Customer' }
                            ]}
                        />
                        <CustomSelect 
                            value={filterStatus} 
                            onChange={setFilterStatus} 
                            options={[
                                { value: 'all', label: 'All Statuses' },
                                { value: 'active', label: 'Active Users' },
                                { value: 'deactivated', label: 'Deactivated' },
                                { value: 'banned', label: 'Banned' },
                                { value: 'deleted', label: 'Soft Deleted' }
                            ]}
                        />
                        <CustomSelect 
                            value={sortBy} 
                            onChange={setSortBy} 
                            icon={SlidersHorizontal}
                            label="Sort:"
                            options={[
                                { value: 'newest', label: 'Newest First' },
                                { value: 'oldest', label: 'Oldest First' },
                                { value: 'name_asc', label: 'Alphabetical (A-Z)' },
                                { value: 'name_desc', label: 'Alphabetical (Z-A)' }
                            ]}
                        />
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="users-stats-grid">
                    <div className="stat-card-v2 glass-card">
                        <div className="stat-icon-wrapper blue"><Users size={24} /></div>
                        <div className="stat-info-v2">
                            <span className="stat-label-v2">Total Users</span>
                            <h3 className="stat-value-v2">{users.length}</h3>
                            <div className="stat-trend-v2">Platform Wide</div>
                        </div>
                    </div>
                    <div className="stat-card-v2 glass-card">
                        <div className="stat-icon-wrapper green"><CheckCircle size={24} /></div>
                        <div className="stat-info-v2">
                            <span className="stat-label-v2">Filtered Results</span>
                            <h3 className="stat-value-v2">{filteredUsers.length}</h3>
                            <div className="stat-trend-v2">Current View</div>
                        </div>
                    </div>
                    <div className="stat-card-v2 glass-card">
                        <div className="stat-icon-wrapper purple"><Palette size={24} /></div>
                        <div className="stat-info-v2">
                            <span className="stat-label-v2">Active Artists</span>
                            <h3 className="stat-value-v2">{users.filter(u => u.user_type === 'artist').length}</h3>
                            <div className="stat-trend-v2">Studio Staff</div>
                        </div>
                    </div>
                    <div className="stat-card-v2 glass-card">
                        <div className="stat-icon-wrapper orange"><UserCircle size={24} /></div>
                        <div className="stat-info-v2">
                            <span className="stat-label-v2">Total Customers</span>
                            <h3 className="stat-value-v2">{users.filter(u => u.user_type === 'customer').length}</h3>
                            <div className="stat-trend-v2">Client Base</div>
                        </div>
                    </div>
                </div>

                {/* Data Table */}
                <div className="table-card-container glass-card">
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="7" className="no-data admin-st-3927920f">Loading users...</td></tr>
                                ) : paginatedUsers.length > 0 ? (
                                    paginatedUsers.map((user) => (
                                        <tr key={user.id}>
                                            <td data-label="ID">#{user.id}</td>
                                            <td data-label="Name">{user.name}</td>
                                            <td data-label="Email">{user.email}</td>
                                            <td data-label="Phone">{user.phone || '-'}</td>
                                            <td data-label="Role"><span className={`badge role-${user.user_type}`}>{user.user_type}</span></td>
                                            <td data-label="Status">
                                                <span className={`badge status-${user.is_deleted ? 'deleted' : (user.account_status || 'active')}`}>
                                                    {user.is_deleted 
                                                        ? 'Soft Deleted'
                                                        : (user.account_status 
                                                            ? user.account_status.charAt(0).toUpperCase() + user.account_status.slice(1)
                                                            : 'Active')}
                                                </span>
                                            </td>
                                            <td data-label="Actions" className="actions-cell">
                                                {user.is_deleted ? (
                                                    <>
                                                        <button className="action-btn edit-btn" onClick={() => handleRestoreUser(user)} title="Restore this account">
                                                            <RotateCcw size={14} style={{ marginRight: '4px' }} /> Restore
                                                        </button>
                                                        <button className="action-btn" onClick={() => handlePermanentDelete(user)} title="Permanently erase this account and all data" style={{ color: '#ef4444', borderColor: '#ef4444' }}>
                                                            <Trash2 size={14} style={{ marginRight: '4px' }} /> Erase
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="action-btn edit-btn" onClick={() => handleManage(user)}>Review</button>
                                                        {!user.is_superadmin && (
                                                            <button className="action-btn manage-btn" onClick={() => handleManageStatusClick(user)}>Status</button>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="7" className="no-data">No users found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage}
                        itemsPerPage={itemsPerPage}
                        onItemsPerPageChange={(newVal) => { setItemsPerPage(newVal); setCurrentPage(1); }}
                        totalItems={filteredUsers.length} unit="users"
                    />
                </div>

                {/* ═══════════════════════════════════════════════════ */}
                {/* ADMIN EDIT MODAL (existing flat form) */}
                {/* ═══════════════════════════════════════════════════ */}
                {userModal.mounted && (
                    <div className={`modal-overlay ${userModal.visible ? 'open' : ''}`} onClick={closeAdminModal}>
                        <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Edit User Profile</h2>
                                <button className="close-btn" onClick={closeAdminModal}><X size={24} /></button>
                            </div>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="premium-label">Full Name *</label>
                                        <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: filterName(e.target.value).slice(0, 50) })} maxLength={50} className="form-input" placeholder="Full Name" />
                                    </div>
                                    <div className="form-group">
                                        <label className="premium-label">Email Address *</label>
                                        <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} maxLength={254} className="form-input" placeholder="email@example.com" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="premium-label">Phone Number</label>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                            <CountryCodeSelect
                                                value={formData.countryCode || '+63'}
                                                onChange={(code) => setFormData({ ...formData, countryCode: code })}
                                            />
                                            <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: filterDigits(e.target.value).replace(/^0+/, '').slice(0, 11) })} maxLength={11} className="form-input" style={{ flex: 1 }} placeholder="9123456789" />
                                        </div>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="premium-label">User Role</label>
                                        <select
                                            value={formData.user_type}
                                            onChange={(e) => setFormData({ ...formData, user_type: e.target.value })}
                                            className="form-input"
                                            disabled={!currentUser.is_superadmin}
                                        >
                                            <option value="admin">Admin</option>
                                            <option value="manager">Manager</option>
                                            <option value="artist">Artist</option>
                                            <option value="customer">Customer</option>
                                        </select>
                                        {!currentUser.is_superadmin && (
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                                                Only the super admin can change user roles.
                                            </span>
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label className="premium-label">Account Status</label>
                                        <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="form-input"
                                            disabled={selectedUser && selectedUser.is_superadmin && currentUser.email !== selectedUser.email}
                                        >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive / Deactivated</option>
                                            <option value="suspended">Suspended</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <div className="admin-st-c6588e1a">
                                    {selectedUser && !selectedUser.is_superadmin && (
                                        <button className="action-btn manage-btn" onClick={() => { handleManageStatusClick(selectedUser); closeAdminModal(); }}>
                                            Manage Status
                                        </button>
                                    )}
                                </div>
                                <button className="btn btn-secondary" onClick={closeAdminModal}>Cancel</button>
                                <button className="btn btn-primary admin-st-9be3106b" onClick={handleSave}
                                    disabled={selectedUser && selectedUser.is_superadmin && currentUser.email !== selectedUser.email}
                                >Save Changes</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════ */}
                {/* CLIENT (CUSTOMER) MODAL — 2 tabs */}
                {/* ═══════════════════════════════════════════════════ */}
                {clientModal.mounted && selectedClient && (
                    <div className={`modal-overlay ${clientModal.visible ? 'open' : ''}`} onClick={closeClientModal}>
                        <div className="modal-content large" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="admin-flex-center admin-gap-15">
                                    <div className="admin-st-c911153f" style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', border: '1px solid #e2e8f0' }}>
                                        {clientDetails.profile?.profile_image ? (
                                            <img src={clientDetails.profile.profile_image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <img src="/images/logo.png" alt="Inkvictus Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="admin-m-0">Client Profile: {selectedClient.name}</h2>
                                        <p className="admin-st-925e4e02">Account ID: #CLI-{selectedClient.id.toString().padStart(5, '0')}</p>
                                    </div>
                                </div>
                                <button className="close-btn" onClick={closeClientModal}><X size={24} /></button>
                            </div>

                            <div className="settings-tabs admin-st-13b83aa7">
                                <button className={`tab-button ${clientActiveTab === 'profile' ? 'active' : ''}`} onClick={() => setClientActiveTab('profile')}>
                                    <User size={16} /> Personal Information
                                </button>
                                <button className={`tab-button ${clientActiveTab === 'history' ? 'active' : ''}`} onClick={() => { setClientActiveTab('history'); setExpandedRecordId(null); }}>
                                    <Calendar size={16} /> Visit History
                                </button>
                            </div>

                            <div className="modal-body admin-st-d6e6b0a9">
                                {loadingClientDetails ? (
                                    <div className="admin-st-e70dab8d"><div className="loading-spinner"></div></div>
                                ) : (
                                    <div className="fade-in">
                                        {clientActiveTab === 'profile' ? (
                                            <div className="admin-st-e7646dcc">
                                                <div className="admin-st-ff43421e">
                                                    <div className="form-group">
                                                        <label className="admin-st-19644797">Legal Name</label>
                                                        <input type="text" className="form-input" value={clientFormData.name || ''} onChange={e => setClientFormData({ ...clientFormData, name: filterName(e.target.value).slice(0, 50) })} maxLength={50} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="admin-st-19644797">Direct Link (Email)</label>
                                                        <input type="email" className="form-input" value={clientFormData.email || ''} onChange={e => setClientFormData({ ...clientFormData, email: e.target.value })} maxLength={254} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="admin-st-19644797">Primary Contact</label>
                                                        <input type="text" className="form-input" value={clientFormData.phone || ''} onChange={e => setClientFormData({ ...clientFormData, phone: filterDigits(e.target.value).replace(/^0+/, '').slice(0, 11) })} maxLength={11} />
                                                    </div>
                                                </div>
                                                <div className="admin-st-ff43421e">
                                                    <div className="form-group">
                                                        <label className="admin-st-19644797">Internal Confidential Notes</label>
                                                        <textarea
                                                            className="form-input admin-st-6c845e15" rows="8"
                                                            placeholder="Record specific sensitivities, design preferences, or billing history notes..."
                                                            value={clientFormData.notes || ''}
                                                            onChange={e => setClientFormData({ ...clientFormData, notes: e.target.value.substring(0, 2000) })}
                                                            maxLength={2000}
                                                        ></textarea>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="table-responsive admin-st-59cb08dc">
                                                <table className="portal-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                    <thead>
                                                        <tr>
                                                            <th>Date</th>
                                                            <th>Type</th>
                                                            <th>Description</th>
                                                            <th>Status</th>
                                                            <th style={{ width: '28px' }}></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {clientDetails.appointments.length > 0 ? clientDetails.appointments.map(record => {
                                                            const isExpanded = expandedRecordId === record.id;
                                                            const isSession = record.recordType === 'Session';
                                                            return (
                                                                <React.Fragment key={record.id}>
                                                                    <tr
                                                                        onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                                                                        style={{
                                                                            cursor: 'pointer',
                                                                            background: isExpanded ? 'rgba(193,154,107,0.08)' : 'transparent',
                                                                            transition: 'background 0.2s'
                                                                        }}
                                                                    >
                                                                        <td className="admin-fw-600" style={{ whiteSpace: 'nowrap' }}>{new Date(record.appointment_date).toLocaleDateString()}</td>
                                                                        <td>
                                                                            <span style={{
                                                                                display: 'inline-block', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600,
                                                                                background: isSession ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)',
                                                                                color: isSession ? '#3b82f6' : '#10b981'
                                                                            }}>
                                                                                {isSession ? 'Session' : 'Retail'}
                                                                            </span>
                                                                        </td>
                                                                        <td>{isSession ? record.design_title : (record.service_type || record.design_title || '—')}</td>
                                                                        <td><span className={`status-badge ${record.status}`}>{(record.status || '').toUpperCase()}</span></td>
                                                                        <td style={{ textAlign: 'center', color: '#be9055', fontSize: '0.8rem', userSelect: 'none' }}>
                                                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                                        </td>
                                                                    </tr>
                                                                    {isExpanded && (
                                                                        <tr style={{ background: 'rgba(193,154,107,0.04)' }}>
                                                                            <td colSpan="5" style={{ padding: 0, borderBottom: '2px solid rgba(193,154,107,0.3)' }}>
                                                                                <div style={{
                                                                                    padding: '16px 20px',
                                                                                    display: 'grid',
                                                                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                                                                    gap: '12px 24px',
                                                                                    fontFamily: "'Inter', sans-serif",
                                                                                    fontSize: '0.83rem',
                                                                                    animation: 'fadeIn 0.2s ease'
                                                                                }}>
                                                                                    {isSession ? (
                                                                                        <>
                                                                                            {record.booking_code && (
                                                                                                <div>
                                                                                                    <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Booking Code</div>
                                                                                                    <div style={{ color: '#be9055', fontWeight: 700, letterSpacing: '0.05em' }}>{getDisplayCode(record.booking_code, record.id)}</div>
                                                                                                </div>
                                                                                            )}
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Artist</div>
                                                                                                <div style={{ color: '#1e293b', fontWeight: 500 }}>{record.artist_name || '—'}</div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Service</div>
                                                                                                <div style={{ color: '#1e293b', fontWeight: 500 }}>{record.service_type || '—'}</div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Time Slot</div>
                                                                                                <div style={{ color: '#1e293b', fontWeight: 500 }}>{record.start_time ? `${formatTime12Hour(record.start_time)}${record.end_time ? ' – ' + formatTime12Hour(record.end_time) : ''}` : '—'}</div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Price</div>
                                                                                                <div style={{ color: '#1e293b', fontWeight: 600 }}>₱{Number(record.price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Amount Paid</div>
                                                                                                <div style={{ color: '#10b981', fontWeight: 600 }}>₱{Number(record.total_paid || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Payment Method</div>
                                                                                                <div style={{ color: '#1e293b', fontWeight: 500 }}>{record.manual_payment_method || '—'}</div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Payment Status</div>
                                                                                                <div style={{ color: record.payment_status === 'paid' ? '#10b981' : '#f59e0b', fontWeight: 600 }}>{(record.payment_status || 'unpaid').toUpperCase()}</div>
                                                                                            </div>
                                                                                            {record.reschedule_count > 0 && (
                                                                                                <div>
                                                                                                    <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Reschedules</div>
                                                                                                    <div style={{ color: '#f59e0b', fontWeight: 600 }}>{record.reschedule_count}</div>
                                                                                                </div>
                                                                                            )}
                                                                                            {record.notes && (
                                                                                                <div style={{ gridColumn: '1 / -1' }}>
                                                                                                    <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Notes</div>
                                                                                                    <div style={{ color: '#1e293b', fontStyle: 'italic', background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '8px', padding: '8px 12px' }}>{record.notes}</div>
                                                                                                </div>
                                                                                            )}
                                                                                            {record.reference_image && (
                                                                                                <div style={{ gridColumn: '1 / -1' }}>
                                                                                                    <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>Reference Image</div>
                                                                                                    <img src={record.reference_image} alt="Reference" style={{ maxWidth: '160px', maxHeight: '120px', borderRadius: '10px', border: '1px solid rgba(193,154,107,0.3)', objectFit: 'cover' }} />
                                                                                                </div>
                                                                                            )}
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Invoice Date</div>
                                                                                                <div style={{ color: '#1e293b', fontWeight: 500 }}>{new Date(record.appointment_date).toLocaleDateString()}</div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Description</div>
                                                                                                <div style={{ color: '#1e293b', fontWeight: 500 }}>{record.service_type || record.design_title || '—'}</div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Amount</div>
                                                                                                <div style={{ color: '#1e293b', fontWeight: 600 }}>₱{Number(record.amount || record.price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                                                            </div>
                                                                                            <div>
                                                                                                <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Payment Status</div>
                                                                                                <div style={{ color: record.status === 'paid' ? '#10b981' : '#f59e0b', fontWeight: 600 }}>{(record.status || 'unpaid').toUpperCase()}</div>
                                                                                            </div>
                                                                                            {record.paymongo_payment_id && (
                                                                                                <div style={{ gridColumn: '1 / -1' }}>
                                                                                                    <div style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Payment Reference</div>
                                                                                                    <div style={{ color: '#64748b', fontFamily: 'monospace', fontSize: '0.78rem' }}>{record.paymongo_payment_id}</div>
                                                                                                </div>
                                                                                            )}
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </React.Fragment>
                                                            );
                                                        }) : (
                                                            <tr><td colSpan="5" className="no-data">This client has no recorded procedures in the archive.</td></tr>
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
                                    <Trash2 size={16} /> Archive Account
                                </button>
                                <button className="btn btn-secondary" onClick={closeClientModal}>Cancel</button>
                                <button className="btn btn-primary admin-st-f9a92399" onClick={handleSaveClient}>
                                    <Save size={18} /> Commit Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════ */}
                {/* ARTIST MODAL — 4 tabs */}
                {/* ═══════════════════════════════════════════════════ */}
                {artistModal.mounted && selectedArtist && (
                    <div className={`modal-overlay ${artistModal.visible ? 'open' : ''}`} onClick={handleCloseArtistModal}>
                        <div className="modal-content xl admin-st-980ed307" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="admin-flex-center admin-gap-20">
                                    <div className="admin-st-d84f98fc" style={{ width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', border: '1px solid #e2e8f0' }}>
                                        {artistDetails.profile?.profile_image ? (
                                            <img src={artistDetails.profile.profile_image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <img src="/images/logo.png" alt="Inkvictus Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="admin-m-0">{selectedArtist.name}</h2>
                                        <div className="admin-st-df628aac">
                                            <span className={`badge role-${selectedArtist.user_type} admin-st-500d49ab`}>{selectedArtist.user_type.charAt(0).toUpperCase() + selectedArtist.user_type.slice(1)}</span>
                                            <span className="admin-st-3bf8f64b">Staff ID: #STR-{selectedArtist.id.toString().padStart(4, '0')}</span>
                                        </div>
                                    </div>
                                </div>
                                <button className="close-btn" onClick={handleCloseArtistModal} aria-label="Close modal"><X size={24} /></button>
                            </div>

                            <div className="settings-tabs admin-st-23c98a22">
                                <button className={`tab-button ${artistActiveTab === 'profile' ? 'active' : ''}`} onClick={() => setArtistActiveTab('profile')} style={{ gap: '8px' }}>
                                    <UserCircle size={16} /> Profile Information
                                </button>
                                <button className={`tab-button ${artistActiveTab === 'schedule' ? 'active' : ''}`} onClick={() => setArtistActiveTab('schedule')} style={{ gap: '8px' }}>
                                    <Calendar size={16} /> Procedure Schedule
                                </button>
                                <button className={`tab-button ${artistActiveTab === 'portfolio' ? 'active' : ''}`} onClick={() => setArtistActiveTab('portfolio')} style={{ gap: '8px' }}>
                                    <Palette size={16} /> Media Portfolio
                                </button>
                                <button className={`tab-button ${artistActiveTab === 'earnings' ? 'active' : ''}`} onClick={() => setArtistActiveTab('earnings')} style={{ gap: '8px' }}>
                                    <PhilippinePeso size={16} /> Remittance Log
                                </button>
                            </div>

                            <div className="modal-body admin-st-89c672df">
                                {loadingArtistDetails ? (
                                    <div className="admin-st-578fa77f">
                                        <div className="loading-spinner"></div>
                                        <p>Fetching performance metrics...</p>
                                    </div>
                                ) : (
                                    <div className="fade-in">
                                        {artistActiveTab === 'profile' && renderArtistProfileTab()}
                                        {artistActiveTab === 'schedule' && renderScheduleTab()}
                                        {artistActiveTab === 'portfolio' && renderPortfolioTab()}
                                        {artistActiveTab === 'earnings' && renderEarningsTab()}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button
                                    className="btn btn-secondary"
                                    onClick={handleCloseArtistModal}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1.5px solid #cbd5e1', background: 'transparent', color: '#475569' }}
                                >
                                    <X size={16} /> Close
                                </button>
                                {artistActiveTab === 'profile' && (
                                    <button className="btn btn-primary admin-st-f9a92399" onClick={handleUpdateArtistProfile}>
                                        <Save size={18} /> Sync Account Updates
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════ */}
                {/* PORTFOLIO EDITOR SUB-MODAL */}
                {/* ═══════════════════════════════════════════════════ */}
                {editWorkModal.mounted && selectedWork && (
                    <div className={`modal-overlay ${editWorkModal.visible ? 'open' : ''} admin-st-63d3f2c7`} onClick={closeEditWork}>
                        <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <div>
                                    <h2 className="admin-m-0">Review Portfolio Asset</h2>
                                    <p className="admin-st-9b9985a8">Update display metadata and gallery positioning</p>
                                </div>
                                <button className="close-btn" onClick={closeEditWork}><X size={24} /></button>
                            </div>
                            <form onSubmit={handleSaveWork}>
                                <div className="modal-body admin-st-cc3b3598">
                                    <div className="admin-st-ede7eeea">
                                        <div className="admin-st-52f745d6">
                                            <div className="admin-st-721d662a">
                                                <img src={selectedWork.image_url} alt="Preview" className="admin-st-2aa2aed6" />
                                            </div>
                                            <div className="form-group admin-st-cd631299">
                                                <label className="admin-st-32231f0d">
                                                    <input type="checkbox" className="admin-st-95e08695" checked={workFormData.isPublic}
                                                        onChange={e => setWorkFormData({ ...workFormData, isPublic: e.target.checked })} />
                                                    Visible in Public Studio Gallery
                                                </label>
                                            </div>
                                        </div>
                                        <div className="admin-st-ff43421e">
                                            <div className="form-group">
                                                <label className="admin-st-19644797">Asset Title</label>
                                                <input type="text" className="form-input" value={workFormData.title}
                                                    onChange={e => setWorkFormData({ ...workFormData, title: e.target.value })} required />
                                            </div>
                                            <div className="admin-st-2f580e88">
                                                <div className="form-group">
                                                    <label className="admin-st-19644797">Style Category</label>
                                                    <MultiSelectDropdown 
                                                        options={TATTOO_STYLES}
                                                        selectedStr={workFormData.category}
                                                        onChange={(newVal) => setWorkFormData({ ...workFormData, category: newVal })}
                                                        placeholder="Select categories"
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="admin-st-19644797">Market Valuation (₱)</label>
                                                    <input type="number" min="0" className="form-input" value={workFormData.priceEstimate}
                                                        onChange={e => setWorkFormData({ ...workFormData, priceEstimate: e.target.value })} />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="admin-st-19644797">Project Narrative</label>
                                                <textarea className="form-input admin-st-7b393fc7" rows="6" value={workFormData.description}
                                                    onChange={e => setWorkFormData({ ...workFormData, description: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={closeEditWork}>Discard Changes</button>
                                    <button type="submit" className="btn btn-primary admin-st-6948e5f9"><Save size={18} /> Update Content</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════ */}
                {/* CREATE USER MODAL — with inline validations */}
                {/* ═══════════════════════════════════════════════════ */}
                {createModal.mounted && (
                    <div className={`modal-overlay ${createModal.visible ? 'open' : ''}`} onClick={closeCreateModal}>
                        <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Create New User</h2>
                                <button className="close-btn" onClick={closeCreateModal}><X size={24} /></button>
                            </div>
                            <div className="modal-body">
                                {/* Profile Image Upload */}
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                                    <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => document.getElementById('create-user-avatar-input').click()}>
                                        <div style={{
                                            width: '100px', height: '100px', borderRadius: '50%',
                                            background: profileImagePreview ? 'transparent' : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
                                            border: '3px dashed #cbd5e1', overflow: 'hidden',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all 0.2s ease'
                                        }}>
                                            {profileImagePreview ? (
                                                <img src={profileImagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <Camera size={32} color="#94a3b8" />
                                            )}
                                        </div>
                                        <div style={{
                                            position: 'absolute', bottom: '0', right: '0',
                                            width: '30px', height: '30px', borderRadius: '50%',
                                            background: '#6366f1', border: '2px solid white',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                                        }}>
                                            <Camera size={14} color="white" />
                                        </div>
                                        <input id="create-user-avatar-input" type="file" accept="image/*" style={{ display: 'none' }}
                                            onChange={handleProfileImageChange} />
                                    </div>
                                </div>
                                {createErrors.profileImage && <small style={{ color: '#ef4444', display: 'block', textAlign: 'center', marginTop: '-16px', marginBottom: '12px', fontSize: '0.8rem' }}>{createErrors.profileImage}</small>}
                                <p style={{ textAlign: 'center', margin: '-12px 0 20px', fontSize: '0.8rem', color: '#94a3b8' }}>Click to upload profile photo (optional)</p>

                                <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="premium-label">First Name *</label>
                                        <input type="text" className={`form-input ${createErrors.firstName ? 'error' : ''}`}
                                            placeholder="e.g. Juan" value={createFormData.firstName}
                                            onChange={(e) => handleCreateFieldChange('firstName', e.target.value)}
                                            onBlur={() => handleCreateBlur('firstName')} maxLength={50} />
                                        {createErrors.firstName && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{createErrors.firstName}</small>}
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="premium-label">Last Name *</label>
                                        <input type="text" className={`form-input ${createErrors.lastName ? 'error' : ''}`}
                                            placeholder="e.g. dela Cruz" value={createFormData.lastName}
                                            onChange={(e) => handleCreateFieldChange('lastName', e.target.value)}
                                            onBlur={() => handleCreateBlur('lastName')} maxLength={50} />
                                        {createErrors.lastName && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{createErrors.lastName}</small>}
                                    </div>
                                    <div className="form-group" style={{ width: '90px', flexShrink: 0 }}>
                                        <label className="premium-label">Suffix</label>
                                        <input type="text" className="form-input"
                                            placeholder="Jr." value={createFormData.suffix}
                                            onChange={(e) => handleCreateFieldChange('suffix', e.target.value)}
                                            maxLength={5} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="premium-label">Email Address *</label>
                                        <input type="email" className={`form-input ${createErrors.email ? 'error' : ''}`}
                                            placeholder="email@example.com" value={createFormData.email}
                                            onChange={(e) => handleCreateFieldChange('email', e.target.value)}
                                            onBlur={() => handleCreateBlur('email')} maxLength={254} />
                                        {createErrors.email && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{createErrors.email}</small>}
                                    </div>
                                    <div className="form-group">
                                        <label className="premium-label">User Role *</label>
                                        <select value={createFormData.user_type}
                                            onChange={(e) => setCreateFormData({ ...createFormData, user_type: e.target.value })} className="form-input">
                                            <option value="customer">Customer (Client)</option>
                                            <option value="artist">Artist (Staff)</option>
                                            {currentUser.is_superadmin && (
                                                <>
                                                    <option value="manager">Manager</option>
                                                    <option value="admin">Admin</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="premium-label">Phone Number *</label>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                            <CountryCodeSelect
                                                value={createFormData.countryCode}
                                                onChange={(code) => setCreateFormData({ ...createFormData, countryCode: code })}
                                            />
                                            <input type="tel" className={`form-input ${createErrors.phone ? 'error' : ''}`}
                                                style={{ flex: 1 }} placeholder="09XXXXXXXXX" value={createFormData.phone}
                                                onChange={(e) => handleCreateFieldChange('phone', e.target.value)}
                                                onBlur={() => handleCreateBlur('phone')} maxLength={11} />
                                        </div>
                                        {createErrors.phone && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{createErrors.phone}</small>}
                                    </div>
                                    <div className="form-group">
                                        <label className="premium-label">Age</label>
                                        <input type="text" inputMode="numeric" className={`form-input ${createErrors.age ? 'error' : ''}`}
                                            placeholder="e.g. 25" value={createFormData.age}
                                            onChange={(e) => handleCreateFieldChange('age', e.target.value)}
                                            onBlur={() => handleCreateBlur('age')} />
                                        {createErrors.age && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{createErrors.age}</small>}
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="premium-label">Password *</label>
                                        <div style={{ position: 'relative' }}>
                                            <input type={showCreatePassword ? 'text' : 'password'} className={`form-input ${createErrors.password ? 'error' : ''}`}
                                                style={{ paddingRight: '44px' }}
                                                placeholder="Secure password" value={createFormData.password}
                                                onChange={(e) => handleCreateFieldChange('password', e.target.value)}
                                                onFocus={() => setCreatePasswordFocused(true)}
                                                onBlur={() => { handleCreateBlur('password'); if (!createFormData.password) setCreatePasswordFocused(false); }}
                                                onPaste={(e) => e.preventDefault()} maxLength={128} />
                                            <button type="button" onClick={() => setShowCreatePassword(!showCreatePassword)}
                                                style={{
                                                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                                                    color: '#94a3b8', display: 'flex', alignItems: 'center'
                                                }}
                                                title={showCreatePassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showCreatePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                        {createErrors.password && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{createErrors.password}</small>}
                                    </div>
                                    <div className="form-group">
                                        <label className="premium-label">Confirm Password *</label>
                                        <div style={{ position: 'relative' }}>
                                            <input type={showCreateConfirmPassword ? 'text' : 'password'} className={`form-input ${createErrors.confirmPassword ? 'error' : ''}`}
                                                style={{ paddingRight: '44px' }}
                                                placeholder="Re-enter password" value={createFormData.confirmPassword}
                                                onChange={(e) => handleCreateFieldChange('confirmPassword', e.target.value)}
                                                onBlur={() => handleCreateBlur('confirmPassword')}
                                                onPaste={(e) => e.preventDefault()} maxLength={128} />
                                            <button type="button" onClick={() => setShowCreateConfirmPassword(!showCreateConfirmPassword)}
                                                style={{
                                                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                                                    color: '#94a3b8', display: 'flex', alignItems: 'center'
                                                }}
                                                title={showCreateConfirmPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showCreateConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                        {createErrors.confirmPassword && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{createErrors.confirmPassword}</small>}
                                    </div>
                                </div>
                                {/* Password Strength Meter */}
                                <div style={{ overflow: 'hidden', maxHeight: createPasswordFocused ? '200px' : '0', opacity: createPasswordFocused ? 1 : 0, transition: 'max-height 0.3s ease, opacity 0.3s ease', marginTop: createPasswordFocused ? '4px' : '0', marginBottom: '8px' }}>
                                    <div>
                                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                            {[createPasswordFeedback.hasMinLength, createPasswordFeedback.hasNumber, createPasswordFeedback.hasUppercase && createPasswordFeedback.hasLowercase, createPasswordFeedback.hasSymbol].map((met, i) => (
                                                <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: met ? '#be9055' : '#e2e8f0', transition: 'background-color 0.3s ease' }} />
                                            ))}
                                        </div>
                                        {(() => {
                                            const steps = [
                                                { met: createPasswordFeedback.hasMinLength, hint: 'At least 8 characters' },
                                                { met: createPasswordFeedback.hasNumber, hint: 'Add a number' },
                                                { met: createPasswordFeedback.hasUppercase && createPasswordFeedback.hasLowercase, hint: 'Add upper & lowercase letters' },
                                                { met: createPasswordFeedback.hasSymbol, hint: 'Add a special character: !@#$%^&*()_+' }
                                            ];
                                            const nextHint = steps.find(s => !s.met);
                                            return nextHint ? <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>{nextHint.hint}</div> : null;
                                        })()}
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={closeCreateModal}>Cancel</button>
                                <button className="btn btn-primary admin-st-9be3106b" onClick={handleCreateSave} disabled={!isCreateFormValid()}>
                                    Create User
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirm Modal */}
                <ConfirmModal
                    isOpen={confirmDialog.isOpen} title={confirmDialog.title} message={confirmDialog.message}
                    confirmText={confirmDialog.confirmText} onConfirm={confirmDialog.onConfirm}
                    onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
                    type={confirmDialog.type} isAlert={confirmDialog.isAlert}
                />

                {/* Status Management Modal */}
                {statusModal.mounted && (
                    <div className={`modal-overlay ${statusModal.visible ? 'open' : ''}`} onClick={closeStatusModal}>
                        <div className="modal-content medium" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Manage Account Status</h2>
                                <button className="close-btn" onClick={closeStatusModal}><X size={24} /></button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="premium-label">Account Status</label>
                                    <select
                                        value={statusFormData.status}
                                        onChange={(e) => {
                                            const newStatus = e.target.value;
                                            let newReason = statusFormData.reason;
                                            if (newStatus === 'deactivated' && (!statusFormData.reason || statusFormData.reason === 'Your account has been permanently banned due to policy violations.')) {
                                                newReason = `Your account has been temporarily suspended by an administrator for ${statusFormData.duration}.`;
                                            } else if (newStatus === 'banned' && (!statusFormData.reason || statusFormData.reason.startsWith('Your account has been temporarily suspended'))) {
                                                newReason = `Your account has been permanently banned due to policy violations.`;
                                            } else if (newStatus === 'active') {
                                                newReason = '';
                                            }
                                            setStatusFormData({ ...statusFormData, status: newStatus, reason: newReason });
                                        }}
                                        className="form-input"
                                    >
                                        <option value="active">Active</option>
                                        <option value="deactivated">Deactivated (Temporary Suspension)</option>
                                        <option value="banned">Banned (Permanent Hold)</option>
                                    </select>
                                </div>
                                {statusFormData.status === 'deactivated' && (
                                    <>
                                        <div className="form-group" style={{ marginTop: '15px' }}>
                                            <label className="premium-label">Suspension Duration *</label>
                                            <select
                                                value={statusFormData.duration}
                                                onChange={(e) => {
                                                    const newDuration = e.target.value;
                                                    let newReason = statusFormData.reason;
                                                    if (newReason.startsWith('Your account has been temporarily suspended by an administrator for')) {
                                                        newReason = `Your account has been temporarily suspended by an administrator for ${newDuration}.`;
                                                    }
                                                    setStatusFormData({ ...statusFormData, duration: newDuration, reason: newReason });
                                                }}
                                                className="form-input"
                                                required
                                            >
                                                <option value="24 hours">24 hours</option>
                                                <option value="3 days">3 days</option>
                                                <option value="7 days">7 days</option>
                                                <option value="14 days">14 days</option>
                                                <option value="30 days">30 days</option>
                                                <option value="Indefinite">Indefinite</option>
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ marginTop: '15px' }}>
                                            <label className="premium-label" style={{ color: '#f59e0b' }}>Reason for Suspension (Required) *</label>
                                            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
                                                This will be sent to the user via email.
                                            </p>
                                            <textarea
                                                value={statusFormData.reason}
                                                onChange={(e) => setStatusFormData({ ...statusFormData, reason: e.target.value })}
                                                className="form-input"
                                                placeholder="E.g., Temporary hold pending review."
                                                rows={3}
                                                required
                                            ></textarea>
                                        </div>
                                    </>
                                )}
                                {statusFormData.status === 'banned' && (
                                    <div className="form-group" style={{ marginTop: '15px' }}>
                                        <label className="premium-label" style={{ color: '#ef4444' }}>Reason for Ban (Required) *</label>
                                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
                                            This will be sent to the user via email and recorded in audit logs.
                                        </p>
                                        <textarea
                                            value={statusFormData.reason}
                                            onChange={(e) => setStatusFormData({ ...statusFormData, reason: e.target.value })}
                                            className="form-input"
                                            placeholder="E.g., Repeated no-shows or policy violations."
                                            rows={3}
                                            required
                                        ></textarea>
                                    </div>
                                )}
                                {statusFormData.status === 'active' && (
                                    <div className="form-group" style={{ marginTop: '15px' }}>
                                        <label className="premium-label">Administrative Note (Optional)</label>
                                        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>
                                            Internal note explaining the status change.
                                        </p>
                                        <textarea
                                            value={statusFormData.adminNote}
                                            onChange={(e) => setStatusFormData({ ...statusFormData, adminNote: e.target.value })}
                                            className="form-input"
                                            placeholder="Optional context for the team..."
                                            rows={2}
                                        ></textarea>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                                <div>
                                    {statusModal.user && !statusModal.user.is_superadmin && (
                                        statusModal.user.is_deleted ? (
                                            <button 
                                                className="btn" 
                                                onClick={() => handlePermanentDelete(statusModal.user)}
                                                style={{ backgroundColor: '#ef4444', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                title="Permanently erase this account"
                                            >
                                                <Trash2 size={16} /> Permanently Delete
                                            </button>
                                        ) : (
                                            <button 
                                                className="btn" 
                                                onClick={() => handleSoftDelete(statusModal.user)}
                                                style={{ backgroundColor: '#dc2626', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                title="Soft delete this account"
                                            >
                                                <Trash2 size={16} /> Delete Account
                                            </button>
                                        )
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className="btn btn-secondary" onClick={closeStatusModal}>Cancel</button>
                                    <button 
                                        className="btn btn-primary" 
                                        onClick={submitStatusChange}
                                        style={{ backgroundColor: statusFormData.status === 'banned' ? '#ef4444' : '#10b981', color: 'white' }}
                                    >
                                        Confirm Status Change
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Destructive Delete Confirmation with Countdown */}
                {deleteConfirm.isOpen && ReactDOM.createPortal(
                    <div className="modal-overlay open" style={{ zIndex: 10000 }} onClick={closeDestructiveConfirm}>
                        <div className="modal-content" style={{ maxWidth: '480px', padding: '0', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                                <div style={{ 
                                    width: '64px', height: '64px', borderRadius: '50%', 
                                    background: '#fee2e2', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                    margin: '0 auto 16px', color: '#dc2626'
                                }}>
                                    <AlertTriangle size={32} />
                                </div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0 0 12px', color: '#1e293b' }}>{deleteConfirm.title}</h2>
                                <p style={{ fontSize: '0.95rem', color: '#64748b', margin: '0', lineHeight: '1.6', whiteSpace: 'pre-line' }}>{deleteConfirm.message}</p>
                            </div>
                            <div style={{ display: 'flex', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
                                <button 
                                    onClick={closeDestructiveConfirm} 
                                    style={{ flex: 1, padding: '16px', background: 'transparent', border: 'none', borderRight: '1px solid #f1f5f9', fontWeight: 600, color: '#64748b', cursor: 'pointer', transition: 'all 0.2s' }}
                                    onMouseOver={e => e.target.style.background = '#f1f5f9'}
                                    onMouseOut={e => e.target.style.background = 'transparent'}
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={() => { if (deleteConfirm.countdown <= 0 && deleteConfirm.onConfirm) { closeDestructiveConfirm(); deleteConfirm.onConfirm(); } }}
                                    disabled={deleteConfirm.countdown > 0}
                                    style={{ 
                                        flex: 1, padding: '16px', background: 'transparent', border: 'none', 
                                        fontWeight: 700, 
                                        color: deleteConfirm.countdown > 0 ? '#94a3b8' : '#dc2626', 
                                        cursor: deleteConfirm.countdown > 0 ? 'not-allowed' : 'pointer', 
                                        transition: 'all 0.2s',
                                        opacity: deleteConfirm.countdown > 0 ? 0.6 : 1
                                    }}
                                    onMouseOver={e => { if (deleteConfirm.countdown <= 0) e.target.style.background = '#fee2e2'; }}
                                    onMouseOut={e => e.target.style.background = 'transparent'}
                                >
                                    {deleteConfirm.countdown > 0 ? `Please wait (${deleteConfirm.countdown}s)` : 'Confirm Delete'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            </div>
        </div>
    );
}

export default AdminUsers;
