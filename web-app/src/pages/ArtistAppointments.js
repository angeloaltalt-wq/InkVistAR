import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Axios from 'axios';
import { Check, X, Calendar, List, ChevronLeft, ChevronRight, Inbox, PenTool, Plus, User, Download, Printer, Search, Filter } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import './PortalStyles.css';
import './ArtistStyles.css';
import './AdminUsers.css';
import { API_URL } from '../config';
import { getDisplayCode, formatTime12Hour, formatStatus, getStatusColor } from '../utils/formatters';
import { generateReportHeader, downloadCsv } from '../utils/csvExport';

function ArtistAppointments() {
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('upcoming');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'
    const [currentDate, setCurrentDate] = useState(new Date());
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = React.useRef(null);
    const [confirmModal, setConfirmModal] = useState({ visible: false, title: '', message: '', onConfirm: null, type: 'danger' });
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [publishStatus, setPublishStatus] = useState({});
    const [customerConsent, setCustomerConsent] = useState({});
    const [selectedDay, setSelectedDay] = useState(() => {
        const today = new Date();
        return today.getDate();
    });
    const [showCalendarLegend, setShowCalendarLegend] = useState(false);

    // Fetch customer consent when an appointment is selected
    useEffect(() => {
        if (selectedAppointment && selectedAppointment.customer_id && !customerConsent[selectedAppointment.customer_id]) {
            Axios.get(`${API_URL}/api/customer/${selectedAppointment.customer_id}/consent`)
                .then(res => {
                    if (res.data.success) {
                        setCustomerConsent(prev => ({ ...prev, [selectedAppointment.customer_id]: res.data }));
                    }
                })
                .catch(() => {});
        }
    }, [selectedAppointment]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Keyboard arrow-key navigation for calendar
    useEffect(() => {
        if (viewMode !== 'calendar') return;
        if (selectedAppointment) return;

        const handleKeyDown = (e) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return;

            e.preventDefault();
            const daysInMonthLocal = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

            if (selectedDay === null) {
                const today = new Date();
                if (today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear()) {
                    setSelectedDay(today.getDate());
                } else {
                    setSelectedDay(1);
                }
                return;
            }

            let newDay = selectedDay;
            if (e.key === 'ArrowLeft') newDay = selectedDay - 1;
            else if (e.key === 'ArrowRight') newDay = selectedDay + 1;
            else if (e.key === 'ArrowUp') newDay = selectedDay - 7;
            else if (e.key === 'ArrowDown') newDay = selectedDay + 7;

            if (newDay < 1) {
                const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
                const prevDaysInMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
                setSelectedDay(prevDaysInMonth);
                setCurrentDate(newDate);
            } else if (newDay > daysInMonthLocal) {
                setSelectedDay(1);
                setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
            } else {
                setSelectedDay(newDay);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewMode, selectedDay, currentDate, selectedAppointment]);
    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;
    const navigate = useNavigate();

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
        const matchesTab = activeTab === 'pending' ? apt.status === 'pending' : 
                           activeTab === 'upcoming' ? ['confirmed', 'scheduled'].includes(apt.status) : 
                           activeTab === 'history' ? ['completed', 'cancelled', 'incomplete'].includes(apt.status) : true;
        const searchTarget = `${apt.client_name} ${apt.design_title} ${getDisplayCode(apt.booking_code, apt.id)}`.toLowerCase();
        const matchesSearch = searchTarget.includes(searchTerm.toLowerCase());
        return matchesTab && matchesSearch;
    });

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab]);

    // Deep-link: auto-open appointment from notification
    const location = useLocation();
    useEffect(() => {
        if (location.state?.openAppointmentId && appointments.length > 0) {
            const targetId = parseInt(location.state.openAppointmentId);
            const target = appointments.find(a => a.id === targetId);
            if (target) {
                setSelectedAppointment(target);
                // Switch to the correct tab
                if (target.status === 'pending') setActiveTab('pending');
                else if (['completed', 'cancelled', 'incomplete'].includes(target.status)) setActiveTab('history');
                else setActiveTab('upcoming');
            }
            // Clear state to prevent re-opening on re-render
            window.history.replaceState({}, '', location.pathname);
        }
    }, [appointments, location.state]);

    const handleExport = () => {
        const artistName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Artist';
        const headerRows = generateReportHeader('Artist Schedule Export', {
            'Artist': artistName,
            'Tab': activeTab,
            'View': viewMode
        });

        const columnHeaders = ['Client', 'Service', 'Date', 'Time', 'Status'];
        const dataRows = filteredAppointments.map(a => [
            a.client_name,
            a.design_title,
            new Date(a.appointment_date).toLocaleDateString(),
            formatTime12Hour(a.start_time),
            formatStatus(a.status)
        ]);

        downloadCsv([...headerRows, columnHeaders, ...dataRows], `artist_appointments_${activeTab}`);
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        const printData = filteredAppointments.map(a =>
            `<tr>
                <td>${a.client_name || 'N/A'}</td>
                <td>${a.design_title || 'N/A'}</td>
                <td>${a.appointment_date ? new Date(a.appointment_date).toLocaleDateString() : 'N/A'}</td>
                <td>${formatTime12Hour(a.start_time) || 'N/A'}</td>
                <td>${formatStatus(a.status).toUpperCase()}</td>
            </tr>`
        ).join('');

        printWindow.document.write(`
            <html>
                <head>
                    <title>Print Appointments - Artist</title>
                    <style>
                        body { font-family: sans-serif; padding: 20px; color: #333; }
                        h1 { color: #1e293b; text-align: center; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 14px; }
                        th { background-color: #f1f5f9; color: #475569; }
                    </style>
                </head>
                <body>
                    <h1>Artist Schedule: ${activeTab.toUpperCase()}</h1>
                    <p style="text-align:center;">Generated on ${new Date().toLocaleString()}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Client Name</th>
                                <th>Service/Project</th>
                                <th>Date</th>
                                <th>Time</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${printData}
                        </tbody>
                    </table>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
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

    const handlePublishToPortfolio = async (appt) => {
        if (!appt || !appt.after_photo) return;
        setPublishStatus(prev => ({ ...prev, [appt.id]: 'publishing' }));
        try {
            const res = await Axios.post(`${API_URL}/api/artist/portfolio`, {
                artistId: artistId,
                imageUrl: appt.after_photo.startsWith('data:') ? appt.after_photo : (appt.after_photo.startsWith('http') ? appt.after_photo : `${API_URL}${appt.after_photo}`),
                title: appt.design_title || 'Tattoo Session',
                description: `Completed piece for ${appt.client_name}. ${appt.notes || ''}`.trim(),
                category: appt.service_type || 'Tattoo Session',
                isPublic: 1,
                priceEstimate: appt.price
            });
            if (res.data.success) {
                setPublishStatus(prev => ({ ...prev, [appt.id]: 'success' }));
            } else {
                alert(res.data.message || 'Failed to publish to portfolio');
                setPublishStatus(prev => ({ ...prev, [appt.id]: 'idle' }));
            }
        } catch (error) {
            console.error("Error publishing to portfolio:", error);
            alert('An error occurred while publishing. Please try again.');
            setPublishStatus(prev => ({ ...prev, [appt.id]: 'idle' }));
        }
    };

    const compressImage = (file, maxWidth = 1200, quality = 0.7) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();
            reader.onload = (e) => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleUploadDraft = async (e, id) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const compressedBase64 = await compressImage(file);
            const res = await Axios.put(`${API_URL}/api/artist/appointments/${id}/draft`, { draft_image: compressedBase64 });
            if (res.data.success) {
                setSelectedAppointment(prev => ({ ...prev, draft_image: compressedBase64 }));
                fetch(); // update list implicitly
                alert('Draft image successfully attached to this session!');
            }
        } catch (err) {
            console.error('Draft upload error:', err);
            const msg = err.response?.data?.message || err.message || 'Unknown error';
            alert(`Error uploading draft: ${msg}`);
        }
    };

    const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
    const currentItems = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Calendar Helpers
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

    const changeMonth = (offset) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
        const newDaysInMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
        if (selectedDay !== null) {
            setSelectedDay(offset > 0 ? 1 : newDaysInMonth);
        }
        setCurrentDate(newDate);
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
                <header className="portal-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h1 style={{ margin: 0 }}>Schedule Management</h1>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-secondary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}>
                                <Download size={14} /> Export
                            </button>
                            <button className="btn btn-secondary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}>
                                <Printer size={14} /> Print
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(248, 250, 252, 0.7)', backdropFilter: 'blur(10px)', padding: '5px 6px', borderRadius: '24px', border: '1px solid #e2e8f0', marginBottom: '10px' }}>
                        <div className="modern-view-toggle" style={{ margin: 0, background: 'transparent', boxShadow: 'none' }}>
                            <button
                                className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                                onClick={() => setViewMode('list')}
                            >
                                <List size={14} /> <span>List View</span>
                            </button>
                            <button
                                className={`toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                                onClick={() => setViewMode('calendar')}
                            >
                                <Calendar size={14} /> <span>Calendar View</span>
                            </button>
                        </div>
                    </div>
                </header>

                <div className="portal-content">
                    {viewMode === 'list' && (
                        <div className="premium-filter-bar premium-filter-bar--stacked" style={{ marginBottom: '20px' }}>
                            <div className="premium-search-box premium-search-box--full" ref={searchRef} style={{ position: 'relative' }}>
                                <Search size={16} className="premium-search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search by client name, service, or booking ID..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setShowSuggestions(true);
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    maxLength={100}
                                />
                                {showSuggestions && searchTerm && filteredAppointments.length > 0 && (
                                    <div className="autocomplete-dropdown waterfall-dropdown">
                                        {Array.from(new Set(filteredAppointments.map(a => a.client_name)))
                                            .filter(s => s && s.toLowerCase().includes(searchTerm.toLowerCase()))
                                            .slice(0, 8)
                                            .map((suggestion, index) => (
                                                <div 
                                                    key={suggestion} 
                                                    className="autocomplete-item waterfall-item"
                                                    style={{ animationDelay: `${index * 0.05}s` }}
                                                    onClick={() => {
                                                        setSearchTerm(suggestion);
                                                        setShowSuggestions(false);
                                                    }}
                                                >
                                                    {suggestion}
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>

                            <div className="premium-filters-row">
                                <div className="modern-view-toggle" style={{ margin: 0 }}>
                                    <button className={`toggle-btn ${activeTab === 'upcoming' ? 'active' : ''}`} onClick={() => setActiveTab('upcoming')}>
                                        Upcoming
                                    </button>
                                    <button className={`toggle-btn ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
                                        Pending
                                    </button>
                                    <button className={`toggle-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                                        History
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {loading ? <div className="no-data">Loading...</div> : (
                        <>
                            {viewMode === 'calendar' ? (
                                <div className="calendar-split-view">
                                    <div className="data-card calendar-main-pane">
                                        <div className="artist-calendar-header">
                                            <div className="artist-calendar-nav">
                                                <button onClick={() => changeMonth(-1)} className="artist-calendar-nav-btn"><ChevronLeft size={20} /></button>
                                                <button onClick={() => setCurrentDate(new Date())} className="artist-calendar-nav-btn">Today</button>
                                                <button onClick={() => changeMonth(1)} className="artist-calendar-nav-btn"><ChevronRight size={20} /></button>
                                            </div>
                                            <h2 style={{ margin: 0, border: 'none' }}>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                                            <div style={{ position: 'relative' }}>
                                                <button
                                                    onClick={() => setShowCalendarLegend(v => !v)}
                                                    title="Show color legend"
                                                    style={{
                                                        width: '30px', height: '30px', borderRadius: '50%',
                                                        border: '1.5px solid #cbd5e1',
                                                        background: showCalendarLegend ? '#6366f1' : 'white',
                                                        color: showCalendarLegend ? 'white' : '#64748b',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem',
                                                        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                                                        transition: 'all 0.2s ease', flexShrink: 0
                                                    }}
                                                >
                                                    i
                                                </button>
                                                {showCalendarLegend && (
                                                    <div
                                                        style={{
                                                            position: 'absolute', top: '38px', right: 0,
                                                            background: 'white', borderRadius: '12px',
                                                            boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
                                                            border: '1px solid #e2e8f0',
                                                            padding: '14px 18px', zIndex: 999,
                                                            minWidth: '220px', cursor: 'default'
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Booking Status Legend</p>
                                                        {[
                                                            { color: '#38bdf8', label: 'Confirmed' },
                                                            { color: '#f59e0b', label: 'Pending' },
                                                            { color: '#7c3aed', label: 'Scheduled' },
                                                            { color: '#0284c7', label: 'In Session' },
                                                            { color: '#22c55e', label: 'Completed' },
                                                            { color: '#ef4444', label: 'Incomplete' },
                                                            { color: '#94a3b8', label: 'Cancelled / Rejected' },
                                                        ].map(({ color, label }) => (
                                                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 0 2px ${color}33` }} />
                                                                <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 500 }}>{label}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="artist-calendar-grid">
                                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                                <div key={d} className="artist-calendar-day-header">{d}</div>
                                            ))}
                                            {[...Array(firstDayOfMonth)].map((_, i) => <div key={`empty-${i}`} className="artist-calendar-cell-empty"></div>)}
                                            {[...Array(daysInMonth)].map((_, i) => {
                                                const day = i + 1;
                                                const dayAppts = getAppointmentsForDate(day);
                                                const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();

                                                let statusColorFn = (status) => {
                                                    if (status === 'confirmed') return '#38bdf8';
                                                    if (status === 'pending') return '#f59e0b';
                                                    if (status === 'in_progress') return '#0284c7';
                                                    if (status === 'completed') return '#22c55e';
                                                    if (status === 'incomplete') return '#ef4444';
                                                    if (status === 'cancelled' || status === 'rejected') return '#94a3b8';
                                                    return '#7c3aed';
                                                };

                                                return (
                                                    <div key={day} 
                                                        className={`artist-calendar-cell ${isToday ? 'today' : ''} ${selectedDay === day ? 'selected' : ''}`}
                                                        onClick={() => setSelectedDay(day)}
                                                    >
                                                        <div className="artist-calendar-date-number" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span>{day}</span>
                                                            <Plus size={12} style={{ color: '#cbd5e1', cursor: 'pointer' }} />
                                                        </div>
                                                        {dayAppts.length > 0 && (
                                                            <div style={{
                                                                position: 'absolute', top: '6px', right: '6px',
                                                                background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                                                                color: '#fff',
                                                                fontSize: '0.62rem', fontWeight: 800,
                                                                minWidth: '18px', height: '18px',
                                                                padding: '0 5px', borderRadius: '9px',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                boxShadow: '0 2px 6px rgba(99,102,241,0.45)',
                                                                lineHeight: 1, letterSpacing: '-0.3px',
                                                                pointerEvents: 'none'
                                                            }}>
                                                                {dayAppts.length}
                                                            </div>
                                                        )}
                                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>

                                                            {dayAppts.length > 0 && (
                                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px', paddingLeft: '2px' }}>
                                                                    {dayAppts.slice(0, 5).map(apt => (
                                                                        <div key={apt.id} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: statusColorFn(apt.status) }} title={apt.status} />
                                                                    ))}
                                                                    {dayAppts.length > 5 && <span style={{ fontSize: '0.7rem', color: '#94a3b8', lineHeight: '8px', fontWeight: 700 }}>+</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="day-view-panel data-card">
                                        <div className="day-view-header">
                                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>
                                                {new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay || 1).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </h3>
                                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                                {getAppointmentsForDate(selectedDay || 1).length} Bookings
                                            </span>
                                        </div>
                                        <div className="day-view-body">
                                            {getAppointmentsForDate(selectedDay || 1).map(apt => (
                                                <div
                                                    key={apt.id}
                                                    className="glass-card day-view-apt-card"
                                                    onClick={() => setSelectedAppointment(apt)}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{
                                                            width: '40px', height: '40px', borderRadius: '50%',
                                                            backgroundColor: '#f1f5f9', overflow: 'hidden',
                                                            border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                        }}>
                                                            {apt.clientAvatar && apt.clientAvatar.length > 10 ? (
                                                                <img 
                                                                    src={apt.clientAvatar} 
                                                                    alt="Profile" 
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                    onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'; }}
                                                                />
                                                            ) : (
                                                                <User size={18} color="#94a3b8" />
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#be9055', fontFamily: 'monospace', letterSpacing: '0.02em', marginBottom: '2px' }}>
                                                                #{getDisplayCode(apt.booking_code, apt.id)}
                                                            </span>
                                                            <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.95rem' }}>{apt.client_name}</div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{apt.design_title || 'Tattoo Session'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                                                        <span className={`badge status-${getStatusColor(apt.status)}`} style={{ padding: '4px 8px', fontSize: '0.75rem', margin: 0 }}>
                                                            {formatStatus(apt.status)}
                                                        </span>
                                                        <span style={{ color: '#6366f1', fontWeight: '600', fontSize: '0.85rem' }}>{formatTime12Hour(apt.start_time || apt.time) || 'N/A'}</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {getAppointmentsForDate(selectedDay || 1).length === 0 && (
                                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 1rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                                    <Calendar size={32} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                                                    No appointments scheduled for this date.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <>

                                    <div className="table-card-container" style={{ minHeight: '600px', background: 'rgba(255, 255, 255, 0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.6)', boxShadow: '0 4px 30px rgba(0, 0, 0, 0.05)', borderRadius: '16px' }}>
                                        {currentItems.length ? (
                                            <>
                                                <div className="table-responsive">
                                                    <table className="portal-table mobile-card-table">
                                                        <thead><tr><th>Booking ID</th><th>Client</th><th>Service</th><th>Date</th><th>Time</th><th>Price</th>{activeTab === 'history' && <th>Materials Cost</th>}<th>Status</th><th>Payment</th>{activeTab === 'pending' && <th>Actions</th>}</tr></thead>
                                                        <tbody>{currentItems.map((a, index) => (
                                                            <tr key={a.id} onClick={() => setSelectedAppointment(a)} style={{ cursor: 'pointer', animation: 'slideInUpFade 0.3s ease-out forwards', animationDelay: `${index * 0.05}s`, opacity: 0 }} className="clickable-row hover-bg">
                                                                <td data-label="Booking ID">
                                                                    <span style={{ fontFamily: 'monospace', fontWeight: '600', color: '#1e293b', fontSize: '0.85rem' }}>{getDisplayCode(a.booking_code, a.id)}</span>
                                                                    {a.total_sessions > 1 && (
                                                                        <span style={{ display: 'inline-block', marginLeft: '6px', fontSize: '0.65rem', fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', padding: '2px 6px', borderRadius: '6px', verticalAlign: 'middle' }}>
                                                                            {a.session_number || 1}/{a.total_sessions}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td data-label="Client" style={{ fontWeight: '600' }}>{a.client_name}</td>
                                                                <td data-label="Service">{a.design_title}</td>
                                                                <td data-label="Date">{new Date(a.appointment_date).toLocaleDateString()}</td>
                                                                <td data-label="Time">{formatTime12Hour(a.start_time) || 'N/A'}</td>
                                                                <td data-label="Price" style={{ fontWeight: 'bold' }}>₱{parseFloat(a.price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                                {activeTab === 'history' && (
                                                                    <td data-label="Materials Cost" style={{ color: '#f59e0b', fontWeight: '500' }}>₱{parseFloat(a.total_material_cost || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                                )}
                                                                <td data-label="Status"><span className={`badge status-${getStatusColor(a.status)}`}>{formatStatus(a.status)}</span></td>
                                                                <td data-label="Payment">
                                                                    <span className={`status-badge ${a.payment_status === 'paid' ? 'completed' : a.payment_status === 'downpayment_paid' ? 'pending' : a.payment_status === 'pending' ? 'pending' : 'cancelled'}`} style={{ backgroundColor: a.payment_status === 'paid' ? '#dcfce7' : a.payment_status === 'downpayment_paid' ? '#dbeafe' : a.payment_status === 'pending' ? '#fef3c7' : '#f3f4f6', color: a.payment_status === 'paid' ? '#16a34a' : a.payment_status === 'downpayment_paid' ? '#2563eb' : a.payment_status === 'pending' ? '#b45309' : '#64748b' }}>
                                                                        {a.payment_status === 'paid' ? 'Paid' : a.payment_status === 'downpayment_paid' ? 'Partially Paid' : a.payment_status === 'pending' ? 'Pending' : 'Unpaid'}
                                                                    </span>
                                                                </td>
                                                                {activeTab === 'pending' && (
                                                                    <td data-label="Actions">
                                                                        <div className="artist-action-group">
                                                                            <button onClick={(e) => { e.stopPropagation(); setConfirmModal({ visible: true, title: 'Confirm Availability', message: 'Ready to take on this assignment? Confirming will notify the manager to generate a quote for the client.', type: 'success', onConfirm: () => handleAccept(a.id) }); }} className="artist-btn-accept">Confirm</button>
                                                                            <button onClick={(e) => { e.stopPropagation(); setConfirmModal({ visible: true, title: 'Decline Assignment', message: 'Are you sure you want to decline this assignment? It will be reverted back to the Admin for reassignment.', type: 'danger', onConfirm: () => handleReject(a.id) }); }} className="artist-btn-decline">Decline</button>
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
                                        type={confirmModal.type}
                                        onConfirm={() => { confirmModal.onConfirm(); setConfirmModal({ ...confirmModal, visible: false }); }}
                                        onClose={() => setConfirmModal({ ...confirmModal, visible: false })}
                                    />

                                    {selectedAppointment && (() => {
                                        const myRole = selectedAppointment.assigned_role || 'primary';
                                        const isDual = ['tattoo', 'piercing', 'both'].includes(myRole) && selectedAppointment.secondary_artist_id;
                                        const roleBadge = isDual ? (
                                            myRole === 'both' ? { icon: '', label: 'Tattoo & Piercing Staff', bg: '#be9055', color: '#fff' }
                                            : myRole === 'piercing' ? { icon: '', label: 'Piercing Staff', bg: '#be9055', color: '#fff' }
                                            : { icon: '', label: 'Tattoo Staff', bg: '#be9055', color: '#fff' }
                                        ) : null;
                                        return (
                                        <div className="modal-overlay" onClick={() => setSelectedAppointment(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
                                            <div className="modal-content large" onClick={e => e.stopPropagation()} style={{ width: '95%', maxWidth: '850px', background: '#ffffff', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                                                <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <h3 style={{ margin: 0, color: '#1e293b' }}>Appointment {getDisplayCode(selectedAppointment.booking_code, selectedAppointment.id)}</h3>
                                                        {selectedAppointment.total_sessions > 1 && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.02em' }}>
                                                                Session {selectedAppointment.session_number || 1} of {selectedAppointment.total_sessions}
                                                            </span>
                                                        )}
                                                        {roleBadge && (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 12px', borderRadius: '20px', background: roleBadge.bg, color: roleBadge.color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.02em', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                                                                {roleBadge.icon} {roleBadge.label}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button onClick={() => setSelectedAppointment(null)} className="close-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                                                </div>
                                                <div className="artist-modal-body-scroll modal-body" style={{ padding: '24px' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                                        {/* LEFT COLUMN: Info & Notes */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                                            <div className="artist-flex-between" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <div>
                                                                    <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: '#64748b' }}>Client</p>
                                                                    <p style={{ margin: 0, fontWeight: '600', fontSize: '1.1rem', color: '#0f172a' }}>{selectedAppointment.client_name}</p>
                                                                </div>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: '#64748b' }}>Date & Time</p>
                                                                    <p style={{ margin: 0, fontWeight: '600', color: '#0f172a' }}>{new Date(selectedAppointment.appointment_date).toLocaleDateString()} at {formatTime12Hour(selectedAppointment.start_time) || 'N/A'}</p>
                                                                </div>
                                                            </div>

                                                            <div style={{ padding: '15px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                                <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: '#64748b' }}>Service Requested</p>
                                                                <p style={{ margin: 0, fontWeight: '600', color: '#0f172a' }}>{selectedAppointment.design_title || 'Tattoo Session'}</p>

                                                                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '15px' }}>
                                                                    <div>
                                                                        <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Status</span>
                                                                        <span className={`badge status-${getStatusColor(selectedAppointment.status)}`}>{formatStatus(selectedAppointment.status)}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Price</span>
                                                                        <span style={{ fontWeight: 'bold', color: '#0f172a' }}>₱{parseFloat(selectedAppointment.price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                                                                            Your Cut ({(() => {
                                                                                if (!selectedAppointment.secondary_artist_id) return '30%';
                                                                                const split = selectedAppointment.commission_split || 50;
                                                                                const myPct = Number(selectedAppointment.artist_id) === Number(artistId) ? split : (100 - split);
                                                                                return `${(myPct * 0.3).toFixed(0)}% split`;
                                                                            })()})
                                                                        </span>
                                                                        <span style={{ fontWeight: 'bold', color: '#10b981' }}>₱{(() => {
                                                                            const price = parseFloat(selectedAppointment.price || 0);
                                                                            if (!selectedAppointment.secondary_artist_id) return (price * 0.30).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                                            const split = selectedAppointment.commission_split || 50;
                                                                            const myShare = Number(selectedAppointment.artist_id) === Number(artistId) ? (split / 100) : ((100 - split) / 100);
                                                                            return (price * 0.30 * myShare).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                                        })()}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Payment</span>
                                                                        <span className={`status-badge ${selectedAppointment.payment_status === 'paid' ? 'completed' : selectedAppointment.payment_status === 'downpayment_paid' ? 'pending' : selectedAppointment.payment_status === 'pending' ? 'pending' : 'cancelled'}`} style={{ backgroundColor: selectedAppointment.payment_status === 'paid' ? '#dcfce7' : selectedAppointment.payment_status === 'downpayment_paid' ? '#dbeafe' : selectedAppointment.payment_status === 'pending' ? '#fef3c7' : '#f3f4f6', color: selectedAppointment.payment_status === 'paid' ? '#16a34a' : selectedAppointment.payment_status === 'downpayment_paid' ? '#2563eb' : selectedAppointment.payment_status === 'pending' ? '#b45309' : '#64748b' }}>
                                                                            {selectedAppointment.payment_status === 'paid' ? 'Paid' : selectedAppointment.payment_status === 'downpayment_paid' ? 'Partially Paid' : selectedAppointment.payment_status === 'pending' ? 'Pending' : 'Unpaid'}
                                                                        </span>
                                                                    </div>
                                                                    {selectedAppointment.status === 'completed' && (
                                                                        <div>
                                                                            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Materials Cost</span>
                                                                            <span style={{ fontWeight: 'bold', color: '#f59e0b' }}>₱{parseFloat(selectedAppointment.total_material_cost || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {selectedAppointment.notes && (
                                                                <div>
                                                                    <p style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: '#64748b' }}>Notes & Description</p>
                                                                    <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '8px', fontSize: '0.95rem', lineHeight: '1.5', color: '#334155' }}>
                                                                        {selectedAppointment.notes}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* RIGHT COLUMN: Images & Audit */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                                            {selectedAppointment.reference_image && (
                                                                <div>
                                                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#64748b' }}>Reference Image</p>
                                                                    <img
                                                                        src={selectedAppointment.reference_image.startsWith('data:') ? selectedAppointment.reference_image : selectedAppointment.reference_image.startsWith('http') ? selectedAppointment.reference_image : `${API_URL}${selectedAppointment.reference_image}`}
                                                                        alt="Reference"
                                                                        style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0' }}
                                                                    />
                                                                </div>
                                                            )}

                                                            {/* Draft Design Section */}
                                                            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>Artist Draft Design</p>
                                                                    <label className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '6px', margin: 0 }}>
                                                                        {selectedAppointment.draft_image ? 'Update Draft' : 'Upload Draft'}
                                                                        <input
                                                                            type="file"
                                                                            accept="image/*"
                                                                            style={{ display: 'none' }}
                                                                            onChange={(e) => handleUploadDraft(e, selectedAppointment.id)}
                                                                        />
                                                                    </label>
                                                                </div>
                                                                {selectedAppointment.draft_image ? (
                                                                    <img
                                                                        src={selectedAppointment.draft_image}
                                                                        alt="Draft Design"
                                                                        style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: '1px dashed #cbd5e1', background: '#fff' }}
                                                                    />
                                                                ) : (
                                                                    <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.9rem', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#fff' }}>
                                                                        No draft uploaded yet. Attach your design mockups here.
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Audit / Completed Image Section */}
                                                            {selectedAppointment.status === 'completed' && selectedAppointment.after_photo && (
                                                                <div style={{ background: '#ffffff', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.05)' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>Session Audit ({myRole === 'piercing' ? 'Completed Piercing' : 'Completed Tattoo'})</p>
                                                                    </div>
                                                                    <img
                                                                        src={selectedAppointment.after_photo.startsWith('data:') ? selectedAppointment.after_photo : (selectedAppointment.after_photo.startsWith('http') ? selectedAppointment.after_photo : `${API_URL}${selectedAppointment.after_photo}`)}
                                                                        alt="Completed Tattoo"
                                                                        style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#f8fafc' }}
                                                                    />
                                                                    <div style={{ marginTop: '15px', textAlign: 'center' }}>
                                                                        {customerConsent[selectedAppointment.customer_id]?.photo_marketing_consent === false ? (
                                                                            <div style={{ padding: '12px 18px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                                                                                <span style={{ fontSize: '0.82rem', color: '#991b1b', fontWeight: 600 }}>This client declined photo marketing consent.</span>
                                                                            </div>
                                                                        ) : (
                                                                            <>
                                                                                <button
                                                                                    className="btn"
                                                                                    disabled={publishStatus[selectedAppointment.id] === 'success' || publishStatus[selectedAppointment.id] === 'publishing'}
                                                                                    onClick={() => handlePublishToPortfolio(selectedAppointment)}
                                                                                    style={{ 
                                                                                        padding: '10px 24px', 
                                                                                        borderRadius: '20px', 
                                                                                        background: publishStatus[selectedAppointment.id] === 'success' ? '#10b981' : 'linear-gradient(135deg, #1e293b, #0f172a)', 
                                                                                        color: 'white', 
                                                                                        border: 'none', 
                                                                                        cursor: publishStatus[selectedAppointment.id] === 'success' || publishStatus[selectedAppointment.id] === 'publishing' ? 'not-allowed' : 'pointer', 
                                                                                        fontWeight: '600',
                                                                                        boxShadow: '0 4px 15px rgba(190, 144, 85, 0.3)',
                                                                                        transition: 'all 0.3s'
                                                                                    }}
                                                                                >
                                                                                    {publishStatus[selectedAppointment.id] === 'success' ? <><Check size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}} /> Published to Portfolio</> : publishStatus[selectedAppointment.id] === 'publishing' ? 'Publishing...' : 'Publish to Portfolio'}
                                                                                </button>
                                                                                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '8px' }}>This will push the image to your public Gallery.</p>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ padding: '15px 24px', borderTop: '1px solid #e2e8f0', textAlign: 'right', background: '#f8fafc', borderBottomLeftRadius: '20px', borderBottomRightRadius: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                                    {selectedAppointment.status === 'pending' && (
                                                        <>
                                                            <button onClick={() => { setConfirmModal({ visible: true, title: 'Decline Assignment', message: 'Are you sure you want to decline this assignment? It will be reverted back to the Admin for reassignment.', type: 'danger', onConfirm: () => { handleReject(selectedAppointment.id); setSelectedAppointment(null); } }); }} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', color: '#ef4444', border: '1px solid #ef4444', backgroundColor: '#fef2f2' }}>Decline</button>
                                                            <button onClick={() => { setConfirmModal({ visible: true, title: 'Confirm Availability', message: 'Ready to take on this assignment? Confirming will notify the manager to generate a quote for the client.', type: 'success', onConfirm: () => { handleAccept(selectedAppointment.id); setSelectedAppointment(null); } }); }} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', backgroundColor: '#10b981', color: 'white', border: 'none' }}>Confirm Availability</button>
                                                        </>
                                                    )}
                                                    {['confirmed', 'in_progress'].includes(selectedAppointment.status) && (
                                                        <button
                                                            onClick={() => { setSelectedAppointment(null); navigate(`/artist/sessions?appointment=${selectedAppointment.id}`); }}
                                                            className="btn btn-primary"
                                                            style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                        >
                                                            <PenTool size={14} /> Manage Session
                                                        </button>
                                                    )}
                                                    <button onClick={() => setSelectedAppointment(null)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: '500', color: '#334155' }}>Close</button>
                                                </div>
                                            </div>
                                        </div>
                                    ); })()}
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
