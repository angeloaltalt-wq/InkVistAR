import React, { useState, useEffect } from 'react';
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
    
    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    useEffect(() => {
        fetchArtistData();
    }, [artistId]);

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
                
                // Filter today's appointments
                const today = new Date().toISOString().split('T')[0];
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
                <h1>Artist Dashboard</h1>
                <button className="logout-btn" onClick={() => navigate('/login')}>
                    <LogOut size={20} />
                    Logout
                </button>
            </header>

            <div className="portal-content">
                {loading ? (
                    <div className="no-data">Loading artist data...</div>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <div className="stats-grid">
                            <div className="stat-card">
                                <DollarSign className="stat-icon" size={32} />
                                <div className="stat-info">
                                    <p className="stat-label">Total Earnings</p>
                                    <p className="stat-value">₱{artist?.earnings ? artist.earnings.toLocaleString() : 0}</p>
                                </div>
                            </div>

                            <div className="stat-card">
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
                                {appointments.length > 0 ? (
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
                                            {appointments.slice(0, 5).map((apt) => (
                                                <tr key={apt.id}>
                                                    <td>{apt.client_name || apt.client || 'N/A'}</td>
                                                    <td>{apt.appointment_date || apt.date || 'N/A'}</td>
                                                    <td>{apt.appointment_time || apt.time || 'N/A'}</td>
                                                    <td><span className={`status-badge ${(apt.status || 'pending').toLowerCase()}`}>{apt.status || 'Pending'}</span></td>
                                                    <td>
                                                        <button className="action-btn">View</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <p className="no-data">No appointments found</p>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
            </div>
        </div>
    );
}

export default ArtistPortal;
