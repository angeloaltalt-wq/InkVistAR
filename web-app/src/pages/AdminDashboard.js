import React, { useState, useEffect, useRef } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Palette, Settings, Package, BarChart3, AlertTriangle, Bell, Clock, CheckCircle, FileText, Search, ChevronLeft, ChevronRight, X, ShoppingCart, Info, SlidersHorizontal, RefreshCw } from 'lucide-react';
import PhilippinePeso from '../components/PhilippinePeso';
import AnalyticsMetricCards from '../components/AnalyticsMetricCards';
import AnalyticsAuditModal from '../components/AnalyticsAuditModal';
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import './AdminDashboard.css';
import AdminSideNav from '../components/AdminSideNav';
import './PortalStyles.css';
import './AdminStyles.css';
import { API_URL } from '../config';
import { getDisplayCode, formatTime12Hour, formatStatus } from '../utils/formatters';

function AdminDashboard() {
    const [stats, setStats] = useState({
        totalUsers: 0,
        totalAppointments: 0,
        totalRevenue: 0,
        activeArtists: 0
    });
    const [revenueData, setRevenueData] = useState({ daily: 0, monthly: 0 });
    const [todaysAppointments, setTodaysAppointments] = useState([]);
    const [artistStatus, setArtistStatus] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [users, setUsers] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unreadNotifications, setUnreadNotifications] = useState(0);

    // Shared analytics state (for metric cards + audit modal)
    const [analyticsData, setAnalyticsData] = useState(null);
    const [auditModal, setAuditModal] = useState({ open: false, title: '', type: '', data: null });
    const [expenseForm, setExpenseForm] = useState({ category: 'Inventory', description: '', amount: '' });
    const [expenseList, setExpenseList] = useState([]);
    const [expenseLoading, setExpenseLoading] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);
    const [isRefreshingNotifs, setIsRefreshingNotifs] = useState(false);
    const notifRef = useRef(null);

    // Audit Logs State
    const [auditSearch, setAuditSearch] = useState('');
    const [auditPage, setAuditPage] = useState(1);
    const [auditFilter, setAuditFilter] = useState('all'); // 'all' | 'admin'
    const itemsPerPage = 5;

    // Appointments Pagination State
    const [appointmentSearch, setAppointmentSearch] = useState('');
    const [appointmentFilter, setAppointmentFilter] = useState('upcoming'); // 'upcoming', 'latest', 'all'
    const [appointmentPage, setAppointmentPage] = useState(1);
    const appointmentsPerPage = 10;
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ open: false, type: 'approve', title: '', message: '', appointmentRef: '', onConfirm: null });

    const navigate = useNavigate();

    useEffect(() => {
        fetchDashboardData();
        fetchAnalyticsData();
        fetchExpenseData();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (notifRef.current && !notifRef.current.contains(event.target)) {
                setShowNotifDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const refreshNotifications = async () => {
        try {
            setIsRefreshingNotifs(true);
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            if (user.id) {
                const res = await Axios.get(`${API_URL}/api/notifications/${user.id}`);
                if (res.data.success) {
                    setNotifications(res.data.notifications || []);
                    setUnreadNotifications(res.data.unreadCount);
                }
            }
        } catch (error) {
            console.error("Error refreshing notifications:", error);
        } finally {
            setIsRefreshingNotifs(false);
        }
    };

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const [usersResponse, appointmentsResponse, logsResponse, inventoryResponse, notificationsResponse] = await Promise.all([
                Axios.get(`${API_URL}/api/debug/users`),
                Axios.get(`${API_URL}/api/admin/appointments`),
                Axios.get(`${API_URL}/api/admin/audit-logs?limit=20`), // Fetch enough logs for dashboard activity feed
                Axios.get(`${API_URL}/api/admin/inventory?status=active`),
                user.id ? Axios.get(`${API_URL}/api/notifications/${user.id}`) : Promise.resolve({ data: { unreadCount: 0 } })
            ]);

            if (usersResponse.data.success) {
                // Filter out deleted users for dashboard stats
                const users = usersResponse.data.users.filter(u => !u.is_deleted);
                setUsers(users);

                const appointments = appointmentsResponse.data.success ? appointmentsResponse.data.data : [];

                // Calculate stats
                const totalUsers = users.length;
                const activeArtists = users.filter(u => u.user_type === 'artist').length;
                const totalAppointments = appointments.length;

                // --- Process Data for Dashboard ---
                const now = new Date();
                // Get local date string in YYYY-MM-DD format
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const todayStr = `${year}-${month}-${day}`;

                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();

                let dailyRev = 0;
                let monthlyRev = 0;
                let totalRev = 0;

                // Chart Data Prep (Last 7 Days)
                const last7Days = {};
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const dYear = d.getFullYear();
                    const dMonth = String(d.getMonth() + 1).padStart(2, '0');
                    const dDay = String(d.getDate()).padStart(2, '0');
                    last7Days[`${dYear}-${dMonth}-${dDay}`] = 0;
                }

                appointments.forEach(apt => {
                    // Normalize date
                    let aptDateStr = '';
                    if (typeof apt.appointment_date === 'string') {
                        aptDateStr = apt.appointment_date.split('T')[0];
                    } else {
                        const d = new Date(apt.appointment_date);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        aptDateStr = `${y}-${m}-${dd}`;
                    }

                    // Chart Counting
                    if (last7Days.hasOwnProperty(aptDateStr)) {
                        last7Days[aptDateStr]++;
                    }

                    // Revenue Calculation (exclude guest placeholder bookings from admin's personal stats)
                    if (apt.status !== 'cancelled' && !apt.is_guest_placeholder) {
                        const paidTotal = Number(apt.total_paid) || 0;
                        totalRev += paidTotal;
                        if (aptDateStr === todayStr) dailyRev += paidTotal;
                        const aptDate = new Date(aptDateStr);
                        if (aptDate.getMonth() === currentMonth && aptDate.getFullYear() === currentYear) {
                            monthlyRev += paidTotal;
                        }
                    }
                });

                setRevenueData({ daily: dailyRev, monthly: monthlyRev });
                setChartData(Object.keys(last7Days).map(date => ({
                    day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
                    count: last7Days[date]
                })));

                setStats({
                    totalUsers,
                    totalAppointments,
                    totalRevenue: totalRev,
                    activeArtists
                });

                setAppointments(appointments);

                // Today's Appointments
                const todayApptsList = appointments.filter(apt => {
                    let d = '';
                    if (typeof apt.appointment_date === 'string') {
                        d = apt.appointment_date.split('T')[0];
                    } else {
                        const dObj = new Date(apt.appointment_date);
                        d = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
                    }
                    return d === todayStr && apt.status !== 'cancelled';
                });
                setTodaysAppointments(todayApptsList);

                // Artist Availability
                const artistList = users.filter(u => u.user_type === 'artist');
                const statusMap = artistList.map(artist => {
                    const isBusy = todayApptsList.some(apt => apt.artist_name === artist.name);
                    return {
                        id: artist.id,
                        name: artist.name,
                        status: isBusy ? 'Booked' : 'Available'
                    };
                });
                setArtistStatus(statusMap);

                // --- Generate Functional Alerts ---
                const generatedAlerts = [];
                let alertId = 1;

                // 1. Inventory Alerts
                if (inventoryResponse.data.success) {
                    const inventory = inventoryResponse.data.data;
                    const lowStockItems = inventory.filter(item => item.current_stock <= item.min_stock);

                    lowStockItems.slice(0, 2).forEach(item => { // Limit to 2 for UI cleanliness
                        generatedAlerts.push({
                            id: alertId++,
                            type: 'inventory',
                            message: `Low stock: ${item.name} (${item.current_stock} left)`,
                            severity: 'high'
                        });
                    });
                }

                // 2. TESTING the Appointments Alert
                const pendingAppointments = appointments.filter(apt => apt.status === 'pending');
                if (pendingAppointments.length > 0) {
                    generatedAlerts.push({
                        id: alertId++,
                        type: 'appointment', // Changed to 'appointment' for consistency with AdminNotifications
                        message: `You have ${pendingAppointments.length} pending appointment requests.`,
                        severity: 'medium'
                    });
                }

                setAlerts(generatedAlerts);
            }

            if (logsResponse?.data?.success) {
                setAuditLogs(logsResponse.data.data);
            }

            if (notificationsResponse.data.success) {
                setNotifications(notificationsResponse.data.notifications || []);
                setUnreadNotifications(notificationsResponse.data.unreadCount);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            setLoading(false);
        }
    };

    const showConfirm = (type, title, message, appointmentRef, onConfirm) => {
        setConfirmModal({ open: true, type, title, message, appointmentRef, onConfirm });
    };

    const handleStatusUpdate = async (id, status, appointment) => {
        const isApprove = status === 'confirmed';
        const ref = `${appointment.client_name || 'Client'} — ${getDisplayCode(appointment)}`;
        showConfirm(
            isApprove ? 'approve' : 'reject',
            isApprove ? 'Approve Consultation' : 'Reject Consultation',
            isApprove
                ? 'Confirming this request will notify the client that their consultation has been approved and schedule it in the system.'
                : 'Rejecting this request will mark it as declined and notify the client that their consultation was not approved.',
            ref,
            async () => {
                try {
                    await Axios.put(`${API_URL}/api/appointments/${id}/status`, { status });
                    fetchDashboardData();
                } catch (error) {
                    console.error(error);
                }
            }
        );
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        navigate('/admin');
    };

    const handleNavigate = (path) => {
        navigate(path);
    };

    // Shared analytics fetch (same endpoint as AdminAnalytics)
    const fetchAnalyticsData = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/admin/analytics?timeframe=monthly`);
            if (res.data.success) setAnalyticsData(res.data.data);
        } catch (error) { console.error('Error fetching analytics for dashboard:', error); }
    };

    const fetchExpenseData = async () => {
        setExpenseLoading(true);
        try {
            const res = await Axios.get(`${API_URL}/api/admin/expenses`);
            if (res.data.success) setExpenseList(res.data.data);
        } catch (e) { console.error(e); }
        setExpenseLoading(false);
    };

    const handleAddExpenseDash = async (e) => {
        e.preventDefault();
        if (!expenseForm.amount || parseFloat(expenseForm.amount) <= 0) return;
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            await Axios.post(`${API_URL}/api/admin/expenses`, { ...expenseForm, amount: parseFloat(expenseForm.amount), userId: user?.id });
            setExpenseForm({ category: 'Inventory', description: '', amount: '' });
            fetchExpenseData();
            fetchAnalyticsData();
        } catch (e) { console.error(e); }
    };

    const handleDeleteExpenseDash = async (id) => {
        try {
            await Axios.delete(`${API_URL}/api/admin/expenses/${id}`);
            fetchExpenseData();
            fetchAnalyticsData();
        } catch (e) {
            const msg = e.response?.data?.message || 'Failed to delete expense.';
            alert(msg);
        }
    };

    const handleEditExpenseDash = async (id, data) => {
        try {
            await Axios.put(`${API_URL}/api/admin/expenses/${id}`, {
                category: data.category,
                description: data.description,
                amount: parseFloat(data.amount)
            });
            fetchExpenseData();
            fetchAnalyticsData();
        } catch (e) {
            const msg = e.response?.data?.message || 'Failed to edit expense.';
            alert(msg);
        }
    };

    const openDashAuditModal = (type) => {
        if (!analyticsData) return;
        let title = '', data = null;
        switch (type) {
            case 'revenue':
                title = 'Revenue Audit — Source Breakdown';
                data = { breakdown: analyticsData.revenue.breakdown, total: analyticsData.revenue.total, source: 'payments + invoices + manual_paid_amount' };
                break;
            case 'expenses':
                title = 'Operations Audits — Payouts & Procurements';
                data = { breakdown: analyticsData.expenses.breakdown, total: analyticsData.expenses.total, source: 'payouts + inventory transactions (type=in)', payouts_audit: analyticsData.expenses.payouts_audit, inventory_in_audit: analyticsData.expenses.inventory_in_audit };
                break;
            case 'overhead':
                title = 'Studio Overhead — Manual Expenses';
                data = { breakdown: analyticsData.overhead.breakdown, total: analyticsData.overhead.total, source: 'studio_expenses table' };
                fetchExpenseData();
                break;
            case 'appointments':
                title = 'Appointments Audit';
                data = { breakdown: [{ name: 'Completed', value: Number(analyticsData.appointments.completed) || 0 }, { name: 'Scheduled', value: Number(analyticsData.appointments.scheduled) || 0 }, { name: 'Cancelled', value: Number(analyticsData.appointments.cancelled) || 0 }].filter(b => b.value > 0), total: analyticsData.appointments.total, source: 'appointments table' };
                break;
            case 'users':
                title = 'User Base Audit';
                data = { breakdown: [{ name: 'Customers', value: Number(analyticsData.users?.customers) || 0 }, { name: 'Artists', value: Number(analyticsData.users?.artists) || 0 }, { name: 'Admins', value: Number(analyticsData.users?.admins) || 0 }].filter(b => b.value > 0), total: analyticsData.users?.total || 0, source: 'users table' };
                break;
            case 'artists':
                title = 'Artist Performance Audit';
                data = { list: analyticsData.artists, source: 'appointments joined with users' };
                break;
            case 'inventory':
                title = 'Inventory Consumption Audit';
                data = { list: analyticsData.inventory, source: 'inventory_transactions (type=out)' };
                break;
            case 'completion':
                title = 'Completion Rate Audit';
                data = { breakdown: [{ name: 'Completed', value: Number(analyticsData.appointments.completed) || 0 }, { name: 'Cancelled', value: Number(analyticsData.appointments.cancelled) || 0 }].filter(b => b.value > 0), rate: analyticsData.appointments.completionRate, source: 'appointments table' };
                break;
            case 'duration':
                title = 'Avg Session Duration Audit';
                data = { avgDuration: analyticsData.appointments.avgDuration, source: 'appointments: AVG(session_duration)' };
                break;
            default: break;
        }
        setAuditModal({ open: true, title, type, data });
    };

    const closeDashAuditModal = () => setAuditModal({ open: false, title: '', type: '', data: null });

    const formatDuration = (seconds) => {
        if (!seconds) return 'N/A';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return hrs > 0 ? `${hrs}h ${String(mins).padStart(2, '0')}m` : `${mins}m`;
    };

    // Filter and paginate logs
    const filteredLogs = auditLogs.filter(log => {
        // Apply admin-only filter
        if (auditFilter === 'admin' && !['admin', 'manager'].includes(log.user_type)) return false;
        // Apply search
        return (
            (log.user_name || 'System').toLowerCase().includes(auditSearch.toLowerCase()) ||
            (log.action || '').toLowerCase().includes(auditSearch.toLowerCase()) ||
            (log.details || '').toLowerCase().includes(auditSearch.toLowerCase())
        );
    });
    const auditTotalPages = Math.ceil(filteredLogs.length / itemsPerPage);
    const displayedLogs = filteredLogs.slice((auditPage - 1) * itemsPerPage, auditPage * itemsPerPage);

    // Filter and paginate appointments
    const filteredAppointments = appointments.filter(apt => {
        const matchesSearch =
            (apt.client_name || '').toLowerCase().includes(appointmentSearch.toLowerCase()) ||
            (apt.artist_name || '').toLowerCase().includes(appointmentSearch.toLowerCase());

        if (!matchesSearch) return false;

        if (appointmentFilter === 'upcoming') {
            const today = new Date().toISOString().split('T')[0];
            const aptDate = typeof apt.appointment_date === 'string'
                ? apt.appointment_date.split('T')[0]
                : new Date(apt.appointment_date).toISOString().split('T')[0];

            return aptDate >= today && apt.status !== 'cancelled' && apt.status !== 'completed';
        }
        return true;
    });

    // Sorting
    if (appointmentFilter === 'latest') {
        filteredAppointments.sort((a, b) => b.id - a.id);
    } else {
        filteredAppointments.sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));
    }

    const appointmentTotalPages = Math.ceil(filteredAppointments.length / appointmentsPerPage);
    const displayedAppointments = filteredAppointments.slice((appointmentPage - 1) * appointmentsPerPage, appointmentPage * appointmentsPerPage);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page admin-dashboard-container page-container-enter">
                <header className="portal-header">
                    <div className="header-title">
                        <h1>Admin Dashboard</h1>
                    </div>
                    <div className="header-actions">


                        <div className="notif-btn-wrapper admin-st-fab32c0e" ref={notifRef} >
                            <button className="notif-trigger-btn" onClick={() => setShowNotifDropdown(!showNotifDropdown)}>
                                <Bell size={20} />
                                {unreadNotifications > 0 && <span className="notif-badge-dot"></span>}
                            </button>

                            {showNotifDropdown && (
                                <div className="notif-dropdown-v2 glass-card">
                                    <div className="notif-dropdown-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3>Notifications</h3>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); refreshNotifications(); }}
                                            title="Refresh notifications"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'all 0.2s' }}
                                        >
                                            <RefreshCw size={16} style={isRefreshingNotifs ? { animation: 'spin 1s linear infinite' } : {}} />
                                        </button>
                                    </div>
                                    <div className="notif-dropdown-list">
                                        {notifications.length > 0 ? (
                                            notifications.map(n => (
                                                <div key={n.id} className={`notif-dropdown-item ${!n.is_read ? 'unread' : ''}`} onClick={() => { setShowNotifDropdown(false); navigate('/admin/notifications'); }}>
                                                    <div className="notif-item-content">
                                                        <span className="notif-item-title">{n.title}</span>
                                                        <span className="notif-item-msg">{n.message}</span>
                                                        <span className="notif-item-time">{new Date(n.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="notif-empty">No notifications yet</div>
                                        )}
                                    </div>
                                    <div className="notif-dropdown-footer">
                                        <button onClick={() => { setShowNotifDropdown(false); navigate('/admin/notifications'); }}>See All Updates</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
                <p className="header-subtitle">System Overview & Management</p>

                {loading ? (
                    <div className="dashboard-loader-container">
                        <div className="premium-loader"></div>
                        <p>Loading Dashboard...</p>
                    </div>
                ) : (
                    <div className="dashboard-content">
                        {/* Stats Section — Chart-Based Stat Cards */}
                        {analyticsData && (
                            <div className="stats-section">
                                {/* Revenue Card — PieChart donut matching Analytics */}
                                <div className="stat-card-v2 glass-card clickable" onClick={() => openDashAuditModal('revenue')} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <div className="stat-icon-wrapper green"><PhilippinePeso size={24} /></div>
                                        <div className="stat-info-v2" style={{ border: 'none' }}>
                                            <span className="stat-label-v2">Revenue (Month)</span>
                                            <h3 className="stat-value-v2">₱{Number(analyticsData.revenue?.total || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                        </div>
                                    </div>
                                    {analyticsData.revenue?.breakdown?.length > 0 ? (
                                        <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'center' }}>
                                            <ResponsiveContainer width="50%" height="100%">
                                                <PieChart>
                                                    <Pie data={analyticsData.revenue.breakdown} cx="50%" cy="50%" innerRadius={14} outerRadius={30} paddingAngle={2} dataKey="value">
                                                        {analyticsData.revenue.breakdown.map((_, i) => <Cell key={i} fill={['#10b981', '#3b82f6', '#f59e0b', '#ec4899'][i % 4]} />)}
                                                    </Pie>
                                                    <Tooltip formatter={(v, name) => [`₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name]} contentStyle={{ fontSize: '0.7rem', borderRadius: '8px' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div style={{ fontSize: '0.65rem', color: '#64748b', lineHeight: 1.6, flex: 1 }}>
                                                {analyticsData.revenue.breakdown.map((b, i) => (
                                                    <div key={i}><span style={{ color: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899'][i % 4], fontWeight: 700 }}>₱{Number(b.value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> {b.name}</div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ width: '100%', height: 80 }}>
                                            <ResponsiveContainer>
                                                <BarChart data={analyticsData.revenue.chart || []} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                                    <Bar dataKey="value" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                                                    <Tooltip formatter={(v, name) => [`₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name]} contentStyle={{ fontSize: '0.75rem', borderRadius: '8px' }} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                    <div className="stat-trend-v2" style={{ marginTop: '4px', color: '#64748b', fontSize: '0.75rem' }}>Click for source breakdown →</div>
                                </div>

                                {/* Appointments Card — Full Pie matching Analytics */}
                                <div className="stat-card-v2 glass-card clickable" onClick={() => openDashAuditModal('appointments')} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <div className="stat-icon-wrapper purple"><Calendar size={24} /></div>
                                        <div className="stat-info-v2" style={{ border: 'none' }}>
                                            <span className="stat-label-v2">Appointments</span>
                                            <h3 className="stat-value-v2">{analyticsData.appointments?.total || 0}</h3>
                                        </div>
                                    </div>
                                    <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {(analyticsData.appointments?.completed > 0 || analyticsData.appointments?.scheduled > 0 || analyticsData.appointments?.cancelled > 0) ? (
                                            <>
                                                <ResponsiveContainer width="50%" height="100%">
                                                    <PieChart>
                                                        <Pie data={[
                                                            { name: 'Completed', value: Number(analyticsData.appointments.completed) || 0 },
                                                            { name: 'Scheduled', value: Number(analyticsData.appointments.scheduled) || 0 },
                                                            { name: 'Cancelled', value: Number(analyticsData.appointments.cancelled) || 0 }
                                                        ].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={30} paddingAngle={3} dataKey="value">
                                                            <Cell fill="#10b981" />
                                                            <Cell fill="#3b82f6" />
                                                            <Cell fill="#ef4444" />
                                                        </Pie>
                                                        <Tooltip formatter={(v, name) => [v, name]} contentStyle={{ fontSize: '0.7rem', borderRadius: '8px' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                <div style={{ fontSize: '0.65rem', color: '#64748b', lineHeight: 1.6 }}>
                                                    <div><span style={{ color: '#10b981', fontWeight: 700 }}>{analyticsData.appointments.completed}</span> completed</div>
                                                    <div><span style={{ color: '#3b82f6', fontWeight: 700 }}>{analyticsData.appointments.scheduled}</span> scheduled</div>
                                                    <div><span style={{ color: '#ef4444', fontWeight: 700 }}>{analyticsData.appointments.cancelled}</span> cancelled</div>
                                                </div>
                                            </>
                                        ) : (
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No appointments yet</span>
                                        )}
                                    </div>
                                    <div className="stat-trend-v2" style={{ marginTop: '4px', color: '#64748b', fontSize: '0.75rem' }}>Click for status breakdown →</div>
                                </div>

                                {/* Users Card — Bar with XAxis labels matching Analytics */}
                                <div className="stat-card-v2 glass-card clickable" onClick={() => openDashAuditModal('users')} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <div className="stat-icon-wrapper blue"><Users size={24} /></div>
                                        <div className="stat-info-v2" style={{ border: 'none' }}>
                                            <span className="stat-label-v2">Total Users</span>
                                            <h3 className="stat-value-v2">{analyticsData.users?.total || 0}</h3>
                                        </div>
                                    </div>
                                    {analyticsData.users && (
                                        <div style={{ width: '100%', height: 80, display: 'flex', alignItems: 'center' }}>
                                            <ResponsiveContainer width="55%" height="100%">
                                                <BarChart data={[
                                                    { name: 'Customers', count: Number(analyticsData.users.customers) || 0 },
                                                    { name: 'Artists', count: Number(analyticsData.users.artists) || 0 },
                                                    { name: 'Admins', count: Number(analyticsData.users.admins) || 0 }
                                                ]} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                                    <Bar dataKey="count" name="Users" radius={[4, 4, 0, 0]}>
                                                        <Cell fill="#3b82f6" />
                                                        <Cell fill="#a855f7" />
                                                        <Cell fill="#f59e0b" />
                                                    </Bar>
                                                    <Tooltip formatter={(v, name) => [v, name]} contentStyle={{ fontSize: '0.7rem', borderRadius: '8px' }} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                            <div style={{ fontSize: '0.65rem', color: '#64748b', lineHeight: 1.6, flex: 1 }}>
                                                <div><span style={{ color: '#3b82f6', fontWeight: 700 }}>{analyticsData.users.customers || 0}</span> Customers</div>
                                                <div><span style={{ color: '#a855f7', fontWeight: 700 }}>{analyticsData.users.artists || 0}</span> Artists</div>
                                                <div><span style={{ color: '#f59e0b', fontWeight: 700 }}>{analyticsData.users.admins || 0}</span> Admins</div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="stat-trend-v2" style={{ marginTop: '4px', color: '#64748b', fontSize: '0.75rem' }}>Click for user audit →</div>
                                </div>

                                {/* Active Artists Card */}
                                <div className="stat-card-v2 glass-card clickable" onClick={() => openDashAuditModal('artists')} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                        <div className="stat-icon-wrapper orange"><Palette size={24} /></div>
                                        <div className="stat-info-v2" style={{ border: 'none' }}>
                                            <span className="stat-label-v2">Active Artists</span>
                                            <h3 className="stat-value-v2">{analyticsData.artists?.length || 0}</h3>
                                        </div>
                                    </div>
                                    {analyticsData.artists?.length > 0 && (
                                        <div style={{ width: '100%', height: 80 }}>
                                            <ResponsiveContainer>
                                                <BarChart data={analyticsData.artists.slice(0, 5)} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                                                    <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} barSize={10}>
                                                        {analyticsData.artists.slice(0, 5).map((_, i) => <Cell key={i} fill={['#f97316', '#a855f7', '#3b82f6', '#10b981', '#ec4899'][i % 5]} />)}
                                                    </Bar>
                                                    <Tooltip formatter={(v, name) => [`₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name]} contentStyle={{ fontSize: '0.7rem', borderRadius: '8px' }} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                    <div className="stat-trend-v2" style={{ marginTop: '4px', color: '#64748b', fontSize: '0.75rem' }}>Click for performance audit →</div>
                                </div>
                            </div>
                        )}

                        <div className="dashboard-layout-grid">
                            <div className="layout-column">
                                {/* Weekly Activity Chart */}
                                <div className="glass-card">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <BarChart3 size={20} />
                                            <h2>Weekly Appointments</h2>
                                        </div>
                                    </div>
                                    <div className="premium-chart">
                                        {chartData.map((item, index) => (
                                            <div key={index} className="modern-bar-group">
                                                <div className="bar-rail">
                                                    <div
                                                        className="bar-fill"
                                                        style={{ height: `${Math.min(item.count * 15, 100)}%` }}
                                                    >
                                                        <div className="bar-tooltip">{item.count}</div>
                                                    </div>
                                                </div>
                                                <span className="bar-label">{item.day}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="glass-card">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <Calendar size={20} />
                                            <h2>Appointments Overview</h2>
                                        </div>
                                        <div className="card-actions admin-st-bb81d8eb">
                                            <div className="filter-pill-group">
                                                <button
                                                    className={`filter-pill ${appointmentFilter === 'upcoming' ? 'active' : ''}`}
                                                    onClick={() => { setAppointmentFilter('upcoming'); setAppointmentPage(1); }}
                                                >Upcoming</button>
                                                <button
                                                    className={`filter-pill ${appointmentFilter === 'latest' ? 'active' : ''}`}
                                                    onClick={() => { setAppointmentFilter('latest'); setAppointmentPage(1); }}
                                                >Latest Added</button>
                                                <button
                                                    className={`filter-pill ${appointmentFilter === 'all' ? 'active' : ''}`}
                                                    onClick={() => { setAppointmentFilter('all'); setAppointmentPage(1); }}
                                                >All</button>
                                            </div>
                                            <div className="header-search admin-st-bea296a0">
                                                <Search size={14} />
                                                <input
                                                    type="text"
                                                    placeholder="Search..."
                                                    value={appointmentSearch}
                                                    onChange={(e) => { setAppointmentSearch(e.target.value); setAppointmentPage(1); }}
                                                    className="admin-st-fb2a7115"
                                                    maxLength={100}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="modern-table-wrapper table-responsive" style={{ minHeight: '520px' }}>
                                        <table className="premium-table">
                                            <thead>
                                                <tr>
                                                    <th>Client</th>
                                                    <th>Staff</th>
                                                    <th>Service</th>
                                                    <th>Date</th>
                                                    <th>Status</th>
                                                    <th className="admin-st-7851dbc0">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {displayedAppointments.length > 0 ? displayedAppointments.map((appointment) => (
                                                    <tr key={appointment.id}>
                                                        <td data-label="Client">
                                                            {appointment.client_name}
                                                            {appointment.is_guest_placeholder ? (
                                                                <span style={{
                                                                    display: 'inline-block', marginLeft: '6px', padding: '1px 7px',
                                                                    fontSize: '0.65rem', fontWeight: '700', borderRadius: '20px',
                                                                    background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)',
                                                                    color: '#b45309', border: '1px solid #f59e0b44',
                                                                    verticalAlign: 'middle', letterSpacing: '0.02em'
                                                                }} title="This booking was made by an unregistered guest">GUEST</span>
                                                            ) : null}
                                                        </td>
                                                        <td data-label="Staff">{appointment.artist_name}</td>
                                                        <td data-label="Service">
                                                            <span className="badge-v2 pending admin-st-606efc58">
                                                                {appointment.service_type || 'Tattoo Session'}
                                                            </span>
                                                        </td>
                                                        <td data-label="Date" className="date-time-cell">
                                                            <div className="primary-date">{new Date(appointment.appointment_date).toLocaleDateString()}</div>
                                                            <div className="secondary-time">{formatTime12Hour(appointment.start_time)}</div>
                                                        </td>
                                                        <td data-label="Status">
                                                            <span className={`badge-v2 ${appointment.status.toLowerCase()}`}>
                                                                {formatStatus(appointment.status)}
                                                            </span>
                                                        </td>
                                                        <td data-label="Actions">
                                                            <div className="table-actions-v2">
                                                                {appointment.status === 'pending' && appointment.service_type?.toLowerCase() === 'consultation' && (
                                                                    <>
                                                                        <button className="icon-btn-v2 check" title="Approve consultation" onClick={() => handleStatusUpdate(appointment.id, 'confirmed', appointment)}>
                                                                            <CheckCircle size={16} />
                                                                        </button>
                                                                        <button className="icon-btn-v2 cross" title="Reject consultation" onClick={() => handleStatusUpdate(appointment.id, 'rejected', appointment)}>
                                                                            <AlertTriangle size={16} />
                                                                        </button>
                                                                    </>
                                                                )}
                                                                <button
                                                                    className="icon-btn-v2"
                                                                    title="Details"
                                                                    onClick={() => { setSelectedAppointment(appointment); setIsDetailModalOpen(true); }}
                                                                >
                                                                    <FileText size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan="6" className="no-data admin-st-3927920f">No appointments found</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="card-footer-v2 admin-st-700e3e2e">
                                        <button
                                            className="icon-btn-v2"
                                            disabled={appointmentPage === 1}
                                            onClick={() => setAppointmentPage(p => p - 1)}
                                        ><ChevronLeft size={16} /></button>
                                        <span className="admin-st-c949b242">{appointmentPage} / {Math.max(1, appointmentTotalPages)}</span>
                                        <button
                                            className="icon-btn-v2"
                                            disabled={appointmentPage >= appointmentTotalPages}
                                            onClick={() => setAppointmentPage(p => p + 1)}
                                        ><ChevronRight size={16} /></button>
                                    </div>
                                </div>
                            </div>

                            <div className="layout-column">
                                {/* Artist Status */}
                                <div className="glass-card">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <Palette size={20} />
                                            <h2>Artist Status</h2>
                                        </div>
                                    </div>
                                    <div className="artist-occupancy-list">
                                        {artistStatus.length > 0 ? artistStatus.map(artist => (
                                            <div key={artist.id} className="occupancy-item">
                                                <div className="occupancy-info">
                                                    <div className={`occupancy-dot ${artist.status.toLowerCase() === 'available' ? 'available' : 'booked'}`}></div>
                                                    <span className="artist-name-v2">{artist.name}</span>
                                                </div>
                                                <span className={`occupancy-tag ${artist.status.toLowerCase() === 'available' ? 'available' : 'booked'}`}>
                                                    {artist.status}
                                                </span>
                                            </div>
                                        )) : <p className="no-data">No artists found</p>}
                                    </div>
                                </div>

                                {/* System Alerts */}
                                <div className="glass-card">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <Bell size={20} />
                                            <h2>System Alerts</h2>
                                        </div>
                                        <button className="view-all-btn admin-st-d3ffc78c" onClick={() => navigate('/admin/notifications')}>View All</button>
                                    </div>
                                    <div className="alerts-stack">
                                        {alerts.length > 0 ? alerts.map(alert => (
                                            <div key={alert.id} className={`priority-alert-item ${alert.severity}`}>
                                                <div className="alert-content-v2">
                                                    <span className="alert-type-v2">{alert.type}</span>
                                                    <p>{alert.message}</p>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="all-clear">
                                                <CheckCircle size={32} />
                                                <p>All systems operational</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Today's Appointments */}
                                <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <Clock size={20} />
                                            <h2>Today's Schedule</h2>
                                        </div>
                                        <button className="view-all-btn admin-st-d3ffc78c" onClick={() => navigate('/admin/appointments')}>View All</button>
                                    </div>
                                    <div className="audit-stream" style={{ flex: 1 }}>
                                        {todaysAppointments.length > 0 ? todaysAppointments.map(apt => (
                                            <div key={apt.id} className="audit-entry">
                                                <div className="entry-marker"></div>
                                                <div className="entry-content">
                                                    <div className="entry-time">{formatTime12Hour(apt.start_time)}</div>
                                                    <div className="entry-desc">
                                                        <strong>{apt.artist_name}</strong> session with {apt.client_name || 'Walk-in'}
                                                        <span className={`badge-v2 ${apt.status}`} style={{ marginLeft: '10px', fontSize: '0.7em', padding: '2px 6px' }}>{formatStatus(apt.status)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )) : <p className="no-data admin-st-eb108882" style={{ border: 'none', padding: '20px 0' }}>No appointments for today.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── Admin Activity Feed ─── */}
                        <div className="glass-card" style={{ marginTop: '24px' }}>
                            <div className="card-header-v2" style={{ flexWrap: 'wrap', gap: '10px' }}>
                                <div className="header-title">
                                    <FileText size={20} />
                                    <h2>Activity Log</h2>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(190,144,85,0.25)' }}>
                                        <button
                                            onClick={() => { setAuditFilter('all'); setAuditPage(1); }}
                                            style={{
                                                padding: '5px 14px', fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                                                background: auditFilter === 'all' ? 'rgba(190,144,85,0.2)' : 'transparent',
                                                color: auditFilter === 'all' ? '#be9055' : '#94a3b8',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >All Activity</button>
                                        <button
                                            onClick={() => { setAuditFilter('admin'); setAuditPage(1); }}
                                            style={{
                                                padding: '5px 14px', fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                                                borderLeft: '1px solid rgba(190,144,85,0.25)',
                                                background: auditFilter === 'admin' ? 'rgba(190,144,85,0.2)' : 'transparent',
                                                color: auditFilter === 'admin' ? '#be9055' : '#94a3b8',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >Admin Only</button>
                                    </div>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                        <input
                                            type="text"
                                            placeholder="Search logs..."
                                            value={auditSearch}
                                            onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                                            style={{
                                                padding: '6px 10px 6px 30px', fontSize: '0.78rem', borderRadius: '8px',
                                                border: '1px solid rgba(190,144,85,0.2)', background: 'rgba(15,23,42,0.4)',
                                                color: '#e2e8f0', outline: 'none', width: '160px'
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="audit-stream" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                                {displayedLogs.length > 0 ? displayedLogs.map((log, idx) => (
                                    <div key={log.id || idx} className="audit-entry">
                                        <div className="entry-marker" style={{ background: log.user_type === 'admin' ? '#be9055' : log.user_type === 'manager' ? '#3b82f6' : '#64748b' }}></div>
                                        <div className="entry-content">
                                            <div className="entry-time" style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className="entry-desc">
                                                <strong style={{ color: '#be9055' }}>{log.user_name || 'System'}</strong>
                                                <span style={{ margin: '0 6px', color: '#475569' }}>|</span>
                                                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{(log.action || '').replace(/_/g, ' ')}</span>
                                            </div>
                                            {log.details && (
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                                    {log.details.length > 80 ? log.details.substring(0, 80) + '...' : log.details}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )) : (
                                    <p className="no-data" style={{ border: 'none', padding: '20px 0', textAlign: 'center', color: '#64748b' }}>
                                        {auditFilter === 'admin' ? 'No admin activity recorded yet.' : 'No activity logs found.'}
                                    </p>
                                )}
                            </div>
                            {auditTotalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '12px 0', borderTop: '1px solid rgba(190,144,85,0.1)' }}>
                                    <button
                                        onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                                        disabled={auditPage === 1}
                                        style={{ background: 'none', border: 'none', color: auditPage === 1 ? '#334155' : '#be9055', cursor: auditPage === 1 ? 'default' : 'pointer' }}
                                    ><ChevronLeft size={16} /></button>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{auditPage} / {auditTotalPages}</span>
                                    <button
                                        onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                                        disabled={auditPage === auditTotalPages}
                                        style={{ background: 'none', border: 'none', color: auditPage === auditTotalPages ? '#334155' : '#be9055', cursor: auditPage === auditTotalPages ? 'default' : 'pointer' }}
                                    ><ChevronRight size={16} /></button>
                                </div>
                            )}
                        </div>

                    </div>
                )}
            </div>

            {/* ═══════════════ ANALYTICS AUDIT MODAL (shared) ═══════════════ */}
            <AnalyticsAuditModal
                auditModal={auditModal}
                onClose={closeDashAuditModal}
                analytics={analyticsData}
                expenseList={expenseList}
                expenseLoading={expenseLoading}
                expenseForm={expenseForm}
                setExpenseForm={setExpenseForm}
                onAddExpense={handleAddExpenseDash}
                onDeleteExpense={handleDeleteExpenseDash}
                onEditExpense={handleEditExpenseDash}
                formatDuration={formatDuration}
                darkMode={false}
            />

            {/* Appointment Detail Modal */}
            {isDetailModalOpen && selectedAppointment && (
                <div className="modal-overlay open" onClick={() => setIsDetailModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="admin-flex-center admin-gap-15">
                                <div className="admin-st-c911153f">
                                    <Clock size={20} className="text-bronze" />
                                </div>
                                <div>
                                    <h2 className="admin-m-0">Session Intelligence</h2>
                                    <p className="admin-st-925e4e02">Appointment Ref: {getDisplayCode(selectedAppointment.booking_code || selectedAppointment.bookingCode, selectedAppointment.id)}</p>
                                </div>
                            </div>
                            <button className="close-btn" onClick={() => setIsDetailModalOpen(false)}>
                                <X size={24} />
                            </button>
                        </div>
                        <div className="modal-body admin-st-7cea880d">
                            <div className="admin-st-2f580e88">
                                <div className="detail-item admin-st-8edafd44">
                                    <span className="admin-st-2591d288">Client Entity</span>
                                    <span className="admin-st-c9f09bca">{selectedAppointment.client_name}</span>
                                </div>
                                <div className="detail-item admin-st-8edafd44">
                                    <span className="admin-st-2591d288">Assigned Professional</span>
                                    <span className="admin-st-c9f09bca">{selectedAppointment.artist_name}</span>
                                </div>
                                <div className="detail-item admin-st-8edafd44">
                                    <span className="admin-st-2591d288">Scheduled Date</span>
                                    <span className="admin-st-c9f09bca">{new Date(selectedAppointment.appointment_date).toLocaleDateString()}</span>
                                </div>
                                <div className="detail-item admin-st-8edafd44">
                                    <span className="admin-st-2591d288">Timeline (Start)</span>
                                    <span className="admin-st-c9f09bca">{formatTime12Hour(selectedAppointment.start_time)}</span>
                                </div>
                                <div className="detail-item admin-st-8edafd44">
                                    <span className="admin-st-2591d288">Status Lifecycle</span>
                                    <span className={`status-badge-v2 ${selectedAppointment.status.toLowerCase()}`}>
                                        {formatStatus(selectedAppointment.status)}
                                    </span>
                                </div>
                                <div className="detail-item admin-st-8edafd44">
                                    <span className="admin-st-2591d288">Service Protocol</span>
                                    <span className="admin-st-c9f09bca">{selectedAppointment.service_type || 'Tattoo Session'}</span>
                                </div>
                                {selectedAppointment.notes && (
                                    <div className="detail-item admin-st-bb130abb">
                                        <span className="admin-st-2591d288">Operational Memo / Notes</span>
                                        <span className="admin-st-9aa3b024">
                                            {selectedAppointment.notes}
                                        </span>
                                    </div>
                                )}
                                <div className="detail-item admin-st-0ce7012c">
                                    <span className="admin-st-2591d288">Valuation (Total)</span>
                                    <span className="admin-st-362525e0">₱{Number(selectedAppointment.price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="detail-item admin-st-1c711d5e">
                                    <span className="admin-st-e26908b3">Financial Clearance (Paid)</span>
                                    <span className="admin-st-da64dae6">
                                        ₱{Number(selectedAppointment.total_paid || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setIsDetailModalOpen(false)}>
                                Dismiss Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.open && (() => {
                const isApprove = confirmModal.type === 'approve';
                const closeModal = () => setConfirmModal({ open: false, type: 'approve', title: '', message: '', appointmentRef: '', onConfirm: null });
                return (
                    <div className="modal-overlay open" onClick={closeModal}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
                            <div className="modal-header" style={{ borderBottom: `2px solid ${isApprove ? '#10b981' : '#ef4444'}` }}>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {isApprove
                                        ? <CheckCircle size={20} color="#10b981" />
                                        : <AlertTriangle size={20} color="#ef4444" />}
                                    {confirmModal.title}
                                </h2>
                                <button className="close-btn" onClick={closeModal} aria-label="Close modal" title="Close">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="modal-body" style={{ padding: '28px 28px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Icon badge */}
                                <div style={{
                                    width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto',
                                    background: isApprove ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                    border: `2px solid ${isApprove ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {isApprove
                                        ? <CheckCircle size={30} color="#10b981" />
                                        : <AlertTriangle size={30} color="#ef4444" />}
                                </div>
                                {/* Description */}
                                <p style={{ margin: 0, textAlign: 'center', color: '#475569', fontSize: '0.95rem', lineHeight: '1.6' }}>
                                    {confirmModal.message}
                                </p>
                                {/* Appointment reference chip */}
                                {confirmModal.appointmentRef && (
                                    <div style={{
                                        padding: '10px 16px', borderRadius: '10px', textAlign: 'center',
                                        background: isApprove ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                                        border: `1px solid ${isApprove ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                        fontSize: '0.85rem', fontWeight: 600,
                                        color: isApprove ? '#065f46' : '#991b1b'
                                    }}>
                                        {confirmModal.appointmentRef}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer" style={{ padding: '16px 28px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={closeModal}
                                    title="Cancel and go back"
                                >
                                    Cancel
                                </button>
                                <button
                                    className="btn"
                                    style={{
                                        background: isApprove ? '#10b981' : '#ef4444',
                                        color: '#fff',
                                        border: 'none',
                                        fontWeight: 700
                                    }}
                                    onClick={() => {
                                        confirmModal.onConfirm?.();
                                        closeModal();
                                    }}
                                    title={isApprove ? 'Confirm approval' : 'Confirm rejection'}
                                >
                                    {isApprove ? 'Yes, Approve' : 'Yes, Reject'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

export default AdminDashboard;
