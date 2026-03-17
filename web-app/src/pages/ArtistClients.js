import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Search, User, Calendar, FileText, Image as ImageIcon, AlertCircle, MapPin, Phone } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import './PortalStyles.css';
import { API_URL } from '../config';

function ArtistClients() {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClient, setSelectedClient] = useState(null);
    const [clientHistory, setClientHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(9);
    
    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    useEffect(() => {
        fetchClients();
    }, [artistId]);

    const fetchClients = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/artist/${artistId}/clients`);
            if (res.data.success) {
                setClients(res.data.clients);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching clients:", error);
            setLoading(false);
        }
    };

    const handleClientClick = async (client) => {
        setSelectedClient(client);
        setLoadingHistory(true);
        setClientHistory([]); // Reset history

        try {
            // Fetch full profile and appointment history in parallel
            const [profileRes, historyRes] = await Promise.all([
                Axios.get(`${API_URL}/api/customer/profile/${client.id}`),
                Axios.get(`${API_URL}/api/customer/${client.id}/appointments`)
            ]);

            if (profileRes.data.success) {
                setSelectedClient(prev => ({ ...prev, ...profileRes.data.profile }));
            }
            if (historyRes.data.success) {
                setClientHistory(historyRes.data.appointments);
            }
        } catch (error) {
            console.error("Error fetching client details:", error);
        }
        setLoadingHistory(false);
    };

    const filteredClients = clients.filter(client => 
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Reset page on search
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    // Pagination logic
    const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
    const paginatedClients = filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="portal-layout">
            <ArtistSideNav />
            <div className="portal-container artist-portal">
                <header className="portal-header">
                    <h1>Client Profiles</h1>
                    <div className="search-box" style={{ maxWidth: '300px' }}>
                        <input 
                            type="text" 
                            placeholder="Search clients..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="search-input"
                            style={{ paddingLeft: '10px' }}
                        />
                    </div>
                </header>
                
                <div className="portal-content">
                    {loading ? <div className="no-data">Loading clients...</div> : (
                        filteredClients.length > 0 ? (
                            <div className="artists-grid">
                                {paginatedClients.map(client => (
                                    <div key={client.id} className="artist-card" onClick={() => handleClientClick(client)} style={{ cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                                            <div style={{ background: '#e0e7ff', padding: '15px', borderRadius: '50%' }}>
                                                <User size={32} color="#4f46e5" />
                                            </div>
                                        </div>
                                        <h3>{client.name}</h3>
                                        <p style={{ color: '#666', fontSize: '0.9rem' }}>{client.email}</p>
                                        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', color: '#4f46e5', fontWeight: '600' }}>
                                                <Calendar size={14}/> {client.appointment_count} Visits
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="no-data">
                                {searchTerm ? 'No clients found matching your search.' : 'No clients assigned yet.'}
                            </div>
                        )
                    )}

                    {/* Pagination Controls */}
                    {filteredClients.length > itemsPerPage && (
                        <div className="pagination-controls" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
                            <button className="btn btn-secondary" style={{padding: '5px 15px'}} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</button>
                            <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Page {currentPage} of {totalPages}</span>
                            <button className="btn btn-secondary" style={{padding: '5px 15px'}} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</button>
                        </div>
                    )}
                </div>

                {selectedClient && (
                    <div className="modal-overlay" onClick={() => setSelectedClient(null)}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%', maxHeight: '85vh' }}>
                            <div className="modal-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ background: '#e0e7ff', padding: '10px', borderRadius: '50%' }}>
                                        <User size={24} color="#4f46e5" />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0 }}>{selectedClient.name}</h2>
                                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>Client Profile (Read-Only)</p>
                                    </div>
                                </div>
                                <button className="close-btn" onClick={() => setSelectedClient(null)}>×</button>
                            </div>
                            <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                                {/* Left Column: Details */}
                                <div style={{ borderRight: '1px solid #eee', paddingRight: '20px' }}>
                                    <div className="info-group" style={{ marginBottom: '15px' }}>
                                        <label>Contact Details</label>
                                        <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><User size={14}/> {selectedClient.email}</p>
                                        <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Phone size={14}/> {selectedClient.phone || 'N/A'}</p>
                                        <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><MapPin size={14}/> {selectedClient.location || 'N/A'}</p>
                                    </div>
                                    
                                    <div className="info-group" style={{ marginBottom: '15px', backgroundColor: '#fff1f2', borderColor: '#fecdd3' }}>
                                        <label style={{ color: '#be123c', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <AlertCircle size={14}/> Skin Sensitivity & Medical
                                        </label>
                                        <p style={{ color: '#881337', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                            {selectedClient.skin_notes || "No specific skin conditions or allergies recorded."}
                                        </p>
                                    </div>
                                </div>

                                {/* Right Column: History */}
                                <div>
                                    <h3 style={{ marginTop: 0, marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FileText size={18}/> Tattoo History & Notes
                                    </h3>
                                    
                                    {loadingHistory ? <div className="no-data">Loading history...</div> : (
                                        <div className="history-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                            {clientHistory.length > 0 ? clientHistory.map(appt => (
                                                <div key={appt.id} style={{ background: '#f8fafc', borderRadius: '8px', padding: '15px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                        <span style={{ fontWeight: 'bold', color: '#334155' }}>{appt.design_title || 'Untitled Session'}</span>
                                                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{new Date(appt.appointment_date).toLocaleDateString()}</span>
                                                    </div>
                                                    
                                                    {appt.notes && (
                                                        <div style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '10px', fontStyle: 'italic' }}>
                                                            "{appt.notes}"
                                                        </div>
                                                    )}

                                                    {appt.reference_image && (
                                                        <div style={{ marginTop: '10px' }}>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}><ImageIcon size={14}/> Reference / Session Image</div>
                                                            <img src={appt.reference_image} alt="Reference" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                                                        </div>
                                                    )}
                                                    
                                                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                                                        <span className={`status-badge ${appt.status}`}>{appt.status}</span>
                                                    </div>
                                                </div>
                                            )) : (
                                                <p className="no-data">No appointment history found.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ArtistClients;