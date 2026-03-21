import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Calendar, Heart, Award, Users, Clock, LogOut } from 'lucide-react';
import './PortalStyles.css';
import CustomerSideNav from '../components/CustomerSideNav';
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
                    <h1>My Tattoo Portal</h1>
                    <p className="header-subtitle">Welcome back, {customer.name || 'Inker'}!</p>
                </div>
                <button className="logout-btn" onClick={() => navigate('/login')}>
                    <LogOut size={20} />
                    Logout
                </button>
            </header>

            <div className="portal-content">
                {loading ? (
                    <div className="no-data">Loading customer portal...</div>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <div className="stats-grid">
                            <div className="stat-card" onClick={() => navigate('/customer/bookings')} style={{cursor: 'pointer'}}>
                                <Calendar className="stat-icon" size={32} />
                                <div className="stat-info">
                                    <p className="stat-label">Upcoming</p>
                                    <p className="stat-value">{customer.appointments}</p>
                                </div>
                            </div>

                            <div className="stat-card" onClick={() => navigate('/customer/gallery')} style={{cursor: 'pointer'}}>
                                <Heart className="stat-icon" size={32} style={{background: 'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)'}} />
                                <div className="stat-info">
                                    <p className="stat-label">Favorites</p>
                                    <p className="stat-value">{customer.savedDesigns}</p>
                                </div>
                            </div>

                            <div className="stat-card" onClick={() => navigate('/customer/gallery')} style={{cursor: 'pointer'}}>
                                <Award className="stat-icon" size={32} style={{background: 'linear-gradient(135deg, #C19A6B 0%, #8B4513 100%)'}} />
                                <div className="stat-info">
                                    <p className="stat-label">My Tattoos</p>
                                    <p className="stat-value">{customer.totalTattoos}</p>
                                </div>
                            </div>
                        </div>

                        {/* Upcoming Appointments */}
                        <div className="data-card">
                            <div className="card-header">
                                <h2>Upcoming Sessions</h2>
                                <button className="action-btn" onClick={() => navigate('/customer/book')}>Book New Session</button>
                            </div>
                            <div className="table-responsive">
                                {appointments.length > 0 ? (
                                    <table className="portal-table">
                                        <thead>
                                            <tr>
                                                <th>Artist</th>
                                                <th>Service</th>
                                                <th>Date</th>
                                                <th>Time</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {appointments.map((apt) => (
                                                <tr key={apt.id}>
                                                    <td>{apt.artist}</td>
                                                    <td>{apt.service}</td>
                                                    <td>{apt.date}</td>
                                                    <td>{apt.time}</td>
                                                    <td><span className={`status-badge ${apt.status.toLowerCase()}`}>{apt.status}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="empty-state-simple">
                                        <p>No upcoming appointments scheduled.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="quick-actions-grid">
                            <div className="action-card" onClick={() => navigate('/customer/gallery')}>
                                <Heart size={24} />
                                <span>View Saved Designs</span>
                            </div>
                            <div className="action-card" onClick={() => navigate('/customer/gallery')}>
                                <Award size={24} />
                                <span>My Tattoo History</span>
                            </div>
                            <div className="action-card" onClick={() => navigate('/customer/book')}>
                                <Calendar size={24} />
                                <span>Schedule Session</span>
                            </div>
                        </div>

                        {/* Favorite Artists */}
                        <div className="data-card">
                            <h2>Recommended Artists</h2>
                            <div className="artists-grid">
                                {artists.length > 0 ? (
                                    artists.slice(0, 4).map((artist) => (
                                        <div key={artist.id} className="artist-card">
                                            <h3>{artist.name}</h3>
                                            <p className="specialty">{artist.specialization || 'Professional Artist'}</p>
                                            <p className="rating">⭐ {artist.rating || 5.0}/5.0</p>
                                            <button className="action-btn" onClick={() => navigate('/customer/book')}>Book Now</button>
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
        </div>
    );
}

export default CustomerPortal;
