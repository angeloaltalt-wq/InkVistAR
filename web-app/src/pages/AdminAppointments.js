import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, List, ChevronLeft, ChevronRight, Search, Filter, SlidersHorizontal, Plus, Check, X, User, Palette, Clock, CreditCard, DollarSign } from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ConfirmModal';
import './AdminAppointments.css';
import { API_URL } from '../config';

function AdminAppointments() {
    const navigate = useNavigate();
    const location = useLocation();
    const [appointments, setAppointments] = useState([]);
    const [artists, setArtists] = useState([]);
    const [clients, setClients] = useState([]);

    const [filteredAppointments, setFilteredAppointments] = useState(appointments);
    const [viewMode, setViewMode] = useState('calendar'); // Defaults to calendar
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [quickFilter, setQuickFilter] = useState('all'); // 'upcoming', 'latest', 'all'
    const [dateFilter, setDateFilter] = useState('');
    const [sortBy, setSortBy] = useState('date');
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [appointmentModal, setAppointmentModal] = useState({ mounted: false, visible: false });
    const [manualPaymentModal, setManualPaymentModal] = useState({ isOpen: false, amount: '', method: 'Cash' });
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'danger', isAlert: false });
    const [formData, setFormData] = useState({
        clientId: '',
        artistId: '',
        serviceType: '',
        designTitle: '',
        date: '',
        time: '',
        status: 'confirmed',
        paymentStatus: 'unpaid',
        notes: '',
        price: 0,
        manualPaidAmount: 0,
        manualPaymentMethod: 'Cash'
    });
    const [dayViewModal, setDayViewModal] = useState({ isOpen: false, date: '', appointments: [] });

    // Modal animation handlers
    const openModal = () => {
        setAppointmentModal({ mounted: true, visible: false });
        setTimeout(() => setAppointmentModal({ mounted: true, visible: true }), 10);
    };

    const closeModal = () => {
        setAppointmentModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setAppointmentModal({ mounted: false, visible: false });
        }, 400);
    };

    useEffect(() => {
        fetchAppointments();
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await Axios.get(`${API_URL}/api/debug/users`);
            if (response.data.success) {
                setArtists(response.data.users.filter(u => u.user_type === 'artist'));
                setClients(response.data.users.filter(u => u.user_type === 'customer'));
            }
        } catch (error) {
            console.error("Error fetching users:", error);
        }
    };

    const fetchAppointments = async () => {
        try {
            setLoading(true);
            const response = await Axios.get(`${API_URL}/api/admin/appointments`);
            if (response.data.success) {
                const mappedAppointments = response.data.data.map(apt => ({
                    id: apt.id,
                    clientName: apt.client_name,
                    clientId: apt.customer_id,
                    artistName: apt.artist_name,
                    artistId: apt.artist_id,
                    serviceType: apt.service_type || (apt.design_title?.includes(':') ? apt.design_title.split(':')[0] : (apt.notes?.toLowerCase().includes('consultation') ? 'Consultation' : 'Tattoo Session')),
                    designTitle: apt.design_title?.includes(':') ? apt.design_title.split(':')[1]?.trim() : apt.design_title,
                    date: apt.appointment_date ? (apt.appointment_date.includes('T') ? apt.appointment_date.split('T')[0] : apt.appointment_date.substring(0, 10)) : '',
                    time: apt.start_time,
                    status: apt.status,
                    paymentStatus: apt.payment_status,
                    notes: apt.notes,
                    beforePhoto: apt.before_photo,
                    afterPhoto: apt.after_photo,
                    price: apt.price || 0,
                    totalPaid: apt.total_paid || 0,
                    manualPaidAmount: apt.manual_paid_amount || 0,
                    manualPaymentMethod: apt.manual_payment_method || 'Cash'
                }));
                setAppointments(mappedAppointments);
                setFilteredAppointments(mappedAppointments);
                setLoading(false);
                return mappedAppointments;
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching appointments:", error);
            setLoading(false);
            return []; // Return empty on error
        }
    };

    const handleDayClick = (dateString) => {
        const dayAppts = appointments.filter(apt => {
            const aptDate = apt.date ? (apt.date.includes('T') ? apt.date.split('T')[0] : apt.date.substring(0, 10)) : '';
            return aptDate === dateString;
        });
        setDayViewModal({ isOpen: true, date: dateString, appointments: dayAppts });
    };

    useEffect(() => {
        filterAndSortAppointments();
    }, [appointments, searchTerm, statusFilter, serviceFilter, quickFilter, dateFilter, sortBy]);

    const filterAndSortAppointments = () => {
        let filtered = appointments.filter(apt => {
            const matchesSearch =
                (apt.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (apt.artistName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (apt.serviceType || '').toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'all' || apt.status === statusFilter;
            const matchesService = serviceFilter === 'all' || apt.serviceType === serviceFilter;
            const matchesDate = !dateFilter || apt.date === dateFilter;

            let matchesQuick = true;
            if (quickFilter === 'upcoming') {
                const today = new Date().toISOString().split('T')[0];
                matchesQuick = apt.date >= today && apt.status !== 'cancelled' && apt.status !== 'completed';
            }

            return matchesSearch && matchesStatus && matchesService && matchesDate && matchesQuick;
        });

        // Reset pagination on filter change
        setCurrentPage(1);

        // Sort
        if (quickFilter === 'latest') {
            filtered.sort((a, b) => b.id - a.id);
        } else if (sortBy === 'date') {
            filtered.sort((a, b) => new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time));
        } else if (sortBy === 'client') {
            filtered.sort((a, b) => a.clientName.localeCompare(b.clientName));
        } else if (sortBy === 'artist') {
            filtered.sort((a, b) => a.artistName.localeCompare(b.artistName));
        } else if (sortBy === 'status') {
            filtered.sort((a, b) => a.status.localeCompare(b.status));
        }

        setFilteredAppointments(filtered);
    };

    // Calendar Helpers
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

    const changeMonth = (offset) => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
    };

    const getAppointmentsForDate = (day) => {
        return appointments.filter(a => {
            if (!a.date) return false;
            const [y, m, d] = a.date.split('-').map(Number);
            return d === day &&
                (m - 1) === currentDate.getMonth() &&
                y === currentDate.getFullYear() &&
                a.status !== 'cancelled';
        });
    };

    const showConfirm = (message, onConfirm) => {
        setConfirmDialog({ isOpen: true, title: 'Confirm Action', message, onConfirm, type: 'info', isAlert: !onConfirm });
    };

    const showAlert = (title, message, type = 'info') => {
        setConfirmDialog({ isOpen: true, title, message, type, isAlert: true, onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })) });
    };

    const handleStatusUpdate = async (id, status, clientName = 'this client') => {
        const actionVerb = status === 'confirmed' ? 'confirm' : status === 'completed' ? 'complete' : 'cancel';
        
        showConfirm(
            `Confirm ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            `Are you sure you want to ${actionVerb} this appointment for ${clientName}? A notification will be sent to them.`,
            async () => {
                try {
                    await Axios.put(`${API_URL}/api/appointments/${id}/status`, { status });
                    fetchAppointments();
                    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                } catch (error) {
                    console.error('Error updating status:', error);
                }
            }
        );
    };

    const handleEdit = (appointment) => {
        setSelectedAppointment(appointment);
        setFormData({
            clientId: appointment.clientId || appointment.customer_id,
            artistId: appointment.artistId || appointment.artist_id,
            secondaryArtistId: appointment.secondary_artist_id || '',
            commissionSplit: appointment.commission_split || 50,
            serviceType: appointment.serviceType || appointment.service_type,
            designTitle: appointment.designTitle || appointment.design_title,
            date: appointment.date || appointment.appointment_date,
            time: appointment.time || appointment.start_time,
            status: appointment.status,
            paymentStatus: appointment.paymentStatus || appointment.payment_status,
            notes: appointment.notes,
            price: appointment.price,
            manualPaidAmount: appointment.manualPaidAmount || 0,
            manualPaymentMethod: appointment.manualPaymentMethod || 'Cash'
        });
        setClientSearch(appointment.clientName);
        openModal();
    };

    const handleDelete = (id) => {
        showConfirm('Are you sure you want to delete this appointment? This cannot be undone.', () => {
            setAppointments(appointments.filter(a => a.id !== id));
            Axios.delete(`${API_URL}/api/admin/appointments/${id}`)
                .then(() => fetchAppointments())
                .catch(err => console.error(err));
        });
    };

    const handleAddNew = (prefilledDate = null) => {
        setSelectedAppointment(null);
        setFormData({
            clientId: '',
            artistId: '',
            secondaryArtistId: '',
            commissionSplit: 50,
            serviceType: '',
            date: prefilledDate || new Date().toISOString().split('T')[0],
            time: '13:00',
            status: 'pending',
            paymentStatus: 'unpaid',
            notes: '',
            price: 0,
            manualPaidAmount: 0,
            manualPaymentMethod: 'Cash'
        });
        setClientSearch('');
        openModal();
    };

    const handleSave = async () => {
        if (!formData.clientId || !formData.artistId || !formData.date || !formData.time) {
            showConfirm('Please fill in all required fields (Client, Artist, Date, Time).', null);
            return;
        }

        let priceInput = formData.price ? String(formData.price).replace(/[^0-9.]/g, '') : '0';
        let priceValue = parseFloat(priceInput);
        const finalPrice = (!priceValue || priceValue < 0) ? 0 : priceValue;

        const doSave = async () => {
            try {
                const payload = {
                    customerId: formData.clientId,
                    artistId: formData.artistId,
                    secondaryArtistId: formData.secondaryArtistId || null,
                    commissionSplit: formData.commissionSplit || 50,
                    serviceType: formData.serviceType,
                    designTitle: formData.designTitle,
                    date: formData.date,
                    startTime: formData.time,
                    status: formData.status,
                    paymentStatus: formData.paymentStatus,
                    notes: formData.notes,
                    price: finalPrice,
                    manualPaidAmount: parseFloat(formData.manualPaidAmount) || 0,
                    manualPaymentMethod: formData.manualPaymentMethod
                };

                if (selectedAppointment) {
                    await Axios.put(`${API_URL}/api/admin/appointments/${selectedAppointment.id}`, payload);
                } else {
                    await Axios.post(`${API_URL}/api/admin/appointments`, payload);
                }
                closeModal();
                fetchAppointments();
            } catch (error) {
                console.error('Error saving appointment:', error);
                alert('Failed to save appointment. Please check if your data was filled correctly.');
            } finally {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            }
        };

        showConfirm(
            selectedAppointment ? 'Save changes to this appointment?' : 'Create this new appointment?',
            doSave
        );
    };

    const handleApplyManualPayment = async () => {
        const remainingBalance = Math.max(0, formData.price - (selectedAppointment?.totalPaid || 0));
        const inputAmount = parseFloat(manualPaymentModal.amount);

        if (!inputAmount || inputAmount <= 0) return;

        if (inputAmount > remainingBalance) {
            showAlert('Invalid Amount', `Amount exceeds the remaining balance of ₱${remainingBalance.toLocaleString()}`, 'warning');
            return;
        }

        try {
            const res = await Axios.post(`${API_URL}/api/admin/appointments/${selectedAppointment.id}/manual-payment`, {
                amount: manualPaymentModal.amount,
                method: manualPaymentModal.method
            });
            if (res.data.success) {
                setManualPaymentModal({ ...manualPaymentModal, isOpen: false, amount: '' });
                // Refresh the list and update the locally selected appointment to show the new balance
                const newList = await fetchAppointments();
                const freshData = newList.find(a => a.id === selectedAppointment.id);
                if (freshData) setSelectedAppointment(freshData);
            }
        } catch (error) {
            showAlert("Payment Failed", error.response?.data?.message || "Failed to record payment", "danger");
        }
    };

    const handleMultiSession = () => {
        setFormData({ ...formData, notes: formData.notes + '\n[Multi-Session: Session 1 of X]' });
    };

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'scheduled': return 'scheduled';
            case 'confirmed': return 'scheduled'; // Map confirmed to scheduled color
            case 'completed': return 'completed';
            case 'pending': return 'pending';
            case 'cancelled': return 'cancelled';
            default: return 'scheduled';
        }
    };

    const handleExport = () => {
        const headers = ['Appointment ID', 'Client Name', 'Artist', 'Service Type', 'Date', 'Time', 'Status', 'Price'];
        const csvContent = [
            headers.join(','),
            ...filteredAppointments.map(a =>
                `${a.id},"${a.clientName}","${a.artistName}","${a.serviceType}",${a.date},${a.time},${a.status},${a.price}`
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `appointments_export_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const handlePrint = () => {
        window.print();
    };

    const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
    const currentItems = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
                {/* Print Only Header */}
                <div className="print-only-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px' }}>
                        <div>
                            <h1 style={{ margin: 0, color: '#000' }}>InkVistAR Studio</h1>
                            <p style={{ margin: 0 }}>Appointments & Schedule Report</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0 }}>Date: {new Date().toLocaleDateString()}</p>
                            <p style={{ margin: 0 }}>View: {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}</p>
                        </div>
                    </div>
                </div>
                <header className="admin-header" style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: 'none', color: '#1f2937' }}>
                    <h1>Appointment Management</h1>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div className="view-toggle" style={{ display: 'flex', gap: '10px' }}>
                            <button
                                className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setViewMode('list')}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.5rem 1rem' }}
                            >
                                <List size={16} /> List
                            </button>
                            <button
                                className={`btn ${viewMode === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setViewMode('calendar')}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.5rem 1rem' }}
                            >
                                <Calendar size={16} /> Calendar
                            </button>
                        </div>
                        <button className="btn btn-primary" onClick={handleAddNew}>
                            + New Appointment
                        </button>
                        <button className="btn btn-secondary" onClick={handleExport}>
                            Export CSV
                        </button>
                        <button className="btn btn-secondary" onClick={handlePrint}>
                            Print
                        </button>
                    </div>
                </header>

                {viewMode === 'calendar' ? (
                    <div className="data-card" style={{ margin: '2rem' }}>
                        <div className="calendar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button onClick={() => changeMonth(-1)} className="action-btn" style={{ margin: 0 }}><ChevronLeft size={20} /></button>
                                <button onClick={() => setCurrentDate(new Date())} className="action-btn" style={{ margin: 0, padding: '0.4rem 1rem', background: 'transparent', border: '1px solid #e2e8f0', color: '#64748b' }}>Today</button>
                                <button onClick={() => changeMonth(1)} className="action-btn" style={{ margin: 0 }}><ChevronRight size={20} /></button>
                            </div>
                            <h2 style={{ margin: 0, border: 'none' }}>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                            <div style={{ width: '150px' }}></div>
                        </div>
                        <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                <div key={d} style={{ fontWeight: 'bold', textAlign: 'center', padding: '10px', color: '#64748b' }}>{d}</div>
                            ))}
                            {[...Array(firstDayOfMonth)].map((_, i) => <div key={`empty-${i}`} style={{ background: '#f8fafc', borderRadius: '8px' }}></div>)}
                            {[...Array(daysInMonth)].map((_, i) => {
                                const day = i + 1;
                                const dayAppts = getAppointmentsForDate(day);
                                const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();

                                return (
                                    <div key={day} style={{
                                        border: isToday ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                        minHeight: '100px',
                                        padding: '8px',
                                        borderRadius: '8px',
                                        backgroundColor: 'white',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                        className="calendar-day-cell"
                                        onClick={() => handleDayClick(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '5px', color: isToday ? '#6366f1' : '#334155', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{day}</span>
                                            <Plus size={12} style={{ opacity: 0.5 }} />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: 'auto' }}>
                                            {dayAppts.length > 0 && (
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    padding: '4px',
                                                    borderRadius: '4px',
                                                    backgroundColor: '#e0e7ff',
                                                    color: '#3730a3',
                                                    textAlign: 'center',
                                                    fontWeight: '600'
                                                }}>
                                                    {dayAppts.length} {dayAppts.length === 1 ? 'Booking' : 'Bookings'}
                                                </div>
                                            )}
                                            {dayAppts.length > 0 && (
                                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    {dayAppts.slice(0, 5).map(apt => (
                                                        <div key={apt.id} style={{
                                                            width: '8px', 
                                                            height: '8px', 
                                                            borderRadius: '50%',
                                                            backgroundColor: apt.status === 'confirmed' ? '#10b981' : (apt.status === 'pending' ? '#f59e0b' : '#6366f1')
                                                        }} title={apt.status} />
                                                    ))}
                                                    {dayAppts.length > 5 && <span style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '8px' }}>+</span>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="premium-filter-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                <div className="premium-search-box" style={{ flex: 1, minWidth: '300px' }}>
                                    <Search size={18} className="text-muted" />
                                    <input
                                        type="text"
                                        placeholder="Search appointments..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>

                                <div className="quick-filters" style={{
                                    display: 'flex',
                                    background: 'rgba(255,255,255,0.5)',
                                    padding: '4px',
                                    borderRadius: '12px',
                                    border: '1px solid #e2e8f0',
                                    gap: '4px'
                                }}>
                                    {[
                                        { id: 'all', label: 'All', icon: <Filter size={14} /> },
                                        { id: 'upcoming', label: 'Upcoming', icon: <Plus size={14} /> },
                                        { id: 'latest', label: 'Latest Added', icon: <Plus size={14} style={{ transform: 'rotate(45deg)' }} /> }
                                    ].map(filter => (
                                        <button
                                            key={filter.id}
                                            onClick={() => setQuickFilter(filter.id)}
                                            className={`badge ${quickFilter === filter.id ? 'status-confirmed' : ''}`}
                                            style={{
                                                border: 'none',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '8px 16px',
                                                background: quickFilter === filter.id ? '' : 'transparent',
                                                color: quickFilter === filter.id ? '' : '#64748b',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {filter.icon}
                                            {filter.label}
                                        </button>
                                    ))}
                                    {(searchTerm || quickFilter !== 'all' || statusFilter !== 'all' || serviceFilter !== 'all' || dateFilter) && (
                                        <button
                                            onClick={() => {
                                                setSearchTerm('');
                                                setQuickFilter('all');
                                                setStatusFilter('all');
                                                setServiceFilter('all');
                                                setDateFilter('');
                                            }}
                                            className="badge"
                                            style={{
                                                border: 'none',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '8px 16px',
                                                background: 'transparent',
                                                color: '#ef4444',
                                                transition: 'all 0.2s',
                                                fontWeight: '600'
                                            }}
                                        >
                                            <X size={14} />
                                            Clear Filters
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="premium-filters-group" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: '600', marginRight: '0.5rem' }}>
                                    <Filter size={16} />
                                    <span>Refine:</span>
                                </div>

                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="premium-select-v2"
                                    style={{ minWidth: '140px' }}
                                >
                                    <option value="all">All Status</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="scheduled">Scheduled</option>
                                    <option value="pending">Pending</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>

                                <select
                                    value={serviceFilter}
                                    onChange={(e) => setServiceFilter(e.target.value)}
                                    className="premium-select-v2"
                                    style={{ minWidth: '160px' }}
                                >
                                    <option value="all">All Services</option>
                                    <option value="Tattoo Session">Tattoo Session</option>
                                    <option value="Consultation">Consultation</option>
                                    <option value="Piercing">Piercing</option>
                                    <option value="Follow-up">Follow-up</option>
                                    <option value="Touch-up">Touch-up</option>
                                </select>

                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="premium-select-v2"
                                    style={{ paddingRight: '1rem', backgroundImage: 'none' }}
                                />

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.85rem', fontWeight: '600', marginLeft: '0.5rem' }}>
                                    <SlidersHorizontal size={16} />
                                    <span>Sort:</span>
                                </div>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="premium-select-v2"
                                >
                                    <option value="date">Date</option>
                                    <option value="client">Client</option>
                                    <option value="artist">Artist</option>
                                    <option value="status">Status</option>
                                </select>
                            </div>
                        </div>

                        <div className="stats-row">
                            <div className="stat-item">
                                <span className="stat-label">Total Appointments</span>
                                <span className="stat-count">{appointments.length}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Scheduled</span>
                                <span className="stat-count">{appointments.filter(a => a.status === 'scheduled').length}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Completed</span>
                                <span className="stat-count">{appointments.filter(a => a.status === 'completed').length}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Pending</span>
                                <span className="stat-count">{appointments.filter(a => a.status === 'pending').length}</span>
                            </div>
                        </div>

                        <div className="table-card-container">
                            <div className="table-responsive">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Appointment ID</th>
                                            <th>Client Name</th>
                                            <th>Artist</th>
                                            <th>Service</th>
                                            <th>Date</th>
                                            <th>Time</th>
                                            <th>Status</th>
                                            <th>Payment</th>
                                            <th>Price</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="10" className="no-data" style={{ textAlign: 'center', padding: '2rem' }}>Loading appointments...</td></tr>
                                        ) : currentItems.length > 0 ? (
                                            currentItems.map((appointment) => (
                                                <tr key={appointment.id}>
                                                    <td>#{appointment.id}</td>
                                                    <td>{appointment.clientName}</td>
                                                    <td>{appointment.artistName}</td>
                                                    <td>{appointment.serviceType}</td>
                                                    <td>{appointment.date}</td>
                                                    <td>{appointment.time}</td>
                                                    <td>
                                                        <span className={`badge status-${getStatusColor(appointment.status || 'pending')}`}>
                                                            {appointment.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {appointment.paymentStatus === 'paid' ? (
                                                            <span className="badge status-confirmed" style={{ backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #10b981' }}>Fully Paid</span>
                                                        ) : appointment.paymentStatus === 'downpayment_paid' ? (
                                                            <span className="badge" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #3b82f6' }}>Downpayment</span>
                                                        ) : appointment.price > 0 ? (
                                                            appointment.totalPaid >= appointment.price ? (
                                                                <span className="badge status-confirmed" style={{ backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #10b981' }}>Fully Paid</span>
                                                            ) : appointment.totalPaid > 0 ? (
                                                                <span className="badge" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #3b82f6' }}>Balance: ₱{(appointment.price - appointment.totalPaid).toLocaleString()}</span>
                                                            ) : (
                                                                <span className="badge" style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #ef4444' }}>Unpaid</span>
                                                            )
                                                        ) : (
                                                            <span className="badge" style={{ backgroundColor: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb' }}>No Charge</span>
                                                        )}
                                                    </td>
                                                    <td>₱{Number(appointment.price).toLocaleString()}</td>
                                                    <td className="actions-cell">
                                                        {/* Consultation-specific pending: Approve + Reject */}
                                                        {appointment.serviceType?.toLowerCase() === 'consultation' && appointment.status === 'pending' && (
                                                            <>
                                                                <button className="action-btn view-btn" style={{ backgroundColor: '#10b981', marginRight: '5px' }} onClick={() => handleStatusUpdate(appointment.id, 'confirmed', appointment.clientName)} title="Approve Consultation">
                                                                    Approve
                                                                </button>
                                                                <button className="action-btn delete-btn" style={{ marginRight: '5px' }} onClick={() => handleStatusUpdate(appointment.id, 'cancelled', appointment.clientName)}>
                                                                    Reject
                                                                </button>
                                                            </>
                                                        )}
                                                        {/* Consultation confirmed: Done button */}
                                                        {appointment.serviceType?.toLowerCase() === 'consultation' && appointment.status?.toLowerCase() === 'confirmed' && (
                                                            <button
                                                                className="action-btn view-btn"
                                                                style={{ backgroundColor: '#8b5cf6', marginRight: '5px' }}
                                                                onClick={() => handleStatusUpdate(appointment.id, 'completed', appointment.clientName)}
                                                                title="Mark Consultation as Done"
                                                            >
                                                                <Check size={14} /> Done
                                                            </button>
                                                        )}
                                                        {/* Non-consultation pending: only Reject */}
                                                        {appointment.serviceType?.toLowerCase() !== 'consultation' && appointment.status === 'pending' && (
                                                            <button className="action-btn delete-btn" style={{ marginRight: '5px' }} onClick={() => handleStatusUpdate(appointment.id, 'cancelled', appointment.clientName)}>
                                                                Reject
                                                            </button>
                                                        )}
                                                        <button className="action-btn edit-btn" onClick={() => handleEdit(appointment)}>
                                                            Edit
                                                        </button>
                                                        <button className="action-btn delete-btn" onClick={() => handleDelete(appointment.id)}>
                                                            Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="10" className="no-data">No appointments found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                                itemsPerPage={itemsPerPage}
                                onItemsPerPageChange={(newVal) => {
                                    setItemsPerPage(newVal);
                                    setCurrentPage(1);
                                }}
                                totalItems={filteredAppointments.length}
                                unit="appointments"
                            />
                        </div>
                    </>
                )}

                {/* Modal */}
                {appointmentModal.mounted && (
                    <div className={`modal-overlay ${appointmentModal.visible ? 'open' : ''}`} onClick={closeModal}>
                        <div className="modal-content" style={{ maxWidth: '800px', width: '95%', overflowX: 'hidden', boxSizing: 'border-box' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header" style={{ paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h2 style={{ margin: 0 }}>{selectedAppointment ? `Edit Appointment #${selectedAppointment.id}` : 'New Appointment'}</h2>
                                    {selectedAppointment && (
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                            <span className={`badge status-${getStatusColor(selectedAppointment.status)}`}>{selectedAppointment.status}</span>
                                            {selectedAppointment.price > 0 && (
                                                <span className="badge" style={{
                                                    backgroundColor: selectedAppointment.totalPaid >= selectedAppointment.price ? '#ecfdf5' : '#eff6ff',
                                                    color: selectedAppointment.totalPaid >= selectedAppointment.price ? '#059669' : '#1d4ed8',
                                                    border: `1px solid ${selectedAppointment.totalPaid >= selectedAppointment.price ? '#10b981' : '#3b82f6'}`
                                                }}>
                                                    Paid: ₱{selectedAppointment.totalPaid.toLocaleString()} / ₱{selectedAppointment.price.toLocaleString()}
                                                    {selectedAppointment.totalPaid < selectedAppointment.price && ` (Balance: ₱${(selectedAppointment.price - selectedAppointment.totalPaid).toLocaleString()})`}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <button className="close-btn" onClick={closeModal}>×</button>
                            </div>
                            <div className="modal-body">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                                    {/* Left Column: People & Service */}
                                    <div>
                                        <h3 style={{ fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <User size={16} /> Client & Artist
                                        </h3>
                                        <div className="form-group" style={{ position: 'relative' }}>
                                            <label>Client Selection *</label>
                                            {formData.clientId ? (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '12px', border: '2px solid #10b981', width: '100%' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ background: '#d1fae5', padding: '6px', borderRadius: '50%' }}>
                                                            <User size={16} color="#10b981" />
                                                        </div>
                                                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{clients.find(c => c.id == formData.clientId)?.name || clientSearch}</span>
                                                    </div>
                                                    <button type="button" onClick={() => { setFormData(prev => ({...prev, clientId: null})); setClientSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="premium-search-box" style={{ maxWidth: '100%', marginBottom: '5px' }}>
                                                        <Search size={16} />
                                                        <input
                                                            type="text"
                                                            placeholder="Search clients..."
                                                            value={clientSearch}
                                                            onChange={(e) => setClientSearch(e.target.value)}
                                                        />
                                                    </div>
                                                    {clientSearch && (
                                                        <div className="glass-card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, maxHeight: '150px', overflowY: 'auto', background: 'white' }}>
                                                            {clients.filter(c => c.name && c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                                                                <div key={c.id} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => { setFormData({ ...formData, clientId: c.id }); setClientSearch(c.name); }}>
                                                                    <User size={14} color="#C19A6B" />
                                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.name}</div>
                                                                </div>
                                                            ))}
                                                            {clients.filter(c => c.name && c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                                                                <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>No clients found</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        <div className="form-group" style={{ marginTop: '15px' }}>
                                            <label>Assign Primary Artist *</label>
                                            <select value={formData.artistId} onChange={(e) => setFormData({ ...formData, artistId: e.target.value })} className="premium-select-v2" style={{ width: '100%' }}>
                                                <option value="">Select Artist</option>
                                                {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                            </select>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
                                            <div className="form-group">
                                                <label>Secondary Artist</label>
                                                <select value={formData.secondaryArtistId || ''} onChange={(e) => setFormData({ ...formData, secondaryArtistId: e.target.value })} className="premium-select-v2" style={{ width: '100%' }}>
                                                    <option value="">None (Solo)</option>
                                                    {artists.filter(a => a.id !== formData.artistId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                                </select>
                                            </div>
                                            {formData.secondaryArtistId && (
                                                <div className="form-group">
                                                    <label>Split % (Primary/Sec)</label>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <input 
                                                            type="number" 
                                                            min="1" 
                                                            max="99" 
                                                            value={formData.commissionSplit} 
                                                            onChange={(e) => setFormData({ ...formData, commissionSplit: parseInt(e.target.value) })}
                                                            className="premium-input-v2" 
                                                            style={{ width: '60px', textAlign: 'center' }} 
                                                        />
                                                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>/ {100 - (formData.commissionSplit || 0)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <h3 style={{ fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '30px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Palette size={16} /> Service Information
                                        </h3>
                                        <div className="form-group">
                                            <label>Service Type *</label>
                                            <select value={formData.serviceType} onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })} className="premium-select-v2" style={{ width: '100%' }}>
                                                <option value="Tattoo Session">Tattoo Session</option>
                                                <option value="Consultation">Consultation</option>
                                                <option value="Piercing">Piercing</option>
                                                <option value="Touch-up">Touch-up</option>
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ marginTop: '15px' }}>
                                            <label>Design Title / Idea</label>
                                            <input type="text" value={formData.designTitle} onChange={(e) => setFormData({ ...formData, designTitle: e.target.value })} className="premium-input-v2" placeholder="e.g. Neo-Traditional Dagger" style={{ width: '100%' }} />
                                        </div>
                                    </div>

                                    {/* Right Column: Schedule & Pricing */}
                                    <div>
                                        <h3 style={{ fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Clock size={16} /> Schedule
                                        </h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '15px' }}>
                                            <div className="form-group">
                                                <label>Date *</label>
                                                <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="premium-select-v2" style={{ width: '100%', backgroundImage: 'none' }} />
                                            </div>
                                            <div className="form-group">
                                                <label>Time *</label>
                                                <input type="time" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} className="premium-select-v2" style={{ width: '100%', backgroundImage: 'none' }} />
                                            </div>
                                        </div>
                                        <div className="form-group" style={{ marginTop: '15px' }}>
                                            <label>Appointment Status</label>
                                            <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="premium-select-v2" style={{ width: '100%' }}>
                                                <option value="pending">Pending Review</option>
                                                <option value="confirmed">Confirmed</option>
                                                <option value="completed">Completed</option>
                                                <option value="cancelled">Cancelled</option>
                                            </select>
                                        </div>

                                        <h3 style={{ fontSize: '0.9rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '30px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <DollarSign size={16} /> Pricing & Payment
                                        </h3>
                                        <div className="form-group">
                                            <label>Total Quoted Price (₱)</label>
                                            <input type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="premium-input-v2" style={{ width: '100%', backgroundImage: 'none' }} />
                                        </div>

                                        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', marginTop: '15px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                <label style={{ margin: 0 }}>Financial Summary</label>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    style={{
                                                        padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '5px',
                                                        opacity: (!selectedAppointment || (selectedAppointment.totalPaid >= formData.price)) ? 0.5 : 1,
                                                        cursor: (!selectedAppointment || (selectedAppointment.totalPaid >= formData.price)) ? 'not-allowed' : 'pointer'
                                                    }}
                                                    onClick={() => selectedAppointment && (selectedAppointment.totalPaid < formData.price) && setManualPaymentModal({ ...manualPaymentModal, isOpen: true, amount: '' })}
                                                    disabled={!selectedAppointment || (selectedAppointment.totalPaid >= formData.price)}
                                                >
                                                    <Plus size={14} /> Adjust Manually
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                <span style={{ color: '#64748b' }}>Total Collected: ₱{Number(selectedAppointment?.totalPaid || 0).toLocaleString()}</span>
                                                <span style={{ fontWeight: '600', color: '#3b82f6' }}>Balance: ₱{Math.max(0, (formData.price || 0) - (selectedAppointment?.totalPaid || 0)).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginTop: '20px' }}>
                                    <label>Notes</label>
                                    <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="premium-select-v2" style={{ width: '100%', height: 'auto', backgroundImage: 'none' }} rows="3" />
                                </div>
                            </div>
                            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                                <div className="footer-left">
                                    {selectedAppointment && (
                                        <button
                                            className="btn btn-secondary"
                                            style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}
                                            onClick={() => {
                                                handleDelete(selectedAppointment.id);
                                                closeModal();
                                            }}
                                        >
                                            Delete Appointment
                                        </button>
                                    )}
                                </div>
                                <div className="footer-right" style={{ display: 'flex', gap: '1rem' }}>
                                    <button className="btn btn-secondary" onClick={closeModal}>
                                        Cancel
                                    </button>
                                    <button className="btn btn-primary" onClick={handleSave}>
                                        Save Appointment
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Manual Payment Sub-Modal */}
                {manualPaymentModal.isOpen && (
                    <div className="modal-overlay" style={{ zIndex: 3000 }}>
                        <div className="modal-content" style={{ maxWidth: '400px' }}>
                            <div className="modal-header">
                                <h3>Insert Payment Manually</h3>
                                <button className="close-btn" onClick={() => setManualPaymentModal({ isOpen: false })}><X size={20} /></button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Amount to Add (₱)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={manualPaymentModal.amount}
                                        onChange={e => setManualPaymentModal({ ...manualPaymentModal, amount: e.target.value })}
                                        placeholder="Enter amount paid in studio"
                                    />
                                </div>
                                <div className="form-group" style={{ marginTop: '15px' }}>
                                    <label>Payment Method</label>
                                    <select
                                        className="form-input"
                                        value={manualPaymentModal.method}
                                        onChange={e => setManualPaymentModal({ ...manualPaymentModal, method: e.target.value })}
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="GCash">GCash</option>
                                        <option value="Card (Manual)">Card (Direct/POS)</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleApplyManualPayment}>Apply Adjustment</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Calendar Day View Modal */}
                {dayViewModal.isOpen && (
                    <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setDayViewModal({ ...dayViewModal, isOpen: false })}>
                        <div className="modal-content glass-modal" style={{ maxWidth: '500px', border: '1px solid rgba(255,255,255,0.4)' }} onClick={e => e.stopPropagation()}>
                            <div className="modal-header-v2">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ background: '#f1f5f9', width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyCenter: 'center', color: '#6366f1' }}>
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0 }}>{new Date(dayViewModal.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</h3>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Daily Schedule Summary</p>
                                    </div>
                                </div>
                                <button className="modal-close-btn" onClick={() => setDayViewModal({ ...dayViewModal, isOpen: false })}><X size={20} /></button>
                            </div>
                            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '20px' }}>
                                {dayViewModal.appointments.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {dayViewModal.appointments.map(apt => (
                                            <div
                                                key={apt.id}
                                                className="glass-card"
                                                style={{
                                                    padding: '16px',
                                                    cursor: 'pointer',
                                                    borderLeft: `4px solid ${apt.status === 'confirmed' ? '#10b981' : (apt.status === 'pending' ? '#f59e0b' : '#6366f1')}`,
                                                    background: 'rgba(255,255,255,0.5)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                                onClick={() => {
                                                    setDayViewModal({ ...dayViewModal, isOpen: false });
                                                    handleEdit(apt);
                                                }}
                                            >
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                        <Clock size={14} style={{ color: '#64748b' }} />
                                                        <span style={{ fontWeight: '700', color: '#1e293b' }}>{apt.time.slice(0, 5)}</span>
                                                        <span style={{ color: '#64748b', fontSize: '0.9rem' }}>• {apt.clientName}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: '#475569', marginLeft: '22px' }}>
                                                        {apt.serviceType} with {apt.artistName}
                                                    </div>
                                                </div>
                                                <div className={`badge status-${getStatusColor(apt.status)}`} style={{ fontSize: '0.7rem', padding: '4px 8px' }}>
                                                    {apt.status}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                                        <div style={{ background: '#f8fafc', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px auto', color: '#cbd5e1' }}>
                                            <Calendar size={32} />
                                        </div>
                                        <p style={{ fontWeight: 600, margin: 0 }}>No Appointments Yet</p>
                                        <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>The schedule for this day is currently clear.</p>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer" style={{ borderTop: '1px solid #f1f5f9', padding: '20px' }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                    onClick={() => {
                                        setDayViewModal({ ...dayViewModal, isOpen: false });
                                        handleAddNew(dayViewModal.date);
                                    }}
                                >
                                    <Plus size={18} /> Schedule New Appointment
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            <ConfirmModal
                {...confirmDialog}
                onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}

export default AdminAppointments;
