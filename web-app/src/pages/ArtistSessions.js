import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Play, CheckCircle, Upload, Save, X, Package, FileText, Image as ImageIcon, Clock, Search, Calendar } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import ConfirmModal from '../components/ConfirmModal';
import './PortalStyles.css';
import { API_URL } from '../config';

function ArtistSessions() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeSession, setActiveSession] = useState(null);
    const [sessionData, setSessionData] = useState({
        notes: '',
        beforePhoto: null,
        afterPhoto: null
    });

    const [sessionMaterials, setSessionMaterials] = useState([]);
    const [sessionCost, setSessionCost] = useState(0);
    const [inventoryItems, setInventoryItems] = useState([]);
    const [serviceKits, setServiceKits] = useState({});
    const [addingMaterial, setAddingMaterial] = useState(false);
    const [inventorySearch, setInventorySearch] = useState('');

    const [sessionModal, setSessionModal] = useState({ mounted: false, visible: false });
    const [inventoryModal, setInventoryModal] = useState({ mounted: false, visible: false });
    const [isSaving, setIsSaving] = useState(false);
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null,
        type: 'danger',
        isAlert: false
    });

    const showAlert = (title, message, type = 'info') => {
        setConfirmModal({
            isOpen: true,
            title,
            message,
            type,
            isAlert: true,
            onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
        });
    };

    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    const fetchSessions = async () => {
        try {
            // Fetch all appointments for the artist, then filter by today locally
            const res = await Axios.get(`${API_URL}/api/artist/${artistId}/appointments`);
            if (res.data.success) {
                // Use local date instead of UTC to avoid timezone issues
                const now = new Date();
                const today = now.getFullYear() + '-' +
                              String(now.getMonth() + 1).padStart(2, '0') + '-' +
                              String(now.getDate()).padStart(2, '0');
                const todaySessions = res.data.appointments.filter(a => {
                    const appointmentDate = typeof a.appointment_date === 'string'
                        ? a.appointment_date.split('T')[0]
                        : new Date(a.appointment_date).toISOString().split('T')[0];
                    return appointmentDate === today && a.status !== 'cancelled';
                });
                setSessions(todaySessions);
            }
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, [artistId]);

    useEffect(() => {
        if (activeSession) {
            fetchInventory();
            fetchServiceKits();
            if (activeSession.status === 'in_progress' || activeSession.status === 'completed') {
                fetchSessionMaterials(activeSession.id);
            }
        }
    }, [activeSession?.id, activeSession?.status]);

    const fetchInventory = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/admin/inventory`);
            if (res.data.success && res.data.data) {
                setInventoryItems(res.data.data.filter(item => item.current_stock > 0 && !item.is_deleted));
            }
        } catch (e) { console.error(e); }
    };

    const fetchServiceKits = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/admin/service-kits`);
            if (res.data.success) {
                setServiceKits(res.data.data || {});
            }
        } catch (e) { console.error(e); }
    };

    const fetchSessionMaterials = async (id) => {
        try {
            const res = await Axios.get(`${API_URL}/api/appointments/${id}/materials`);
            if (res.data.success) {
                setSessionMaterials(res.data.materials || []);
                setSessionCost(res.data.totalCost || 0);
            }
        } catch (e) { console.error(e); }
    };

    const handleReleaseMaterial = async (materialId) => {
        if (!activeSession) return;
        try {
            const res = await Axios.post(`${API_URL}/api/appointments/${activeSession.id}/release-material`, {
                materialId
            });
            if (res.data.success) {
                fetchSessionMaterials(activeSession.id);
            } else {
                showAlert("Error", res.data.message || 'Failed to release material.', "warning");
            }
        } catch (e) {
            showAlert("Connection Error", "Failed to connect to the server.", "danger");
        }
    };

    const handleQuickAdd = async (inventoryId, quantity = 1) => {
        if (!activeSession) return;
        setAddingMaterial(true);
        try {
            const res = await Axios.post(`${API_URL}/api/appointments/${activeSession.id}/materials`, {
                inventory_id: inventoryId, quantity
            });
            if (res.data.success) {
                fetchSessionMaterials(activeSession.id);
            } else {
                showAlert("Inventory Error", res.data.message || 'Failed to add material. Check stock.', "warning");
            }
        } catch (e) {
            showAlert("Connection Error", "Failed to connect to the server while adding material.", "danger");
        } finally {
            setAddingMaterial(false);
        }
    };

    const handleQuickAddKit = async (kitItems) => {
        if (!activeSession || !kitItems || kitItems.length === 0) return;
        setAddingMaterial(true);
        try {
            let successCount = 0;
            let failedItems = [];

            for (const item of kitItems) {
                const res = await Axios.post(`${API_URL}/api/appointments/${activeSession.id}/materials`, {
                    inventory_id: item.inventory_id,
                    quantity: item.default_quantity
                });
                if (res.data.success) {
                    successCount++;
                } else {
                    failedItems.push(item.item_name);
                }
            }

            if (successCount > 0) {
                fetchSessionMaterials(activeSession.id);
                if (failedItems.length === 0) {
                    showAlert("Success", `Added ${successCount} items from kit!`, "success");
                } else {
                    showAlert("Partial Success", `Added ${successCount} items. Failed: ${failedItems.join(', ')}`, "warning");
                }
            } else {
                showAlert("Error", "Failed to add kit items. Check inventory levels.", "danger");
            }
        } catch (e) {
            showAlert("Connection Error", "Failed to connect to the server while adding kit.", "danger");
        } finally {
            setAddingMaterial(false);
        }
    };

    const openInventoryModal = () => {
        setInventoryModal({ mounted: true, visible: false });
        setTimeout(() => setInventoryModal({ mounted: true, visible: true }), 10);
    };

    const closeInventoryModal = () => {
        setInventoryModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setInventoryModal({ mounted: false, visible: false });
        }, 400);
    };

    const openSessionModal = () => {
        setSessionModal({ mounted: true, visible: false });
        setTimeout(() => setSessionModal({ mounted: true, visible: true }), 10);
    };

    const closeSessionModal = () => {
        setSessionModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setSessionModal({ mounted: false, visible: false });
            setActiveSession(null);
        }, 400);
    };

    const handleManageSession = (session) => {
        setActiveSession(session);
        setSessionData({
            notes: session.notes || '',
            beforePhoto: null,
            afterPhoto: null
        });
        openSessionModal();
    };

    const handlePhotoUpload = (e, type) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSessionData(prev => ({ ...prev, [type]: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUpdateStatus = async (newStatus) => {
        if (newStatus === 'completed') {
            setConfirmModal({
                isOpen: true,
                title: 'Complete Session?',
                message: `Are you sure you want to mark this session as completed? Total material cost: ₱${sessionCost.toLocaleString()} will be recorded.`,
                confirmText: 'Yes, Complete',
                type: 'info',
                onConfirm: async () => {
                    await processStatusUpdate(newStatus);
                    setConfirmModal({ ...confirmModal, isOpen: false });
                }
            });
        } else {
            await processStatusUpdate(newStatus);
        }
    };

    const processStatusUpdate = async (newStatus) => {
        try {
            // Save session details (notes, photos) before completing
            if (newStatus === 'completed' && (sessionData.notes || sessionData.beforePhoto || sessionData.afterPhoto)) {
                await Axios.put(`${API_URL}/api/appointments/${activeSession.id}/details`, {
                    notes: sessionData.notes,
                    beforePhoto: sessionData.beforePhoto,
                    afterPhoto: sessionData.afterPhoto
                });
            }

            const res = await Axios.put(`${API_URL}/api/appointments/${activeSession.id}/status`, { status: newStatus });
            if (res.data.success) {
                setActiveSession(prev => ({ ...prev, status: newStatus }));

                if (newStatus === 'completed') {
                    closeSessionModal();
                    fetchSessions();
                } else if (newStatus === 'in_progress') {
                    setTimeout(() => fetchSessionMaterials(activeSession.id), 1000);
                }
            } else {
                showAlert("Update Failed", "Failed to update session status. Please try again.", "warning");
            }
        } catch (error) {
            console.error("Error updating status:", error);
            showAlert("Connection Error", "Failed to connect to the server while updating status.", "danger");
        }
    };

    const handleSaveDetails = async () => {
        if (!activeSession) return;
        setIsSaving(true);
        try {
            console.log('💾 Saving session details...');
            console.log(`   - Appointment ID: ${activeSession.id}`);
            console.log(`   - Notes: ${sessionData.notes ? sessionData.notes.substring(0, 50) + '...' : 'empty'}`);
            console.log(`   - Before Photo: ${sessionData.beforePhoto ? 'YES (' + (sessionData.beforePhoto.length / 1024 / 1024).toFixed(2) + ' MB)' : 'NO'}`);
            console.log(`   - After Photo: ${sessionData.afterPhoto ? 'YES (' + (sessionData.afterPhoto.length / 1024 / 1024).toFixed(2) + ' MB)' : 'NO'}`);

            const res = await Axios.put(`${API_URL}/api/appointments/${activeSession.id}/details`, {
                notes: sessionData.notes,
                beforePhoto: sessionData.beforePhoto,
                afterPhoto: sessionData.afterPhoto
            });
            console.log('✅ Response:', res.data);
            if (res.data.success) {
                showAlert("Saved", "Session details saved successfully!", "success");
                setActiveSession(null);
                fetchSessions();
            } else {
                showAlert("Error", "Failed to save session details. " + res.data.message, "danger");
            }
        } catch (error) {
            console.error("Error saving details:", error);
            showAlert("Error", "Failed to save session details. Please check your connection.", "danger");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="portal-layout">
            <ArtistSideNav />
            <div className="portal-container artist-portal">
                <header className="portal-header">
                    <h1>Tattoo Sessions</h1>
                    <p>Manage today's active sessions</p>
                </header>
                <div className="portal-content">
                    {loading ? <div className="no-data">Loading...</div> : (
                        <div className="table-card-container" style={{ minHeight: '500px' }}>
                            <div className="card-header-v2">
                                <h2>Today's Queue</h2>
                                <span className={`status-badge-v2 pending`}>{sessions.length} Appointments</span>
                            </div>
                            {sessions.length > 0 ? (
                                <div className="table-responsive">
                                    <table className="portal-table">
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>Client</th>
                                                <th>Design</th>
                                                <th>Status</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sessions.map(session => (
                                                <tr key={session.id}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                                                            <Clock size={14} className="text-muted" />
                                                            {session.start_time || 'N/A'}
                                                        </div>
                                                    </td>
                                                    <td style={{ fontWeight: '600' }}>{session.client_name}</td>
                                                    <td>{session.design_title}</td>
                                                    <td><span className={`status-badge ${session.status}`}>{session.status}</span></td>
                                                    <td>
                                                        <button className="btn btn-primary" onClick={() => handleManageSession(session)} style={{ padding: '6px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <Play size={14} /> Manage Session
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="no-data-container" style={{ flex: 1 }}>
                                    <Calendar size={48} className="no-data-icon" />
                                    <p className="no-data-text">No sessions scheduled for today.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    title={confirmModal.title}
                    message={confirmModal.message}
                    confirmText={confirmModal.confirmText}
                    onConfirm={confirmModal.onConfirm}
                    onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                    type={confirmModal.type}
                    isAlert={confirmModal.isAlert}
                />
            </div>

            {/* Active Session Modal */}
            {sessionModal.mounted && activeSession && (
                <div className={`modal-overlay ${sessionModal.visible ? 'open' : ''}`} onClick={closeSessionModal}>
                    <div className="modal-content session-modal" style={{ maxWidth: '800px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h2>Session: {activeSession.client_name}</h2>
                                <p style={{ margin: 0, color: '#666' }}>{activeSession.design_title}</p>
                            </div>
                            <button className="close-btn" onClick={closeSessionModal}><X size={20} /></button>
                        </div>

                        <div className="modal-body">
                            {/* Status Control */}
                            <div className="data-card" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span className={`status-badge ${activeSession.status}`}>{activeSession.status.toUpperCase()}</span>
                                    {activeSession.status === 'confirmed' && <span style={{ color: '#666', fontSize: '0.9rem' }}>Ready to start</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {activeSession.status === 'confirmed' && (
                                        <button className="btn btn-primary" onClick={() => handleUpdateStatus('in_progress')}>
                                            <Play size={16} style={{ marginRight: '5px' }} /> Start Session
                                        </button>
                                    )}
                                    {activeSession.status === 'in_progress' && (
                                        <button className="btn btn-primary" style={{ backgroundColor: '#10b981' }} onClick={() => handleUpdateStatus('completed')}>
                                            <CheckCircle size={16} style={{ marginRight: '5px' }} /> Complete Session
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Photos */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                <div className="photo-upload-box" style={{ border: '2px dashed #e2e8f0', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600' }}>Before Photo</label>
                                    {sessionData.beforePhoto ? (
                                        <img src={sessionData.beforePhoto} alt="Before" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '4px' }} />
                                    ) : (
                                        <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <Upload size={16} /> Upload
                                            <input type="file" hidden accept="image/*" onChange={(e) => handlePhotoUpload(e, 'beforePhoto')} />
                                        </label>
                                    )}
                                </div>
                                <div className="photo-upload-box" style={{ border: '2px dashed #e2e8f0', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                                    <label style={{ display: 'block', marginBottom: '10px', fontWeight: '600' }}>After Photo</label>
                                    {sessionData.afterPhoto ? (
                                        <img src={sessionData.afterPhoto} alt="After" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '4px' }} />
                                    ) : (
                                        <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <Upload size={16} /> Upload
                                            <input type="file" hidden accept="image/*" onChange={(e) => handlePhotoUpload(e, 'afterPhoto')} />
                                        </label>
                                    )}
                                </div>
                            </div>

                            {/* Notes & Supplies */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div className="form-group">
                                    <label><FileText size={16} style={{ verticalAlign: 'middle' }} /> Session Notes</label>
                                    <textarea
                                        className="form-input"
                                        rows="10"
                                        value={sessionData.notes}
                                        onChange={(e) => setSessionData({ ...sessionData, notes: e.target.value })}
                                        placeholder="Record session details, skin reaction, etc..."
                                        style={{ height: '100%' }}
                                    />
                                </div>

                                {/* Dynamic Session Materials */}
                                <div className="form-group" style={{ display: 'flex', flexDirection: 'column' }}>
                                    <label><Package size={16} style={{ verticalAlign: 'middle' }} /> Dynamic Supply Log</label>

                                    {activeSession.status === 'in_progress' ? (
                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '15px', flex: 1, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                <strong>Items Held/Consumed</strong>
                                                <span style={{ color: '#10b981', fontWeight: 'bold' }}>₱{sessionCost.toLocaleString()}</span>
                                            </div>

                                            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '150px' }}>
                                                {sessionMaterials.length === 0 ? (
                                                    <p style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic', margin: 0 }}>No materials logged yet.</p>
                                                ) : (
                                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                                        {sessionMaterials.map((mat, idx) => (
                                                            <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{mat.quantity}x {mat.item_name}</span>
                                                                    <span style={{ fontSize: '0.75rem', color: mat.status === 'hold' ? '#f59e0b' : '#64748b' }}>{mat.status.toUpperCase()}</span>
                                                                </div>
                                                                {mat.status === 'hold' && (
                                                                    <button
                                                                        onClick={() => handleReleaseMaterial(mat.id)}
                                                                        title="Return to Inventory"
                                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>

                                            <div style={{ marginTop: '15px', borderTop: '1px dashed #cbd5e1', paddingTop: '10px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                    <strong style={{ fontSize: '0.85rem', color: '#475569' }}>Add Supplies:</strong>
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        {Object.keys(serviceKits).length > 0 && (
                                                            <select
                                                                disabled={addingMaterial}
                                                                onChange={(e) => {
                                                                    if (e.target.value) {
                                                                        handleQuickAddKit(serviceKits[e.target.value]);
                                                                        e.target.value = '';
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0',
                                                                    fontSize: '0.8rem', cursor: addingMaterial ? 'not-allowed' : 'pointer',
                                                                    background: '#fff'
                                                                }}
                                                            >
                                                                <option value="">📦 Quick Kits</option>
                                                                {Object.keys(serviceKits).map(kitName => (
                                                                    <option key={kitName} value={kitName}>
                                                                        {kitName} ({serviceKits[kitName].length} items)
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        )}
                                                        <button
                                                            onClick={openInventoryModal}
                                                            disabled={addingMaterial}
                                                            style={{
                                                                padding: '6px 12px', borderRadius: '6px', background: '#3b82f6',
                                                                border: 'none', fontSize: '0.8rem', cursor: addingMaterial ? 'not-allowed' : 'pointer',
                                                                color: '#fff', display: 'flex', alignItems: 'center', gap: '6px'
                                                            }}
                                                        >
                                                            <Package size={14} /> Add Item
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', textAlign: 'center', background: '#f8fafc', color: '#64748b', fontStyle: 'italic' }}>
                                            {activeSession.status === 'confirmed' ? 'Start session to begin logging materials.' : 'Session ended. Supplies finalized.'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={closeSessionModal}>Close</button>
                            <button className="btn btn-primary" onClick={handleSaveDetails}>
                                <Save size={16} style={{ marginRight: '5px' }} /> Save Details
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Inventory Selection Modal */}
            {inventoryModal.mounted && (
                <div className={`modal-overlay ${inventoryModal.visible ? 'open' : ''}`} onClick={closeInventoryModal}>
                    <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Select Item to Add</h2>
                            <button className="close-btn" onClick={closeInventoryModal}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label><Search size={16} style={{ verticalAlign: 'middle' }} /> Search Inventory</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Search by name or category..."
                                    value={inventorySearch}
                                    onChange={(e) => setInventorySearch(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '15px' }}>
                                {inventoryItems.length === 0 ? (
                                    <p style={{ color: '#64748b', fontStyle: 'italic' }}>No inventory items available.</p>
                                ) : (
                                    (() => {
                                        const filtered = inventoryItems.filter(item =>
                                            !inventorySearch ||
                                            (item.name && item.name.toLowerCase().includes(inventorySearch.toLowerCase())) ||
                                            (item.category && item.category.toLowerCase().includes(inventorySearch.toLowerCase()))
                                        );
                                        return filtered.map(item => (
                                            <div
                                                key={item.id}
                                                onClick={() => {
                                                    handleQuickAdd(item.id, 1);
                                                    closeInventoryModal();
                                                }}
                                                style={{
                                                    padding: '12px',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    borderRadius: '6px',
                                                    marginBottom: '8px',
                                                    background: '#f8fafc',
                                                    transition: 'background 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.target.style.background = '#e2e8f0'}
                                                onMouseLeave={(e) => e.target.style.background = '#f8fafc'}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: '600' }}>{item.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                        {item.category} • Stock: {item.current_stock} {item.unit}
                                                    </div>
                                                </div>
                                                <button
                                                    disabled={addingMaterial || item.current_stock < 1}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: '6px',
                                                        background: item.current_stock < 1 ? '#cbd5e1' : '#10b981',
                                                        border: 'none', color: '#fff', cursor: item.current_stock < 1 ? 'not-allowed' : 'pointer',
                                                        fontSize: '0.8rem'
                                                    }}
                                                >
                                                    {item.current_stock < 1 ? 'Out of Stock' : 'Add'}
                                                </button>
                                            </div>
                                        ));
                                    })()
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ArtistSessions;