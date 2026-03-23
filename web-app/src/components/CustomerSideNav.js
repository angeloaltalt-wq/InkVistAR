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
    PlusCircle,
    Sparkles,
    Receipt
} from 'lucide-react';
import '../styles/CustomerSideNav.css';

function CustomerSideNav() {
    const navigate = useNavigate();
    const location = useLocation();
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
        { label: 'Book Appointment', icon: PlusCircle, path: '/customer/book' },
        { label: 'My Bookings', icon: Calendar, path: '/customer/bookings' },
        { label: 'Gallery', icon: Image, path: '/customer/gallery' },
        { label: 'Try-On Tattoo', icon: Sparkles, path: '/customer/try-on' },
        { label: 'Profile', icon: User, path: '/customer/profile' },
    ];

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/login');
    };

    return (
        <aside className={`customer-sidenav ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidenav-header">
                <span>Customer Portal</span>
                <button className="close-nav" onClick={toggleCollapsed}>
                    {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
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
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="menu-section-bottom">
                    <button className="menu-item logout-item" onClick={handleLogout}>
                        <LogOut size={20} />
                        <span className="menu-text">Logout</span>
                    </button>
                </div>
            </nav>
        </aside>
    );
}

export default CustomerSideNav;