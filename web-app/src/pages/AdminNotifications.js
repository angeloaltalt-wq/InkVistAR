import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { 
    Bell, 
    AlertTriangle, 
    CheckCircle, 
    Package, 
    CalendarDays,
    CalendarCheck, // Added for appointment_confirmed
    XCircle, // Added for appointment_cancelled
    Settings, 
    Clock, 
    ArrowRight,
    Search,
    Filter,
    Check, // Keep Check for "Mark as Read"
    Trash2,
    CheckCheck,
    Info, // Added for system notifications
    RotateCcw, // Added for mark as unread
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminSideNav from '../components/AdminSideNav';
import Pagination from '../components/Pagination';
import './AdminDashboard.css';
import { API_URL } from '../config';

function AdminNotifications() {
    const [notifications, setNotifications] = useState([]);
    const [systemAlerts, setSystemAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const navigate = useNavigate();

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
        try {
            setLoading(true);
            const [notifsResponse, appointmentsResponse, inventoryResponse] = await Promise.all([
                Axios.get(`${API_URL}/api/notifications/1`), // Admin notifications
                Axios.get(`${API_URL}/api/admin/appointments`),
                Axios.get(`${API_URL}/api/admin/inventory?status=active`)
            ]);

            // Process Personal/Direct Notifications
            const directNotifs = notifsResponse.data.success ? notifsResponse.data.notifications : [];

            // Generate System-wide Alerts (Mirroring Dashboard logic for consistency)
            const alerts = [];
            
            // 1. Inventory Alerts
            if (inventoryResponse.data.success) {
                const lowStockItems = inventoryResponse.data.data.filter(item => item.current_stock <= item.min_stock);
                lowStockItems.forEach(item => {
                    alerts.push({
                        id: `inv-${item.id}`,
                        title: 'Inventory Alert',
                        message: `Low stock detected: ${item.name} (${item.current_stock} remaining).`,
                        type: 'inventory',
                        severity: 'high',
                        created_at: new Date().toISOString(),
                        is_read: false,
                        path: '/admin/inventory'
                    });
                });
            }

            // 2. Pending Appointments
            if (appointmentsResponse.data.success) {
                const pending = appointmentsResponse.data.data.filter(apt => apt.status === 'pending');
                if (pending.length > 0) {
                    alerts.push({
                        id: 'apt-pending',
                        title: 'Booking Requests',
                        message: `There are ${pending.length} pending appointment requests awaiting review.`,
                        type: 'appointment',
                        severity: 'medium',
                        created_at: new Date().toISOString(),
                        is_read: false,
                        path: '/admin/appointments'
                    });
                }
            }

            // Combine and sort
            const combined = [
                ...alerts,
                ...directNotifs.map(n => ({
                    ...n,
                    severity: n.type === 'system' ? 'medium' : 'low'
                }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            
            setNotifications(combined);
            setUnreadCount(combined.filter(n => !n.is_read).length);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching notifications:", error);
            setLoading(false);
            setNotifications([]);
            setUnreadCount(0);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'inventory': return <Package size={20} className="text-orange" />;
            case 'appointment': return <CalendarDays size={20} className="text-blue" />;
            case 'system': return <Settings size={20} className="text-purple" />;
            case 'appointment_confirmed': return <CalendarCheck size={20} className="text-green" />;
            case 'appointment_cancelled': return <XCircle size={20} className="text-red" />;
            case 'appointment_completed': return <CheckCircle size={20} className="text-green" />;
            case 'payment_success': return <CheckCircle size={20} className="text-green" />;
            case 'pos_invoice': return <Info size={20} className="text-blue" />;
            case 'appointment_request': return <CalendarDays size={20} className="text-orange" />;
            default: return <Bell size={20} />;
        }
    };

    const markAsRead = async (id) => {
        if (id.toString().startsWith('inv-') || id === 'apt-pending') {
            // These are computed alerts, we just remove them from view for this session
            setNotifications(notifications.filter(n => n.id !== id));
            return;
        }
        try {
            await Axios.put(`${API_URL}/api/notifications/${id}/read`);
            setNotifications(prev => {
                const updated = prev.map(n => n.id === id ? { ...n, is_read: 1 } : n);
                return updated;
            });
        } catch (e) {
            console.error(e);
        }
    };

    const markAsUnread = async (id) => {
        // Computed alerts (inv- or apt-pending) don't have a backend state to mark as unread.
        // They are transient and are re-generated on page load if conditions are met.
        // For these, we will simply not perform any action.
        if (id.toString().startsWith('inv-') || id === 'apt-pending') {
            console.log(`Attempted to mark computed alert ${id} as unread. Not applicable as it's a client-side generated notification.`);
            return;
        }
        try {
            // The backend endpoint `/api/notifications/:id/read` supports a body with `is_read`.
            // Sending `is_read: 0` will mark it as unread.
            await Axios.put(`${API_URL}/api/notifications/${id}/read`, { is_read: 0 });
            setNotifications(prev => {
                const updated = prev.map(n => n.id === id ? { ...n, is_read: 0 } : n);
                return updated;
            });
        } catch (e) {
            console.error("Error marking notification as unread:", e);
            // Optionally, show a user-friendly error message
        }
    };

    const markAllRead = async () => {
        try {
            const unreadIds = notifications.filter(n => !n.is_read && !n.id.toString().startsWith('inv-') && n.id !== 'apt-pending').map(n => n.id);
            if (unreadIds.length > 0) {
                await Promise.all(unreadIds.map(id => Axios.put(`${API_URL}/api/notifications/${id}/read`)));
                setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
                setUnreadCount(0);
            }
        } catch (e) {
            console.error(e);
        }
    };
    const filterButtonStyle = (isActive) => {
        return { background: isActive ? '#daa520' : 'rgba(255,255,255,0.05)', color: isActive ? 'white' : 'rgba(255,255,255,0.6)' };
    };


    const filteredNotifs = notifications.filter(n => {
        const matchesSearch = n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             n.message.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = activeFilter === 'all' || n.type === activeFilter;
        return matchesSearch && matchesFilter;
    });

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, activeFilter]);

    const totalPages = Math.ceil(filteredNotifs.length / itemsPerPage);
    const currentItems = filteredNotifs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page portal-container">
                <header className="portal-header">
                    <div className="header-title">
                        <h1>Notification Center</h1>
                    </div>
                    <div className="header-actions">
                        <button 
                            className="premium-btn primary"
                            onClick={markAllRead}
                        >
                            <CheckCheck size={18} /> Mark All Read
                        </button>
                        <button 
                            className="premium-btn secondary"
                            onClick={async () => {
                                // Clear computed alerts (Inventory/Bookings)
                                setNotifications(notifications.filter(n => !n.id.toString().startsWith('inv-') && n.id !== 'apt-pending'));
                                setUnreadCount(notifications.filter(n => !n.is_read && !n.id.toString().startsWith('inv-') && n.id !== 'apt-pending').length);
                            }}
                            title="Clear system alerts"
                        >
                            <Trash2 size={16} /> Clear Alerts
                        </button>
                    </div>
                </header>
                <p className="header-subtitle" style={{ marginTop: '-2.5rem', marginBottom: '2.5rem', marginRight: '-5.5rem', textAlign: 'left' }}>System alerts and direct updates</p>

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

                <main className="dashboard-main-content">
                    <div className="glass-card table-card-v2 full-width">
                        <div className="premium-filter-bar" style={{ margin: '20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div className="premium-search-box" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <Search size={18} style={{ color: 'rgba(255,255,255,0.4)' }} />
                                <input
                                    type="text"
                                    placeholder="Search notifications..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ color: 'white' }}
                                />
                            </div>

                            <div className="premium-filters-group">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', fontWeight: '600' }}>
                                    <Filter size={16} />
                                    <span>Type:</span>
                                </div>
                                <select 
                                    value={activeFilter} 
                                    onChange={(e) => setActiveFilter(e.target.value)}
                                    className="premium-select-v2" // Keep this class for existing styling
                                    // Override some styles to match filterButtonStyle
                                    // This is a temporary fix, ideally these styles should be in CSS
                                    // and the select should be a custom component or styled consistently.
                                    // For now, it's a quick way to make it look similar to the buttons.
                                    style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}
                                >
                                    <option value="all">All Notifications</option>
                                    <option value="inventory">Inventory Alerts</option>
                                    <option value="appointment">Booking Requests</option>
                                    <option value="system">System Updates</option>
                                </select>
                            </div>
                        </div>

                        {loading ? (
                            <div className="empty-state">
                                <div className="premium-loader"></div>
                                <p>Processing alert stream...</p>
                            </div>
                        ) : (
                            <div className="notifications-stream">
                                {currentItems.length > 0 ? (
                                    <div className="notifications-stream" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                        {currentItems.map((n) => {
                                            const Icon = getIcon(n.type);
                                            return (
                                                <div key={n.id} className={`glass-card notification-record ${n.is_read ? 'read' : 'unread'}`} style={{ padding: '12px 20px', borderLeft: !n.is_read ? `4px solid ${getNotificationStyle(n.type).color}` : '1px solid rgba(255,255,255,0.1)', fontWeight: n.is_read ? 'normal' : '600' }}>
                                                    <div className="notif-id-marker"></div>
                                                    <div className="notif-main" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                        <div className="icon-badge" style={{ background: getNotificationStyle(n.type).bg, padding: '6px', borderRadius: '6px', flexShrink: 0 }}>
                                                            {Icon}
                                                        </div>
                                                        
                                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px', overflow: 'hidden' }}>
                                                            <span className="subject-text" style={{ fontSize: '0.95rem', minWidth: '150px', color: n.is_read ? '#64748b' : '#1e293b' }}>{n.title}</span>
                                                            <p className="notif-body" style={{ margin: 0, fontSize: '0.9rem', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.message}</p>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexShrink: 0 }}>
                                                            <span className="notif-time" style={{ fontSize: '0.75rem', color: '#94a3b8', minWidth: '80px', textAlign: 'right' }}>
                                                                {new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                            </span>
                                                            
                                                            <div className="notif-actions" style={{ display: 'flex', gap: '8px' }}>
                                                                {n.path && (
                                                                    <button 
                                                                        className="notif-btn primary" 
                                                                        onClick={() => navigate(n.path)}
                                                                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                                                    >
                                                                        Take Action <ArrowRight size={14} />
                                                                    </button>
                                                                )}
                                                                {!n.is_read ? (
                                                                    <button className="notif-btn ghost" onClick={() => markAsRead(n.id)} style={{ padding: '4px' }} title="Mark as Read">
                                                                        <Check size={14}/>
                                                                    </button>
                                                                ) : (
                                                                    <button className="notif-btn ghost" onClick={() => markAsUnread(n.id)} style={{ padding: '4px' }} title="Mark as Unread">
                                                                        <RotateCcw size={14}/>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )) : (
                                    <div className="all-clear" style={{ padding: '100px 0' }}>
                                        <CheckCircle size={48} color="#10b981" />
                                        <h3>Notification Inbox Clear</h3>
                                        <p>You have addressed all system alerts and updates.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {!loading && filteredNotifs.length > 0 && (
                            <Pagination 
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                                itemsPerPage={itemsPerPage}
                                onItemsPerPageChange={(newVal) => {
                                    setItemsPerPage(newVal);
                                    setCurrentPage(1);
                                }}
                                totalItems={filteredNotifs.length}
                                unit="notifications"
                            />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

export default AdminNotifications;
