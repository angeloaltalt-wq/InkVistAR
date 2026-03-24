import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Calendar, Heart, Award, Users, Clock, LogOut } from 'lucide-react';
import './PortalStyles.css';
import CustomerSideNav from '../components/CustomerSideNav';
import ChatWidget from '../components/ChatWidget';
import { API_URL } from '../config';

function CustomerPortal() {
    const navigate = useNavigate();
    const [customer, setCustomer] = useState({
        name: '',
        email: '',
        appointments: 0,
        favoriteArtists: 0,
        totalTattoos: 0,
        savedDesigns: 0
    });
    const [appointments, setAppointments] = useState([]);
    const [artists, setArtists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeAppointment, setActiveAppointment] = useState(null);
    const user = JSON.parse(localStorage.getItem('user'));
    const customerId = user ? user.id : null;

    useEffect(() => {
        if (customerId) fetchCustomerData();
    }, [customerId]);

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
                    savedDesigns: stats?.saved_designs || 0
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
                    <p className="header-subtitle">Welcome back, {customer.name || 'Inker'}!</p>
                </div>
                <div className="header-actions">
                    <button className="logout-btn" onClick={() => navigate('/login')}>
                        <LogOut size={20} />
                        Logout
                    </button>
                </div>
            </header>

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
                            <div className="stat-card-v2" onClick={() => navigate('/customer/bookings')} style={{cursor: 'pointer'}}>
                                <div className="stat-icon-wrapper blue">
                                    <Calendar size={24} />
                                </div>
                                <div className="stat-content">
                                    <span className="stat-label-v2">Upcoming Sessions</span>
                                    <h2 className="stat-value-v2">{customer.appointments}</h2>
                                </div>
                            </div>

                            <div className="stat-card-v2" onClick={() => navigate('/customer/gallery')} style={{cursor: 'pointer'}}>
                                <div className="stat-icon-wrapper rose">
                                    <Heart size={24} />
                                </div>
                                <div className="stat-content">
                                    <span className="stat-label-v2">Saved Designs</span>
                                    <h2 className="stat-value-v2">{customer.savedDesigns}</h2>
                                </div>
                            </div>

                            <div className="stat-card-v2" onClick={() => navigate('/customer/gallery')} style={{cursor: 'pointer'}}>
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
                                <button className="action-btn" onClick={() => navigate('/customer/book')}>Book New Session</button>
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
                                    <div className="empty-state-simple" style={{padding: '3rem', textAlign: 'center', color: 'var(--text-muted)'}}>
                                        <p>No upcoming appointments found.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="quick-actions-grid">
                            <div className="action-card glass-card" onClick={() => navigate('/customer/gallery')}>
                                <Heart size={24} />
                                <span>View Saved Designs</span>
                            </div>
                            <div className="action-card glass-card" onClick={() => navigate('/customer/gallery')}>
                                <Award size={24} />
                                <span>My Tattoo History</span>
                            </div>
                            <div className="action-card glass-card" onClick={() => navigate('/customer/book')}>
                                <Calendar size={24} />
                                <span>Schedule Session</span>
                            </div>
                        </div>

                        {/* Favorite Artists */}
                        <div className="data-card-v2">
                            <div className="card-header-v2">
                                <h2>Recommended Artists</h2>
                                <button className="view-more-btn" onClick={() => navigate('/artists')}>Meet the Team</button>
                            </div>
                            <div className="artists-grid" style={{padding: '1.5rem'}}>
                                {artists.length > 0 ? (
                                    artists.slice(0, 4).map((artist) => (
                                        <div key={artist.id} className="artist-card-v2 glass-card" style={{padding: '1.5rem', borderRadius: '16px'}}>
                                            <h3 style={{margin: '0 0 5px 0', fontSize: '1.1rem'}}>{artist.name}</h3>
                                            <p className="specialty" style={{margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-muted)'}}>{artist.specialization || 'Professional Artist'}</p>
                                            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                                <span className="rating" style={{fontWeight: '700', color: '#f59e0b'}}>⭐ {artist.rating || 5.0}</span>
                                                <button className="action-btn-small" onClick={() => navigate('/customer/book')} style={{background: 'var(--text-main)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem'}}>Book</button>
                                            </div>
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
