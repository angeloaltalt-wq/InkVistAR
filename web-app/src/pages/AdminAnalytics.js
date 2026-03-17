import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { DollarSign, Calendar, Users, Download, Package, Printer } from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import './AdminAnalytics.css';
import { API_URL } from '../config';

function AdminAnalytics() {
    const [dateRange, setDateRange] = useState('month');
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            const res = await Axios.get(`${API_URL}/api/admin/analytics`);
            if (res.data.success) {
                setAnalytics(res.data.data);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching analytics:", error);
            setLoading(false);
        }
    };

    const handleExport = () => {
        if (!analytics) return;
        
        // Prepare CSV data
        const rows = [
            ['Report Type', 'Metric', 'Value'],
            ['Revenue', 'Total Revenue', `₱${analytics.revenue.total}`],
            ['Appointments', 'Total', analytics.appointments.total],
            ['Appointments', 'Completed', analytics.appointments.completed],
            ['Appointments', 'Cancelled', analytics.appointments.cancelled],
            [],
            ['Artist Performance', 'Name', 'Revenue', 'Appointments'],
            ...analytics.artists.map(a => ['Artist', a.name, `₱${a.revenue}`, a.appointments]),
            [],
            ['Inventory Consumption', 'Item', 'Used Qty'],
            ...analytics.inventory.map(i => ['Inventory', i.name, `${i.used} ${i.unit}`])
        ];
        
        let csvContent = "data:text/csv;charset=utf-8," 
            + rows.map(e => e.join(",")).join("\n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `analytics_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
    };
    
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="admin-page-with-sidenav">
               <AdminSideNav />
            <div className="admin-page page-container-enter">
            <header className="admin-header" style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: 'none', color: '#1f2937' }}>
                <h1>Analytics & Reports</h1>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button className="btn btn-secondary" onClick={handlePrint} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Printer size={18} /> Print Report
                    </button>
                    <button className="btn btn-primary" onClick={handleExport} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Download size={18} /> Export Report
                    </button>
                    <select 
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="select-input"
                        style={{ maxWidth: '200px' }}
                    >
                        <option value="week">Last Week</option>
                        <option value="month">This Month</option>
                        <option value="quarter">This Quarter</option>
                        <option value="year">This Year</option>
                    </select>
                </div>
            </header>

            {loading ? (
                <div className="no-data" style={{padding: '4rem'}}>Loading analytics...</div>
            ) : !analytics ? (
                <div className="no-data" style={{padding: '4rem'}}>No analytics data available.</div>
            ) : (
            <>
            {/* Print Only Header */}
            <div className="print-only-header">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px'}}>
                    <div>
                        <h1 style={{margin: 0, color: '#000'}}>InkVistAR Studio</h1>
                        <p style={{margin: 0}}>Analytics & Performance Report</p>
                    </div>
                    <div style={{textAlign: 'right'}}>
                        <p style={{margin: 0}}>Date: {new Date().toLocaleDateString()}</p>
                        <p style={{margin: 0}}>Range: {dateRange.charAt(0).toUpperCase() + dateRange.slice(1)}</p>
                    </div>
                </div>
            </div>
            {/* Key Metrics */}
            <div className="metrics-section">
                <div className="metric-card primary">
                    <DollarSign className="metric-icon" size={32} />
                    <div className="metric-content">
                        <p className="metric-label">Total Revenue</p>
                        <p className="metric-value">₱{analytics.revenue.total.toLocaleString()}</p>
                    </div>
                </div>

                <div className="metric-card">
                    <Calendar className="metric-icon" size={32} />
                    <div className="metric-content">
                        <p className="metric-label">Total Appointments</p>
                        <p className="metric-value">{analytics.appointments.total}</p>
                        <p className="metric-info">
                            {analytics.appointments.completed} completed, {analytics.appointments.scheduled} scheduled
                        </p>
                    </div>
                </div>

                <div className="metric-card">
                    <Package className="metric-icon" size={32} />
                    <div className="metric-content">
                        <p className="metric-label">Inventory Used</p>
                        <p className="metric-value">{analytics.inventory.reduce((sum, i) => sum + i.used, 0)}</p>
                        <p className="metric-info">
                            Items consumed
                        </p>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon">✓</div>
                    <div className="metric-content">
                        <p className="metric-label">Completion Rate</p>
                        <p className="metric-value">{analytics.appointments.completionRate}%</p>
                        <p className="metric-info">
                            {analytics.appointments.cancelled} cancelled
                        </p>
                    </div>
                </div>
            </div>

            <div className="analytics-grid">
                {/* Services Performance */}
                <div className="card">
                    <h2>Popular Styles</h2>
                    <div className="service-list">
                        {analytics.styles.map((style, index) => (
                            <div key={index} className="service-item">
                                <div className="service-info">
                                    <p className="service-name">{style.name}</p>
                                    <div className="service-stats">
                                        <span>{style.count} works</span>
                                    </div>
                                </div>
                                <div className="progress-bar">
                                    <div 
                                        className="progress-fill" 
                                        // Simple visualization relative to max
                                        style={{ width: `${(style.count / Math.max(...analytics.styles.map(s => s.count))) * 100}%` }}
                                    >
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Artist Performance */}
                <div className="card">
                    <h2>Top Artists</h2>
                    <div className="artist-list">
                        {analytics.artists.map((artist, index) => (
                            <div key={index} className="artist-item">
                                <div className="artist-info">
                                    <div className="artist-rank">#{index + 1}</div>
                                    <div className="artist-details">
                                        <p className="artist-name">{artist.name}</p>
                                        <p className="artist-rating">⭐ 5.0</p>
                                    </div>
                                </div>
                                <div className="artist-stats">
                                    <div className="stat">
                                        <span className="stat-value">₱{(artist.revenue || 0).toLocaleString()}</span>
                                        <span className="stat-label">Revenue</span>
                                    </div>
                                    <div className="stat">
                                        <span className="stat-value">{artist.appointments}</span>
                                        <span className="stat-label">Appointments</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="analytics-grid">
                {/* Peak Hours */}
                <div className="card">
                    <h2>Inventory Consumption</h2>
                    <div className="service-list">
                        {analytics.inventory.map((item, index) => (
                            <div key={index} className="service-item">
                                <div className="service-info">
                                    <p className="service-name">{item.name}</p>
                                    <div className="service-stats">
                                        <span>{item.used} {item.unit} used</span>
                                    </div>
                                </div>
                                <div className="progress-bar">
                                    <div 
                                        className="progress-fill" 
                                        style={{ width: `${(item.used / Math.max(...analytics.inventory.map(i => i.used))) * 100}%`, backgroundColor: '#f59e0b' }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Monthly Trend */}
                <div className="card">
                    <h2>Monthly Revenue Trend</h2>
                    <div className="trend-chart">
                        {analytics.revenue.chart.map((data, index) => (
                            <div key={index} className="trend-item">
                                <div className="trend-bar-container">
                                    <div 
                                        className="trend-bar" 
                                        style={{ height: `${Math.min((data.value / 5000) * 100, 100)}%` }}
                                    >
                                        <span className="bar-value">₱{data.value}</span>
                                    </div>
                                </div>
                                <div className="trend-info">
                                    <p className="trend-month">{data.month}</p>
                                    <p className="trend-appointments">{data.appointments} apt</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Additional Stats */}
            <div className="card">
                <h2>Appointment Breakdown</h2>
                <div className="breakdown-grid">
                    <div className="breakdown-item">
                        <div className="breakdown-stat">
                            <span className="stat-number">{analytics.appointments.completed}</span>
                            <span className="stat-label">Completed</span>
                        </div>
                        <div className="breakdown-percentage green">
                            {Math.round((analytics.appointments.completed / analytics.appointments.total) * 100)}%
                        </div>
                    </div>
                    <div className="breakdown-item">
                        <div className="breakdown-stat">
                            <span className="stat-number">{analytics.appointments.scheduled}</span>
                            <span className="stat-label">Scheduled</span>
                        </div>
                        <div className="breakdown-percentage blue">
                            {Math.round((analytics.appointments.scheduled / analytics.appointments.total) * 100)}%
                        </div>
                    </div>
                    <div className="breakdown-item">
                        <div className="breakdown-stat">
                            <span className="stat-number">{analytics.appointments.cancelled}</span>
                            <span className="stat-label">Cancelled</span>
                        </div>
                        <div className="breakdown-percentage red">
                            {Math.round((analytics.appointments.cancelled / analytics.appointments.total) * 100)}%
                        </div>
                    </div>
                    <div className="breakdown-item">
                        <div className="breakdown-stat">
                            <span className="stat-number">₱{analytics.appointments.total > 0 ? (analytics.revenue.total / analytics.appointments.total).toFixed(0) : 0}</span>
                            <span className="stat-label">Avg per Appointment</span>
                        </div>
                        <div className="breakdown-percentage info">
                            Revenue/Apt
                        </div>
                    </div>
                </div>
            </div>
            </>
            )}
            </div>
        </div>
    );
}

export default AdminAnalytics;
