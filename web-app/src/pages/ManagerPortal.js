import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, TrendingUp, AlertCircle, LogOut } from 'lucide-react';
import './PortalStyles.css';
import { API_URL } from '../config';
import ManagerSideNav from '../components/ManagerSideNav';
import Pagination from '../components/Pagination';

function ManagerPortal() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalArtists: 0,
        appointments: 0,
        revenue: 0,
        alerts: 0
    });
    const [artists, setArtists] = useState([]);
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [artistPage, setArtistPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(5);
    
    useEffect(() => {
        fetchManagerData();
    }, []);

    const fetchManagerData = async () => {
        try {
            setLoading(true);
            
            // Fetch Dashboard Stats
            const statsRes = await Axios.get(`${API_URL}/api/manager/dashboard`);
            if (statsRes.data.success) {
                const s = statsRes.data.stats;
                setStats({
                    totalArtists: s.totalArtists || 0,
                    appointments: s.totalAppointments || 0,
                    revenue: s.estimatedRevenue || 0,
                    alerts: 0 // Placeholder
                });
            }

            // Fetch Recent Appointments
            const apptRes = await Axios.get(`${API_URL}/api/admin/appointments`);
            if (apptRes.data.success) {
                const recent = apptRes.data.data.slice(0, 5).map(a => ({
                    id: a.id,
                    client: a.client_name,
                    artist: a.artist_name,
                    date: new Date(a.appointment_date).toLocaleDateString(),
                    status: a.status
                }));
                setAppointments(recent);
            }

            // Fetch Artists (using admin users endpoint for now)
            const usersRes = await Axios.get(`${API_URL}/api/debug/users`);
            if (usersRes.data.success) {
                setArtists(usersRes.data.users.filter(u => u.user_type === 'artist'));
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching manager data:", error);
            setLoading(false);
        }
    };

    return (
        <div className="portal-layout">
            <ManagerSideNav />
            <div className="portal-container manager-portal">
            <header className="portal-header">
                <h1>Manager Dashboard</h1>
                <button className="logout-btn" onClick={() => navigate('/login')}>
                    <LogOut size={20} />
                    Logout
                </button>
            </header>

            <div className="portal-content">
                {loading ? (
                    <div className="no-data">Loading manager dashboard...</div>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <div className="stats-grid">
                            <div className="stat-card">
                                <Users className="stat-icon" size={32} />
                                <div className="stat-info">
                                    <p className="stat-label">Active Artists</p>
                                    <p className="stat-value">{stats.totalArtists}</p>
                                </div>
                            </div>

                            <div className="stat-card">
                                <Calendar className="stat-icon" size={32} />
                                <div className="stat-info">
                                    <p className="stat-label">Appointments</p>
                                    <p className="stat-value">{stats.appointments}</p>
                                </div>
                            </div>

                            <div className="stat-card">
                                <TrendingUp className="stat-icon" size={32} />
                                <div className="stat-info">
                                    <p className="stat-label">Monthly Revenue</p>
                                    <p className="stat-value">₱{stats.revenue ? stats.revenue.toLocaleString() : 0}</p>
                                </div>
                            </div>

                            <div className="stat-card alert">
                                <AlertCircle className="stat-icon" size={32} />
                                <div className="stat-info">
                                    <p className="stat-label">Alerts</p>
                                    <p className="stat-value">{stats.alerts}</p>
                                </div>
                            </div>
                        </div>

                        {/* Artists Performance */}
                        <div className="data-card">
                            <h2>Artist Performance</h2>
                            <div className="table-responsive">
                                {artists.length > 0 ? (
                                    <table className="portal-table">
                                        <thead>
                                            <tr>
                                                <th>Artist Name</th>
                                                <th>Appointments</th>
                                                <th>Revenue</th>
                                                <th>Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {artists.slice((artistPage - 1) * itemsPerPage, artistPage * itemsPerPage).map((artist) => (
                                                <tr key={artist.id}>
                                                    <td>{artist.name}</td>
                                                    <td>{artist.appointments}</td>
                                                    <td>₱{artist.revenue ? artist.revenue.toLocaleString() : 0}</td>
                                                    <td><span className="role-badge artist">{artist.status || 'Active'}</span></td>
                                                    <td>
                                                        <button className="action-btn">View Details</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <p className="no-data">No artists found</p>
                                )}
                                {artists.length > 0 && (
                                    <Pagination
                                        currentPage={artistPage}
                                        totalPages={Math.ceil(artists.length / itemsPerPage)}
                                        onPageChange={setArtistPage}
                                        itemsPerPage={itemsPerPage}
                                        onItemsPerPageChange={(newVal) => {
                                            setItemsPerPage(newVal);
                                            setArtistPage(1);
                                        }}
                                        totalItems={artists.length}
                                        unit="artists"
                                    />
                                )}
                            </div>
                        </div>

                        {/* Appointments Overview */}
                        <div className="data-card">
                            <h2>Recent Appointments</h2>
                            <div className="table-responsive">
                                {appointments.length > 0 ? (
                                    <table className="portal-table">
                                        <thead>
                                            <tr>
                                                <th>Client</th>
                                                <th>Artist</th>
                                                <th>Date</th>
                                                <th>Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {appointments.map((apt) => (
                                                <tr key={apt.id}>
                                                    <td>{apt.client}</td>
                                                    <td>{apt.artist}</td>
                                                    <td>{apt.date}</td>
                                                    <td><span className={`status-badge ${(apt.status || 'pending').toLowerCase()}`}>{apt.status || 'Pending'}</span></td>
                                                    <td>
                                                        <button className="action-btn">Reschedule</button>
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

export default ManagerPortal;
