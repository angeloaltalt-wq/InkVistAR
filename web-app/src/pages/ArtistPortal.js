import React, { useState, useEffect, useRef } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Calendar, DollarSign, Users, BarChart3, Clock, LogOut, Bell, CheckCircle, AlertCircle } from 'lucide-react';
import './PortalStyles.css';
import ArtistSideNav from '../components/ArtistSideNav';
import { API_URL } from '../config';

function ArtistPortal() {
    const navigate = useNavigate();
    const [artist, setArtist] = useState({
        name: '',
        rating: 0,
        earnings: 0,
        appointments: 0,
        hourly_rate: 0
    });
    const [appointments, setAppointments] = useState([]);
    const [todaysAppointments, setTodaysAppointments] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);
    const notifRef = useRef(null);

    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    useEffect(() => {
        fetchArtistData();
        fetchNotifications();
    }, [artistId]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (notifRef.current && !notifRef.current.contains(event.target)) {
                setShowNotifDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchNotifications = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/notifications/${artistId}`);
            if (res.data.success) {
                const sortedNotifs = res.data.notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                setNotifications(sortedNotifs.slice(0, 5));
                setUnreadCount(sortedNotifs.filter(n => !n.is_read).length);
            }
        } catch (error) {
            console.error("Error fetching notifications:", error);
        }
    };

    const fetchArtistData = async () => {
        try {
            setLoading(true);
            // Fetch artist dashboard data
            const dashboardResponse = await Axios.get(`${API_URL}/api/artist/dashboard/${artistId}`);
            if (dashboardResponse.data.success) {
                const { artist: artistData, stats } = dashboardResponse.data;
                setArtist({
                    ...artistData,
                    earnings: stats?.total_earnings || 0,
                    appointments: stats?.total_appointments || 0
                });
                setNotifications(dashboardResponse.data.notifications || []);
            }

            // Fetch artist appointments
            const appointmentsResponse = await Axios.get(`${API_URL}/api/artist/${artistId}/appointments`);
            if (appointmentsResponse.data.success) {
                const allAppointments = appointmentsResponse.data.appointments || [];
                setAppointments(allAppointments);

                // Filter today's appointments using local date instead of UTC
                const now = new Date();
                const today = now.getFullYear() + '-' +
                    String(now.getMonth() + 1).padStart(2, '0') + '-' +
                    String(now.getDate()).padStart(2, '0');
                const todayAppts = allAppointments.filter(apt =>
                    apt.appointment_date && apt.appointment_date.startsWith(today) && apt.status !== 'cancelled'
                );
                setTodaysAppointments(todayAppts);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching artist data:", error);
            setLoading(false);
        }
    };

    return (
        <div className="portal-layout">
            <ArtistSideNav />
            <div className="portal-container artist-portal">
                <header className="portal-header">
                    <div className="header-title">
                        <h1>Artist Dashboard</h1>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', alignItems: 'center' }}>
                        <div className="notif-btn-wrapper" ref={notifRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <button className="notif-trigger-btn" onClick={() => setShowNotifDropdown(!showNotifDropdown)}>
                                <Bell size={22} />
                                {unreadCount > 0 && <span className="notif-badge-dot"></span>}
                            </button>

                            {showNotifDropdown && (
                                <div className="notif-dropdown-v2 glass-card">
                                    <div className="notif-dropdown-header">
                                        <h3>Notifications</h3>
                                    </div>
                                    <div className="notif-dropdown-list">
                                        {notifications.length > 0 ? (
                                            notifications.map(n => (
                                                <div key={n.id} className={`notif-dropdown-item ${!n.is_read ? 'unread' : ''}`} onClick={() => { setShowNotifDropdown(false); navigate('/artist/notifications'); }}>
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
                                        <button onClick={() => { setShowNotifDropdown(false); navigate('/artist/notifications'); }}>See All Updates</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button className="logout-btn" onClick={() => navigate('/login')} style={{ marginLeft: '15px' }}>
                            <LogOut size={20} />
                            Logout
                        </button>
                    </div>
                </header>

                <div className="portal-content">
                    {loading ? (
                        <div className="no-data">Loading artist data...</div>
                    ) : (
                        <>
                            {/* Stats Grid */}
                            <div className="stats-grid">
                                <div className="stat-card clickable" onClick={() => navigate('/artist/earnings')} style={{ cursor: 'pointer' }}>
                                    <DollarSign className="stat-icon" size={32} />
                                    <div className="stat-info">
                                        <p className="stat-label">Total Earnings</p>
                                        <p className="stat-value">₱{artist?.earnings ? artist.earnings.toLocaleString() : 0}</p>
                                    </div>
                                </div>

                                <div className="stat-card clickable" onClick={() => navigate('/artist/appointments')} style={{ cursor: 'pointer' }}>
                                    <Calendar className="stat-icon" size={32} />
                                    <div className="stat-info">
                                        <p className="stat-label">Appointments</p>
                                        <p className="stat-value">{artist?.appointments || 0}</p>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                                {/* Today's Schedule */}
                                <div className="data-card">
                                    <h2>Today's Schedule</h2>
                                    {todaysAppointments.length > 0 ? (
                                        <div className="table-responsive">
                                            <table className="portal-table">
                                                <thead>
                                                    <tr>
                                                        <th>Time</th>
                                                        <th>Client</th>
                                                        <th>Service</th>
                                                        <th>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {todaysAppointments.map((apt) => (
                                                        <tr key={apt.id}>
                                                            <td>{apt.start_time}</td>
                                                            <td>{apt.client_name}</td>
                                                            <td>{apt.design_title}</td>
                                                            <td><span className={`status-badge ${apt.status.toLowerCase()}`}>{apt.status}</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="no-data" style={{ padding: '20px', textAlign: 'center' }}>
                                            <CheckCircle size={40} color="#10b981" style={{ marginBottom: '10px' }} />
                                            <p>No appointments scheduled for today.</p>
                                        </div>
                                    )}
                                </div>

                                {/* Notifications */}
                                <div className="data-card">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                        <Bell size={20} />
                                        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Notifications</h2>
                                    </div>
                                    <div className="notifications-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                        {notifications.length > 0 ? notifications.map(notif => (
                                            <div key={notif.id} style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', gap: '10px' }}>
                                                <AlertCircle size={16} color="#6366f1" style={{ marginTop: '3px' }} />
                                                <div>
                                                    <p style={{ margin: '0 0 5px 0', fontWeight: '600', fontSize: '0.9rem' }}>{notif.title}</p>
                                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>{notif.message}</p>
                                                </div>
                                            </div>
                                        )) : <p className="no-data">No new notifications</p>}
                                    </div>
                                </div>
                            </div>

                            {/* Upcoming Appointments */}
                            <div className="data-card">
                                <h2>Upcoming Sessions</h2>
                                <div className="table-responsive">
                                    {appointments.filter(apt => {
                                        const aptDate = apt.appointment_date || apt.date || '';
                                        const dateStr = typeof aptDate === 'string' ? aptDate.split('T')[0] : '';
                                        const now = new Date();
                                        const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                                        return dateStr >= today && apt.status !== 'cancelled';
                                    }).sort((a,b) => new Date(a.appointment_date || a.date) - new Date(b.appointment_date || b.date)).length > 0 ? (
                                        <table className="portal-table">
                                            <thead>
                                                <tr>
                                                    <th>Client</th>
                                                    <th>Date</th>
                                                    <th>Time</th>
                                                    <th>Status</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {appointments.filter(apt => {
                                                    const aptDate = apt.appointment_date || apt.date || '';
                                                    const dateStr = typeof aptDate === 'string' ? aptDate.split('T')[0] : '';
                                                    const now = new Date();
                                                    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
                                                    return dateStr >= today && apt.status !== 'cancelled';
                                                }).sort((a,b) => new Date(a.appointment_date || a.date) - new Date(b.appointment_date || b.date)).slice(0, 5).map((apt) => (
                                                    <tr key={apt.id}>
                                                        <td>{apt.client_name || apt.client || 'N/A'}</td>
                                                        <td>{apt.appointment_date || apt.date || 'N/A'}</td>
                                                        <td>{apt.start_time || apt.appointment_time || apt.time || 'N/A'}</td>
                                                        <td><span className={`status-badge ${(apt.status || 'pending').toLowerCase()}`}>{apt.status || 'Pending'}</span></td>
                                                        <td>
                                                            <button className="action-btn" onClick={() => navigate('/artist/appointments')}>View</button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="no-data">No upcoming appointments found</p>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                    <style jsx>{`
                    .notif-trigger-btn {
                        background: none;
                        border: none;
                        color: #64748b;
                        cursor: pointer;
                        padding: 8px;
                        border-radius: 50%;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .notif-trigger-btn:hover { background: rgba(0,0,0,0.05); color: #1e293b; }
                    .notif-badge-dot {
                        position: absolute;
                        top: 5px;
                        right: 5px;
                        width: 10px;
                        height: 10px;
                        background-color: #ef4444;
                        border-radius: 50%;
                        border: 2px solid white;
                    }
                    .notif-dropdown-v2 {
                        position: absolute;
                        top: 100%;
                        right: 0;
                        width: 320px;
                        background: white;
                        border-radius: 12px;
                        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                        z-index: 1000;
                        margin-top: 10px;
                        border: 1px solid #e2e8f0;
                        animation: slideDown 0.2s ease-out;
                    }
                    @keyframes slideDown { 
                        from { opacity: 0; transform: translateY(-10px); } 
                        to { opacity: 1; transform: translateY(0); } 
                    }
                    .notif-dropdown-header { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
                    .notif-dropdown-header h3 { margin: 0; font-size: 1rem; color: #1e293b; }
                    .notif-dropdown-list { max-height: 350px; overflow-y: auto; }
                    .notif-dropdown-item { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: background 0.2s; }
                    .notif-dropdown-item:hover { background: #f8fafc; }
                    .notif-dropdown-item.unread { background: #f0f9ff; }
                    .notif-item-content { display: flex; flex-direction: column; gap: 4px; }
                    .notif-item-title { font-weight: 600; font-size: 0.9rem; color: #1e293b; text-align: left; }
                    .notif-item-msg { font-size: 0.8rem; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
                    .notif-item-time { font-size: 0.7rem; color: #94a3b8; text-align: left; }
                    .notif-empty { padding: 30px; text-align: center; color: #94a3b8; font-size: 0.9rem; }
                    .notif-dropdown-footer { padding: 10px; border-top: 1px solid #f1f5f9; text-align: center; }
                    .notif-dropdown-footer button { 
                        background: none; border: none; color: #daa520; font-weight: 600; font-size: 0.85rem; 
                        cursor: pointer; transition: color 0.2s; 
                    }
                    .notif-dropdown-footer button:hover { color: #b8860b; text-decoration: underline; }
                `}</style>
                </div>
            </div>
        </div>
    );
}

export default ArtistPortal;
