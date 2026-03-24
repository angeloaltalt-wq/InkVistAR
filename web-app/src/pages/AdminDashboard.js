import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, DollarSign, Palette, Settings, Package, BarChart3, AlertTriangle, Bell, Clock, CheckCircle, FileText, Search, ChevronLeft, ChevronRight } from 'lucide-react';
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
    const filteredAppointments = appointments.filter(apt =>
        (apt.client_name || '').toLowerCase().includes(appointmentSearch.toLowerCase()) ||
        (apt.artist_name || '').toLowerCase().includes(appointmentSearch.toLowerCase())
    );
    const appointmentTotalPages = Math.ceil(filteredAppointments.length / appointmentsPerPage);
    const displayedAppointments = filteredAppointments.slice((appointmentPage - 1) * appointmentsPerPage, appointmentPage * appointmentsPerPage);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page admin-dashboard page-container-enter">
                <header className="dashboard-header">
                    <h1>Admin Dashboard</h1>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
                </header>

                {loading ? (
                    <div className="dashboard-loading" style={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: '#6b7280' }}>
                        Loading dashboard...
                    </div>
                ) : (
                    <div className="dashboard-content">
                        {/* Stats Grid */}
                        <div className="stats-grid">
                            <div className="stat-card">
                                <div className="stat-icon users">
                                    <Users className="icon" size={32} />
                                </div>
                                <div className="stat-info">
                                    <p className="stat-label">Total Users</p>
                                    <p className="stat-value">{stats.totalUsers}</p>
                                </div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-icon appointments">
                                    <Calendar className="icon" size={32} />
                                </div>
                                <div className="stat-info">
                                    <p className="stat-label">Total Appointments</p>
                                    <p className="stat-value">{stats.totalAppointments}</p>
                                </div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-icon revenue">
                                    <DollarSign className="icon" size={32} />
                                </div>
                                <div className="stat-info">
                                    <p className="stat-label">Revenue (Month)</p>
                                    <p className="stat-value">₱{revenueData.monthly.toLocaleString()}</p>
                                    <small style={{ color: '#10b981', fontSize: '0.8rem' }}>
                                        +₱{revenueData.daily.toLocaleString()} today
                                    </small>
                                </div>
                            </div>

                            <div className="stat-card">
                                <div className="stat-icon artists">
                                    <Palette className="icon" size={32} />
                                </div>
                                <div className="stat-info">
                                    <p className="stat-label">Active Artists</p>
                                    <p className="stat-value">{stats.activeArtists}</p>
                                </div>
                            </div>
                        </div>

                        <div className="dashboard-grid-row">
                            {/* Weekly Activity Chart */}
                            <div className="data-card chart-card">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                                    <BarChart3 size={20} />
                                    <h2 style={{ margin: 0 }}>Weekly Appointments</h2>
                                </div>
                                <div className="chart-container">
                                    {chartData.map((item, index) => (
                                        <div key={index} className="chart-bar-group">
                                            <div className="chart-bar-wrapper">
                                                <div 
                                                    className="chart-bar" 
                                                    style={{ height: `${Math.min(item.count * 15, 100)}%` }}
                                                    title={`${item.count} appointments`}
                                                ></div>
                                            </div>
                                            <span className="chart-label">{item.day}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Artist Availability */}
                            <div className="data-card">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                                    <Palette size={20} />
                                    <h2 style={{ margin: 0 }}>Artist Status (Today)</h2>
                                </div>
                                <div className="artist-status-list">
                                    {artistStatus.length > 0 ? artistStatus.map(artist => (
                                        <div key={artist.id} className="artist-status-item">
                                            <span className="artist-name">{artist.name}</span>
                                            <span className={`status-badge ${artist.status.toLowerCase() === 'available' ? 'completed' : 'scheduled'}`}>
                                                {artist.status}
                                            </span>
                                        </div>
                                    )) : <p className="no-data">No artists found</p>}
                                </div>
                            </div>
                        </div>

                        <div className="dashboard-grid-row">
                            {/* Today's Appointments */}
                            <div className="data-card">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                                    <Clock size={20} />
                                    <h2 style={{ margin: 0 }}>Today's Schedule</h2>
                                </div>
                                <div className="table-responsive">
                                    {todaysAppointments.length > 0 ? (
                                        <table className="admin-table">
                                            <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>Client</th>
                                                    <th>Artist</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {todaysAppointments.map(apt => (
                                                    <tr key={apt.id}>
                                                        <td>{apt.start_time}</td>
                                                        <td>{apt.client_name || 'Unknown'}</td>
                                                        <td>{apt.artist_name}</td>
                                                        <td><span className={`status-badge ${apt.status}`}>{apt.status}</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : <p className="no-data">No appointments for today.</p>}
                                </div>
                            </div>

                            {/* Alerts Section */}
                            <div className="data-card">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                                    <Bell size={20} />
                                    <h2 style={{ margin: 0 }}>System Alerts</h2>
                                </div>
                                <div className="alerts-list">
                                    {alerts.length > 0 ? alerts.map(alert => (
                                        <div key={alert.id} className={`alert-item ${alert.severity}`}>
                                            <AlertTriangle size={16} />
                                            <span>{alert.message}</span>
                                        </div>
                                    )) : (
                                        <p className="no-data">No new alerts.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Appointments Overview */}
                        <div className="data-card">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h2 style={{ margin: 0 }}>Appointments Overview</h2>
                                <div style={{ position: 'relative', maxWidth: '200px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                    <input
                                        type="text"
                                        placeholder="Search appointments..."
                                        value={appointmentSearch}
                                        onChange={(e) => { setAppointmentSearch(e.target.value); setAppointmentPage(1); }}
                                        style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '0.9rem' }}
                                    />
                                </div>
                            </div>
                            <div className="table-responsive">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Client Name</th>
                                            <th>Artist</th>
                                            <th>Date</th>
                                            <th>Time</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayedAppointments.length > 0 ? displayedAppointments.map((appointment) => (
                                            <tr key={appointment.id}>
                                                <td>{appointment.client_name}</td>
                                                <td>{appointment.artist_name}</td>
                                                <td>{new Date(appointment.appointment_date).toLocaleDateString()}</td>
                                                <td>{appointment.start_time}</td>
                                                <td>
                                                    <span className={`status-badge ${appointment.status.toLowerCase()}`}>
                                                        {appointment.status}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="actions-cell">
                                                        {appointment.status === 'pending' && (
                                                            <>
                                                                <button className="action-btn approve-btn" onClick={() => handleStatusUpdate(appointment.id, 'confirmed')}>Approve</button>
                                                                <button className="action-btn reject-btn" onClick={() => handleStatusUpdate(appointment.id, 'cancelled')}>Reject</button>
                                                            </>
                                                        )}
                                                        <button className="action-btn details-btn">Details</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="6" className="no-data" style={{textAlign: 'center', padding: '1rem'}}>No appointments found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {appointmentTotalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '1rem', gap: '10px' }}>
                                    <button
                                        className="btn btn-secondary"
                                        disabled={appointmentPage === 1}
                                        onClick={() => setAppointmentPage(p => p - 1)}
                                        style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}
                                    ><ChevronLeft size={16} /></button>
                                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Page {appointmentPage} of {appointmentTotalPages}</span>
                                    <button
                                        className="btn btn-secondary"
                                        disabled={appointmentPage === appointmentTotalPages}
                                        onClick={() => setAppointmentPage(p => p + 1)}
                                        style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}
                                    ><ChevronRight size={16} /></button>
                                </div>
                            )}
                        </div>

                        {/* System Audit Logs */}
                        <div className="data-card">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <FileText size={20} />
                                    <h2 style={{ margin: 0 }}>System Audit Logs</h2>
                                </div>
                                <div style={{ position: 'relative', maxWidth: '200px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                    <input 
                                        type="text" 
                                        placeholder="Search logs..." 
                                        value={auditSearch}
                                        onChange={(e) => { setAuditSearch(e.target.value); setAuditPage(1); }}
                                        style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '0.9rem' }}
                                    />
                                </div>
                            </div>
                            <div className="table-responsive">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>User</th>
                                            <th>Action</th>
                                            <th>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayedLogs.length > 0 ? displayedLogs.map((log) => (
                                            <tr key={log.id}>
                                                <td>{new Date(log.created_at).toLocaleString()}</td>
                                                <td>
                                                    <div style={{fontWeight: '500'}}>{log.user_name || 'System'}</div>
                                                    <div style={{fontSize: '0.8rem', color: '#64748b'}}>{log.user_email}</div>
                                                </td>
                                                <td><span className="status-badge scheduled" style={{fontSize: '0.75rem'}}>{log.action}</span></td>
                                                <td>
                                                    <div>{log.details}</div>
                                                    {log.ip_address && <div style={{fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px'}}>IP: {log.ip_address}</div>}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="4" className="no-data" style={{textAlign: 'center', padding: '1rem'}}>No logs found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            
                            {auditTotalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '1rem', gap: '10px' }}>
                                    <button
                                        className="btn btn-secondary"
                                        disabled={auditPage === 1}
                                        onClick={() => setAuditPage(p => p - 1)}
                                        style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}
                                    ><ChevronLeft size={16} /></button>
                                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Page {auditPage} of {auditTotalPages}</span>
                                    <button
                                        className="btn btn-secondary"
                                        disabled={auditPage === auditTotalPages}
                                        onClick={() => setAuditPage(p => p + 1)}
                                        style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}
                                    ><ChevronRight size={16} /></button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AdminDashboard;
