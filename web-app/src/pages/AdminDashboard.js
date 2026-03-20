import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
    Users, 
    Calendar, 
    DollarSign, 
    Palette, 
    Settings, 
    Package, 
    BarChart3, 
    AlertTriangle, 
    Bell, 
    Clock, 
    CheckCircle, 
    FileText, 
    Search, 
    ChevronLeft, 
    ChevronRight,
    TrendingUp,
    ArrowUpRight,
    Activity,
    CalendarDays
} from 'lucide-react';
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
    
    // Audit Logs State
    const [auditSearch, setAuditSearch] = useState('');
    const [auditPage, setAuditPage] = useState(1);
    const itemsPerPage = 5;

    // Appointments Pagination State
    const [appointmentSearch, setAppointmentSearch] = useState('');
    const [appointmentPage, setAppointmentPage] = useState(1);
    const appointmentsPerPage = 10;

    const navigate = useNavigate();

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const [usersResponse, appointmentsResponse, logsResponse, inventoryResponse] = await Promise.all([
                Axios.get(`${API_URL}/api/debug/users`),
                Axios.get(`${API_URL}/api/admin/appointments`),
                Axios.get(`${API_URL}/api/admin/audit-logs`),
                Axios.get(`${API_URL}/api/admin/inventory?status=active`)
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
                    count: last7Days[date],
                    fullDate: date
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

                // 2. Pending Appointments Alert
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
            setLoading(false);
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (id, status) => {
        if (!window.confirm(`Are you sure you want to ${status} this appointment?`)) return;
        try {
            await Axios.put(`${API_URL}/api/appointments/${id}/status`, { status });
            fetchDashboardData();
        } catch (error) {
            alert('Failed to update status.');
            console.error(error);
        }
    };

    const handleLogout = () => {
        navigate('/admin/dashboard');
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
    const filteredAppointments = appointments.filter(apt =>
        (apt.client_name || '').toLowerCase().includes(appointmentSearch.toLowerCase()) ||
        (apt.artist_name || '').toLowerCase().includes(appointmentSearch.toLowerCase())
    );
    const appointmentTotalPages = Math.ceil(filteredAppointments.length / appointmentsPerPage);
    const displayedAppointments = filteredAppointments.slice((appointmentPage - 1) * appointmentsPerPage, appointmentPage * appointmentsPerPage);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page admin-dashboard-container">
                <header className="dashboard-top-nav">
                    <div className="top-nav-left">
                        <h1>Dashboard Overview</h1>
                        <p className="subtitle">Welcome back, Administrator</p>
                    </div>
                    <div className="top-nav-right">
                        <div className="header-search">
                            <Search size={18} />
                            <input type="text" placeholder="Search anything..." />
                        </div>
                        <button className="notification-bell">
                            <Bell size={20} />
                            {alerts.length > 0 && <span className="notification-dot" />}
                        </button>
                        <button onClick={handleLogout} className="top-logout-btn">
                            Logout
                        </button>
                    </div>
                </header>

                {loading ? (
                    <div className="dashboard-loader-container">
                        <div className="premium-loader"></div>
                        <p>Synchronizing Real-time Data...</p>
                    </div>
                ) : (
                    <main className="dashboard-main-content">
                        {/* Summary Cards */}
                        <section className="stats-section">
                            {[
                                { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'blue', trend: '+12%' },
                                { label: 'Appointments', value: stats.totalAppointments, icon: CalendarDays, color: 'purple', trend: '+8%' },
                                { label: 'Monthly Revenue', value: `₱${revenueData.monthly.toLocaleString()}`, icon: DollarSign, color: 'green', trend: `+₱${revenueData.daily.toLocaleString()} Today` },
                                { label: 'Active Artists', value: stats.activeArtists, icon: Palette, color: 'orange', trend: 'Stable' }
                            ].map((stat, i) => (
                                <div key={i} className="glass-card stat-card-v2">
                                    <div className={`stat-icon-wrapper ${stat.color}`}>
                                        <stat.icon size={24} />
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-label-v2">{stat.label}</span>
                                        <h2 className="stat-value-v2">{stat.value}</h2>
                                        <div className="stat-trend-v2">
                                            <TrendingUp size={14} />
                                            <span>{stat.trend}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </section>

                        <div className="dashboard-layout-grid">
                            {/* Analytics & Activity */}
                            <section className="layout-column main-column">
                                <div className="glass-card chart-container-v2">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <Activity size={20} />
                                            <h2>Weekly Appointment Trends</h2>
                                        </div>
                                        <button className="view-more-btn">
                                            View Detailed Analytics <ArrowUpRight size={16} />
                                        </button>
                                    </div>
                                    <div className="premium-chart">
                                        {chartData.map((item, index) => (
                                            <div key={index} className="modern-bar-group">
                                                <div className="bar-rail">
                                                    <div 
                                                        className="bar-fill" 
                                                        style={{ height: `${Math.min(item.count * 15, 100)}%` }}
                                                        data-value={item.count}
                                                    >
                                                        <span className="bar-tooltip">{item.count}</span>
                                                    </div>
                                                </div>
                                                <span className="bar-label">{item.day}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="glass-card table-card-v2">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <CalendarDays size={20} />
                                            <h2>Upcoming Appointments</h2>
                                        </div>
                                        <div className="card-actions">
                                            <div className="search-box-v2">
                                                <Search size={16} />
                                                <input 
                                                    type="text" 
                                                    placeholder="Filter by name..." 
                                                    value={appointmentSearch}
                                                    onChange={(e) => { setAppointmentSearch(e.target.value); setAppointmentPage(1); }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="modern-table-wrapper">
                                        <table className="premium-table">
                                            <thead>
                                                <tr>
                                                    <th>Client Details</th>
                                                    <th>Assigned Artist</th>
                                                    <th>Schedule</th>
                                                    <th>Status</th>
                                                    <th style={{ textAlign: 'right' }}>Management</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {displayedAppointments.length > 0 ? displayedAppointments.map((appointment) => (
                                                    <tr key={appointment.id}>
                                                        <td>
                                                            <div className="client-cell">
                                                                <div className="avatar-placeholder">{appointment.client_name?.charAt(0) || 'U'}</div>
                                                                <span>{appointment.client_name}</span>
                                                            </div>
                                                        </td>
                                                        <td>{appointment.artist_name}</td>
                                                        <td>
                                                            <div className="date-time-cell">
                                                                <div className="primary-date">{new Date(appointment.appointment_date).toLocaleDateString()}</div>
                                                                <div className="secondary-time">{appointment.start_time}</div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={`badge-v2 ${appointment.status.toLowerCase()}`}>
                                                                {appointment.status}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="table-actions-v2">
                                                                {appointment.status === 'pending' && (
                                                                    <>
                                                                        <button className="icon-btn-v2 check" onClick={() => handleStatusUpdate(appointment.id, 'confirmed')} title="Approve"><CheckCircle size={18} /></button>
                                                                        <button className="icon-btn-v2 cross" onClick={() => handleStatusUpdate(appointment.id, 'cancelled')} title="Reject"><AlertTriangle size={18} /></button>
                                                                    </>
                                                                )}
                                                                <button className="icon-btn-v2 info" title="Details"><Activity size={18} /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan="5" className="empty-state">No matching appointments discovered</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    {appointmentTotalPages > 1 && (
                                        <div className="pagination-v2">
                                            <button disabled={appointmentPage === 1} onClick={() => setAppointmentPage(p => p - 1)}><ChevronLeft size={18} /></button>
                                            <span>{appointmentPage} / {appointmentTotalPages}</span>
                                            <button disabled={appointmentPage === appointmentTotalPages} onClick={() => setAppointmentPage(p => p + 1)}><ChevronRight size={18} /></button>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Sidebar Column */}
                            <section className="layout-column side-column">
                                <div className="glass-card artist-status-card">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <Palette size={18} />
                                            <h2>Artist Occupancy</h2>
                                        </div>
                                    </div>
                                    <div className="artist-occupancy-list">
                                        {artistStatus.length > 0 ? artistStatus.map(artist => (
                                            <div key={artist.id} className="occupancy-item">
                                                <div className="occupancy-info">
                                                    <span className="artist-name-v2">{artist.name}</span>
                                                    <span className={`occupancy-dot ${artist.status.toLowerCase()}`}></span>
                                                </div>
                                                <span className={`occupancy-tag ${artist.status.toLowerCase()}`}>{artist.status}</span>
                                            </div>
                                        )) : <p className="no-data">No data available</p>}
                                    </div>
                                </div>

                                <div className="glass-card alerts-card-v2">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <AlertTriangle size={18} />
                                            <h2>Priority Alerts</h2>
                                        </div>
                                    </div>
                                    <div className="alerts-stack">
                                        {alerts.length > 0 ? alerts.map(alert => (
                                            <div key={alert.id} className={`priority-alert-item ${alert.severity}`}>
                                                <div className="alert-content-v2">
                                                    <p>{alert.message}</p>
                                                    <span className="alert-type-v2">{alert.type} notification</span>
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

                                <div className="glass-card logs-preview-card">
                                    <div className="card-header-v2">
                                        <div className="header-title">
                                            <FileText size={18} />
                                            <h2>Audit Stream</h2>
                                        </div>
                                    </div>
                                    <div className="audit-stream">
                                        {displayedLogs.map(log => (
                                            <div key={log.id} className="audit-entry">
                                                <div className="entry-marker"></div>
                                                <div className="entry-content">
                                                    <div className="entry-time">{new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                                    <div className="entry-desc">
                                                        <strong>{log.user_name || 'System'}</strong> {log.action}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="full-logs-btn" onClick={() => navigate('/admin/analytics')}>
                                        View All Audit Logs
                                    </button>
                                </div>
                            </section>
                        </div>
                    </main>
                )}
            </div>
        </div>
    );
}

export default AdminDashboard;
