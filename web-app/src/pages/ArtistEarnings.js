import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { DollarSign, TrendingUp, CreditCard, Download } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import Pagination from '../components/Pagination';
import './PortalStyles.css';
import { API_URL } from '../config';

function ArtistEarnings() {
    const [stats, setStats] = useState({
        totalEarnings: 0,
        totalCommission: 0,
        pendingPayout: 0
    });
    const [sessionEarnings, setSessionEarnings] = useState([]);
    const [payoutHistory, setPayoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    useEffect(() => {
        const fetchLedger = async () => {
            try {
                setLoading(true);
                const res = await Axios.get(`${API_URL}/api/artist/${artistId}/earnings-ledger`);

                if (res.data.success) {
                    setStats({
                        totalEarnings: res.data.stats.totalEarned,
                        totalCommission: (res.data.commissionRate * 100).toFixed(0),
                        pendingPayout: res.data.stats.balanceToPay
                    });
                    setSessionEarnings(res.data.sessions);
                    setPayoutHistory(res.data.payouts.map(p => ({
                        month: new Date(p.created_at).toLocaleString('default', { month: 'long', year: 'numeric' }),
                        amount: Number(p.amount),
                        status: p.status,
                        date: new Date(p.created_at)
                    })));
                }
                setLoading(false);
            } catch (e) {
                console.error(e);
                setLoading(false);
            }
        };
        fetchLedger();
    }, [artistId]);

    return (
        <div className="portal-layout">
            <ArtistSideNav />
            <div className="portal-container artist-portal">
                <header className="portal-header">
                    <h1>Earnings & Commissions</h1>
                    <button className="btn btn-secondary" style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <Download size={16} /> Export Report
                    </button>
                </header>

                <div className="portal-content">
                    {loading ? <div className="no-data">Loading...</div> : (
                        <>
                            {/* Summary Stats */}
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <DollarSign className="stat-icon" size={32} />
                                    <div className="stat-info">
                                        <p className="stat-label">Today's Earnings</p>
                                        <p className="stat-value">₱{stats.totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <TrendingUp className="stat-icon" size={32} />
                                    <div className="stat-info">
                                        <p className="stat-label">Your Commission Rate</p>
                                        <p className="stat-value">{stats.totalCommission}%</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <CreditCard className="stat-icon" size={32} />
                                    <div className="stat-info">
                                        <p className="stat-label">Current Month Payout</p>
                                        <p className="stat-value">₱{stats.pendingPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                                {/* Session-based Earnings */}
                                <div className="data-card">
                                    <h2>Session Earnings</h2>
                                    {sessionEarnings.length > 0 ? (
                                        <div className="table-responsive">
                                            <table className="portal-table">
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Client</th>
                                                        <th>Service</th>
                                                        <th>Total</th>
                                                        <th>Your Cut ({stats.totalCommission}%)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sessionEarnings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((session) => (
                                                        <tr key={session.id}>
                                                            <td>{new Date(session.appointment_date).toLocaleDateString()}</td>
                                                            <td>{session.client_name}</td>
                                                            <td>{session.design_title}</td>
                                                            <td>₱{(session.basePrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                            <td style={{ color: session.payment_status === 'paid' ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
                                                                ₱{(session.artistShare || 0).toFixed(2)}
                                                                <span style={{ fontSize: '0.7rem', display: 'block', color: session.payment_status === 'paid' ? '#10b981' : '#f59e0b' }}>
                                                                    {session.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : <p className="no-data">No completed sessions yet.</p>}
                                    {sessionEarnings.length > 0 && (
                                        <Pagination
                                            currentPage={currentPage}
                                            totalPages={Math.ceil(sessionEarnings.length / itemsPerPage)}
                                            onPageChange={setCurrentPage}
                                            itemsPerPage={itemsPerPage}
                                            onItemsPerPageChange={(newVal) => {
                                                setItemsPerPage(newVal);
                                                setCurrentPage(1);
                                            }}
                                            totalItems={sessionEarnings.length}
                                            unit="sessions"
                                        />
                                    )}
                                </div>

                                {/* Payout History */}
                                <div className="data-card">
                                    <h2>Payout History</h2>
                                    {payoutHistory.length > 0 ? (
                                        <div className="table-responsive">
                                            <table className="portal-table">
                                                <thead>
                                                    <tr>
                                                        <th>Month</th>
                                                        <th>Amount</th>
                                                        <th>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {payoutHistory.map((payout, i) => (
                                                        <tr key={i}>
                                                            <td>{payout.month}</td>
                                                            <td>₱{(payout.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                            <td><span className="status-badge completed">{payout.status}</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : <p className="no-data">No payout history.</p>}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ArtistEarnings;
