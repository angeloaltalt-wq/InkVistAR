import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, List, ChevronLeft, ChevronRight } from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import ManagerSideNav from '../components/ManagerSideNav';
import './AdminAppointments.css';
import { API_URL } from '../config';

function AdminAppointments() {
    const navigate = useNavigate();
    const location = useLocation();
    const isManagerView = location.pathname.startsWith('/manager');
    const [appointments, setAppointments] = useState([]);
    const [artists, setArtists] = useState([]);
    const [clients, setClients] = useState([]);

    const [filteredAppointments, setFilteredAppointments] = useState(appointments);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('');
    const [sortBy, setSortBy] = useState('date');
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [appointmentModal, setAppointmentModal] = useState({ mounted: false, visible: false });
    const [formData, setFormData] = useState({
        clientId: '',
        artistId: '',
        serviceType: '',
        date: '',
        time: '',
        status: 'confirmed',
        notes: '',
        price: 0
    });

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
                    serviceType: apt.design_title || 'Tattoo',
                    date: apt.appointment_date ? (apt.appointment_date.includes('T') ? apt.appointment_date.split('T')[0] : apt.appointment_date.substring(0, 10)) : '',
                    time: apt.start_time,
                    status: apt.status,
                    notes: apt.notes,
                    price: apt.price || 0
                }));
                setAppointments(mappedAppointments);
                setFilteredAppointments(mappedAppointments);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching appointments:", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        filterAndSortAppointments();
    }, [appointments, searchTerm, statusFilter, dateFilter, sortBy]);

    const filterAndSortAppointments = () => {
        let filtered = appointments.filter(apt => {
            const matchesSearch =
                apt.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                apt.artistName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                apt.serviceType.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = statusFilter === 'all' || apt.status === statusFilter;
            const matchesDate = !dateFilter || apt.date === dateFilter;
            
            return matchesSearch && matchesStatus && matchesDate;
        });

        // Reset pagination on filter change
        setCurrentPage(1);

        // Sort
        if (sortBy === 'date') {
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

    const handleStatusUpdate = async (id, status) => {
        if (!window.confirm(`Are you sure you want to ${status} this appointment?`)) return;
        try {
            await Axios.put(`${API_URL}/api/appointments/${id}/status`, { status });
            fetchAppointments();
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Failed to update status");
        }
    };

    const handleEdit = (appointment) => {
        setSelectedAppointment(appointment);
        setFormData({
            clientId: clients.find(c => c.name === appointment.clientName)?.id || '',
            artistId: artists.find(a => a.name === appointment.artistName)?.id || '',
            serviceType: appointment.serviceType,
            date: appointment.date,
            time: appointment.time,
            status: appointment.status,
            notes: appointment.notes,
            price: appointment.price
        });
        openModal();
    };

    const handleDelete = (id) => {
        if (window.confirm('Are you sure you want to delete this appointment?')) {
            setAppointments(appointments.filter(a => a.id !== id));
            Axios.delete(`${API_URL}/api/admin/appointments/${id}`)
                .then(() => fetchAppointments())
                .catch(err => console.error(err));
        }
    };

    const handleAddNew = () => {
        setSelectedAppointment(null);
        setFormData({
            clientId: '',
            artistId: '',
            serviceType: '',
            date: '',
            time: '',
            status: 'confirmed',
            notes: '',
            price: 0
        });
        openModal();
    };

    const handleSave = async () => {
        if (!formData.clientId || !formData.artistId || !formData.date || !formData.time) {
            alert("Please fill in all required fields (Client, Artist, Date, Time)");
            return;
        }

        try {
            const payload = {
                customerId: formData.clientId,
                artistId: formData.artistId,
                designTitle: formData.serviceType,
                date: formData.date,
                startTime: formData.time,
                status: formData.status,
                notes: formData.notes,
                price: formData.price
            };

            if (selectedAppointment) {
                await Axios.put(`${API_URL}/api/admin/appointments/${selectedAppointment.id}`, payload);
                alert('Appointment updated successfully');
            } else {
                // Walk-in / New Booking
                await Axios.post(`${API_URL}/api/admin/appointments`, payload);
                alert('Appointment created successfully');
            }
            closeModal();
            fetchAppointments();
        } catch (error) {
            console.error("Error saving appointment:", error);
            alert("Failed to save appointment: " + (error.response?.data?.message || error.message));
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
        const headers = ['ID', 'Client Name', 'Artist', 'Service Type', 'Date', 'Time', 'Status', 'Price'];
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
          {isManagerView ? <ManagerSideNav /> : <AdminSideNav />}
            <div className="admin-page page-container-enter">
            {/* Print Only Header */}
            <div className="print-only-header">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px'}}>
                    <div>
                        <h1 style={{margin: 0, color: '#000'}}>InkVistAR Studio</h1>
                        <p style={{margin: 0}}>Appointments & Schedule Report</p>
                    </div>
                    <div style={{textAlign: 'right'}}>
                        <p style={{margin: 0}}>Date: {new Date().toLocaleDateString()}</p>
                        <p style={{margin: 0}}>View: {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}</p>
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
                <div className="data-card" style={{margin: '2rem'}}>
                    <div className="calendar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <button onClick={() => changeMonth(-1)} className="action-btn" style={{margin:0}}><ChevronLeft size={20}/></button>
                        <h2 style={{margin:0, border: 'none'}}>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                        <button onClick={() => changeMonth(1)} className="action-btn" style={{margin:0}}><ChevronRight size={20}/></button>
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
                                    backgroundColor: 'white'
                                }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '5px', color: isToday ? '#6366f1' : '#334155' }}>{day}</div>
                                    {dayAppts.map(apt => (
                                        <div key={apt.id} style={{ 
                                            fontSize: '0.75rem', 
                                            padding: '4px', 
                                            marginBottom: '4px', 
                                            borderRadius: '4px',
                                            backgroundColor: apt.status === 'confirmed' ? '#d1fae5' : (apt.status === 'pending' ? '#fef3c7' : '#e0e7ff'),
                                            color: apt.status === 'confirmed' ? '#065f46' : (apt.status === 'pending' ? '#92400e' : '#3730a3'),
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            cursor: 'pointer'
                                        }} title={`${apt.time} - ${apt.clientName} (${apt.artistName})`} onClick={() => handleEdit(apt)}>
                                            {apt.time.slice(0,5)} {apt.clientName}
                                        </div>
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <>
                    <div className="filters-section">
                        <div className="search-box" style={{ maxWidth: '300px' }}>
                            <input
                                type="text"
                                placeholder="Search appointments..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="search-input"
                            />
                        </div>

                        <div className="filter-controls">
                            <select 
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="select-input"
                                style={{ maxWidth: '200px' }}
                            >
                                <option value="all">All Status</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="scheduled">Scheduled</option>
                                <option value="pending">Pending</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>

                            <input 
                                type="date"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="input-date"
                                style={{ maxWidth: '200px' }}
                            />

                            <select 
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="select-input"
                                style={{ maxWidth: '200px' }}
                            >
                                <option value="date">Sort by Date</option>
                                <option value="client">Sort by Client</option>
                                <option value="artist">Sort by Artist</option>
                                <option value="status">Sort by Status</option>
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

                    <div className="table-card">
                        <div className="table-responsive">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Client Name</th>
                                        <th>Artist</th>
                                        <th>Service</th>
                                        <th>Date</th>
                                        <th>Time</th>
                                        <th>Status</th>
                                        <th>Price</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan="8" className="no-data" style={{textAlign: 'center', padding: '2rem'}}>Loading appointments...</td></tr>
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
                                                <td>₱{Number(appointment.price).toLocaleString()}</td>
                                                <td className="actions-cell">
                                                    {appointment.status === 'pending' && (
                                                        <>
                                                            <button className="action-btn view-btn" style={{backgroundColor: '#10b981', marginRight: '5px'}} onClick={() => handleStatusUpdate(appointment.id, 'confirmed')}>
                                                                Approve
                                                            </button>
                                                            <button className="action-btn delete-btn" style={{marginRight: '5px'}} onClick={() => handleStatusUpdate(appointment.id, 'cancelled')}>
                                                                Reject
                                                            </button>
                                                        </>
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
                                            <td colSpan="9" className="no-data">No appointments found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem', gap: '1rem' }}>
                                <button className="btn btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                                    Previous
                                </button>
                                <span>Page {currentPage} of {totalPages}</span>
                                <button className="btn btn-secondary" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                                    Next
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Modal */}
            {appointmentModal.mounted && (
                <div className={`modal-overlay ${appointmentModal.visible ? 'open' : ''}`} onClick={closeModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedAppointment ? 'Edit Appointment' : 'New Appointment'}</h2>
                            <button className="close-btn" onClick={closeModal}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Client (Walk-in Registration) *</label>
                                    <select
                                        value={formData.clientId}
                                        onChange={(e) => setFormData({...formData, clientId: e.target.value})}
                                        className="form-input"
                                    >
                                        <option value="">Select Client</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Assign Artist *</label>
                                    <select
                                        value={formData.artistId}
                                        onChange={(e) => setFormData({...formData, artistId: e.target.value})}
                                        className="form-input"
                                    >
                                        <option value="">Select Artist</option>
                                        {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Service Type *</label>
                                    <select
                                        value={formData.serviceType}
                                        onChange={(e) => setFormData({...formData, serviceType: e.target.value})}
                                        className="form-input"
                                    >
                                        <option value="">Select Service</option>
                                        <option value="Tattoo Session">Tattoo Session</option>
                                        <option value="Consultation">Consultation</option>
                                        <option value="Piercing">Piercing</option>
                                        <option value="Touch-up">Touch-up</option>
                                        <option value="Aftercare Check">Aftercare Check</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Status *</label>
                                    <select 
                                        value={formData.status}
                                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                                        className="form-input"
                                    >
                                        <option value="confirmed">Confirmed</option>
                                        <option value="pending">Pending</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Date *</label>
                                    <input
                                        type="date"
                                        value={formData.date}
                                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Time *</label>
                                    <input
                                        type="time"
                                        value={formData.time}
                                        onChange={(e) => setFormData({...formData, time: e.target.value})}
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Price (₱)</label>
                                <input
                                    type="number"
                                    value={formData.price}
                                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                                    className="form-input"
                                    placeholder="e.g. 35000"
                                />
                            </div>
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                    className="form-input"
                                    rows="3"
                                />
                                <button type="button" className="btn btn-secondary" style={{marginTop: '5px', fontSize: '0.8rem', padding: '5px 10px'}} onClick={handleMultiSession}>
                                    + Mark as Multi-Session
                                </button>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeModal}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleSave}>
                                Save Appointment
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}

export default AdminAppointments;
