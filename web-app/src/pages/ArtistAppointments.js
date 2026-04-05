import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Check, X, Calendar, List, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ConfirmModal';
import './PortalStyles.css';
import { API_URL } from '../config';

function ArtistAppointments(){
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('upcoming');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
    const [currentDate, setCurrentDate] = useState(new Date());
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null });
    
    
    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    useEffect(() => {
        fetch();
    }, [artistId]);

    const fetch = async () => {
        try {
            setLoading(true);
            const res = await Axios.get(`${API_URL}/api/artist/${artistId}/appointments`);
            if (res.data.success) setAppointments(res.data.appointments || []);
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const filteredAppointments = appointments.filter(apt => {
        if (activeTab === 'pending') return apt.status === 'pending';
        if (activeTab === 'upcoming') return ['confirmed', 'scheduled'].includes(apt.status);
        if (activeTab === 'history') return ['completed', 'cancelled'].includes(apt.status);
        return true;
    });

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab]);

    const handleExport = () => {
        const headers = ['Client', 'Service', 'Date', 'Time', 'Status'];
        const csvContent = [
            headers.join(','),
            ...filteredAppointments.map(a => 
                `"${a.client_name}","${a.design_title}",${new Date(a.appointment_date).toLocaleDateString()},${a.start_time},${a.status}`
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `artist_appointments_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const handlePrint = () => {
        window.print();
    };

    const handleAccept = async (id) => {
        try {
            const res = await Axios.put(`${API_URL}/api/artist/appointments/${id}/accept`);
            if (res.data.success) {
                fetch();
                alert('Appointment accepted successfully!');
            }
        } catch (e) { console.error(e); }
    };

    const handleReject = async (id) => {
        try {
            const res = await Axios.put(`${API_URL}/api/artist/appointments/${id}/reject`);
            if (res.data.success) {
                fetch();
                alert('Appointment rejected. It has been reverted back to the Admin.');
            }
        } catch (e) { console.error(e); }
    };

    const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
    const currentItems = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Calendar Helpers
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

    const changeMonth = (offset) => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
    };

    const getAppointmentsForDate = (day) => {
        return appointments.filter(a => {
            const apptDate = new Date(a.appointment_date);
            return apptDate.getDate() === day &&
                   apptDate.getMonth() === currentDate.getMonth() &&
                   apptDate.getFullYear() === currentDate.getFullYear() &&
                   a.status !== 'cancelled';
        });
    };

    return (
        <div className="portal-layout">
            <ArtistSideNav />
            <div className="portal-container artist-portal">
                <header className="portal-header">
                    <h1>Schedule Management</h1>
                    <button className="btn btn-secondary" onClick={() => alert("Block date feature coming soon")}>
                        Block Date
                    </button>
                    <button className="btn btn-secondary" onClick={handleExport}>
                        Export CSV
                    </button>
                    <button className="btn btn-secondary" onClick={handlePrint}>
                        Print
                    </button>
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
                </header>
                
                <div className="portal-content">
                    {loading ? <div className="no-data">Loading...</div> : (
                        <>
                            {viewMode === 'calendar' ? (
                                <div className="data-card">
                                    <div className="calendar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <button onClick={() => changeMonth(-1)} className="action-btn" style={{margin:0}}><ChevronLeft size={20}/></button>
                                            <button onClick={() => setCurrentDate(new Date())} className="action-btn" style={{ margin:0, padding: '0.4rem 1rem', background: 'transparent', border: '1px solid #e2e8f0', color: '#64748b' }}>Today</button>
                                            <button onClick={() => changeMonth(1)} className="action-btn" style={{margin:0}}><ChevronRight size={20}/></button>
                                        </div>
                                        <h2 style={{margin:0, border: 'none'}}>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
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
                                                        }} title={`${apt.start_time || 'N/A'} - ${apt.client_name}`}>
                                                            {(apt.start_time || '').slice(0,5)} {apt.client_name}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="settings-tabs" style={{ marginBottom: '20px' }}>
                                        <button className={`tab-button ${activeTab === 'upcoming' ? 'active' : ''}`} onClick={() => setActiveTab('upcoming')}>Upcoming</button>
                                        <button className={`tab-button ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>Pending Requests</button>
                                        <button className={`tab-button ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>History</button>
                                    </div>

                                    <div className="table-card-container" style={{ minHeight: '600px' }}>
                                        {currentItems.length ? (
                                            <>
                                                <div className="table-responsive">
                                                    <table className="portal-table">
                                                        <thead><tr><th>Client</th><th>Service</th><th>Date</th><th>Time</th><th>Price</th><th>Status</th><th>Payment</th>{activeTab === 'pending' && <th>Actions</th>}</tr></thead>
                                                        <tbody>{currentItems.map(a => (
                                                            <tr key={a.id}>
                                                                <td style={{ fontWeight: '600' }}>{a.client_name}</td>
                                                                <td>{a.design_title}</td>
                                                                <td>{new Date(a.appointment_date).toLocaleDateString()}</td>
                                                                <td>{a.start_time || 'N/A'}</td>
                                                                <td style={{ fontWeight: 'bold' }}>₱{parseFloat(a.price || 0).toLocaleString()}</td>
                                                                <td><span className={`status-badge ${a.status}`}>{a.status}</span></td>
                                                                <td>
                                                                    <span className={`status-badge ${a.payment_status === 'paid' ? 'completed' : a.payment_status === 'pending' ? 'pending' : 'cancelled'}`} style={{ backgroundColor: a.payment_status === 'paid' ? '#dcfce7' : a.payment_status === 'pending' ? '#fef3c7' : '#f3f4f6', color: a.payment_status === 'paid' ? '#16a34a' : a.payment_status === 'pending' ? '#b45309' : '#64748b' }}>
                                                                        {a.payment_status ? a.payment_status.charAt(0).toUpperCase() + a.payment_status.slice(1) : 'Unpaid'}
                                                                    </span>
                                                                </td>
                                                                {activeTab === 'pending' && (
                                                                    <td>
                                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                                            <button onClick={() => setConfirmModal({ visible: true, title: 'Accept Assignment', message: 'Do you want to accept this appointment?', onConfirm: () => handleAccept(a.id) })} className="action-btn" style={{ background: '#10b981', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem' }}>Accept</button>
                                                                            <button onClick={() => setConfirmModal({ visible: true, title: 'Decline Assignment', message: 'Are you sure you want to decline this assignment? It will be reverted back to the Admin.', onConfirm: () => handleReject(a.id) })} className="action-btn" style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem' }}>Decline</button>
                                                                        </div>
                                                                    </td>
                                                                )}
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
                                                    unit="appointments"
                                                />
                                            </>
                                        ) : (
                                            <div className="no-data-container">
                                                <Inbox size={48} className="no-data-icon" />
                                                <p className="no-data-text">No appointments in this category</p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <ConfirmModal 
                                        isOpen={confirmModal.visible}
                                        title={confirmModal.title}
                                        message={confirmModal.message}
                                        onConfirm={() => { confirmModal.onConfirm(); setConfirmModal({ ...confirmModal, visible: false }); }}
                                        onClose={() => setConfirmModal({ ...confirmModal, visible: false })}
                                    />
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ArtistAppointments;
