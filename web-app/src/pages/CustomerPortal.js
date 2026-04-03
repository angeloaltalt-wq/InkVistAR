import React, { useState, useEffect, useRef } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Calendar, Heart, Award, Users, Clock, LogOut, Plus, Bell } from 'lucide-react';
import './PortalStyles.css';
import CustomerSideNav from '../components/CustomerSideNav';
import ChatWidget from '../components/ChatWidget';
import { API_URL } from '../config';

function CustomerPortal() {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const customerId = user ? user.id : null;

    const [customer, setCustomer] = useState({
        name: user.name || '',
        email: user.email || '',
        profile_image: user.profile_image || '',
        appointments: 0,
        favoriteArtists: 0,
        totalTattoos: 0,
        savedDesigns: 0
    });
    const [appointments, setAppointments] = useState([]);
    const [artists, setArtists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeAppointment, setActiveAppointment] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifDropdown, setShowNotifDropdown] = useState(false);
    const notifRef = useRef(null);

    useEffect(() => {
        if (customerId) {
            fetchCustomerData();
            fetchNotifications();
        }
    }, [customerId]);

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
            const res = await Axios.get(`${API_URL}/api/notifications/${customerId}`);
            if (res.data.success) {
                const sortedNotifs = res.data.notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                setNotifications(sortedNotifs.slice(0, 5));
                setUnreadCount(sortedNotifs.filter(n => !n.is_read).length);
            }
        } catch (error) {
            console.error("Error fetching notifications:", error);
        }
    };

    const fetchCustomerData = async () => {
        try {
            setLoading(true);

            // Fetch customer dashboard data
            const dashboardResponse = await Axios.get(`${API_URL}/api/customer/dashboard/${customerId}`);
            if (dashboardResponse.data.success) {
                const { customer: profile, stats, appointments: dashboardAppointments } = dashboardResponse.data;
                setCustomer({
                    ...profile,
                    appointments: stats?.upcoming || 0,
                    favoriteArtists: stats?.artists || 0,
                    totalTattoos: stats?.total_tattoos || 0,
                    savedDesigns: stats?.saved_designs || 0,
                });

                // Map appointments
                const mappedAppointments = dashboardAppointments.map(apt => ({
                    id: apt.id,
                    artist: apt.artist_name || 'Unknown',
                    service: apt.design_title || 'Tattoo',
                    date: new Date(apt.appointment_date).toLocaleDateString(),
                    time: apt.start_time,
                    status: apt.status.charAt(0).toUpperCase() + apt.status.slice(1)
                }));
                setAppointments(mappedAppointments);

                const now = new Date();
                const firstActiveAppointment = dashboardAppointments.find(apt => {
                    const appointmentDateTime = new Date(`${apt.appointment_date}T${apt.start_time}`);
                    return now >= appointmentDateTime;
                });
                setActiveAppointment(firstActiveAppointment);
            }

            // Fetch all artists
            const artistsResponse = await Axios.get(`${API_URL}/api/customer/artists`);
            if (artistsResponse.data.success) {
                setArtists(artistsResponse.data.artists || []);
            }

            setLoading(false);
        } catch (error) {
            console.error("Error fetching customer data:", error);
            setLoading(false);
        }
    };

    return (
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
                <header className="portal-header">
                    <div className="header-title">
                        <h1>Customer Dashboard</h1>
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
                                                <div key={n.id} className={`notif-dropdown-item ${!n.is_read ? 'unread' : ''}`} onClick={() => { setShowNotifDropdown(false); navigate('/customer/notifications'); }}>
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
                                        <button onClick={() => { setShowNotifDropdown(false); navigate('/customer/notifications'); }}>See All Updates</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        {customer.profile_image && (
                            <div onClick={() => navigate('/customer/profile')} style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                overflow: 'hidden', border: '2px solid white',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: 'pointer',
                                marginLeft: '10px'
                            }}>
                                <img src={customer.profile_image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                        )}
                    </div>
                </header>

                <p className="header-subtitle" style={{ marginTop: '-1rem', marginBottom: '2.5rem', marginRight: '-5.5rem', textAlign: 'left' }}>Welcome back, {customer.name || 'Inker'}!</p>

                <div className="portal-content">  
                    {loading ? (
                        <div className="dashboard-loader-container">
                            <div className="premium-loader"></div>
                            <p>Loading your profile...</p>
                        </div>
                    ) : (
                        <>
                            {/* Stats Grid */}
                            <div className="stats-grid">
                                <div className="stat-card-v2" onClick={() => navigate('/customer/bookings')} style={{ cursor: 'pointer' }}>
                                    <div className="stat-icon-wrapper blue">
                                        <Calendar size={24} />
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-label-v2">Upcoming Sessions</span>
                                        <h2 className="stat-value-v2">{customer.appointments}</h2>
                                    </div>
                                </div>

                                <div className="stat-card-v2" onClick={() => navigate('/customer/gallery')} style={{ cursor: 'pointer' }}>
                                    <div className="stat-icon-wrapper rose">
                                        <Heart size={24} />
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-label-v2">Saved Designs</span>
                                        <h2 className="stat-value-v2">{customer.savedDesigns}</h2>
                                    </div>
                                </div>

                                <div className="stat-card-v2" onClick={() => navigate('/customer/gallery')} style={{ cursor: 'pointer' }}>
                                    <div className="stat-icon-wrapper gold">
                                        <Award size={24} />
                                    </div>
                                    <div className="stat-content">
                                        <span className="stat-label-v2">My Tattoos</span>
                                        <h2 className="stat-value-v2">{customer.totalTattoos}</h2>
                                    </div>
                                </div>
                            </div>

                            {/* Upcoming Appointments */}
                            <div className="data-card-v2">
                                <div className="card-header-v2">
                                    <h2>Upcoming Sessions</h2>
                                    <button className="action-btn" onClick={() => navigate('/customer/bookings')}>Book New Session</button>
                                </div>
                                <div className="modern-table-wrapper">
                                    {appointments.length > 0 ? (
                                        <table className="premium-table">
                                            <thead>
                                                <tr>
                                                    <th>Artist</th>
                                                    <th>Service</th>
                                                    <th>Date & Time</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {appointments.map((apt) => (
                                                    <tr key={apt.id}>
                                                        <td>
                                                            <div className="client-cell">
                                                                <div className="avatar-placeholder">{apt.artist.charAt(0)}</div>
                                                                <span>{apt.artist}</span>
                                                            </div>
                                                        </td>
                                                        <td>{apt.service}</td>
                                                        <td>
                                                            <div className="date-time-cell">
                                                                <div className="primary-date">{apt.date}</div>
                                                                <div className="secondary-time">{apt.time}</div>
                                                            </div>
                                                        </td>
                                                        <td><span className={`status-badge-v2 ${apt.status.toLowerCase()}`}>{apt.status}</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <div className="empty-state-simple" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            <p>No upcoming appointments found.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="quick-actions-grid">
                                <button className="action-card-v2 glass-card" onClick={() => navigate('/customer/gallery')}>
                                    <div className="action-icon-wrapper blue">
                                        <Heart size={20} />
                                    </div>
                                    <div className="action-content-v2">
                                        <span className="action-title-v2">Saved Designs</span>
                                        <span className="action-subtitle-v2">Explore your inspirations</span>
                                    </div>
                                </button>

                                <button className="action-card-v2 glass-card" onClick={() => navigate('/customer/gallery')}>
                                    <div className="action-icon-wrapper gold">
                                        <Award size={20} />
                                    </div>
                                    <div className="action-content-v2">
                                        <span className="action-title-v2">My Tattoo History</span>
                                        <span className="action-subtitle-v2">View your completed works</span>
                                    </div>
                                </button>

                                <button className="action-card-v2 glass-card" onClick={() => navigate('/customer/bookings')}>
                                    <div className="action-icon-wrapper purple">
                                        <Calendar size={20} />
                                    </div>
                                    <div className="action-content-v2">
                                        <span className="action-title-v2">Schedule Session</span>
                                        <span className="action-subtitle-v2">Book your next masterpiece</span>
                                    </div>
                                </button>
                            </div>

                            {/* New styles for quick-actions-grid and action-card-v2 */}
                            <style jsx>{`
                            .quick-actions-grid {
                                display: grid;
                                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                                gap: 1.5rem; /* Spacing between cards */
                                margin-top: 2rem;
                            }
                            .action-card-v2 {
                                display: flex;
                                align-items: center;
                                padding: 1.25rem;
                                border-radius: 16px;
                                background: rgba(255, 255, 255, 0.05);
                                backdrop-filter: blur(10px);
                                border: 1px solid rgba(255, 255, 255, 0.1);
                                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                                cursor: pointer;
                                transition: all 0.3s ease;
                                text-align: left;
                                width: 100%;
                            }
                            .action-card-v2:hover {
                                transform: translateY(-5px);
                                box-shadow: 0 8px 12px rgba(0, 0, 0, 0.2);
                                border-color: #C19A6B;
                            }
                            .action-icon-wrapper {
                                width: 48px;
                                height: 48px;
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                margin-right: 1rem;
                                flex-shrink: 0;
                            }
                            .action-icon-wrapper.blue { background-color: rgba(59, 130, 246, 0.2); color: #3b82f6; }
                            .action-icon-wrapper.gold { background-color: rgba(218, 165, 32, 0.2); color: #DAA520; }
                            .action-icon-wrapper.purple { background-color: rgba(139, 92, 246, 0.2); color: #8b5cf6; }
                            .action-content-v2 {
                                display: flex;
                                flex-direction: column;
                            }
                            .action-title-v2 {
                                font-size: 1.1rem;
                                font-weight: 600;
                                color: #0e0e0eff;
                                margin-bottom: 4px;
                            }
                            .action-subtitle-v2 {
                                font-size: 0.85rem;
                                color: #a0a0a0;
                            }
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

                            {/* Favorite Artists */}
                            <div className="data-card-v2" style={{ marginTop: '2rem' }}> {/* Added margin-top for spacing */}
                                <div className="card-header-v2">
                                    <h2>Our Artists</h2>
                                    <button className="view-more-btn" onClick={() => navigate('/artists')}>Meet the Team</button>
                                </div>
                                <div className="artists-grid" style={{ padding: '1.5rem' }}>
                                    {artists.length > 0 ? (
                                        artists.slice(0, 4).map((artist) => (
                                            <div key={artist.id} className="artist-card-v2 glass-card" style={{ padding: '1.5rem', borderRadius: '16px' }}>
                                                <h3 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>{artist.name}</h3>
                                                <p className="specialty" style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>{artist.specialization || 'Professional Artist'}</p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="no-data">No artists found</p>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
            {activeAppointment && (
                <ChatWidget
                    room={activeAppointment.id}
                    currentUser={`customer_${customerId}`}
                />
            )}
        </div>
    );
}

export default CustomerPortal;
