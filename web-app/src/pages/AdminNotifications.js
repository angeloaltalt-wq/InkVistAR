import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { 
    Bell, 
    AlertTriangle, 
    CheckCircle, 
    Package, 
    CalendarDays, 
    Settings, 
    Clock, 
    ArrowRight,
    Search,
    Filter,
    Check, // Keep Check for "Mark as Read"
    // Removed duplicate import of Bell
    Trash2,
    CheckCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminSideNav from '../components/AdminSideNav';
import './AdminDashboard.css';
import { API_URL } from '../config';

function AdminNotifications() {
    const [notifications, setNotifications] = useState([]);
    const [systemAlerts, setSystemAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
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
            setLoading(false);
        } catch (error) {
            console.error("Error fetching notifications:", error);
            setLoading(false);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'inventory': return <Package size={20} className="text-orange" />;
            case 'appointment': return <CalendarDays size={20} className="text-blue" />;
            case 'system': return <Settings size={20} className="text-purple" />;
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
            setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n));
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
            setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 0 } : n));
        } catch (e) {
            console.error("Error marking notification as unread:", e);
            // Optionally, show a user-friendly error message
        }
    };


    const filteredNotifs = notifications.filter(n => {
        const matchesSearch = n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             n.message.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = activeFilter === 'all' || n.type === activeFilter;
        return matchesSearch && matchesFilter;
    });

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page notifications-container">
                <header className="dashboard-top-nav">
                    <div className="top-nav-left">
                        <h1>Notification Center</h1>
                        <p className="subtitle">System alerts and direct updates</p>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
                        <button 
                            className="premium-btn secondary" 
                            onClick={async () => {
                                // Clear computed alerts (Inventory/Bookings)
                                setNotifications(notifications.filter(n => !n.id.toString().startsWith('inv-') && n.id !== 'apt-pending'));
                            }}
                            title="Clear system alerts"
                        >
                            <Trash2 size={16} /> Clear Alerts
                        </button>
                        <button 
                            className="premium-btn primary"
                            onClick={async () => {
                                // Mark all direct notifs as read
                                try {
                                    const unreadIds = notifications.filter(n => !n.is_read && !n.id.toString().startsWith('inv-') && n.id !== 'apt-pending').map(n => n.id);
                                    if (unreadIds.length > 0) {
                                        await Promise.all(unreadIds.map(id => Axios.put(`${API_URL}/api/notifications/${id}/read`)));
                                        setNotifications(notifications.map(n => ({ ...n, is_read: true })));
                                    }
                                } catch (e) { console.error(e); }
                            }}
                        >
                            <CheckCheck size={16} /> Mark all read
                        </button>
                    </div>
                </header>

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
                                    className="premium-select-v2"
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
                                {filteredNotifs.length > 0 ? filteredNotifs.map((n) => (
                                    <div key={n.id} className={`notification-record ${n.is_read ? 'read' : 'unread'} ${n.severity}`}>
                                        <div className="notif-id-marker"></div>
                                        <div className="notif-main">
                                            <div className="notif-header">
                                                <div className="notif-subject">
                                                    {getIcon(n.type)}
                                                    <span className="subject-text">{n.title}</span>
                                                    {!n.is_read && <span className="unread-dot"></span>}
                                                </div>
                                                <span className="notif-time">
                                                    <Clock size={12} />
                                                    {new Date(n.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="notif-body">{n.message}</p>
                                            <div className="notif-actions">
                                                {n.path && (
                                                    <button 
                                                        className="notif-btn primary" 
                                                        onClick={() => navigate(n.path)}
                                                    >
                                                        Take Action <ArrowRight size={14} />
                                                    </button>
                                                )}
                                                {!n.is_read && (
                                                    <button 
                                                        className="notif-btn ghost"
                                                        onClick={() => markAsRead(n.id)}
                                                    >
                                                        <Check size={14} /> Mark as Read
                                                    </button>
                                                )}
                                                {n.is_read && ( // Only show "Mark as Unread" for read notifications
                                                    <button 
                                                        className="notif-btn ghost"
                                                        onClick={() => markAsUnread(n.id)}
                                                        title="Mark as Unread"
                                                    >
                                                        <Bell size={14} /> Mark as Unread
                                                    </button>
                                                )}
                                            </div>
                                        </div>
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
                    </div>
                </main>
            </div>
            
            <style>{`
                .filter-chip {
                    padding: 8px 16px;
                    border-radius: 20px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: rgba(255, 255, 255, 0.7);
                }
                .filter-chip:hover {
                    background: rgba(255, 165, 0, 0.1);
                    color: orange;
                }
                .filter-chip.active {
                    background: orange;
                    color: white;
                    border-color: orange;
                }
                .notifications-stream {
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                .notification-record {
                    display: flex;
                    gap: 20px;
                    padding: 20px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 12px;
                    transition: transform 0.2s, background 0.2s;
                }
                .notification-record:hover {
                    background: rgba(255, 255, 255, 0.05);
                    transform: translateX(5px);
                }
                .notification-record.unread {
                    background: rgba(59, 130, 246, 0.05);
                    border-left: 4px solid #3b82f6;
                }
                .notification-record.high.unread {
                    background: rgba(239, 68, 68, 0.05);
                    border-left-color: #ef4444;
                }
                .notif-main {
                    flex: 1;
                }
                .notif-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }
                .notif-subject {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-weight: 600;
                    color: white;
                }
                .subject-text {
                    font-size: 1.05rem;
                }
                .unread-dot {
                    width: 8px;
                    height: 8px;
                    background: #ef4444;
                    border-radius: 50%;
                }
                .notif-time {
                    font-size: 0.8rem;
                    color: rgba(255, 255, 255, 0.4);
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .notif-body {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.95rem;
                    line-height: 1.5;
                    margin-bottom: 15px;
                }
                .notif-actions {
                    display: flex;
                    gap: 12px;
                }
                .notif-btn {
                    padding: 8px 16px;
                    border-radius: 6px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }
                .notif-btn.primary {
                    background: orange;
                    color: white;
                    border: none;
                }
                .notif-btn.primary:hover {
                    background: #ff8c00;
                    box-shadow: 0 4px 12px rgba(255, 140, 0, 0.3);
                }
                .notif-btn.ghost {
                    background: transparent;
                    color: rgba(255, 255, 255, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .notif-btn.ghost:hover {
                    background: rgba(255, 255, 255, 0.05);
                    color: white;
                    border-color: rgba(255, 255, 255, 0.3);
                }
                .text-orange { color: #f97316; }
                .text-blue { color: #3b82f6; }
                .text-purple { color: #a855f7; }
                
                .all-clear {
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 15px;
                    color: rgba(255, 255, 255, 0.5);
                }
                .all-clear h3 { color: white; margin: 0; }
            `}</style>
        </div>
    );
}

export default AdminNotifications;
