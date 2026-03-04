import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Check, X, Calendar, List, ChevronLeft, ChevronRight } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import './PortalStyles.css';
import { API_URL } from '../config';

function ArtistAppointments(){
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('upcoming');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
    const [currentDate, setCurrentDate] = useState(new Date());
    
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

    const handleStatusUpdate = async (id, status) => {
        try {
            await Axios.put(`${API_URL}/api/appointments/${id}/status`, { status });
            fetch(); // Refresh list
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Failed to update status");
        }
    };

    const filteredAppointments = appointments.filter(apt => {
        if (activeTab === 'pending') return apt.status === 'pending';
        if (activeTab === 'upcoming') return ['confirmed', 'scheduled'].includes(apt.status);
        if (activeTab === 'history') return ['completed', 'cancelled'].includes(apt.status);
        return true;
    });

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
                                                        }} title={`${apt.start_time} - ${apt.client_name}`}>
                                                            {apt.start_time.slice(0,5)} {apt.client_name}
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

                                    <div className="data-card">
                                        {filteredAppointments.length ? (
                                            <table className="portal-table">
                                                <thead><tr><th>Client</th><th>Service</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
                                                <tbody>{filteredAppointments.map(a => (
                                                    <tr key={a.id}>
                                                        <td>{a.client_name}</td>
                                                        <td>{a.design_title}</td>
                                                        <td>{new Date(a.appointment_date).toLocaleDateString()}</td>
                                                        <td>{a.start_time}</td>
                                                        <td><span className={`status-badge ${a.status}`}>{a.status}</span></td>
                                                    </tr>
                                                ))}</tbody>
                                            </table>
                                        ) : <p className="no-data">No appointments in this category</p>}
                                    </div>
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
