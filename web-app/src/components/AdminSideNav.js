import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    LogOut,
    Users,
    Calendar,
    MessageSquare,
    Package,
    BarChart3,
    Settings,
    Users2,
    ChevronLeft,
    ChevronRight,
    Menu,
    Building2,
    UserCircle,
    Receipt,
    ChevronDown,
    ChevronUp,
    AppWindow,
    Bell
} from 'lucide-react';
import '../styles/AdminSideNav.css';

function AdminSideNav() {
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(() => {
        const stored = localStorage.getItem('adminSidenavCollapsed');
        return stored === 'true';
    });
    const [userManagementOpen, setUserManagementOpen] = useState(() => {
        const stored = localStorage.getItem('userManagementOpen');
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
        localStorage.setItem('adminSidenavCollapsed', next ? 'true' : 'false');
    };

    const toggleUserManagement = () => {
        const next = !userManagementOpen;
        setUserManagementOpen(next);
        localStorage.setItem('userManagementOpen', next ? 'true' : 'false');
    };

    const isActive = (path) => location.pathname === path;
    const isParentActive = (children) => children.some(child => location.pathname === child.path);

    const quickActions = [
        {
            label: 'Dashboard',
            icon: LayoutDashboard,
            path: '/admin/dashboard',
            description: 'Overview'
        },
        {
            label: 'User Management',
            icon: Users,
            isDropdown: true,
            children: [
                {
                    label: 'Users',
                    path: '/admin/users',
                    description: 'Manage all users',
                    icon: Users
                },
                {
                    label: 'Clients',
                    path: '/admin/clients',
                    description: 'Client profiles',
                    icon: UserCircle
                },
                {
                    label: 'Staff',
                    path: '/admin/staff',
                    description: 'Manage staff',
                    icon: Users2
                }
            ]
        },
        {
            label: 'Studio',
            icon: Building2,
            path: '/admin/studio',
            description: 'Manage branches'
        },
        {
            label: 'Appointments',
            icon: Calendar,
            path: '/admin/appointments',
            description: 'View appointments'
        },
        {
            label: 'Chat',
            icon: MessageSquare,
            path: '/admin/chat',
            description: 'Chat with customers'
        },
        {
            label: 'Inventory',
            icon: Package,
            path: '/admin/inventory',
            description: 'Manage inventory'
        },
        {
            label: 'Analytics',
            icon: BarChart3,
            path: '/admin/analytics',
            description: 'View reports'
        },
        {
            label: 'Billing',
            icon: Receipt,
            path: '/admin/billing',
            description: 'Payments & Invoices'
        },
        {
            label: 'Settings',
            icon: Settings,
            path: '/admin/settings',
            description: 'System settings'
        },
        {
            label: 'Notifications',
            icon: Bell,
            path: '/admin/notifications',
            description: 'System alerts & updates'
        }
    ];

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/login');
    };

    return (
        <aside className={`admin-sidenav ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidenav-header">
                <div className="logo-container">
                    <AppWindow size={24} className="logo-icon" />
                    <h3 className="logo-text">InkVistAR</h3>
                </div>
                <button className="sidenav-toggle" onClick={toggleCollapsed} title={collapsed ? 'Expand' : 'Collapse'}>
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            <nav className="sidenav-menu">
                <div className="menu-section">
                    <p className="menu-label">Main Menu</p>
                    <ul className="menu-list">
                        {quickActions.map((action, index) => {
                            const IconComponent = action.icon;
                            const active = action.path ? isActive(action.path) : isParentActive(action.children || []);

                            if (action.isDropdown) {
                                return (
                                    <li key={index} className="dropdown-item">
                                        <button
                                            className={`menu-item dropdown-toggle ${userManagementOpen ? 'open' : ''} ${active ? 'parent-active' : ''}`}
                                            onClick={toggleUserManagement}
                                            title={action.label}
                                        >
                                            <IconComponent size={20} />
                                            <span className="menu-text">{action.label}</span>
                                            <span className="dropdown-arrow">
                                                {userManagementOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </span>
                                        </button>
                                        {userManagementOpen && (
                                            <ul className="dropdown-menu">
                                                {action.children.map((child, childIndex) => {
                                                    const ChildIcon = child.icon;
                                                    const childActive = isActive(child.path);
                                                    return (
                                                        <li key={childIndex}>
                                                            <button
                                                                className={`menu-item dropdown-child ${childActive ? 'active' : ''}`}
                                                                onClick={() => navigate(child.path)}
                                                                title={child.description}
                                                            >
                                                                <ChildIcon size={18} />
                                                                <span className="menu-text">{child.label}</span>
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </li>
                                );
                            }

                            return (
                                <li key={index}>
                                    <button
                                        className={`menu-item ${active ? 'active' : ''}`}
                                        onClick={() => navigate(action.path)}
                                        title={action.description}
                                    >
                                        <IconComponent size={20} />
                                        <span className="menu-text">{action.label}</span>
                                        {active && <div className="active-indicator" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="menu-section menu-section-bottom">
                    <button
                        className="menu-item logout-item"
                        onClick={handleLogout}
                        title="Logout"
                    >
                        <LogOut size={20} />
                        <span className="menu-text">Logout</span>
                    </button>
                </div>
            </nav>
        </aside>
    );
}

export default AdminSideNav;
