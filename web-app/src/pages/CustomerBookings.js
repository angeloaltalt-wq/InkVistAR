import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Search, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import './PortalStyles.css';
import { API_URL } from '../config';
import CustomerSideNav from '../components/CustomerSideNav';

function CustomerBookings(){
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;
    const user = JSON.parse(localStorage.getItem('user'));
    const customerId = user ? user.id : null;

    useEffect(() => {
        const fetchAppointments = async () => {
            if (!customerId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try{
                const res = await Axios.get(`${API_URL}/api/customer/${customerId}/appointments`);
                if (res.data.success) {
                    setAppointments(res.data.appointments || []);
                } else {
                    alert('Could not fetch your bookings: ' + res.data.message);
                }
            } catch(e){ 
                console.error("Error fetching bookings:", e.response || e);
                alert('Failed to connect to the server while fetching bookings. Please try again later.');
            } finally {
                setLoading(false);
            }
        };
        fetchAppointments();
    }, [customerId]);

    // Filter Logic
    const filteredAppointments = appointments.filter(apt => {
        const matchesSearch = (apt.artist_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (apt.design_title || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || apt.status.toLowerCase() === statusFilter.toLowerCase();
        return matchesSearch && matchesStatus;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
    const displayedAppointments = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
            <header className="portal-header"><h1>My Bookings</h1></header>
            <div className="portal-content">
                {loading ? <div className="no-data">Loading...</div> : (
                    <div className="data-card">
                        {/* Controls Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Filter size={18} color="#64748b" />
                                <select 
                                    className="form-input" 
                                    value={statusFilter} 
                                    onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                    style={{ width: '150px', margin: 0 }}
                                >
                                    <option value="all">All Status</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="pending">Pending</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                            <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
                                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                <input 
                                    type="text" 
                                    placeholder="Search artist or service..." 
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                    className="form-input"
                                    style={{ paddingLeft: '40px', width: '100%', margin: 0 }}
                                />
                            </div>
                        </div>

                        {displayedAppointments.length ? (
                            <>
                            <div className="table-responsive">
                                <table className="portal-table">
                                    <thead>
                                        <tr>
                                            <th>Artist</th>
                                            <th>Service</th>
                                            <th>Date</th>
                                            <th>Time</th>
                                            <th>Price</th>
                                            <th>Status</th>
                                            <th>Payment</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>{displayedAppointments.map(a=> (
                                        <tr key={a.id}>
                                            <td>{a.artist_name}</td>
                                            <td>{a.design_title}</td>
                                            <td>{new Date(a.appointment_date).toLocaleDateString()}</td>
                                            <td>{a.start_time}</td>
                                            <td style={{ fontWeight: 'bold' }}>₱{parseFloat(a.price || 0).toLocaleString()}</td>
                                            <td><span className={`status-badge ${a.status.toLowerCase()}`}>{a.status}</span></td>
                                            <td>
                                                <span className={`status-badge ${a.payment_status === 'paid' ? 'completed' : a.payment_status === 'pending' ? 'pending' : 'cancelled'}`} style={{ backgroundColor: a.payment_status === 'paid' ? '#dcfce7' : a.payment_status === 'pending' ? '#fef3c7' : '#f3f4f6', color: a.payment_status === 'paid' ? '#16a34a' : a.payment_status === 'pending' ? '#b45309' : '#64748b' }}>
                                                    {a.payment_status ? a.payment_status.charAt(0).toUpperCase() + a.payment_status.slice(1) : 'Unpaid'}
                                                </span>
                                            </td>
                                            <td>
                                                {a.status === 'confirmed' && a.payment_status !== 'paid' && (
                                                    <button 
                                                        className="btn btn-primary" 
                                                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                                        onClick={() => window.location.href = `/payment?appointmentId=${a.id}&price=${a.price}`}
                                                    >
                                                        Pay Now
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                            
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '1.5rem', gap: '10px' }}>
                                    <button 
                                        className="btn btn-secondary" 
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => p - 1)}
                                        style={{ padding: '6px 12px', display: 'flex', alignItems: 'center' }}
                                    ><ChevronLeft size={16} /></button>
                                    <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Page {currentPage} of {totalPages}</span>
                                    <button 
                                        className="btn btn-secondary" 
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(p => p + 1)}
                                        style={{ padding: '6px 12px', display: 'flex', alignItems: 'center' }}
                                    ><ChevronRight size={16} /></button>
                                </div>
                            )}
                            </>
                        ) : <p className="no-data">No bookings found matching your criteria.</p>}
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}

export default CustomerBookings;
