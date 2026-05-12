import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { PenTool, Play, Pause, CheckCircle, Upload, Save, X, Package, FileText, Image as ImageIcon, Clock, Search, Calendar, Plus, Archive, AlertTriangle, List, Heart, ShieldAlert } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import ConfirmModal from '../components/ConfirmModal';
import Pagination from '../components/Pagination';
import ImageLightbox from '../components/ImageLightbox';
import SessionTimeline from '../components/SessionTimeline';
import './PortalStyles.css';
import './ArtistStyles.css';
import { API_URL } from '../config';
import { getSessionPaymentStatus, shouldShowInQueue } from '../utils/sessionPayment';
import { formatTime12Hour, formatStatus, getStatusColor } from '../utils/formatters';

function ArtistSessions() {
    const [sessions, setSessions] = useState([]);
    const [upcomingSessions, setUpcomingSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [activeSession, setActiveSession] = useState(null);
    const [sessionData, setSessionData] = useState({
        notes: '',
        beforePhoto: null,
        afterPhoto: null
    });
    const [errors, setErrors] = useState({});

    const [sessionMaterials, setSessionMaterials] = useState([]);
    const [sessionCost, setSessionCost] = useState(0);
    const [inventoryItems, setInventoryItems] = useState([]);
    const [serviceKits, setServiceKits] = useState({});
    const [addingMaterial, setAddingMaterial] = useState(false);
    const [inventorySearch, setInventorySearch] = useState('');
    const [isCompletingSession, setIsCompletingSession] = useState(false);
    const [isStartingProcedure, setIsStartingProcedure] = useState(false);
    const [showAbortModal, setShowAbortModal] = useState(false);
    const [abortReason, setAbortReason] = useState('');
    const [isAborting, setIsAborting] = useState(false);
    const [sessionTab, setSessionTab] = useState('overview');
    const [paymentInfo, setPaymentInfo] = useState(null); // {hasOutstandingBalance, remaining, isUnquoted}

    // Timer & Audit Log State
    const [sessionElapsed, setSessionElapsed] = useState(0); // seconds
    const [isSessionPaused, setIsSessionPaused] = useState(false);
    const [auditLog, setAuditLog] = useState([]); // [{timestamp, action}]
    const timerRef = React.useRef(null);

    const [sessionModal, setSessionModal] = useState({ mounted: false, visible: false });
    const [inventoryModal, setInventoryModal] = useState({ mounted: false, visible: false });
    const [viewingApt, setViewingApt] = useState(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showHealthAlert, setShowHealthAlert] = useState(false);
    // Feature B: Project timeline for the active session (read-only for artist)
    const [projectTimeline, setProjectTimeline] = useState(null);
    const [projectTimelineLoading, setProjectTimelineLoading] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState(null);
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

    // Feature B: fetch project timeline for the active session
    const fetchProjectTimeline = async (projectId) => {
        if (!projectId) { setProjectTimeline(null); return; }
        setProjectTimelineLoading(true);
        try {
            const res = await Axios.get(`${API_URL}/api/projects/${projectId}`);
            if (res.data.success) setProjectTimeline(res.data.project);
            else setProjectTimeline(null);
        } catch (e) {
            setProjectTimeline(null);
        } finally {
            setProjectTimelineLoading(false);
        }
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
                    const d = new Date(a.appointment_date);
                    const appointmentDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                    return appointmentDate === today && a.status !== 'cancelled' && shouldShowInQueue(a);
                });
                setSessions(todaySessions);

                // Compute next 3 upcoming sessions (future dates, active statuses)
                const upcoming = res.data.appointments
                    .filter(a => {
                        const d = new Date(a.appointment_date);
                        const appointmentDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                        return appointmentDate > today && ['confirmed', 'pending'].includes(a.status);
                    })
                    .sort((a, b) => {
                        const dateA = new Date(a.appointment_date + 'T' + (a.start_time || '00:00'));
                        const dateB = new Date(b.appointment_date + 'T' + (b.start_time || '00:00'));
                        return dateA - dateB;
                    })
                    .slice(0, 3);
                setUpcomingSessions(upcoming);
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
            if (activeSession.status === 'confirmed' || activeSession.status === 'in_progress' || activeSession.status === 'completed') {
                fetchSessionMaterials(activeSession.id);
            }
        }
    }, [activeSession?.id, activeSession?.status]);

    // Timer interval effect
    useEffect(() => {
        if (activeSession && activeSession.status === 'in_progress' && !isSessionPaused) {
            timerRef.current = setInterval(() => {
                setSessionElapsed(prev => prev + 1);
            }, 1000);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [activeSession?.status, isSessionPaused]);

    // Audit log helper
    const addAuditEntry = (action) => {
        const now = new Date();
        const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        setAuditLog(prev => [...prev, { timestamp, action }]);
    };

    // Format seconds to display string
    const formatDuration = (totalSeconds) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
        return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    };

    const handlePauseResume = () => {
        if (isSessionPaused) {
            addAuditEntry('Session Resumed');
            setIsSessionPaused(false);
        } else {
            addAuditEntry('Session Paused');
            setIsSessionPaused(true);
        }
    };

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
                materialId: Number(materialId) // Ensure materialId is a number
            });
            if (res.data.success) {
                showAlert("Success", "Item returned to inventory successfully", "success");
            } else {
                showAlert("Error", res.data.message || 'Failed to release material.', "warning");
            }
        } catch (e) {
            const errorMsg = e.response?.data?.message || "Failed to connect to the server.";
            showAlert("Release Error", errorMsg, "danger");
        } finally {
            // Always refetch materials to ensure UI is in sync with DB
            // This helps if the status changed unexpectedly or due to a race condition.
            fetchSessionMaterials(activeSession.id);
        }
    };

    const handleQuickAdd = async (inventoryId, quantity = 1) => {
        if (!activeSession) return;
        
        const item = inventoryItems.find(i => i.id === inventoryId);
        if (!item) {
            showAlert('Validation Error', 'Item not found in inventory.', 'warning');
            return;
        }
        if (item.current_stock < quantity) {
            showAlert('Validation Error', `Insufficient stock for ${item.name}.`, 'warning');
            return;
        }

        setAddingMaterial(true);
        try {
            const res = await Axios.post(`${API_URL}/api/appointments/${activeSession.id}/materials`, {
                inventory_id: inventoryId, quantity
            });
            if (res.data.success) {
                fetchSessionMaterials(activeSession.id);
                addAuditEntry(`Added ${quantity}x ${inventoryItems.find(i => i.id === inventoryId)?.name || 'item'}`);
            } else {
                showAlert("Inventory Error", res.data.message || 'Failed to add material. Check stock.', "warning");
            }
        } catch (e) {
            const errorMsg = e.response?.data?.message || "Failed to connect to the server while adding material.";
            showAlert("Inventory Error", errorMsg, "danger");
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
            const errorMsg = e.response?.data?.message || "Failed to connect to the server while adding kit.";
            showAlert("Connection Error", errorMsg, "danger");
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

    const hasUnsavedChanges = () => {
        if (!activeSession) return false;
        const origNotes = activeSession.notes || '';
        const origBefore = activeSession.before_photo || null;
        const origAfter = activeSession.after_photo || null;

        return sessionData.notes !== origNotes || 
               sessionData.beforePhoto !== origBefore || 
               sessionData.afterPhoto !== origAfter;
    };

    const closeSessionModal = () => {
        if (hasUnsavedChanges()) {
            setConfirmModal({
                isOpen: true,
                title: 'Unsaved Changes',
                message: 'You have unsaved changes in your documentation. Are you sure you want to close? Your changes will be lost.',
                confirmText: 'Discard Changes',
                cancelText: 'Cancel',
                type: 'warning',
                onConfirm: () => {
                    forceCloseSessionModal();
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                },
                onClose: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
            });
            return;
        }
        forceCloseSessionModal();
    };

    const forceCloseSessionModal = () => {
        setSessionModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setSessionModal({ mounted: false, visible: false });
            setActiveSession(null);
            fetchSessions(); // Refresh today's queue to reflect status changes (e.g. In Progress)
        }, 400);
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const appointmentId = params.get('appointment');
        if (appointmentId && sessions.length > 0) {
            const target = sessions.find(s => s.id.toString() === appointmentId);
            if (target) {
                handleManageSession(target);
                window.history.replaceState({}, '', '/artist/sessions');
            }
        }
    }, [sessions]);

    const handleManageSession = (session) => {
        setActiveSession(session);
        setSessionData({
            notes: session.notes || '',
            beforePhoto: session.before_photo || null,
            afterPhoto: session.after_photo || null
        });
        setErrors({});
        setSessionElapsed(session.session_duration || 0);
        setIsSessionPaused(false);
        // Load stored audit log for completed/incomplete sessions
        if ((session.status === 'completed' || session.status === 'incomplete') && session.audit_log) {
            try {
                const parsed = typeof session.audit_log === 'string' ? JSON.parse(session.audit_log) : session.audit_log;
                setAuditLog(Array.isArray(parsed) ? parsed : []);
            } catch (e) {
                console.warn('Failed to parse stored audit log:', e);
                setAuditLog([]);
            }
        } else {
            setAuditLog([]);
        }
        setSessionTab('overview');
        setPaymentInfo(null);
        setShowHealthAlert(false); // Always start collapsed
        // Feature B: load project timeline for this session if it belongs to a project
        setProjectTimeline(null);
        if (session.project_id) fetchProjectTimeline(session.project_id);
        openSessionModal();
    };

    const validateSessionField = (name, value) => {
        let errorMsg = '';
        if (name === 'notes') {
            if (value.length > 0 && value.trim().length < 10) {
                errorMsg = 'Notes must be at least 10 characters.';
            } else if (value.trim().length > 2000) {
                errorMsg = 'Notes cannot exceed 2000 characters.';
            }
        }
        setErrors(prev => ({ ...prev, [name]: errorMsg }));
        return !errorMsg;
    };

    const handleSessionFormChange = (e) => {
        const { name, value } = e.target;
        setSessionData(prev => ({ ...prev, [name]: value }));
        validateSessionField(name, value);
    };

    const handlePhotoUpload = (e, type) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                showAlert('Validation Error', 'Only image files are allowed.', 'warning');
                return;
            }
            if (file.size > 5 * 1024 * 1024) { // 5MB max
                showAlert('Validation Error', 'Upload failed. File size must be under 5MB.', 'warning');
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800; // Resize to max 800px width
                    const scaleSize = MAX_WIDTH / img.width;
                    const finalWidth = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
                    const finalHeight = img.width > MAX_WIDTH ? img.height * scaleSize : img.height;
                    
                    canvas.width = finalWidth;
                    canvas.height = finalHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    
                const resizedBase64 = canvas.toDataURL('image/jpeg', 0.7); // 70% quality jpeg
                    setSessionData(prev => ({ ...prev, [type]: resizedBase64 }));
                    addAuditEntry(`Uploaded ${type === 'beforePhoto' ? 'Before' : 'After'} Photo`);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUpdateStatus = async (newStatus) => {
        if (newStatus === 'in_progress') {
            if (!sessionData.beforePhoto) {
                showAlert('Before Photo Required', 'Please upload a "Before" photo documenting the client\'s current state before starting the procedure. Go to the Documentation tab to upload.', 'warning');
                setSessionTab('documentation');
                return;
            }
            addAuditEntry('Session Started');
        }
        if (newStatus === 'completed') {
            // Enforce before & after photo uploads before allowing completion
            if (!sessionData.beforePhoto) {
                showAlert('Validation Error', 'Please upload a "Before" photo documenting the client\'s state before the procedure. Go to the Documentation tab to upload.', 'warning');
                setSessionTab('documentation');
                return;
            }
            if (!sessionData.afterPhoto) {
                showAlert('Validation Error', 'Please upload an "After" photo documenting the completed work. Go to the Documentation tab to upload.', 'warning');
                setSessionTab('documentation');
                return;
            }
            if (!sessionData.notes || sessionData.notes.trim().length < 10) {
                showAlert('Validation Error', 'Please provide at least 10 characters of procedure notes before completing the session.', 'warning');
                setSessionTab('documentation');
                return;
            }
            if (sessionMaterials.length === 0) {
                showAlert('Validation Error', 'Please log the supplies and materials consumed during this session.', 'warning');
                setSessionTab('supplies');
                return;
            }
            setIsCompletingSession(true);
        } else {
            if (newStatus === 'in_progress') setIsStartingProcedure(true);
            try {
                await processStatusUpdate(newStatus);
            } finally {
                if (newStatus === 'in_progress') setIsStartingProcedure(false);
            }
        }
    };

    const confirmCompletion = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Session Completion Status',
            message: `Does this piece need another session, or is the tattoo fully complete? (Total material cost: ₱${sessionCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will be recorded).`,
            confirmText: 'Fully Complete',
            cancelText: 'Needs Another Session',
            type: 'info',
            onConfirm: async () => {
                await processStatusUpdate('completed', true);
                setConfirmModal({ ...confirmModal, isOpen: false });
                setIsCompletingSession(false);
            },
            onClose: async () => {
                await processStatusUpdate('completed', false);
                setConfirmModal({ ...confirmModal, isOpen: false });
                setIsCompletingSession(false);
            }
        });
    };

    const processStatusUpdate = async (newStatus, isFullyComplete = true) => {
        // Finalize audit log before sending
        const finalLog = [...auditLog];
        if (newStatus === 'completed') {
            const now = new Date();
            const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            finalLog.push({ timestamp, action: 'Session Completed' });
        }
        if (newStatus === 'incomplete') {
            const now = new Date();
            const timestamp = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            finalLog.push({ timestamp, action: 'Session Aborted' });
        }

        try {
            // Save session details (notes, photos) before completing
            if (newStatus === 'completed' && (sessionData.notes || sessionData.beforePhoto || sessionData.afterPhoto)) {
                await Axios.put(`${API_URL}/api/appointments/${activeSession.id}/details`, {
                    notes: sessionData.notes,
                    beforePhoto: sessionData.beforePhoto,
                    afterPhoto: sessionData.afterPhoto
                });
            }

            const payload = {
                status: newStatus,
                isFullyComplete
            };
            // Include duration and audit log when completing or aborting
            if (newStatus === 'completed' || newStatus === 'incomplete') {
                payload.sessionDuration = sessionElapsed;
                payload.auditLog = finalLog;
            }

            const res = await Axios.put(`${API_URL}/api/appointments/${activeSession.id}/status`, payload);
            if (res.data.success) {
                setActiveSession(prev => ({ ...prev, status: newStatus }));
                if (timerRef.current) clearInterval(timerRef.current);

                if (newStatus === 'completed') {
                    showAlert("Session Complete", `Session marked as complete (Duration: ${formatDuration(sessionElapsed)}). Review your notes and photos, then click 'Archive Session' when ready.`, "success");
                    fetchSessions();
                    // Check remaining balance and show info banner
                    try {
                        const payRes = await Axios.get(`${API_URL}/api/appointments/${activeSession.id}/payment-status`);
                        if (payRes.data.success) {
                            const payStatus = (payRes.data.payment_status || '').toLowerCase();
                            const price = Number(payRes.data.price || 0);
                            const totalPaid = Number(payRes.data.totalPaid || 0);
                            const isUnquoted = price <= 0;
                            const hasOutstandingBalance = price > 0 && totalPaid < price;
                            // Only show the banner if there is genuinely an issue (not when fully paid)
                            if (payStatus !== 'paid' && (isUnquoted || hasOutstandingBalance)) {
                                setPaymentInfo({ hasOutstandingBalance, remaining: price - totalPaid, isUnquoted });
                            }
                        }
                    } catch (pErr) { /* silent - non-critical */ }
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
        
        if (sessionData.notes && !validateSessionField('notes', sessionData.notes)) {
            showAlert("Validation Error", errors.notes || "Please fix validation errors before saving.", "warning");
            return;
        }

        setIsSaving(true);
        try {
            console.log('Saving session details...');
            console.log(`   - Appointment ID: ${activeSession.id}`);
            console.log(`   - Notes: ${sessionData.notes ? sessionData.notes.substring(0, 50) + '...' : 'empty'}`);
            console.log(`   - Before Photo: ${sessionData.beforePhoto ? 'YES (' + (sessionData.beforePhoto.length / 1024 / 1024).toFixed(2) + ' MB)' : 'NO'}`);
            console.log(`   - After Photo: ${sessionData.afterPhoto ? 'YES (' + (sessionData.afterPhoto.length / 1024 / 1024).toFixed(2) + ' MB)' : 'NO'}`);

            const res = await Axios.put(`${API_URL}/api/appointments/${activeSession.id}/details`, {
                notes: sessionData.notes,
                beforePhoto: sessionData.beforePhoto,
                afterPhoto: sessionData.afterPhoto
            });
            console.log('Response:', res.data);
            if (res.data.success) {
                showAlert("Saved", "Session details saved successfully!", "success");
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

    const handleAbortSession = async () => {
        if (!activeSession || abortReason.trim().length < 10) return;
        setIsAborting(true);
        try {
            // Save current session details before aborting
            if (sessionData.notes || sessionData.beforePhoto || sessionData.afterPhoto) {
                await Axios.put(`${API_URL}/api/appointments/${activeSession.id}/details`, {
                    notes: sessionData.notes + `\n\n--- SESSION ABORTED ---\nReason: ${abortReason.trim()}`,
                    beforePhoto: sessionData.beforePhoto,
                    afterPhoto: sessionData.afterPhoto
                });
            }

            const res = await Axios.put(`${API_URL}/api/appointments/${activeSession.id}/status`, {
                status: 'incomplete',
                abortReason: abortReason.trim()
            });
            if (res.data.success) {
                setActiveSession(prev => ({ ...prev, status: 'incomplete' }));
                setShowAbortModal(false);
                setAbortReason('');
                showAlert('Session Stopped', 'The session has been marked as incomplete. The customer and studio have been notified.', 'info');
                fetchSessions();
            } else {
                showAlert('Error', res.data.message || 'Failed to abort session.', 'danger');
            }
        } catch (error) {
            console.error('Error aborting session:', error);
            showAlert('Connection Error', 'Failed to connect to the server.', 'danger');
        } finally {
            setIsAborting(false);
        }
    };

    return (<>
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
                                <>
                                    <div className="table-responsive">
                                        <table className="portal-table mobile-card-table">
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
                                            {sessions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(session => (
                                                <tr key={session.id} onClick={() => { setViewingApt(session); setIsDetailsOpen(true); }} style={{ cursor: 'pointer' }}>
                                                    <td data-label="Time">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                                                            <Clock size={14} className="text-muted" />
                                                            {formatTime12Hour(session.start_time) || 'N/A'}
                                                        </div>
                                                    </td>
                                                    <td data-label="Client" style={{ fontWeight: '600' }}>{session.client_name}</td>
                                                    <td data-label="Design">{session.design_title}</td>
                                                    <td data-label="Status"><span className={`badge status-${getStatusColor(session.status)}`}>{formatStatus(session.status)}</span></td>
                                                    <td data-label="Action">
                                                        <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); handleManageSession(session); }} style={{ padding: '6px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <PenTool size={14} /> Manage Session
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <Pagination
                                    currentPage={currentPage}
                                    totalPages={Math.ceil(sessions.length / itemsPerPage)}
                                    onPageChange={setCurrentPage}
                                    itemsPerPage={itemsPerPage}
                                    onItemsPerPageChange={(newVal) => {
                                        setItemsPerPage(newVal);
                                        setCurrentPage(1);
                                    }}
                                    totalItems={sessions.length}
                                    unit="sessions"
                                />
                                </>
                            ) : (
                                <div className="no-data-container" style={{ flex: 1 }}>
                                    <Calendar size={48} className="no-data-icon" />
                                    <p className="no-data-text">No sessions scheduled for today.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ═══════════════ UPCOMING SESSIONS BANNER ═══════════════ */}
                    {!loading && (
                        <div style={{ marginTop: '20px', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: upcomingSessions.length > 0 ? '12px' : '0' }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Calendar size={16} style={{ color: '#be9055' }} />
                                    Upcoming Sessions
                                </h3>
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>Next 3 scheduled</span>
                            </div>
                            {upcomingSessions.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {upcomingSessions.map(session => {
                                        const apptDate = new Date(session.appointment_date);
                                        const formattedDate = apptDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                        const formattedTime = session.start_time
                                            ? new Date(`2000-01-01T${session.start_time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                                            : 'TBD';
                                        const now = new Date();
                                        now.setHours(0,0,0,0);
                                        const diff = Math.ceil((new Date(session.appointment_date).setHours(0,0,0,0) - now) / (1000 * 60 * 60 * 24));
                                        const daysLabel = diff === 1 ? 'Tomorrow' : `in ${diff} days`;
                                        return (
                                            <div key={session.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', transition: 'background 0.2s' }}>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#be9055', fontSize: '0.8rem', minWidth: '48px' }}>#{session.id}</span>
                                                <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.85rem', minWidth: '120px' }}>{session.client_name}</span>
                                                <span style={{ color: '#475569', fontSize: '0.8rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.design_title || '—'}</span>
                                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b', minWidth: '120px', textAlign: 'right' }}>{formattedDate}</span>
                                                <span style={{ fontSize: '0.72rem', color: '#be9055', fontWeight: 600, minWidth: '70px', textAlign: 'right' }}>{daysLabel}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', minWidth: '80px', justifyContent: 'flex-end' }}>
                                                    <Clock size={12} style={{ color: '#94a3b8' }} />
                                                    {formattedTime}
                                                </div>
                                                <span className={`badge status-${getStatusColor(session.status)}`} style={{ fontSize: '0.7rem', padding: '2px 8px', minWidth: '65px', textAlign: 'center' }}>{formatStatus(session.status)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '14px 0' }}>
                                    <Calendar size={20} style={{ color: '#cbd5e1' }} />
                                    <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: 0 }}>No upcoming sessions scheduled.</p>
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

                {/* Read-Only Session Details Modal */}
                {isDetailsOpen && viewingApt && (
                    <div className="modal-overlay open" onClick={() => setIsDetailsOpen(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>Session Information</h3>
                                <button className="close-btn" onClick={() => setIsDetailsOpen(false)}><X size={20} /></button>
                            </div>
                            <div className="modal-body">
                                <div className="grid-2col" style={{ gap: '15px', marginBottom: '20px' }}>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client</label>
                                        <p style={{ margin: '4px 0 0', fontWeight: '600', color: '#1e293b' }}>{viewingApt.client_name}</p>
                                    </div>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Design Title</label>
                                        <p style={{ margin: '4px 0 0', fontWeight: '600', color: '#1e293b' }}>{viewingApt.design_title}</p>
                                    </div>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Email</label>
                                        <p style={{ margin: '4px 0 0', fontWeight: '600', color: '#1e293b' }}>{viewingApt.client_email || 'N/A'}</p>
                                    </div>
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</label>
                                        <p style={{ margin: '4px 0 0' }}>
                                            <span className={`badge status-${getStatusColor(viewingApt.status)}`}>{formatStatus(viewingApt.status)}</span>
                                        </p>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '10px' }}>Notes & Instructions</label>
                                    <div style={{ padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                                        <p style={{ margin: 0, fontSize: '0.95rem', color: '#475569', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                                            {viewingApt.notes || 'No specific notes provided for this session.'}
                                        </p>
                                        
                                        {viewingApt.reference_image && (
                                            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                                                <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '10px', textTransform: 'uppercase' }}>Reference Image</p>
                                                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                                                    <img src={viewingApt.reference_image.startsWith('data:') ? viewingApt.reference_image : viewingApt.reference_image.startsWith('http') ? viewingApt.reference_image : `${API_URL}${viewingApt.reference_image}`} alt="Reference" className="lightbox-trigger" style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', background: '#f8fafc' }} onClick={() => setLightboxSrc(viewingApt.reference_image.startsWith('data:') ? viewingApt.reference_image : viewingApt.reference_image.startsWith('http') ? viewingApt.reference_image : `${API_URL}${viewingApt.reference_image}`)} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <Clock size={20} style={{ color: '#2563eb' }} />
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#1d4ed8', fontWeight: '600' }}>Schedule Confirmation</p>
                                        <p style={{ margin: 0, fontSize: '0.95rem', color: '#2563eb', fontWeight: 'bold' }}>
                                            {viewingApt.appointment_date ? new Date(viewingApt.appointment_date).toLocaleDateString() : 'Today'} at {formatTime12Hour(viewingApt.start_time) || 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setIsDetailsOpen(false)}>Close</button>
                                <button className="btn btn-primary" onClick={() => { setIsDetailsOpen(false); handleManageSession(viewingApt); }}>
                                    Go to Management
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Active Session Modal */}
            {sessionModal.mounted && activeSession && (
                <div className={`modal-overlay ${sessionModal.visible ? 'open' : ''}`} onClick={closeSessionModal}>
                    <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                            const myRole = activeSession.assigned_role || 'primary';
                            const isDual = ['tattoo', 'piercing', 'both'].includes(myRole) && activeSession.secondary_artist_id;
                            const roleBadge = isDual ? (
                                myRole === 'both' ? { icon: '', label: 'Tattoo & Piercing', bg: '#be9055', color: '#fff' }
                                : myRole === 'piercing' ? { icon: '', label: 'Piercing Session', bg: '#be9055', color: '#fff' }
                                : { icon: '', label: 'Tattoo Session', bg: '#be9055', color: '#fff' }
                            ) : null;
                            const isPiercingRole = myRole === 'piercing';
                            return (
                            <>
                        <div className="modal-header">
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <h2 style={{ margin: 0 }}>Active Session: {activeSession.client_name}</h2>
                                    {activeSession.total_sessions > 1 && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>
                                            Session {activeSession.session_number || 1} of {activeSession.total_sessions}
                                        </span>
                                    )}
                                    {roleBadge && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 14px', borderRadius: '20px', background: roleBadge.bg, color: roleBadge.color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.02em', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                                            {roleBadge.icon} {roleBadge.label}
                                        </span>
                                    )}
                                </div>
                                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>Project: {activeSession.design_title}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {isCompletingSession && (
                                    <button className="btn btn-brand-gold" onClick={confirmCompletion} style={{ fontWeight: 800 }}>Finalize Session</button>
                                )}
                                <button className="close-btn" onClick={closeSessionModal}><X size={24} /></button>
                            </div>
                        </div>

                        <div className="modal-body" style={{ padding: '24px' }}>

                            {/* Health Alert Panel — collapsible, shown only when health data exists */}
                            {(() => {
                                const rawConditions = activeSession.health_conditions || activeSession.client_health_conditions;
                                const rawAllergens  = activeSession.allergens || activeSession.client_allergens;
                                const conditions = Array.isArray(rawConditions) ? rawConditions : [];
                                const allergens  = Array.isArray(rawAllergens)  ? rawAllergens  : [];
                                const hasHealthData = conditions.length > 0 || allergens.length > 0;
                                if (!hasHealthData) return null;
                                return (
                                    <div style={{ marginBottom: '16px' }}>
                                        <button
                                            type="button"
                                            id="health-alert-toggle"
                                            aria-expanded={showHealthAlert}
                                            aria-controls="health-alert-body"
                                            title={showHealthAlert ? 'Collapse health alert panel' : 'View client health & safety information'}
                                            onClick={() => setShowHealthAlert(p => !p)}
                                            style={{
                                                width: '100%', display: 'flex', justifyContent: 'space-between',
                                                alignItems: 'center', padding: '10px 16px',
                                                borderRadius: showHealthAlert ? '12px 12px 0 0' : '12px',
                                                border: '1.5px solid #fed7aa',
                                                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                                                cursor: 'pointer', transition: 'border-radius 0.2s ease'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <ShieldAlert size={15} color="#ea580c" />
                                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Client Health &amp; Safety
                                                </span>
                                                <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 700, background: '#fed7aa', color: '#9a3412' }}>
                                                    {conditions.length + allergens.length} item{conditions.length + allergens.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.5"
                                                style={{ transform: showHealthAlert ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease', flexShrink: 0 }}>
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        </button>

                                        {showHealthAlert && (
                                            <div
                                                id="health-alert-body"
                                                style={{
                                                    padding: '14px 16px',
                                                    borderRadius: '0 0 12px 12px',
                                                    background: '#fff7ed',
                                                    border: '1.5px solid #fed7aa',
                                                    borderTop: 'none'
                                                }}
                                            >
                                                <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#b45309', lineHeight: 1.6 }}>
                                                    The following health information was disclosed by this client. Please review before beginning the procedure.
                                                </p>
                                                {conditions.length > 0 && (
                                                    <div style={{ marginBottom: '10px' }}>
                                                        <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Health Conditions</p>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                            {conditions.map(c => (
                                                                <span key={c} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(190,144,85,0.15)', border: '1.5px solid rgba(190,144,85,0.5)', color: '#92400e' }}>{c}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {allergens.length > 0 && (
                                                    <div>
                                                        <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Known Allergens</p>
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                            {allergens.map(a => (
                                                                <span key={a} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.35)', color: '#b91c1c' }}>{a}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* B-5: Project Timeline — read-only for artists */}
                            {activeSession?.project_id && (
                                <SessionTimeline
                                    project={projectTimeline}
                                    currentSessionId={activeSession?.id}
                                    isAdmin={false}
                                    loading={projectTimelineLoading}
                                />
                            )}

                            {/* Session Tabs */}
                            <div style={{ display: 'flex', gap: '4px', padding: '0 0 16px 0', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
                                {[{id:'overview',label:'Overview'},{id:'documentation',label:'Documentation'},{id:'supplies',label:'Supplies'},{id:'auditlog',label:'Audit Log'}].map(tab => (
                                    <button key={tab.id} onClick={() => setSessionTab(tab.id)} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s', background: sessionTab === tab.id ? '#1e293b' : '#f1f5f9', color: sessionTab === tab.id ? '#fff' : '#64748b' }}>
                                        {tab.label} {tab.id === 'auditlog' && auditLog.length > 0 && <span style={{ background: sessionTab === tab.id ? 'rgba(255,255,255,0.25)' : '#cbd5e1', color: sessionTab === tab.id ? '#fff' : '#475569', padding: '2px 7px', borderRadius: '10px', fontSize: '0.7rem', marginLeft: '4px' }}>{auditLog.length}</span>}
                                    </button>
                                ))}
                            </div>

                            {/* TAB: Overview */}
                            {sessionTab === 'overview' && (
                                <div className="grid-2col" style={{ gap: '16px' }}>
                                    {[{label:'Client', value: activeSession.client_name}, {label:'Email', value: activeSession.client_email || 'N/A'}, {label:'Design / Project', value: activeSession.design_title}, {label:'Scheduled Time', value: formatTime12Hour(activeSession.start_time) || 'N/A'}, {label:'Date', value: activeSession.appointment_date ? new Date(activeSession.appointment_date).toLocaleDateString() : 'Today'}, {label:'Service Type', value: activeSession.service_type || 'Tattoo Session'}].map(item => (
                                        <div key={item.label} style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>{item.label}</span>
                                            <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{item.value}</span>
                                        </div>
                                    ))}
                                    {activeSession.reference_image && (
                                        <div style={{ gridColumn: '1 / -1', background: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '10px' }}>Reference Image</span>
                                            <img src={activeSession.reference_image.startsWith('data:') ? activeSession.reference_image : activeSession.reference_image.startsWith('http') ? activeSession.reference_image : `${API_URL}${activeSession.reference_image}`} alt="Reference" className="lightbox-trigger" style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0' }} onClick={() => setLightboxSrc(activeSession.reference_image.startsWith('data:') ? activeSession.reference_image : activeSession.reference_image.startsWith('http') ? activeSession.reference_image : `${API_URL}${activeSession.reference_image}`)} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB: Documentation */}
                            {sessionTab === 'documentation' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div className={activeSession.draft_image ? 'grid-3col' : 'grid-2col'} style={{ gap: '15px' }}>
                                        {activeSession.draft_image && (
                                            <div className="artist-session-card" style={{ padding: '15px' }}>
                                                <label className="artist-session-label">Draft Design</label>
                                                <div className="artist-session-photo-container">
                                                    <img src={activeSession.draft_image} alt="Draft" className="lightbox-trigger" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => setLightboxSrc(activeSession.draft_image)} />
                                                </div>
                                            </div>
                                        )}
                                        <div className="artist-session-card">
                                            <label className="artist-session-label">{isPiercingRole ? 'Pre-Piercing' : 'Before State'} <span style={{ color: '#ef4444' }}>*</span></label>
                                            <div className="artist-session-photo-container">
                                                {sessionData.beforePhoto ? (
                                                    <img src={sessionData.beforePhoto} alt="Before" className="lightbox-trigger" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => setLightboxSrc(sessionData.beforePhoto)} />
                                                ) : (
                                                    <button className="btn btn-secondary" onClick={() => document.getElementById('before-photo-input').click()}>
                                                        <Upload size={16} /> Upload
                                                    </button>
                                                )}
                                                <input id="before-photo-input" type="file" hidden accept="image/*" onChange={(e) => handlePhotoUpload(e, 'beforePhoto')} />
                                            </div>
                                        </div>
                                        <div style={{ background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '15px', textAlign: 'center' }}>
                                            <label style={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px', display: 'block' }}>{isPiercingRole ? 'Post-Piercing' : 'Post Procedure'} <span style={{ color: '#ef4444' }}>*</span></label>
                                            <div style={{ height: '180px', borderRadius: '12px', overflow: 'hidden', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {sessionData.afterPhoto ? (
                                                    <img src={sessionData.afterPhoto} alt="After" className="lightbox-trigger" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onClick={() => setLightboxSrc(sessionData.afterPhoto)} />
                                                ) : (
                                                    <button className="btn btn-secondary" onClick={() => document.getElementById('after-photo-input').click()}>
                                                        <Upload size={16} /> Upload
                                                    </button>
                                                )}
                                                <input id="after-photo-input" type="file" hidden accept="image/*" onChange={(e) => handlePhotoUpload(e, 'afterPhoto')} />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label style={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <FileText size={14}/> Procedure Notes & Observations
                                        </label>
                                        <textarea
                                            className="form-input"
                                            name="notes"
                                            rows="8"
                                            value={sessionData.notes}
                                            onChange={handleSessionFormChange}
                                            placeholder="Document procedure details, pigment choices, or client skin response..."
                                            style={{ 
                                                borderRadius: '16px', 
                                                minHeight: '200px',
                                                border: errors.notes ? '1px solid #ef4444' : '1px solid #e2e8f0',
                                                boxShadow: errors.notes ? '0 0 0 1px #ef4444' : 'inset 0 1px 3px rgba(0,0,0,0.02)'
                                            }}
                                        />
                                        {errors.notes && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '6px', display: 'block' }}>{errors.notes}</span>}
                                    </div>
                                </div>
                            )}

                            {/* TAB: Supplies */}
                            {sessionTab === 'supplies' && (
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
                                <div style={{ flex: 1, background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <label style={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Package size={14}/> Consumption Log
                                    </label>
                                    {isCompletingSession || activeSession.status === 'confirmed' || activeSession.status === 'in_progress' || activeSession.status === 'completed' ? (
                                        <>
                                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                                {sessionMaterials.length === 0 ? (
                                                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                                                        <Package size={32} style={{ marginBottom: '10px', opacity: 0.3 }} />
                                                        <p style={{ margin: 0, fontSize: '0.85rem' }}>No supplies logged yet.</p>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        {sessionMaterials.map((mat, idx) => (
                                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{mat.quantity}x {mat.item_name}</span>
                                                                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{mat.category}</span>
                                                                </div>
                                                                {mat.status === 'hold' && (
                                                                    <button onClick={() => handleReleaseMaterial(mat.id)} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}>
                                                                        <X size={14} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(183, 149, 78, 0.05)', padding: '10px 15px', borderRadius: '12px', border: '1px solid rgba(183, 149, 78, 0.2)' }}>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Total Material Cost</span>
                                                    <span style={{ fontWeight: 800, color: '#b7954e' }}>₱{sessionCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                                {activeSession.status !== 'completed' && (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.75rem', justifyContent: 'center', padding: '8px' }} onClick={openInventoryModal} disabled={addingMaterial}>
                                                        <Plus size={14}/> Add Item
                                                    </button>
                                                    {Object.keys(serviceKits).length > 0 && (
                                                        <select disabled={addingMaterial} className="premium-select-v2" style={{ flex: 1.2, fontSize: '0.75rem', background: '#f8fafc' }} onChange={(e) => { if (e.target.value) { handleQuickAddKit(serviceKits[e.target.value]); e.target.value = ''; } }}>
                                                            <option value="">Apply Kit</option>
                                                            {Object.keys(serviceKits).map(kitName => (<option key={kitName} value={kitName}>{kitName}</option>))}
                                                        </select>
                                                    )}
                                                </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                                            <Clock size={32} style={{ marginBottom: '10px', opacity: 0.3 }} />
                                            <p style={{ margin: 0, fontSize: '0.85rem' }}>{activeSession.status === 'confirmed' ? 'Start procedure to log supplies.' : 'Supply log archived.'}</p>
                                        </div>
                                    )}
                                </div>
                                {inventoryModal.visible && (
                                    <div style={{ flex: 1, background: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '550px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Search size={14}/> Add Inventory Items
                                            </label>
                                            <button onClick={closeInventoryModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '10px', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}>
                                            <Search size={15} color="#94a3b8" />
                                            <input
                                                type="text"
                                                placeholder="Search by name or category..."
                                                value={inventorySearch}
                                                onChange={(e) => setInventorySearch(e.target.value)}
                                                autoFocus
                                                style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, marginLeft: '8px', fontSize: '0.85rem', padding: '4px 0', color: '#1e293b' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
                                            {inventoryItems.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8' }}>No items in stock.</div>
                                            ) : (
                                                (() => {
                                                    const filtered = inventoryItems.filter(item =>
                                                        !inventorySearch ||
                                                        (item.name && item.name.toLowerCase().includes(inventorySearch.toLowerCase())) ||
                                                        (item.category && item.category.toLowerCase().includes(inventorySearch.toLowerCase()))
                                                    );
                                                    return filtered.length > 0 ? filtered.map(item => (
                                                        <div
                                                            key={item.id}
                                                            onClick={async () => {
                                                                await handleQuickAdd(item.id, 1);
                                                            }}
                                                            style={{
                                                                padding: '10px 14px',
                                                                background: '#fff',
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: '10px',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                flexShrink: 0
                                                            }}
                                                        >
                                                            <div>
                                                                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.name}</div>
                                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                                    {item.category} • {item.current_stock} {item.unit} available
                                                                </div>
                                                            </div>
                                                            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.7rem', color: '#1e293b', background: '#e2e8f0', border: '1px solid #cbd5e1', fontWeight: 600 }}>Add</button>
                                                        </div>
                                                    )) : <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8' }}>No matching items found.</div>;
                                                })()
                                            )}
                                        </div>
                                    </div>
                                )}
                                </div>
                            )}
                            {/* TAB: Audit Log */}
                            {sessionTab === 'auditlog' && (
                                <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '20px' }}>
                                    <label style={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                        <List size={14}/> Session Event Log
                                    </label>
                                    {auditLog.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                                            <List size={32} style={{ marginBottom: '10px', opacity: 0.3 }} />
                                            <p style={{ margin: 0, fontSize: '0.85rem' }}>No events logged yet. Start the procedure to begin tracking.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                            {auditLog.map((entry, idx) => (
                                                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 0', borderBottom: idx < auditLog.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.action.includes('Started') ? '#10b981' : entry.action.includes('Completed') ? '#6366f1' : entry.action.includes('Paused') ? '#f59e0b' : entry.action.includes('Aborted') ? '#ef4444' : '#3b82f6', marginTop: '6px', flexShrink: 0 }} />
                                                    <div style={{ flex: 1 }}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{entry.action}</span>
                                                    </div>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{entry.timestamp}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Outstanding Balance Info Banner */}
                        {activeSession.status === 'completed' && paymentInfo && (
                            <div style={{
                                margin: '0 0 16px 0', padding: '14px 18px',
                                background: paymentInfo.isUnquoted ? 'linear-gradient(135deg, #fffbeb, #fef3c7)' : 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                                borderRadius: '14px',
                                border: paymentInfo.isUnquoted ? '1px solid #fcd34d' : '1px solid #93c5fd',
                                display: 'flex', alignItems: 'flex-start', gap: '12px'
                            }}>
                                <AlertTriangle size={18} style={{ color: paymentInfo.isUnquoted ? '#f59e0b' : '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.85rem', color: paymentInfo.isUnquoted ? '#92400e' : '#1e40af' }}>
                                        {paymentInfo.isUnquoted ? 'Session Unquoted' : 'Outstanding Balance Detected'}
                                    </p>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: paymentInfo.isUnquoted ? '#a16207' : '#1d4ed8', lineHeight: 1.5 }}>
                                        {paymentInfo.isUnquoted
                                            ? 'This session has no price set. The studio admin has been notified and will handle pricing and payment collection.'
                                            : `This session has a remaining balance of ₱${paymentInfo.remaining.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. The studio admin has been notified and will handle payment collection.`
                                        }
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span className={`badge ${activeSession.status}`} style={{ padding: '6px 14px', fontSize: '0.75rem', fontWeight: 800 }}>
                                    {activeSession.status.toUpperCase()}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                    {activeSession.status === 'confirmed' ? 'Ready for procedure' : 
                                     activeSession.status === 'in_progress' ? (isSessionPaused ? 'Paused' : 'Active') : 
                                     activeSession.status === 'completed' ? 'Complete' :
                                     activeSession.status === 'incomplete' ? 'Stopped early' : 'Archived'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {activeSession.status === 'confirmed' && (() => {
                                    const payCheck = getSessionPaymentStatus(activeSession);
                                    return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <button 
                                            className="btn btn-primary" 
                                            style={{ 
                                                padding: '10px 24px',
                                                opacity: (payCheck.canStart && !isStartingProcedure) ? 1 : 0.6,
                                                cursor: (payCheck.canStart && !isStartingProcedure) ? 'pointer' : 'not-allowed'
                                            }} 
                                            title={payCheck.canStart ? 'Start Session' : payCheck.reason}
                                            disabled={isStartingProcedure}
                                            onClick={() => {
                                                if (!payCheck.canStart || isStartingProcedure) {
                                                    if (!payCheck.canStart) {
                                                        showAlert(
                                                            payCheck.isFollowUp ? 'Full Payment Required' : 'Downpayment Required',
                                                            payCheck.reason,
                                                            'warning'
                                                        );
                                                    }
                                                    return;
                                                }
                                                handleUpdateStatus('in_progress');
                                            }}
                                        >
                                            <Play size={16} /> {isStartingProcedure ? 'Starting...' : 'Start Procedure'}
                                        </button>
                                        {!payCheck.canStart && (
                                            <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>
                                                * {payCheck.isFollowUp ? 'Full payment required' : 'Payment required to begin'}
                                            </span>
                                        )}
                                    </div>
                                    );
                                })()}
                                {activeSession.status === 'in_progress' && !isCompletingSession && (
                                    <>
                                        <button className="btn btn-secondary" style={{ padding: '10px 18px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }} onClick={() => setShowAbortModal(true)}>
                                            <AlertTriangle size={14} /> Abort
                                        </button>
                                        <button className="btn btn-primary" onClick={() => handleUpdateStatus('completed')}>
                                            <CheckCircle size={16} /> Complete Work
                                        </button>
                                    </>
                                )}
                                {isCompletingSession && (
                                    <button className="btn btn-secondary" style={{ padding: '10px 20px' }} onClick={() => setIsCompletingSession(false)}>
                                        Cancel
                                    </button>
                                )}
                                {activeSession.status !== 'completed' && (
                                    <button className="btn btn-primary" style={{ padding: '10px 24px' }} onClick={handleSaveDetails} disabled={isSaving}>
                                        <Save size={16} /> {isSaving ? 'Saving...' : 'Sync Progress'}
                                    </button>
                                )}
                                {activeSession.status === 'completed' && (
                                    <button className="btn btn-primary" style={{ padding: '10px 24px' }} onClick={() => { closeSessionModal(); }}>
                                        <Archive size={16} /> Archive Session
                                    </button>
                                )}
                                <button className="btn btn-secondary" onClick={closeSessionModal}>Close</button>
                            </div>
                        </div>
                            </>
                            );
                        })()}
                    </div>
                </div>
            )}


            {/* Abort Session Reason Modal */}
            {showAbortModal && (
                <div className="modal-overlay open" onClick={() => { if (!isAborting) { setShowAbortModal(false); setAbortReason(''); } }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header" style={{ borderBottom: '2px solid #fecaca' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#dc2626', margin: 0 }}>
                                <AlertTriangle size={22} /> Abort Session
                            </h3>
                            <button className="close-btn" onClick={() => { if (!isAborting) { setShowAbortModal(false); setAbortReason(''); } }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {/* Warning Banner */}
                            <div style={{
                                background: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
                                border: '1px solid #fecaca',
                                borderRadius: '12px',
                                padding: '16px',
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px'
                            }}>
                                <AlertTriangle size={20} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <p style={{ margin: '0 0 4px 0', fontWeight: 700, color: '#991b1b', fontSize: '0.9rem' }}>This will stop the session immediately</p>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#b91c1c', lineHeight: 1.5 }}>
                                        The customer will be notified that their session was stopped early. Used materials will be recorded. A follow-up will be coordinated by the studio.
                                    </p>
                                </div>
                            </div>

                            {/* Reason Input */}
                            <div className="form-group">
                                <label style={{ fontWeight: 700, fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: '8px' }}>
                                    Reason for aborting <span style={{ color: '#dc2626' }}>*</span>
                                </label>
                                <textarea
                                    className="form-input"
                                    rows="4"
                                    value={abortReason}
                                    onChange={(e) => setAbortReason(e.target.value.slice(0, 500))}
                                    placeholder="e.g., Customer could not tolerate the pain, medical concern arose, allergic reaction..."
                                    style={{
                                        borderRadius: '12px',
                                        borderColor: abortReason.length > 0 && abortReason.trim().length < 10 ? '#f87171' : '#e2e8f0',
                                        transition: 'border-color 0.2s'
                                    }}
                                    disabled={isAborting}
                                    autoFocus
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                                    <span style={{ fontSize: '0.75rem', color: abortReason.length > 0 && abortReason.trim().length < 10 ? '#ef4444' : '#94a3b8' }}>
                                        {abortReason.length > 0 && abortReason.trim().length < 10 ? `At least 10 characters required (${abortReason.trim().length}/10)` : 'Provide a clear reason for the customer record'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: abortReason.length > 450 ? '#f59e0b' : '#94a3b8' }}>
                                        {abortReason.length}/500
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ borderTop: '1px solid #f1f5f9' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => { setShowAbortModal(false); setAbortReason(''); }}
                                disabled={isAborting}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn"
                                style={{
                                    backgroundColor: abortReason.trim().length >= 10 ? '#dc2626' : '#fca5a5',
                                    color: '#fff',
                                    padding: '10px 24px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: abortReason.trim().length >= 10 && !isAborting ? 'pointer' : 'not-allowed',
                                    opacity: abortReason.trim().length >= 10 && !isAborting ? 1 : 0.6,
                                    transition: 'all 0.2s'
                                }}
                                onClick={handleAbortSession}
                                disabled={abortReason.trim().length < 10 || isAborting}
                            >
                                <AlertTriangle size={16} />
                                {isAborting ? 'Stopping Session...' : 'Confirm Abort'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        <ImageLightbox src={lightboxSrc} alt="Session photo" onClose={() => setLightboxSrc(null)} />
    </>);
}

export default ArtistSessions;