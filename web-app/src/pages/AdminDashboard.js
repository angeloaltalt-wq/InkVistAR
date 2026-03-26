import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, DollarSign, Palette, Settings, Package, BarChart3, AlertTriangle, Bell, Clock, CheckCircle, FileText, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import './AdminDashboard.css';
import AdminSideNav from '../components/AdminSideNav';
import { API_URL } from '../config';

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
    
    // Audit Logs State
    const [auditSearch, setAuditSearch] = useState('');
    const [auditPage, setAuditPage] = useState(1);
    const itemsPerPage = 5;

    // Appointments Pagination State
    const [appointmentSearch, setAppointmentSearch] = useState('');
    const [appointmentFilter, setAppointmentFilter] = useState('upcoming'); // 'upcoming', 'latest', 'all'
    const [appointmentPage, setAppointmentPage] = useState(1);
    const appointmentsPerPage = 10;
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ open: false, message: '', onConfirm: null });

    const navigate = useNavigate();

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const [usersResponse, appointmentsResponse, logsResponse, inventoryResponse, notificationsResponse] = await Promise.all([
                Axios.get(`${API_URL}/api/debug/users`),
                Axios.get(`${API_URL}/api/admin/appointments`),
                Axios.get(`${API_URL}/api/admin/audit-logs`),
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
                const todayStr = now.toISOString().split('T')[0];
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();

                let dailyRev = 0;
                let monthlyRev = 0;
                let totalRev = 0;
                
                // Chart Data Prep (Last 7 Days)
                const last7Days = {};
                for(let i=6; i>=0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    last7Days[d.toISOString().split('T')[0]] = 0;
                }

                appointments.forEach(apt => {
                    // Normalize date
                    let aptDateStr = typeof apt.appointment_date === 'string' 
                        ? apt.appointment_date.split('T')[0] 
                        : new Date(apt.appointment_date).toISOString().split('T')[0];

                    // Chart Counting
                    if (last7Days.hasOwnProperty(aptDateStr)) {
                        last7Days[aptDateStr]++;
                    }

                    // Revenue Calculation
                    if (apt.status === 'completed') {
                        const price = Number(apt.hourly_rate) || 150; // Fallback price
                        totalRev += price;
                        if (aptDateStr === todayStr) dailyRev += price;
                        const aptDate = new Date(aptDateStr);
                        if (aptDate.getMonth() === currentMonth && aptDate.getFullYear() === currentYear) {
                            monthlyRev += price;
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
                    let d = typeof apt.appointment_date === 'string' ? apt.appointment_date : new Date(apt.appointment_date).toISOString();
                    return d.startsWith(todayStr) && apt.status !== 'cancelled';
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
                        type: 'staff',
                        message: `You have ${pendingAppointments.length} pending appointment requests.`,
                        severity: 'medium'
                    });
                }

                setAlerts(generatedAlerts);
            }

            if (logsResponse && logsResponse.data.success) {
                setAuditLogs(logsResponse.data.data);
            }

            if (notificationsResponse.data.success) {
                setUnreadNotifications(notificationsResponse.data.unreadCount);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            setLoading(false);
        }
    };

    const showConfirm = (message, onConfirm) => {
        setConfirmModal({ open: true, message, onConfirm });
    };

    const handleStatusUpdate = async (id, status) => {
        showConfirm(
            `Are you sure you want to mark this appointment as "${status}"?`,
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
        navigate('/admin/dashboard');
    };

    const handleNavigate = (path) => {
        navigate(path);
    };

    // Filter and paginate logs
    const filteredLogs = auditLogs.filter(log =>
        (log.user_name || 'System').toLowerCase().includes(auditSearch.toLowerCase()) ||
        (log.action || '').toLowerCase().includes(auditSearch.toLowerCase()) ||
        (log.details || '').toLowerCase().includes(auditSearch.toLowerCase())
    );
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
                <header className="dashboard-top-nav">
                    <div className="top-nav-left">
                        <h1>Admin Dashboard</h1>
                        <p className="subtitle">System Overview & Management</p>
                    </div>
                    <div className="top-nav-right">
                        <div className="header-search">
                            <Search size={18} />
                            <input type="text" placeholder="Search things..." />
                        </div>
                        <div className="notification-bell" style={{ position: 'relative', cursor: 'pointer' }} onClick={() => navigate('/admin/notifications')}>
                            <Bell size={20} />
                            {unreadNotifications > 0 && (
                                <div 
                                    className="notification-dot" 
                                    style={{ 
                                        position: 'absolute', 
                                        top: '-5px', 
                                        right: '-5px', 
                                        background: '#ef4444', 
                                        color: 'white', 
                                        borderRadius: '50%', 
                                        width: '18px', 
                                        height: '18px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        fontSize: '10px', 
                                        fontWeight: 'bold',
                                        border: '2px solid white'
                                    }}
                                >
                                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                                </div>
                            )}
                        </div>
                        <button onClick={handleLogout} className="logout-btn">Logout</button>
                    </div>
                </header>

                {loading ? (
                    <div className="dashboard-loader-container">
                        <div className="premium-loader"></div>
                        <p>Loading premium dashboard...</p>
                    </div>
                ) : (
                    <div className="dashboard-content">
                        {/* Stats Section */}
                        <div className="stats-section">
                            <div className="stat-card-v2 glass-card">
                                <div className="stat-icon-wrapper blue">
                                    <Users size={24} />
                                </div>
                                <div className="stat-info-v2">
                                    <span className="stat-label-v2">Total Users</span>
                                    <h3 className="stat-value-v2">{stats.totalUsers}</h3>
                                    <div className="stat-trend-v2">Platform Wide</div>
                                </div>
                            </div>

                            <div className="stat-card-v2 glass-card">
                                <div className="stat-icon-wrapper purple">
                                    <Calendar size={24} />
                                </div>
                                <div className="stat-info-v2">
                                    <span className="stat-label-v2">Total Appointments</span>
                                    <h3 className="stat-value-v2">{stats.totalAppointments}</h3>
                                    <div className="stat-trend-v2">All Time</div>
                                </div>
                            </div>

                            <div className="stat-card-v2 glass-card">
                                <div className="stat-icon-wrapper green">
                                    <DollarSign size={24} />
                                </div>
                                <div className="stat-info-v2">
                                    <span className="stat-label-v2">Revenue (Month)</span>
                                    <h3 className="stat-value-v2">₱{revenueData.monthly.toLocaleString()}</h3>
                                    <div className="stat-trend-v2">
                                        +₱{revenueData.daily.toLocaleString()} today
                                    </div>
                                </div>
                            </div>

                            <div className="stat-card-v2 glass-card">
                                <div className="stat-icon-wrapper orange">
                                    <Palette size={24} />
                                </div>
                                <div className="stat-info-v2">
                                    <span className="stat-label-v2">Active Artists</span>
                                    <h3 className="stat-value-v2">{stats.activeArtists}</h3>
                                    <div className="stat-trend-v2">Studio Staff</div>
                                </div>
                            </div>
                        </div>

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

                                {/* Today's Appointments */}
                                <div className="glass-card">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <Clock size={20} />
                                            <h2>Today's Schedule</h2>
                                        </div>
                                    </div>
                                    <div className="modern-table-wrapper">
                                        {todaysAppointments.length > 0 ? (
                                            <table className="premium-table">
                                                <thead>
                                                    <tr>
                                                        <th>Time</th>
                                                        <th>Client</th>
                                                        <th>Artist</th>
                                                        <th>Service</th>
                                                        <th>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {todaysAppointments.map(apt => (
                                                        <tr key={apt.id}>
                                                            <td className="date-time-cell">
                                                                <span className="primary-date">{apt.start_time}</span>
                                                            </td>
                                                            <td>{apt.client_name || 'Unknown'}</td>
                                                            <td>{apt.artist_name}</td>
                                                            <td>
                                                                <span className="badge-v2 pending" style={{ fontSize: '0.72rem' }}>
                                                                    {apt.service_type || 'Tattoo Session'}
                                                                </span>
                                                            </td>
                                                            <td><span className={`badge-v2 ${apt.status}`}>{apt.status}</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : <p className="no-data" style={{padding: '2rem', textAlign: 'center'}}>No appointments for today.</p>}
                                    </div>
                                </div>

                                {/* Appointments Overview */}
                                <div className="glass-card">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <Calendar size={20} />
                                            <h2>Appointments Overview</h2>
                                        </div>
                                        <div className="card-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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
                                            <div className="header-search" style={{ height: '36px', width: '200px' }}>
                                                <Search size={14} />
                                                <input
                                                    type="text"
                                                    placeholder="Search..."
                                                    value={appointmentSearch}
                                                    onChange={(e) => { setAppointmentSearch(e.target.value); setAppointmentPage(1); }}
                                                    style={{ fontSize: '0.8rem' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="modern-table-wrapper">
                                        <table className="premium-table">
                                            <thead>
                                                <tr>
                                                    <th>Client</th>
                                                    <th>Artist</th>
                                                    <th>Service</th>
                                                    <th>Date</th>
                                                    <th>Status</th>
                                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {displayedAppointments.length > 0 ? displayedAppointments.map((appointment) => (
                                                    <tr key={appointment.id}>
                                                        <td>{appointment.client_name}</td>
                                                        <td>{appointment.artist_name}</td>
                                                        <td>
                                                            <span className="badge-v2 pending" style={{ fontSize: '0.72rem' }}>
                                                                {appointment.service_type || 'Tattoo Session'}
                                                            </span>
                                                        </td>
                                                        <td className="date-time-cell">
                                                            <div className="primary-date">{new Date(appointment.appointment_date).toLocaleDateString()}</div>
                                                            <div className="secondary-time">{appointment.start_time}</div>
                                                        </td>
                                                        <td>
                                                            <span className={`badge-v2 ${appointment.status.toLowerCase()}`}>
                                                                {appointment.status}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="table-actions-v2">
                                                                {appointment.status === 'pending' && appointment.service_type?.toLowerCase() === 'consultation' && (
                                                                    <>
                                                                        <button className="icon-btn-v2 check" title="Approve" onClick={() => handleStatusUpdate(appointment.id, 'confirmed')}>
                                                                            <CheckCircle size={16} />
                                                                        </button>
                                                                        <button className="icon-btn-v2 cross" title="Reject" onClick={() => handleStatusUpdate(appointment.id, 'cancelled')}>
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
                                                    <tr><td colSpan="6" className="no-data" style={{textAlign: 'center', padding: '2rem'}}>No appointments found</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {appointmentTotalPages > 1 && (
                                        <div className="card-footer-v2" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem', gap: '10px', alignItems: 'center' }}>
                                            <button
                                                className="icon-btn-v2"
                                                disabled={appointmentPage === 1}
                                                onClick={() => setAppointmentPage(p => p - 1)}
                                            ><ChevronLeft size={16} /></button>
                                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{appointmentPage} / {appointmentTotalPages}</span>
                                            <button
                                                className="icon-btn-v2"
                                                disabled={appointmentPage === appointmentTotalPages}
                                                onClick={() => setAppointmentPage(p => p + 1)}
                                            ><ChevronRight size={16} /></button>
                                        </div>
                                    )}
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
                                            <h2>Priority Alerts</h2>
                                        </div>
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

                                {/* System Audit Logs */}
                                <div className="glass-card">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <FileText size={20} />
                                            <h2>Audit Stream</h2>
                                        </div>
                                    </div>
                                    <div className="audit-stream">
                                        {displayedLogs.map((log) => (
                                            <div key={log.id} className="audit-entry">
                                                <div className="entry-marker"></div>
                                                <div className="entry-content">
                                                    <div className="entry-time">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                    <div className="entry-desc">
                                                        <strong>{log.user_name || 'System'}</strong> {log.action.toLowerCase()}: {log.details}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="full-logs-btn" onClick={() => navigate('/admin/logs')}>
                                        View Full Audit Trail
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Appointment Detail Modal */}
            {isDetailModalOpen && selectedAppointment && (
                <div className="dashboard-modal-overlay" onClick={() => setIsDetailModalOpen(false)}>
                    <div className="dashboard-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal-header">
                            <h2>Appointment Details</h2>
                            <button className="modal-close-btn" onClick={() => setIsDetailModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="dashboard-modal-body">
                            <div className="detail-grid">
                                <div className="detail-item">
                                    <span className="detail-label">Client Name</span>
                                    <span className="detail-value">{selectedAppointment.client_name}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Artist Name</span>
                                    <span className="detail-value">{selectedAppointment.artist_name}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Date</span>
                                    <span className="detail-value">{new Date(selectedAppointment.appointment_date).toLocaleDateString()}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Start Time</span>
                                    <span className="detail-value">{selectedAppointment.start_time}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Status</span>
                                    <span className={`detail-value badge-v2 ${selectedAppointment.status.toLowerCase()}`}>
                                        {selectedAppointment.status}
                                    </span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Service Type</span>
                                    <span className="detail-value">{selectedAppointment.service_type || 'Tattoo Session'}</span>
                                </div>
                                {selectedAppointment.notes && (
                                    <div className="detail-item" style={{ gridColumn: 'span 2' }}>
                                        <span className="detail-label">Client Notes</span>
                                        <span className="detail-value" style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                                            {selectedAppointment.notes}
                                        </span>
                                    </div>
                                )}
                                <div className="detail-item">
                                    <span className="detail-label">Total Price</span>
                                    <span className="detail-value">₱{Number(selectedAppointment.price || 0).toLocaleString()}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Paid Amount</span>
                                    <span className="detail-value" style={{ color: '#10b981' }}>
                                        ₱{Number(selectedAppointment.total_paid || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="dashboard-modal-footer">
                            <button className="logout-btn" onClick={() => setIsDetailModalOpen(false)} style={{ background: '#f1f5f9', color: '#64748b' }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.open && (
                <div className="dashboard-modal-overlay" onClick={() => setConfirmModal({ open: false, message: '', onConfirm: null })}>
                    <div className="dashboard-modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                        <div className="dashboard-modal-header">
                            <h2 style={{ fontSize: '1.1rem' }}>Confirm Action</h2>
                            <button className="modal-close-btn" onClick={() => setConfirmModal({ open: false, message: '', onConfirm: null })}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="dashboard-modal-body" style={{ padding: '1.5rem 2rem' }}>
                            <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>{confirmModal.message}</p>
                        </div>
                        <div className="dashboard-modal-footer" style={{ gap: '0.75rem' }}>
                            <button
                                className="logout-btn"
                                style={{ background: '#f1f5f9', color: '#64748b' }}
                                onClick={() => setConfirmModal({ open: false, message: '', onConfirm: null })}
                            >
                                Cancel
                            </button>
                            <button
                                className="logout-btn"
                                style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white' }}
                                onClick={() => {
                                    confirmModal.onConfirm?.();
                                    setConfirmModal({ open: false, message: '', onConfirm: null });
                                }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
