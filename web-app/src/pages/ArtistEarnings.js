import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { DollarSign, TrendingUp, CreditCard, Download } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import './PortalStyles.css';
import { API_URL } from '../config';

function ArtistEarnings(){
    const [stats, setStats] = useState({ 
        totalEarnings: 0, 
        totalCommission: 0,
        pendingPayout: 0 
    });
    const [sessionEarnings, setSessionEarnings] = useState([]);
    const [payoutHistory, setPayoutHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                // Fetch appointments to calculate earnings
                const res = await Axios.get(`${API_URL}/api/artist/${artistId}/appointments?status=completed`);
                
                if (res.data.success) {
                    const commissionRate = res.data.appointments.length > 0 ? (res.data.appointments[0].commission_rate || 0.6) : 0.6;
                    const completedAppts = res.data.appointments.map(appt => {
                        const basePrice = appt.price || 0; 
                        const artistShare = basePrice * commissionRate;
                        const studioShare = basePrice * (1 - commissionRate);
                        
                        return {
                            ...appt,
                            basePrice,
                            artistShare,
                            studioShare
                        };
                    });

                    setSessionEarnings(completedAppts);

                    // Calculate Stats
                    const totalEarnings = completedAppts
                        .filter(a => a.payment_status === 'paid')
                        .reduce((sum, a) => sum + a.artistShare, 0);
                    
                    // Calculate current month's earnings (only paid)
                    const currentMonth = new Date().getMonth();
                    const currentYear = new Date().getFullYear();
                    const monthlyPayout = completedAppts
                        .filter(a => a.payment_status === 'paid' && new Date(a.appointment_date).getMonth() === currentMonth && new Date(a.appointment_date).getFullYear() === currentYear)
                        .reduce((sum, a) => sum + a.artistShare, 0);

                    setStats({
                        totalEarnings,
                        totalCommission: commissionRate * 100, // Display as percentage
                        pendingPayout: monthlyPayout
                    });

                    // Generate Payout History (Group by Month)
                    const monthlyGroups = completedAppts.reduce((acc, appt) => {
                        const date = new Date(appt.appointment_date);
                        const monthKey = date.toLocaleString('default', { month: 'long', year: 'numeric' });
                        
                        if (!acc[monthKey]) {
                            acc[monthKey] = { month: monthKey, amount: 0, status: 'Paid', date: date };
                        }
                        acc[monthKey].amount += appt.artistShare;
                        return acc;
                    }, {});

                    const history = Object.values(monthlyGroups).sort((a, b) => b.date - a.date);
                    setPayoutHistory(history);
                }
                setLoading(false);
            } catch(e){ console.error(e); setLoading(false); }
        };
        fetch();
    }, [artistId]);

    return (
        <div className="portal-layout">
            <ArtistSideNav />
            <div className="portal-container artist-portal">
                <header className="portal-header">
                    <h1>Earnings & Commissions</h1>
                    <button className="btn btn-secondary" style={{display: 'flex', gap: '5px', alignItems: 'center'}}>
                        <Download size={16}/> Export Report
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
                                        <p className="stat-label">Total Earnings</p>
                                        <p className="stat-value">₱{stats.totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
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
                                        <p className="stat-value">₱{stats.pendingPayout.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
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
                                                    {sessionEarnings.map((session) => (
                                                        <tr key={session.id}>
                                                            <td>{new Date(session.appointment_date).toLocaleDateString()}</td>
                                                            <td>{session.client_name}</td>
                                                            <td>{session.design_title}</td>
                                                            <td>₱{session.basePrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                                            <td style={{color: session.payment_status === 'paid' ? '#10b981' : '#f59e0b', fontWeight: 'bold'}}>
                                                                ₱{session.artistShare.toFixed(2)}
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
                                                            <td>₱{payout.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
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
