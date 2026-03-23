import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';
import { 
    Receipt, 
    Calendar, 
    CreditCard, 
    ArrowRight,
    Search,
    Download,
    ExternalLink,
    CheckCircle,
    Clock,
    AlertCircle
} from 'lucide-react';
import './PortalStyles.css'; // Reusing some table styles

function CustomerTransactions() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    useEffect(() => {
        fetchTransactions();
    }, []);

    const fetchTransactions = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/customer/${user.id}/transactions`);
            if (res.data.success) {
                setTransactions(res.data.transactions);
            }
        } catch (err) {
            console.error('Error fetching transactions:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleDateString(undefined, options);
    };

    const getStatusStyle = (status) => {
        switch (status?.toLowerCase()) {
            case 'paid':
                return { backgroundColor: '#ecfdf5', color: '#059669', icon: CheckCircle };
            case 'pending':
                return { backgroundColor: '#fff7ed', color: '#ea580c', icon: Clock };
            case 'failed':
                return { backgroundColor: '#fef2f2', color: '#dc2626', icon: AlertCircle };
            default:
                return { backgroundColor: '#f3f4f6', color: '#4b5563', icon: Receipt };
        }
    };

    const filteredTransactions = transactions.filter(t => 
        t.design_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.paymongo_payment_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.appointment_id?.toString().includes(searchTerm)
    );

    if (loading) {
        return (
            <div className="bookings-container">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading transaction history...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bookings-container">
            <header className="bookings-header">
                <div>
                    <h1>Transaction History</h1>
                    <p>View all your payments and billing details</p>
                </div>
                <div className="header-actions">
                    <div className="search-bar">
                        <Search size={18} />
                        <input 
                            type="text" 
                            placeholder="Search by title, ID..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            <div className="bookings-card">
                <div className="table-wrapper">
                    <table className="bookings-table">
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Reference</th>
                                <th>Service</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTransactions.length > 0 ? (
                                filteredTransactions.map((t) => {
                                    const statusStyle = getStatusStyle(t.status);
                                    const StatusIcon = statusStyle.icon;
                                    
                                    return (
                                        <tr key={t.id}>
                                            <td className="date-cell">
                                                <div className="date-info">
                                                    <Calendar size={14} />
                                                    <span>{formatDate(t.created_at)}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Appt #{t.appointment_id}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.paymongo_payment_id || t.session_id?.substring(0, 15) + '...'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="design-title">{t.design_title || 'Tattoo Service'}</span>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                                    ₱{(t.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </div>
                                            </td>
                                            <td>
                                                <span 
                                                    className="status-badge" 
                                                    style={{ 
                                                        backgroundColor: statusStyle.backgroundColor, 
                                                        color: statusStyle.color,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        width: 'fit-content'
                                                    }}
                                                >
                                                    <StatusIcon size={12} />
                                                    {t.status?.toUpperCase()}
                                                </span>
                                            </td>
                                            <td>
                                                <button 
                                                    className="btn-view"
                                                    title="View Receipt"
                                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1' }}
                                                    onClick={() => alert(`Payment Reference: ${t.paymongo_payment_id || t.session_id}\nAmount: ₱${(t.amount/100).toFixed(2)}\nStatus: ${t.status}`)}
                                                >
                                                    <ExternalLink size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="6" className="empty-state">
                                        <Receipt size={48} />
                                        <p>No transactions found</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <footer style={{ marginTop: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                <p>Transactions are processed securely via PayMongo. For billing inquiries, contact studio support.</p>
            </footer>
        </div>
    );
}

export default CustomerTransactions;
