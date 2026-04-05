import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { 
    Bell, 
    Check, 
    CalendarCheck, 
    XCircle, 
    CheckCircle, 
    Info, 
    Clock,
    CheckCheck, 
    RotateCcw,
    Mail,
    Trash2
} from 'lucide-react';
import CustomerSideNav from '../components/CustomerSideNav';
import Pagination from '../components/Pagination';
import './PortalStyles.css';
import { API_URL } from '../config';

function CustomerNotifications() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    

    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const customerId = user ? user.id : null;

    useEffect(() => {
        if (customerId) fetchNotifications();
    }, [customerId]);

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const res = await Axios.get(`${API_URL}/api/notifications/${customerId}`);
            if (res.data.success) {
                setNotifications(res.data.notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
            }
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const markRead = async (id) => {
        try {
            await Axios.put(`${API_URL}/api/notifications/${id}/read`);
            setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n));
        } catch (e) {
            console.error(e);
        }
    };

    const markUnread = async (id) => {
        try {
            await Axios.put(`${API_URL}/api/notifications/${id}/read`, { is_read: 0 });
            setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 0 } : n));
        } catch (e) {
            console.error(e);
        }
    };

    const markAllRead = async () => {
        try {
            const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
            if (unreadIds.length > 0) {
                await Promise.all(unreadIds.map(id => Axios.put(`${API_URL}/api/notifications/${id}/read`)));
                setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const formatNotificationTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInDays = (now - date) / (1000 * 60 * 60 * 24);

        if (diffInDays < 7) {
            const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (date.toDateString() === now.toDateString()) {
                return time;
            }
            const day = date.toLocaleDateString([], { weekday: 'short' });
            return `${day} ${time}`;
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const getNotificationStyle = (type) => {
        switch (type) {
            case 'appointment_confirmed': 
                return { icon: CalendarCheck, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', label: 'Confirmed' };
            case 'appointment_cancelled': 
                return { icon: XCircle, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Cancelled' };
            case 'appointment_completed':
                return { icon: CheckCircle, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', label: 'Completed' };
            case 'payment_received':
                return { icon: Check, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', label: 'Payment' };
            case 'system':
                return { icon: Info, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', label: 'System' };
            case 'pos_invoice':
                return { icon: Check, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', label: 'Invoice' };

            default:
                return { icon: Bell, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', label: 'Notification' };
        }
    };

    const filteredNotifs = notifications.filter(n => {
        if (activeFilter === 'unread') return !n.is_read;
        return true;
    });

    const unreadCount = notifications.filter(n => !n.is_read).length;

    // Pagination logic
    const totalPages = Math.ceil(filteredNotifs.length / itemsPerPage);
    const currentItems = filteredNotifs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (!customerId) return <div className="portal-layout"><CustomerSideNav /><div className="portal-container">Please login to view notifications</div></div>;

    return (
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
                <header className="portal-header">
                    <div className="header-title">
                        <h1>Updates & Alerts</h1>
                    </div>
                    <div className="header-actions">
                        <button className="premium-btn primary" onClick={markAllRead}>
                            <CheckCheck size={18} />
                            Mark All Read
                        </button>
                    </div>
                </header>

                <p className="header-subtitle" style={{ marginTop: '-2.5rem', marginBottom: '2.5rem', marginRight: '-5.5rem', textAlign: 'left' }}>Stay informed about your tattoo journey</p>

                <div className="portal-stats-row" style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
                    <div className="glass-card" style={{ flex: 1, padding: '20px', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: '5px' }}>Total Updates</span>
                        <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#1e293b' }}>{notifications.length}</span>
                    </div>
                    <div className="glass-card" style={{ flex: 1, padding: '20px', textAlign: 'center', borderLeft: unreadCount > 0 ? '4px solid #f59e0b' : 'none' }}>
                        <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: '5px' }}>Unread Alerts</span>
                        <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: unreadCount > 0 ? '#f59e0b' : 'inherit' }}>{unreadCount}</span>
                    </div>
                </div>

                <div className="filter-bar" style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
                    <button 
                        className={`filter-btn ${activeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveFilter('all')}
                        style={filterButtonStyle(activeFilter === 'all')}
                    >
                        All
                    </button>
                    <button 
                        className={`filter-btn ${activeFilter === 'unread' ? 'active' : ''}`}
                        onClick={() => setActiveFilter('unread')}
                        style={filterButtonStyle(activeFilter === 'unread')}
                    >
                        Unread
                    </button>
                </div>

                <div className="portal-content">
                    {loading ? (
                        <div className="dashboard-loader-container">
                            <div className="premium-loader"></div>
                            <p>Fetching your updates...</p>
                        </div>
                    ) : (
                        <div className="full-width" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
                            {currentItems.length > 0 ? (
                                <div className="notifications-stream" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                    {currentItems.map(n => {
                                        const style = getNotificationStyle(n.type);
                                        const Icon = style.icon;
                                        
                                        return (
                                            <div key={n.id} className={`glass-card notification-record ${n.is_read ? 'read' : 'unread'}`} style={{ padding: '12px 20px', borderLeft: !n.is_read ? `4px solid ${style.color}` : '1px solid rgba(255,255,255,0.1)', fontWeight: n.is_read ? 'normal' : '600' }}>
                                                <div className="notif-id-marker"></div>
                                                <div className="notif-main" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                    <div className="icon-badge" style={{ background: style.bg, padding: '6px', borderRadius: '6px', flexShrink: 0 }}>
                                                        <Icon size={16} color={style.color}/>
                                                    </div>
                                                    
                                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px', overflow: 'hidden' }}>
                                                        <span className="subject-text" style={{ fontSize: '0.95rem', minWidth: '150px', color: n.is_read ? '#64748b' : '#1e293b' }}>{n.title}</span>
                                                        <p className="notif-body" style={{ margin: 0, fontSize: '0.9rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.message}</p>
                                                    </div>

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexShrink: 0 }}>
                                                        <span className="notif-time" style={{ fontSize: '0.75rem', color: '#94a3b8', minWidth: '100px', textAlign: 'right' }}>
                                                            {formatNotificationTime(n.created_at)}
                                                        </span>
                                                        
                                                        <div className="notif-actions" style={{ display: 'flex', gap: '8px' }}>
                                                            {!n.is_read ? (
                                                                <button className="notif-btn ghost" onClick={() => markRead(n.id)} style={{ padding: '4px' }} title="Mark as Read">
                                                                    <Check size={14}/>
                                                                </button>
                                                            ) : (
                                                                <button className="notif-btn ghost" onClick={() => markUnread(n.id)} style={{ padding: '4px' }} title="Mark as Unread">
                                                                    <RotateCcw size={14}/>
                                                                </button>
                                                            )}
                                                            {n.type === 'pos_invoice' && (
                                                                <a
                                                                    href={`${API_URL}/api/invoices/${n.related_id}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="notif-btn primary"
                                                                    style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                                >
                                                                    Invoice
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="all-clear" style={{ padding: '100px 0' }}>
                                    <CheckCircle size={48} color="#10b981" />
                                    <h3>Everything Up to Date</h3>
                                    <p>You have no new notifications at this time.</p>
                                </div>
                            )}

                            {filteredNotifs.length > itemsPerPage && (
                                <div style={{ marginTop: '20px' }}>
                                    <Pagination 
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPageChange={setCurrentPage}
                                        itemsPerPage={itemsPerPage}
                                        onItemsPerPageChange={setItemsPerPage}
                                        totalItems={filteredNotifs.length}
                                        unit="notifications"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const filterButtonStyle = (isActive) => ({
    padding: '8px 20px',
    borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.1)',
    background: isActive ? '#daa520' : 'rgba(255,255,255,0.05)',
    color: isActive ? 'white' : '#64748b',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    backdropFilter: 'blur(10px)'
});

export default CustomerNotifications;
