import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Axios from 'axios';
import { Search, ChevronLeft, ChevronRight, Filter, CreditCard, Eye, CheckCircle, Info, X, Calendar, Inbox, Plus, Upload, Camera, Image as ImageIcon, User } from 'lucide-react';
import './PortalStyles.css';
import { API_URL } from '../config';
import CustomerSideNav from '../components/CustomerSideNav';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ConfirmModal';

function CustomerBookings(){
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const navigate = useNavigate();
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem('user'));
    const customerId = user ? user.id : null;

    // New Booking Form States
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [artists, setArtists] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bookingData, setBookingData] = useState({
        artistId: '',
        date: '',
        startTime: '',
        designTitle: '',
        placement: '',
        notes: '',
        referenceImage: null
    });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedApt, setSelectedApt] = useState(null);
    const [modalTransactions, setModalTransactions] = useState([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ 
        isOpen: false, 
        title: '', 
        message: '', 
        onConfirm: null, 
        type: 'danger',
        isAlert: false 
    });

    const showAlert = (title, message, type = 'info') => {
        setConfirmModal({
            isOpen: true,
            title,
            message,
            type,
            isAlert: true,
            onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    useEffect(() => {
        const fetchArtists = async () => {
            try {
                const res = await Axios.get(`${API_URL}/api/customer/artists`);
                if (res.data.success) setArtists(res.data.artists);
            } catch (e) { console.error("Error fetching artists:", e); }
        };
        fetchArtists();

        // Handle auto-open from Gallery
        if (location.state?.autoOpenBooking) {
            setBookingData(prev => ({ ...prev, artistId: location.state.artistId || '', designTitle: location.state.designTitle || '' }));
            setIsBookingModalOpen(true);
        }
    }, [location.state]);

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
                    // Ensure price is parsed as a number
                    const formattedAppointments = (res.data.appointments || []).map(appt => ({
                        ...appt,
                        price: parseFloat(appt.price) || 0
                    }));
                    setAppointments(formattedAppointments);
                } else {
                    showAlert("Fetch Error", 'Could not fetch your bookings: ' + res.data.message, "danger");
                }
            } catch(e){ 
                console.error("Error fetching bookings:", e.response || e);
                showAlert("Connection Error", 'Failed to connect to the server while fetching bookings. Please try again later.', "danger");
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

    const handlePay = (appointment, type = 'deposit') => {
        if (!appointment.price || appointment.price <= 0) {
            showAlert("Quotation Pending", "Price has not been set by the studio yet. Please wait for confirmation.", "info");
            return;
        }
        const remainingBalance = appointment.price - (appointment.total_paid || 0);
        navigate(`/pay-mongo?appointmentId=${appointment.id}&price=${appointment.price}`, { 
            state: { 
                appointmentId: appointment.id, 
                price: appointment.price,
                remainingBalance: remainingBalance,
                type: type 
            } 
        });
    };

    const handleViewDetails = async (appt) => {
        setSelectedApt(appt);
        setIsModalOpen(true);
        setModalLoading(true);
        try {
            const res = await Axios.get(`${API_URL}/api/appointments/${appt.id}/transactions`);
            if (res.data.success) {
                setModalTransactions(res.data.transactions || []);
            }
        } catch (e) {
            console.error("Error fetching transactions:", e);
        } finally {
            setModalLoading(false);
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setBookingData({ ...bookingData, referenceImage: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmitBooking = async (e) => {
        e.preventDefault();
        if (!bookingData.artistId || !bookingData.date || !bookingData.startTime) {
            showAlert("Missing Info", "Please select an artist, date, and preferred time.", "warning");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await Axios.post(`${API_URL}/api/customer/appointments`, {
                customerId,
                artistId: bookingData.artistId,
                date: bookingData.date,
                startTime: bookingData.startTime,
                designTitle: bookingData.designTitle,
                notes: `Placement: ${bookingData.placement}\n\nDetails: ${bookingData.notes}`,
                referenceImage: bookingData.referenceImage
            });

            if (res.data.success) {
                showAlert("Booking Requested", "Your consultation request has been sent! Check your notifications for updates.", "success");
                setIsBookingModalOpen(false);
                setBookingData({ artistId: '', date: '', startTime: '', designTitle: '', placement: '', notes: '', referenceImage: null });
                // Refresh list
                const fetchRes = await Axios.get(`${API_URL}/api/customer/${customerId}/appointments`);
                if (fetchRes.data.success) setAppointments(fetchRes.data.appointments);
            }
        } catch (err) {
            showAlert("Booking Error", err.response?.data?.message || "Failed to submit request.", "danger");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
            <header className="portal-header">
                <div className="header-title">
                    <h1>My Bookings</h1>
                </div>
                <div className="header-actions">
                    <button className="action-btn" onClick={() => setIsBookingModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                        <Plus size={16} /> Book New Session
                    </button>
                </div>
            </header>
            <div className="portal-content">
                {loading ? <div className="no-data">Loading...</div> : (
                <div className="portal-content">
                    {loading ? <div className="no-data">Loading...</div> : (
                        <div className="table-card-container" style={{ minHeight: '600px' }}>
                            <div className="card-header-v2">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Filter size={18} color="#64748b" />
                                        <select 
                                            className="pagination-select" 
                                            value={statusFilter} 
                                            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                            style={{ margin: 0 }}
                                        >
                                            <option value="all">All Status</option>
                                            <option value="confirmed">Confirmed</option>
                                            <option value="pending">Pending</option>
                                            <option value="completed">Completed</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                    <div style={{ position: 'relative', width: '250px' }}>
                                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                        <input 
                                            type="text" 
                                            placeholder="Search bookings..." 
                                            value={searchTerm}
                                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                            className="pagination-select"
                                            style={{ paddingLeft: '35px', width: '100%', margin: 0 }}
                                        />
                                    </div>
                                </div>
                                <span className="status-badge-v2 pending">{filteredAppointments.length} Bookings</span>
                            </div>

                            {displayedAppointments.length ? (
                                <>
                                    <div className="table-responsive">
                                        <table className="portal-table">
                                            <thead><tr><th>ID</th><th>Artist</th><th>Service</th><th>Date</th><th>Time</th><th>Status</th><th>Price</th><th>Action</th></tr></thead>
                                            <tbody>{displayedAppointments.map(a=> (
                                                <tr key={a.id}>
                                                    <td style={{ fontWeight: '600', color: '#64748b' }}>#{a.id}</td>
                                                    <td style={{ fontWeight: '600' }}>{a.artist_name}</td>
                                                    <td>{a.service_type || 'Tattoo'}</td>
                                                    <td>{new Date(a.appointment_date).toLocaleDateString()}</td>
                                                    <td>{a.start_time}</td>
                                                    <td><span className={`status-badge ${a.status.toLowerCase()}`}>{a.status}</span></td>
                                                    <td>
                                                        {a.price > 0 ? (
                                                            <div style={{ fontWeight: 'bold' }}>₱{Number(a.price).toLocaleString()}</div>
                                                        ) : (
                                                            <span style={{color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem'}}>Pending Quote</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            {a.status === 'pending' && a.price > 0 && a.payment_status === 'unpaid' ? (
                                                                <button 
                                                                    className="btn btn-primary" 
                                                                    style={{padding: '6px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px'}}
                                                                    onClick={() => handlePay(a)}
                                                                >
                                                                    <CreditCard size={14}/> Pay Deposit
                                                                </button>
                                                            ) : a.payment_status === 'paid' ? (
                                                                <span className="status-badge-v2 confirmed" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px' }}>
                                                                    <CheckCircle size={12}/> Fully Paid
                                                                </span>
                                                            ) : a.payment_status === 'downpayment_paid' ? (
                                                                <button 
                                                                    className="btn btn-primary" 
                                                                    style={{padding: '6px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#3b82f6', border: 'none'}}
                                                                    onClick={() => handlePay(a, 'balance')}
                                                                >
                                                                    <CreditCard size={14}/> Pay Balance
                                                                </button>
                                                            ) : (
                                                                <span style={{color: '#9ca3af', fontSize: '0.9rem'}}>-</span>
                                                            )}

                                                            <button 
                                                                className="billing-details-btn"
                                                                onClick={() => handleViewDetails(a)}
                                                                style={{ padding: '6px 12px' }}
                                                            >
                                                                <Info size={14} /> Details
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}</tbody>
                                        </table>
                                    </div>
                                    
                                    <Pagination 
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPageChange={setCurrentPage}
                                        itemsPerPage={itemsPerPage}
                                        onItemsPerPageChange={setItemsPerPage}
                                        totalItems={filteredAppointments.length}
                                        unit="bookings"
                                    />
                                </>
                            ) : (
                                <div className="no-data-container" style={{ flex: 1 }}>
                                    <Inbox size={48} className="no-data-icon" />
                                    <p className="no-data-text">No bookings found matching your criteria.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                )}
            </div>
            </div>

            {/* Payment Details Modal */}
            {isModalOpen && selectedApt && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
                        <div className="modal-header">
                            <h3>Payment Details</h3>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="billing-summary" style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ color: '#64748b' }}>Total Service Price:</span>
                                    <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>₱{selectedApt.price.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ color: '#64748b' }}>Amount Paid:</span>
                                    <span style={{ fontWeight: 600, color: '#10b981', fontSize: '1.1rem' }}>
                                        ₱{(modalTransactions.reduce((sum, t) => t.status === 'paid' ? sum + (t.amount / 100) : sum, 0)).toLocaleString()}
                                    </span>
                                </div>
                                <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '15px 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>Remaining Balance:</span>
                                    <span style={{ fontWeight: 800, fontSize: '1.4rem', color: '#0f172a' }}>
                                        ₱{(selectedApt.price - modalTransactions.reduce((sum, t) => t.status === 'paid' ? sum + (t.amount / 100) : sum, 0)).toLocaleString()}
                                    </span>
                                </div>
                                {(selectedApt.price - modalTransactions.reduce((sum, t) => t.status === 'paid' ? sum + (t.amount / 100) : sum, 0)) > 0 && (
                                    <button 
                                        className="btn btn-primary" 
                                        style={{ width: '100%', marginTop: '20px', padding: '12px', borderRadius: '10px', backgroundColor: '#3b82f6', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' }}
                                        onClick={() => {
                                            setIsModalOpen(false);
                                            const hasPaidAny = modalTransactions.some(t => t.status === 'paid');
                                            handlePay(selectedApt, hasPaidAny ? 'balance' : 'deposit');
                                        }}
                                    >
                                        <CreditCard size={18} /> Pay {selectedApt.payment_status === 'downpayment_paid' ? 'Remaining Balance' : 'Deposit Now'}
                                    </button>
                                )}
                            </div>

                            <h4 style={{ marginBottom: '12px', color: '#475569', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transaction History</h4>
                            {modalLoading ? (
                                <div style={{ textAlign: 'center', padding: '20px' }}>Loading history...</div>
                            ) : modalTransactions.length > 0 ? (
                                <div className="mini-transactions" style={{ maxHeight: '180px', overflowY: 'auto', paddingRight: '5px' }}>
                                    {modalTransactions.map(t => (
                                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.95rem' }}>
                                            <div>
                                                <div style={{ fontWeight: 500, color: '#1e293b' }}>{t.status === 'paid' ? 'Payment Successful' : 'Attempted Payment'}</div>
                                                <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{new Date(t.created_at).toLocaleDateString()} at {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                            <div style={{ fontWeight: 600, color: t.status === 'paid' ? '#10b981' : '#f59e0b' }}>
                                                ₱{(t.amount / 100).toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px' }}>
                                    No transaction history found.
                                </div>
                            )}

                            {selectedApt.payment_status === 'downpayment_paid' && (
                                <div style={{ marginTop: '24px' }}>
                                    <button 
                                        className="btn btn-primary" 
                                        style={{ width: '100%', padding: '14px', borderRadius: '10px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                                        onClick={() => { setIsModalOpen(false); handlePay(selectedApt, 'balance'); }}
                                    >
                                        <CreditCard size={20} /> Pay Remaining Balance
                                    </button>
                                    <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem', marginTop: '10px' }}> Secure checkout powered by PayMongo </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Custom New Booking Modal */}
            {isBookingModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '700px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Plus size={24} color="#daa520" /> New Tattoo Consultation</h2>
                            <button className="close-btn" onClick={() => setIsBookingModalOpen(false)}><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSubmitBooking}>
                            <div className="modal-body">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div className="form-group">
                                        <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Choose Your Artist</label>
                                        <select 
                                            className="form-input" 
                                            required 
                                            value={bookingData.artistId}
                                            onChange={e => setBookingData({...bookingData, artistId: e.target.value})}
                                        >
                                            <option value="">Select an Artist</option>
                                            {artists.map(a => <option key={a.id} value={a.id}>{a.name} ({a.specialization})</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Tattoo Idea / Title</label>
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            placeholder="e.g. Traditional Dagger" 
                                            value={bookingData.designTitle}
                                            onChange={e => setBookingData({...bookingData, designTitle: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '15px' }}>
                                    <div className="form-group">
                                        <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Placement on Body</label>
                                        <input 
                                            type="text" 
                                            className="form-input" 
                                            placeholder="e.g. Outer Forearm" 
                                            value={bookingData.placement}
                                            onChange={e => setBookingData({...bookingData, placement: e.target.value})}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Reference Image</label>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <label className="btn btn-secondary" style={{ flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.85rem' }}>
                                                <Upload size={16} /> {bookingData.referenceImage ? 'Change Image' : 'Upload Reference'}
                                                <input type="file" hidden accept="image/*" onChange={handleImageUpload} />
                                            </label>
                                            {bookingData.referenceImage && <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #e2e8f0' }}><img src={bookingData.referenceImage} alt="ref" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '15px' }}>
                                    <div className="form-group">
                                        <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Preferred Date</label>
                                        <input type="date" className="form-input" required value={bookingData.date} onChange={e => setBookingData({...bookingData, date: e.target.value})} min={new Date().toISOString().split('T')[0]} />
                                    </div>
                                    <div className="form-group">
                                        <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Preferred Time</label>
                                        <select className="form-input" required value={bookingData.startTime} onChange={e => setBookingData({...bookingData, startTime: e.target.value})}>
                                            <option value="">Select Time Slot</option>
                                            {['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'].map(t => (
                                                <option key={t} value={t}>{t === '13:00' ? '1:00 PM' : t === '20:00' ? '8:00 PM' : (parseInt(t)-12) + ':00 PM'}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginTop: '15px' }}>
                                    <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Tattoo Details / Story</label>
                                    <textarea 
                                        className="form-input" 
                                        rows="4" 
                                        placeholder="Describe the size, color preference, and any specific details you want included..."
                                        value={bookingData.notes}
                                        onChange={e => setBookingData({...bookingData, notes: e.target.value})}
                                    ></textarea>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setIsBookingModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ backgroundColor: '#daa520', border: 'none', minWidth: '180px' }}>
                                    {isSubmitting ? 'Submitting...' : 'Request Consultation'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmModal 
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                onConfirm={confirmModal.onConfirm}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                type={confirmModal.type}
                isAlert={confirmModal.isAlert}
            />
        </div>
    );
}

export default CustomerBookings;
