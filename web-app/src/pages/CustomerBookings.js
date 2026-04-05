import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Axios from 'axios';
import { Search, ChevronLeft, ChevronRight, Filter, CreditCard, Eye, CheckCircle, Info, X, Calendar, Inbox, Plus, Upload, Camera, Image as ImageIcon, User, Scissors, Heart, Sparkles, Check, ArrowRight, ArrowLeft, MapPin } from 'lucide-react';
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
    const [bookingStep, setBookingStep] = useState(1);
    const [artists, setArtists] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const serviceOptions = ['Tattoo Session', 'Consultation', 'Piercing', 'Follow-up', 'Touch-up'];
    
    const [bookingData, setBookingData] = useState({
        artistId: null, // Artist selection is now optional for the customer
        serviceType: '',
        date: '',
        startTime: '',
        designTitle: '',
        placement: '',
        notes: '',
        referenceImage: null,
    });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedApt, setSelectedApt] = useState(null);
    const [modalTransactions, setModalTransactions] = useState([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [showAftercare, setShowAftercare] = useState(false);
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
            setBookingData(prev => ({ ...prev, designTitle: location.state.designTitle || '' }));
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

    // Calendar Logic
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const renderCalendarDays = () => {
        const days = [];
        const today = new Date();
        today.setHours(0,0,0,0);

        for (let i = 0; i < firstDayOfMonth; i++) days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
        
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dateObj = new Date(dateStr);
            const isPast = dateObj <= today;
            const isSelected = bookingData.date === dateStr;

            days.push(
                <div 
                    key={i} 
                    className={`calendar-day ${isPast ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => !isPast && setBookingData({...bookingData, date: dateStr})}
                >
                    {i}
                </div>
            );
        }
        return days;
    };

    const handleSubmitBooking = async (e) => {
        e.preventDefault();
        if (!bookingData.date || !bookingData.startTime || !bookingData.serviceType || !bookingData.placement) {
            showAlert("Missing Info", "Please select a service, placement, date, and time.", "warning");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await Axios.post(`${API_URL}/api/customer/appointments`, {
                customerId,
                artistId: bookingData.artistId,
                date: bookingData.date,
                startTime: bookingData.startTime,
                serviceType: bookingData.serviceType,
                designTitle: bookingData.designTitle,
                notes: `Placement: ${bookingData.placement}\n\nDetails: ${bookingData.notes}`,
                referenceImage: bookingData.referenceImage
            });

            if (res.data.success) {
                showAlert("Booking Requested", "Your session request has been sent! A confirmation notification with details has been added to your account.", "success");
                setIsBookingModalOpen(false);
                setBookingData({ artistId: '', serviceType: '', date: '', startTime: '', designTitle: '', placement: '', notes: '', referenceImage: null });
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

    const bodyParts = [
        "Forearm", "Upper Arm", "Shoulder", "Chest", "Back", "Ribs", "Thigh", "Calf", "Hand", "Neck", "Wrist", "Ankle"
    ];

    return (
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
            <header className="portal-header">
                <div className="header-title">
                    <h1>My Bookings</h1>
                </div>
                <div className="header-actions">
                    <button className="action-btn" onClick={() => { setBookingStep(1); setIsBookingModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
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
                                            <thead><tr><th>ID</th><th>Staff</th><th>Service</th><th>Date</th><th>Time</th><th>Status</th><th>Price</th><th>Action</th></tr></thead>
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
                                                            ) : a.status === 'completed' ? (
                                                                <button 
                                                                    className="btn btn-primary" 
                                                                    style={{padding: '6px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#10b981', border: 'none'}}
                                                                    onClick={() => { setSelectedApt(a); setShowAftercare(true); }}
                                                                >
                                                                    <Heart size={14}/> Aftercare
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
                    <div className="modal-content" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header">
                            <h3>Appointment Details</h3>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Staff Assigned</label>
                                    <p style={{ margin: '4px 0 0', fontWeight: '600', color: '#1e293b' }}>{selectedApt.artist_name || 'TBD'}</p>
                                </div>
                                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Service Type</label>
                                    <p style={{ margin: '4px 0 0', fontWeight: '600', color: '#1e293b' }}>{selectedApt.service_type || 'General Session'}</p>
                                </div>
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '10px' }}>Vision & Booking Notes</label>
                                <div style={{ padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', color: '#0f172a' }}>{selectedApt.design_title}</h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#475569', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                                        {selectedApt.notes || 'No specific notes provided.'}
                                    </p>
                                    
                                    {selectedApt.reference_image && (
                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                                            <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '10px', textTransform: 'uppercase' }}>Reference Image</p>
                                            <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                                                <img src={selectedApt.reference_image} alt="Reference" style={{ width: '100%', maxHeight: '350px', objectFit: 'contain', background: '#f8fafc' }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <h4 style={{ marginBottom: '12px', color: '#475569', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Financial Summary</h4>
                            <div className="billing-summary" style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ color: '#64748b' }}>Total Service Price:</span>
                                    <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>₱{selectedApt.price.toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <span style={{ color: '#64748b' }}>Amount Paid:</span>
                                    <span style={{ fontWeight: 600, color: '#10b981', fontSize: '1.1rem' }}>
                                        ₱{Number(selectedApt.total_paid || 0).toLocaleString()}
                                    </span>
                                </div>
                                <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '15px 0' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontWeight: 600, color: '#1e293b' }}>Remaining Balance:</span>
                                    <span style={{ fontWeight: 800, fontSize: '1.4rem', color: '#0f172a' }}>
                                        ₱{Math.max(0, selectedApt.price - (selectedApt.total_paid || 0)).toLocaleString()}
                                    </span>
                                </div>
                                {selectedApt.price - (selectedApt.total_paid || 0) > 0 && (
                                    <button 
                                        className="btn btn-primary" 
                                        style={{ width: '100%', marginTop: '20px', padding: '12px', borderRadius: '10px', backgroundColor: '#3b82f6', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 'bold' }}
                                        onClick={() => {
                                            setIsModalOpen(false);
                                            const hasPaidAny = (selectedApt.total_paid || 0) > 0;
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
                                    {modalTransactions.map(t => {
                                        let methodLabel = 'Online Payment';
                                        try {
                                            const raw = typeof t.raw_event === 'string' ? JSON.parse(t.raw_event) : t.raw_event;
                                            if (raw?.method) methodLabel = `Manual (${raw.method})`;
                                        } catch(e) {}
                                        
                                        return (
                                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.95rem' }}>
                                            <div>
                                                <div style={{ fontWeight: 500, color: '#1e293b' }}>
                                                    {t.status === 'paid' ? `Payment Successful` : 'Attempted Payment'}
                                                </div>
                                                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{methodLabel}</div>
                                                <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{new Date(t.created_at).toLocaleDateString()} at {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                            <div style={{ fontWeight: 600, color: t.status === 'paid' ? '#10b981' : '#f59e0b' }}>
                                                ₱{(t.amount / 100).toLocaleString()}
                                            </div>
                                        </div>
                                    )})}
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
                                        style={{ width: '100%', padding: '14px', borderRadius: '10px', color: 'white', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
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

            {showAftercare && selectedApt && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '600px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}><Heart size={20} /> Aftercare Instructions</h3>
                            <button className="close-btn" onClick={() => setShowAftercare(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: '#475569', marginBottom: '20px' }}>Congratulations on your new tattoo! Proper aftercare is crucial for vibrant colors and smooth healing. Please follow these steps carefully:</p>
                            
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                <h4 style={{ color: '#1e293b', marginBottom: '8px' }}>1. The First 24 Hours</h4>
                                <ul style={{ paddingLeft: '20px', color: '#475569', margin: 0 }}>
                                    <li style={{ marginBottom: '4px' }}>Leave the bandage on for 2-4 hours, or overnight if your artist recommended it.</li>
                                    <li>Wash gently with warm water and fragrance-free antibacterial soap. Do not scrub.</li>
                                </ul>
                            </div>
                            
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                                <h4 style={{ color: '#1e293b', marginBottom: '8px' }}>2. Days 2 to 14 (Healing Phase)</h4>
                                <ul style={{ paddingLeft: '20px', color: '#475569', margin: 0 }}>
                                    <li style={{ marginBottom: '4px' }}>Apply a very thin layer of tattoo specific ointment or unscented lotion 2-3 times a day.</li>
                                    <li style={{ marginBottom: '4px' }}>Do NOT pick, scratch, or peel the scabs. Let them fall off naturally.</li>
                                    <li>Avoid direct sunlight, swimming, saunas, and soaking in tubs.</li>
                                </ul>
                            </div>
                            
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <h4 style={{ color: '#1e293b', marginBottom: '8px' }}>3. Long-Term Care</h4>
                                <ul style={{ paddingLeft: '20px', color: '#475569', margin: 0 }}>
                                    <li style={{ marginBottom: '4px' }}>Always apply sunscreen (SPF 50+) when exposed to the sun to prevent fading.</li>
                                    <li>Keep your skin moisturized to keep the ink looking fresh.</li>
                                </ul>
                            </div>
                            
                            <div style={{ marginTop: '24px', padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px' }}>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#166534' }}>
                                    <strong>Questions or concerns?</strong> If your tattoo is extremely red, swollen, or hot to the touch after several days, please reach out to your artist immediately.
                                </p>
                            </div>
                            
                            <div style={{ marginTop: '20px' }}>
                                <button className="btn btn-secondary" onClick={() => setShowAftercare(false)} style={{ width: '100%' }}>Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Custom New Booking Modal */}
            {isBookingModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}><Sparkles size={24} color="#daa520" /> Book Your Next Masterpiece</h2>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                    {[1, 2, 3, 4].map(step => (
                                        <div key={step} style={{ 
                                            height: '4px', flex: 1, borderRadius: '2px',
                                            background: bookingStep >= step ? '#daa520' : '#e2e8f0',
                                            transition: 'all 0.3s'
                                        }} />
                                    ))}
                                </div>
                            </div>
                            <button className="close-btn" onClick={() => setIsBookingModalOpen(false)}><X size={24} /></button>
                        </div>
                        
                        <form onSubmit={handleSubmitBooking}>
                            <div className="modal-body" style={{ padding: '24px' }}>
                                
                                {bookingStep === 1 && (
                                    <div className="fade-in">
                                        <h3 style={{ marginBottom: '20px', color: '#1e293b' }}>1. Service Type</h3>
                                        <div className="form-group">
                                            <label style={{ fontWeight: '600', marginBottom: '12px', display: 'block' }}>What type of service are you looking for?</label>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                                {serviceOptions.map(type => (
                                                    <div 
                                                        key={type}
                                                        onClick={() => setBookingData({...bookingData, serviceType: type})}
                                                        style={{
                                                            padding: '16px', borderRadius: '12px', border: `2px solid ${bookingData.serviceType === type ? '#daa520' : '#e2e8f0'}`,
                                                            background: bookingData.serviceType === type ? '#fffdf5' : 'white', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div style={{ marginTop: '24px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', fontStyle: 'italic' }}>
                                                <Info size={14} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
                                                <strong>Artist Assignment:</strong> Our studio management will review your design and assign the best-suited resident artist for your specific style and complexity.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {bookingStep === 2 && (
                                    <div className="fade-in">
                                        <h3 style={{ marginBottom: '20px', color: '#1e293b' }}>2. Design Details</h3>
                                        <div className="form-group">
                                            <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Tattoo Idea / Title</label>
                                            <input 
                                                type="text" className="form-input" placeholder="e.g. Traditional Dagger with Flowers" 
                                                value={bookingData.designTitle} onChange={e => setBookingData({...bookingData, designTitle: e.target.value})}
                                            />
                                        </div>
                                        <div className="form-group" style={{ marginTop: '16px' }}>
                                            <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Tell us your story (Optional)</label>
                                            <textarea 
                                                className="form-input" rows="4" placeholder="Describe the size, color preferences, and any meaningful details..."
                                                value={bookingData.notes} onChange={e => setBookingData({...bookingData, notes: e.target.value})}
                                            />
                                        </div>
                                        <div className="form-group" style={{ marginTop: '16px' }}>
                                            <label style={{ fontWeight: '600', marginBottom: '8px', display: 'block' }}>Reference Image</label>
                                            <div 
                                                onClick={() => document.getElementById('modal-ref-img').click()}
                                                style={{ 
                                                    height: '120px', border: '2px dashed #e2e8f0', borderRadius: '12px', 
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                                                    cursor: 'pointer', background: bookingData.referenceImage ? '#f8fafc' : 'transparent', overflow: 'hidden'
                                                }}
                                            >
                                                {bookingData.referenceImage ? (
                                                    <img src={bookingData.referenceImage} alt="Ref" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                ) : (
                                                    <>
                                                        <ImageIcon size={24} color="#94a3b8" />
                                                        <span style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '8px' }}>Upload a photo or sketch</span>
                                                    </>
                                                )}
                                                <input type="file" id="modal-ref-img" hidden accept="image/*" onChange={handleImageUpload} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {bookingStep === 3 && (
                                    <div className="fade-in">
                                        <h3 style={{ marginBottom: '20px', color: '#1e293b' }}>3. Placement</h3>
                                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '16px' }}>Where would you like your tattoo?</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                            {["Forearm", "Upper Arm", "Shoulder", "Chest", "Back", "Ribs", "Thigh", "Calf", "Neck", "Wrist", "Hand", "Ankle"].map(part => (
                                                <button
                                                    key={part} type="button"
                                                    onClick={() => setBookingData({...bookingData, placement: part})}
                                                    style={{
                                                        padding: '12px', borderRadius: '10px', border: `1px solid ${bookingData.placement === part ? '#daa520' : '#e2e8f0'}`,
                                                        background: bookingData.placement === part ? '#daa520' : 'white',
                                                        color: bookingData.placement === part ? 'white' : '#1e293b',
                                                        fontWeight: '600', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {part}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="form-group" style={{ marginTop: '20px' }}>
                                            <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: '8px' }}>Specific location notes</label>
                                            <input 
                                                type="text" className="form-input" placeholder="e.g. Left inner forearm, near elbow" 
                                                value={bookingData.placementNotes} onChange={e => setBookingData({...bookingData, placementNotes: e.target.value})} 
                                            />
                                        </div>
                                    </div>
                                )}

                                {bookingStep === 4 && (
                                    <div className="fade-in">
                                        <h3 style={{ marginBottom: '20px', color: '#1e293b' }}>4. Schedule Your Session</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
                                            <div className="calendar-container" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                    <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ChevronLeft size={20}/></button>
                                                    <span style={{ fontWeight: 'bold' }}>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
                                                    <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><ChevronRight size={20}/></button>
                                                </div>
                                                <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', fontSize: '0.8rem' }}>
                                                    {['S','M','T','W','T','F','S'].map(d => <div key={d} style={{ color: '#94a3b8', fontWeight: 'bold', padding: '8px 0' }}>{d}</div>)}
                                                    {renderCalendarDays()}
                                                </div>
                                            </div>
                                            <div className="time-slots">
                                                <label style={{ fontWeight: '600', marginBottom: '12px', display: 'block' }}>Preferred Time Slot</label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                                                    {['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map(t => (
                                                        <div 
                                                            key={t}
                                                            onClick={() => setBookingData({...bookingData, startTime: t})}
                                                            style={{
                                                                padding: '12px', borderRadius: '8px', border: `1px solid ${bookingData.startTime === t ? '#daa520' : '#e2e8f0'}`,
                                                                background: bookingData.startTime === t ? '#daa520' : 'white',
                                                                color: bookingData.startTime === t ? 'white' : '#1e293b',
                                                                textAlign: 'center', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem'
                                                            }}
                                                        >
                                                            {parseInt(t) > 12 ? (parseInt(t)-12) + ':00 PM' : t + ':00 PM'}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {bookingData.date && bookingData.startTime && (
                                            <div style={{ marginTop: '24px', padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <CheckCircle size={20} color="#16a34a" />
                                                <span style={{ fontSize: '0.9rem', color: '#166534', fontWeight: '500' }}>
                                                    Selected: {new Date(bookingData.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} at {bookingData.startTime}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer" style={{ background: '#f8fafc', padding: '16px 24px', display: 'flex', justifyContent: 'space-between' }}>
                                <button 
                                    type="button" className="btn btn-secondary" 
                                    onClick={() => bookingStep === 1 ? setIsBookingModalOpen(false) : setBookingStep(bookingStep - 1)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    {bookingStep === 1 ? 'Cancel' : <><ArrowLeft size={16}/> Previous</>}
                                </button>
                                
                                {bookingStep < 4 ? (
                                    <button 
                                        type="button" className="btn btn-primary" 
                                        onClick={() => setBookingStep(bookingStep + 1)}
                                        style={{ backgroundColor: '#1e293b', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
                                        disabled={(bookingStep === 1 && !bookingData.serviceType) || (bookingStep === 2 && !bookingData.designTitle)}
                                    >
                                        Next Step <ArrowRight size={16}/>
                                    </button>
                                ) : (
                                    <button 
                                        type="submit" className="btn btn-primary" 
                                        disabled={isSubmitting || !bookingData.date || !bookingData.startTime} 
                                        style={{ backgroundColor: '#daa520', border: 'none', minWidth: '180px' }}
                                    >
                                        {isSubmitting ? 'Submitting...' : 'Request Session'}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .calendar-day {
                    aspect-ratio: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.2s;
                }
                .calendar-day:hover:not(.disabled) { background: #f1f5f9; }
                .calendar-day.selected { background: #daa520 !important; color: white !important; font-weight: bold; }
                .calendar-day.disabled { opacity: 0.2; cursor: not-allowed; }
                .fade-in { animation: fadeIn 0.3s ease-in-out; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

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
