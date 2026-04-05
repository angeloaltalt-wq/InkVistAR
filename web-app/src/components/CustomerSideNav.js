import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Calendar,
    Image,
    User,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Sparkles,
    Bell,
    Building2
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import '../styles/CustomerSideNav.css';

function CustomerSideNav() {
    const navigate = useNavigate();
    const location = useLocation();
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [collapsed, setCollapsed] = useState(() => {
        const stored = localStorage.getItem('customerSidenavCollapsed');
        return stored === 'true';
    });

    useEffect(() => {
        if (collapsed) {
            document.body.classList.add('sidenav-collapsed');
        } else {
            document.body.classList.remove('sidenav-collapsed');
        }
        return () => document.body.classList.remove('sidenav-collapsed');
    }, [collapsed]);

    const toggleCollapsed = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem('customerSidenavCollapsed', next ? 'true' : 'false');
    };

    const menuItems = [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/customer' },
        { label: 'My Bookings', icon: Calendar, path: '/customer/bookings' },
        { label: 'Gallery', icon: Image, path: '/customer/gallery' },
        { label: 'Try-On Tattoo', icon: Sparkles, path: '/customer/try-on' },
        { label: 'Notifications', icon: Bell, path: '/customer/notifications' },
        { label: 'Profile', icon: User, path: '/customer/profile' },
    ];

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/login');
    };

    return (
        <aside className={`customer-sidenav ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidenav-header">
                <div className="logo-container">
                    <div className="logo-box">
                        <Building2 size={24} />
                    </div>
                    <span className="logo-text">InkVistAR</span>
                </div>
                <button className="sidenav-toggle" onClick={toggleCollapsed} title={collapsed ? 'Expand' : 'Collapse'}>
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            <nav className="sidenav-menu">
                <div className="menu-section">
                    <p className="menu-label">Menu</p>
                    <ul className="menu-list">
                        {menuItems.map((item, index) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.path;
                            return (
                                <li key={index}>
                                    <button
                                        className={`menu-item ${isActive ? 'active' : ''}`}
                                        onClick={() => navigate(item.path)}
                                    >
                                        <Icon size={20} />
                                        <span className="menu-text">{item.label}</span>
                                        {isActive && <div className="active-indicator" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="menu-section-bottom">
                    <button className="menu-item logout-item" onClick={() => setShowLogoutConfirm(true)}>
                        <LogOut size={20} />
                        <span className="menu-text">Logout</span>
                        <div className="active-indicator" style={{ display: 'none' }} />
                    </button>
                </div>
            </nav>

            <ConfirmModal
                isOpen={showLogoutConfirm}
                title="Confirm Logout"
                message="Are you sure you want to sign out of your account?"
                confirmText="Yes, Logout"
                cancelText="Cancel"
                type="logout"
                onConfirm={handleLogout}
                onClose={() => setShowLogoutConfirm(false)}
            />
        </aside>
    );
}

export default CustomerSideNav;