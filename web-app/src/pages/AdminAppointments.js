import React, { useState, useEffect, useCallback, useRef } from 'react';
import Axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, List, ChevronLeft, ChevronRight, Search, Filter, SlidersHorizontal, Plus, Check, X, User, CreditCard, Info, FileText, Image, Clock, Package, CheckCircle, Printer, ShieldCheck, RefreshCw, AlertTriangle, ClipboardList, Syringe, Wrench, Layers, Tag, Gem, Heart, ShieldAlert } from 'lucide-react';
import PhilippinePeso from '../components/PhilippinePeso';

import AdminSideNav from '../components/AdminSideNav';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ConfirmModal';
import ImageLightbox from '../components/ImageLightbox';
import './AdminAppointments.css';
import './PortalStyles.css';
import './AdminStyles.css';
import { API_URL } from '../config';
import { getDisplayCode, formatTime12Hour, formatStatus } from '../utils/formatters';
import { filterName, filterDigits, clampNumber } from '../utils/validation';
import CustomSelect from '../components/CustomSelect';
import { generateReportHeader, downloadCsv, escapeCsv } from '../utils/csvExport';
import SessionTimeline from '../components/SessionTimeline';

const formatDuration = (totalSeconds) => {
    if (!totalSeconds || totalSeconds <= 0) return 'N/A';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`;
    return `${mins}m`;
};

function AdminAppointments() {
    const navigate = useNavigate();
    const location = useLocation();
    const [appointments, setAppointments] = useState([]);
    const [artists, setArtists] = useState([]);
    const [clients, setClients] = useState([]);

    const [filteredAppointments, setFilteredAppointments] = useState(appointments);
    const [viewMode, setViewMode] = useState('calendar'); // Defaults to calendar
    const [currentDate, setCurrentDate] = useState(new Date());
    const [searchTerm, setSearchTerm] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    const [clientSearch, setClientSearch] = useState('');
    const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [serviceFilter, setServiceFilter] = useState('all');
    const [quickFilter, setQuickFilter] = useState('all'); // 'upcoming', 'latest', 'all'
    const [dateFilter, setDateFilter] = useState('');
    const [timePeriodFilter, setTimePeriodFilter] = useState('all');
    const [sortBy, setSortBy] = useState('date');
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [modalTab, setModalTab] = useState('details'); // 'details', 'pricing', or 'notes'
    const [appointmentModal, setAppointmentModal] = useState({ mounted: false, visible: false });
    const [manualPaymentModal, setManualPaymentModal] = useState({ isOpen: false, amount: '', method: 'Cash' });
    const [isSavingAppointment, setIsSavingAppointment] = useState(false);
    const [isRecordingPayment, setIsRecordingPayment] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'danger', isAlert: false });
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const [formData, setFormData] = useState({
        clientId: '',
        artistId: '',
        serviceType: '',
        designTitle: '',
        date: '',
        time: '',
        status: 'confirmed',
        paymentStatus: 'unpaid',
        notes: '',
        price: 0,
        tattooPrice: 0,
        piercingPrice: 0,
        beforePhoto: null,
        referenceImage: null,
        manualPaidAmount: 0,
        manualPaymentMethod: 'Cash',
        rejectionReason: '',
        rescheduleReason: '',
        consultationNotes: '',
        quotedPrice: ''
    });
    const [rescheduleModal, setRescheduleModal] = useState({ isOpen: false, date: '', time: '', reason: '' });
    const [showCalendarLegend, setShowCalendarLegend] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null); // tracks the keyboard-focused day
    const calendarRef = useRef(null);
    const initialFormDataRef = useRef(null);

    // Archive mode: when viewing a completed appointment, show the read-only Archive Record modal
    const [archiveMode, setArchiveMode] = useState(false);
    const [archiveMaterials, setArchiveMaterials] = useState({ materials: [], totalCost: 0 });

    // Feature B: Project Timeline state
    const [projectTimeline, setProjectTimeline] = useState(null); // { project, sessions[] } or null
    const [projectTimelineLoading, setProjectTimelineLoading] = useState(false);

    // Health data for the selected client (fetched on-demand in create mode)
    const [clientHealthData, setClientHealthData] = useState({ conditions: [], allergens: [], loaded: false, loading: false });

    // Reschedule Request state (admin decision panel)
    const [pendingRescheduleRequest, setPendingRescheduleRequest] = useState(null);
    const [rescheduleRequestDeciding, setRescheduleRequestDeciding] = useState(false);
    const [rescheduleRequestNotes, setRescheduleRequestNotes] = useState('');

    const fetchRescheduleRequest = async (appointmentId) => {
        try {
            const res = await Axios.get(`${API_URL}/api/admin/appointments/${appointmentId}/reschedule-request`);
            if (res.data.success && res.data.request) {
                setPendingRescheduleRequest(res.data.request);
            } else {
                setPendingRescheduleRequest(null);
            }
        } catch (e) {
            setPendingRescheduleRequest(null);
        }
    };

    // Feature B: Fetch project timeline when opening a project-linked appointment
    const fetchProjectTimeline = async (projectId) => {
        if (!projectId) { setProjectTimeline(null); return; }
        setProjectTimelineLoading(true);
        try {
            const res = await Axios.get(`${API_URL}/api/projects/${projectId}`);
            if (res.data.success) setProjectTimeline(res.data.project);
            else setProjectTimeline(null);
        } catch (e) {
            console.error('Failed to load project timeline:', e);
            setProjectTimeline(null);
        } finally {
            setProjectTimelineLoading(false);
        }
    };


    const handleRescheduleRequestDecision = async (decision) => {
        if (!pendingRescheduleRequest) return;
        setRescheduleRequestDeciding(true);
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            const adminId = user ? user.id : 1;
            // Backend expects 'approved' or 'rejected'
            const backendDecision = decision === 'approve' ? 'approved' : 'rejected';
            const res = await Axios.put(`${API_URL}/api/admin/reschedule-requests/${pendingRescheduleRequest.id}/decide`, {
                decision: backendDecision,
                adminNotes: rescheduleRequestNotes.trim() || null,
                adminId
            });
            if (res.data.success) {
                showAlert(
                    decision === 'approve' ? 'Request Approved' : 'Request Rejected',
                    res.data.message,
                    decision === 'approve' ? 'info' : 'warning'
                );
                setPendingRescheduleRequest(null);
                setRescheduleRequestNotes('');
                fetchAppointments();
            }
        } catch (err) {
            showAlert('Error', err.response?.data?.message || 'Failed to process request.', 'danger');
        } finally {
            setRescheduleRequestDeciding(false);
        }
    };

    // Validation state
    const [errors, setErrors] = useState({});


    const validateField = (field, value, currentState = formData) => {
        let errorMsg = "";
        
        switch (field) {
            case 'clientId':
                if (!value) errorMsg = "Client is required";
                break;
            case 'serviceType':
                if (!value || !value.trim()) errorMsg = "Service type is required";
                break;
            case 'date':
                if (!value) errorMsg = "Date is required";
                break;
            case 'time':
                if (currentState.serviceType === 'Consultation' && !value) errorMsg = "Time is required for consultations";
                break;
            case 'price':
                if (currentState.serviceType !== 'Consultation' && Number(value) < 5000 && Number(value) > 0) {
                    errorMsg = "Minimum quote for tattoo sessions is ₱5,000";
                }
                break;
            default:
                break;
        }

        setErrors(prev => ({ ...prev, [field]: errorMsg }));
        return errorMsg === "";
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => {
            const newState = { ...prev, [field]: value };
            validateField(field, value, newState);
            return newState;
        });
    };

    // Modal animation handlers
    const openModal = () => {
        setAppointmentModal({ mounted: true, visible: false });
        setTimeout(() => setAppointmentModal({ mounted: true, visible: true }), 10);
    };

    // Dirty check: compare current form state against snapshot taken when modal opened
    const isFormDirty = () => {
        if (!initialFormDataRef.current) return false;
        const tracked = ['clientId', 'artistId', 'secondaryArtistId', 'commissionSplit',
            'serviceType', 'designTitle', 'date', 'time', 'status', 'paymentStatus',
            'notes', 'price', 'tattooPrice', 'piercingPrice', 'rejectionReason', 'isReferral', 'consultationNotes', 'quotedPrice'];
        return tracked.some(key => {
            const a = formData[key] ?? '';
            const b = initialFormDataRef.current[key] ?? '';
            return String(a) !== String(b);
        });
    };

    const closeModal = (skipDirtyCheck = false) => {
        if (!skipDirtyCheck && isFormDirty()) {
            setConfirmDialog({
                isOpen: true,
                title: 'Discard Unsaved Changes?',
                message: 'You have unsaved changes in this appointment. If you close now, all modifications will be lost. Do you want to discard and close?',
                type: 'warning',
                isAlert: false,
                onConfirm: () => {
                    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    closeModal(true);
                }
            });
            return;
        }
        setAppointmentModal(prev => ({ ...prev, visible: false }));
        setTimeout(() => {
            setAppointmentModal({ mounted: false, visible: false });
            initialFormDataRef.current = null;
        }, 400);
    };

    // Helper to get initials for guest accounts (or any user without an avatar)
    const getInitials = (name) => {
        if (!name) return '?';
        const cleanName = name.replace(/\(Guest\)/i, '').trim();
        const parts = cleanName.split(' ').filter(p => p.length > 0);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].substring(0, Math.min(2, parts[0].length)).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    useEffect(() => {
        fetchAppointments();
        fetchUsers();
    }, []);

    // In create mode: fetch the selected client's health profile on-demand
    useEffect(() => {
        if (selectedAppointment) {
            // Edit mode — health data is already embedded in selectedAppointment from the list fetch
            setClientHealthData({ conditions: [], allergens: [], loaded: false, loading: false });
            return;
        }
        if (!formData.clientId) {
            setClientHealthData({ conditions: [], allergens: [], loaded: false, loading: false });
            return;
        }
        let cancelled = false;
        setClientHealthData(prev => ({ ...prev, loading: true, loaded: false }));
        Axios.get(`${API_URL}/api/customer/profile/${formData.clientId}`)
            .then(res => {
                if (cancelled) return;
                if (res.data.success) {
                    setClientHealthData({
                        conditions: Array.isArray(res.data.profile.health_conditions) ? res.data.profile.health_conditions : [],
                        allergens:  Array.isArray(res.data.profile.allergens)           ? res.data.profile.allergens           : [],
                        loaded: true,
                        loading: false
                    });
                } else {
                    setClientHealthData({ conditions: [], allergens: [], loaded: true, loading: false });
                }
            })
            .catch(() => {
                if (!cancelled) setClientHealthData({ conditions: [], allergens: [], loaded: true, loading: false });
            });
        return () => { cancelled = true; };
    }, [formData.clientId, selectedAppointment]);

    const fetchUsers = async () => {
        try {
            const response = await Axios.get(`${API_URL}/api/debug/users`);
            if (response.data.success) {
                setArtists(response.data.users.filter(u => u.user_type === 'artist'));
                setClients(response.data.users.filter(u => u.user_type === 'customer'));
            }
        } catch (error) {
            console.error("Error fetching users:", error);
        }
    };

    const fetchAppointments = async () => {
        try {
            setLoading(true);
            const response = await Axios.get(`${API_URL}/api/admin/appointments`);
            if (response.data.success) {
                const mappedAppointments = response.data.data.map(apt => {
                    let finalClientName = apt.client_name;
                    const isGuest = !!apt.is_guest_placeholder;
                    if (isGuest && apt.notes) {
                        const nameMatch = apt.notes.match(/Name:\s*(.+?)(?:\\n|\n|$)/);
                        if (nameMatch && nameMatch[1]) {
                            finalClientName = nameMatch[1].trim();
                        }
                    } else if (apt.guest_email && apt.notes) {
                        const nameMatch = apt.notes.match(/Name:\s*(.+?)(?:\\n|\n|$)/);
                        if (nameMatch && nameMatch[1]) {
                            finalClientName = `${nameMatch[1].trim()} (Guest)`;
                        }
                    }

                    return {
                        id: apt.id,
                        bookingCode: apt.booking_code,
                        clientName: finalClientName,
                        clientId: apt.customer_id,
                        artistName: apt.artist_name,
                        artistId: apt.artist_id,
                        serviceType: apt.service_type || (apt.design_title?.includes(':') ? apt.design_title.split(':')[0] : (apt.notes?.toLowerCase().includes('consultation') ? 'Consultation' : 'Tattoo Session')),
                        designTitle: apt.design_title?.includes(':') ? apt.design_title.split(':')[1]?.trim() : apt.design_title,
                        date: apt.appointment_date ? (apt.appointment_date.includes('T') ? apt.appointment_date.split('T')[0] : apt.appointment_date.substring(0, 10)) : '',
                        time: apt.start_time,
                        status: apt.status,
                        paymentStatus: apt.payment_status,
                        notes: apt.notes,
                        beforePhoto: apt.before_photo,
                        referenceImage: apt.reference_image,
                        afterPhoto: apt.after_photo,
                        price: apt.price || 0,
                        tattooPrice: apt.tattoo_price || 0,
                        piercingPrice: apt.piercing_price || 0,
                        totalPaid: apt.total_paid || 0,
                        manualPaidAmount: apt.manual_paid_amount || 0,
                        manualPaymentMethod: apt.manual_payment_method || 'Cash',
                        clientAvatar: apt.client_avatar,
                        consultationMethod: apt.consultation_method || null,
                        consultationNotes: apt.consultation_notes || '',
                        quotedPrice: apt.quoted_price || '',
                        secondary_artist_id: apt.secondary_artist_id || null,
                        commission_split: apt.commission_split || 50,
                        isReferral: !!apt.is_referral,
                        sessionDuration: apt.session_duration || null,
                        auditLog: apt.audit_log || null,
                        totalCost: apt.total_material_cost || 0,
                        hasPendingRescheduleRequest: apt.has_pending_reschedule_request > 0,
                        waiverAcceptedAt: apt.waiver_accepted_at || null,
                        sessionNumber: apt.session_number || null,
                        totalSessions: apt.total_sessions || null,
                        discountAmount: parseFloat(apt.discount_amount) || 0,
                        discountType: apt.discount_type || null,
                        selectedJewelryId: apt.selected_jewelry_id || null,
                        selectedJewelryName: apt.selected_jewelry_name || null,
                        piercingJewelry: apt.piercing_jewelry || null,
                        clientHealthConditions: Array.isArray(apt.client_health_conditions) ? apt.client_health_conditions : [],
                        clientAllergens: Array.isArray(apt.client_allergens) ? apt.client_allergens : [],
                        isGuestPlaceholder: !!apt.is_guest_placeholder
                    };
                });
                setAppointments(mappedAppointments);
                setFilteredAppointments(mappedAppointments);
                setLoading(false);
                return mappedAppointments;
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching appointments:", error);
            setLoading(false);
            return []; // Return empty on error
        }
    };

    const fetchSessionMaterials = async (id) => {
        try {
            const res = await Axios.get(`${API_URL}/api/appointments/${id}/materials`);
            if (res.data.success) {
                return { materials: res.data.materials || [], totalCost: res.data.totalCost || 0 };
            }
            return { materials: [], totalCost: 0 };
        } catch (e) {
            console.error(e);
            return { materials: [], totalCost: 0 };
        }
    };

    const handleDayClick = (dateString, day) => {
        setSelectedDay(day || null);
    };

    // Keep selectedDay up to date automatically based on the month being viewed
    useEffect(() => {
        if (viewMode === 'calendar') {
            const today = new Date();
            if (today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear()) {
                setSelectedDay(today.getDate());
            } else {
                setSelectedDay(1);
            }
        }
    }, [currentDate, viewMode]);

    useEffect(() => {
        filterAndSortAppointments();
    }, [appointments, searchTerm, statusFilter, serviceFilter, quickFilter, dateFilter, timePeriodFilter, sortBy]);

    const filterAndSortAppointments = () => {
        let filtered = appointments.filter(apt => {
            const displayCode = getDisplayCode(apt.bookingCode, apt.id);
            const matchesSearch =
                displayCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (apt.bookingCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (apt.clientName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (apt.artistName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (apt.serviceType || '').toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'all' || apt.status === statusFilter;
            const matchesService = serviceFilter === 'all' || apt.serviceType === serviceFilter;
            const matchesDate = !dateFilter || apt.date === dateFilter;

            // Time period filter (weekly/monthly/yearly)
            let matchesPeriod = true;
            if (timePeriodFilter !== 'all' && !dateFilter) {
                const aptDate = new Date(apt.date + 'T00:00:00');
                const now = new Date();
                if (timePeriodFilter === 'weekly') {
                    const dayOfWeek = now.getDay();
                    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - mondayOffset);
                    weekStart.setHours(0, 0, 0, 0);
                    matchesPeriod = aptDate >= weekStart;
                } else if (timePeriodFilter === 'monthly') {
                    matchesPeriod = aptDate.getMonth() === now.getMonth() && aptDate.getFullYear() === now.getFullYear();
                } else if (timePeriodFilter === 'yearly') {
                    matchesPeriod = aptDate.getFullYear() === now.getFullYear();
                }
            }

            let matchesQuick = true;
            if (quickFilter === 'upcoming') {
                const today = new Date().toISOString().split('T')[0];
                matchesQuick = apt.date >= today && apt.status !== 'cancelled' && apt.status !== 'completed';
            }

            return matchesSearch && matchesStatus && matchesService && matchesDate && matchesPeriod && matchesQuick;
        });

        // Reset pagination on filter change
        setCurrentPage(1);

        // Sort
        if (quickFilter === 'latest') {
            filtered.sort((a, b) => b.id - a.id);
        } else if (sortBy === 'date') {
            filtered.sort((a, b) => new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time));
        } else if (sortBy === 'client') {
            filtered.sort((a, b) => a.clientName.localeCompare(b.clientName));
        } else if (sortBy === 'artist') {
            filtered.sort((a, b) => a.artistName.localeCompare(b.artistName));
        } else if (sortBy === 'status') {
            filtered.sort((a, b) => a.status.localeCompare(b.status));
        }

        setFilteredAppointments(filtered);
    };

    // Calendar Helpers
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

    const changeMonth = (offset) => {
        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
        const newDaysInMonth = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
        // If going forward, land on day 1; if going back, land on last day
        if (selectedDay !== null) {
            setSelectedDay(offset > 0 ? 1 : newDaysInMonth);
        }
        setCurrentDate(newDate);
    };

    // Navigate the calendar day
    useEffect(() => {
        if (viewMode !== 'calendar') return;
        if (appointmentModal.mounted) return;

        const handleKeyDown = (e) => {
            // Only handle arrow keys and Enter
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return;

            e.preventDefault();
            const maxDay = daysInMonth;

            if (selectedDay === null) {
                const today = new Date();
                if (today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear()) {
                    setSelectedDay(today.getDate());
                } else {
                    setSelectedDay(1);
                }
                return;
            }

            if (e.key === 'Enter') {
                const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
                handleAddNew(dateStr);
                return;
            }

            let newDay = selectedDay;
            if (e.key === 'ArrowLeft') newDay = selectedDay - 1;
            else if (e.key === 'ArrowRight') newDay = selectedDay + 1;
            else if (e.key === 'ArrowUp') newDay = selectedDay - 7;
            else if (e.key === 'ArrowDown') newDay = selectedDay + 7;

            if (newDay < 1) {
                changeMonth(-1);
            } else if (newDay > maxDay) {
                changeMonth(1);
            } else {
                setSelectedDay(newDay);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [viewMode, selectedDay, currentDate, daysInMonth, appointmentModal.mounted]);

    const getAppointmentsForDate = (day) => {
        return appointments.filter(a => {
            if (!a.date) return false;
            const [y, m, d] = a.date.split('-').map(Number);
            return d === day &&
                (m - 1) === currentDate.getMonth() &&
                y === currentDate.getFullYear();
        });
    };

    const showConfirm = (titleOrMessage, messageOrOnConfirm, maybeOnConfirm) => {
        let title, message, onConfirm;

        if (typeof messageOrOnConfirm === 'function') {
            // Case: showConfirm(message, onConfirm)
            title = 'Confirm Action';
            message = titleOrMessage;
            onConfirm = messageOrOnConfirm;
        } else {
            // Case: showConfirm(title, message, onConfirm)
            title = titleOrMessage;
            message = messageOrOnConfirm;
            onConfirm = maybeOnConfirm;
        }

        const confirmHandler = onConfirm || (() => setConfirmDialog(prev => ({ ...prev, isOpen: false })));
        setConfirmDialog({
            isOpen: true,
            title: title || 'Confirm Action',
            message,
            onConfirm: confirmHandler,
            type: 'info',
            isAlert: !onConfirm
        });
    };

    const showAlert = (title, message, type = 'info') => {
        setConfirmDialog({ isOpen: true, title, message, type, isAlert: true, onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })) });
    };

    const handleStatusUpdate = async (id, status, clientName = 'this client') => {
        const apt = appointments.find(a => a.id === id);

        if (status === 'confirmed' && apt && apt.serviceType !== 'Consultation') {
            const hasNoPrice = (!apt.price || apt.price <= 0);
            const hasNoArtist = (!apt.artist_id && !apt.artistId);

            if (hasNoPrice || hasNoArtist) {
                showConfirm(
                    'Incomplete Session Details',
                    `This physical session is missing ${hasNoArtist ? 'an Assigned Artist' : ''}${hasNoArtist && hasNoPrice ? ' and ' : ''}${hasNoPrice ? 'a finalized Service Price' : ''}. Would you like to review and supply these parameters for ${clientName}'s session now?`,
                    () => {
                        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                        handleEdit(apt);
                    }
                );
                return;
            }
        }

        const actionVerb = status === 'confirmed' ? 'confirm' : status === 'completed' ? 'complete' : 'cancel';

        showConfirm(
            `Confirm ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            `Are you sure you want to ${actionVerb} this appointment for ${clientName}? A notification will be sent to them.`,
            async () => {
                try {
                    await Axios.put(`${API_URL}/api/appointments/${id}/status`, { status });
                    fetchAppointments();
                    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                } catch (error) {
                    console.error('Error updating status:', error);
                }
            }
        );
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const appointmentId = params.get('appointment');
        if (appointmentId && appointments.length > 0) {
            const target = appointments.find(a => a.id.toString() === appointmentId);
            if (target) {
                handleEdit(target);
                navigate('/admin/appointments', { replace: true });
            }
        }
    }, [location.search, appointments]);

    const handleEdit = async (appointment) => {
        // Completed appointments → open read-only Archive Record modal
        if (appointment.status === 'completed') {
            setSelectedAppointment(appointment);
            const materialsData = await fetchSessionMaterials(appointment.id);
            setArchiveMaterials(materialsData);
            setArchiveMode(true);
            openModal();
            return;
        }

        // Non-completed → standard editable modal
        setArchiveMode(false);
        setSelectedAppointment(appointment);
        setModalTab('details');
        
        // Check if the stored artistId is a real artist (not admin placeholder)
        const storedArtistId = appointment.artistId || appointment.artist_id;
        const isRealArtist = artists.some(a => String(a.id) === String(storedArtistId));
        
        setFormData({
            clientId: appointment.clientId || appointment.customer_id,
            artistId: isRealArtist ? storedArtistId : '',
            secondaryArtistId: appointment.secondary_artist_id || '',
            commissionSplit: appointment.commission_split || 50,
            serviceType: appointment.serviceType || appointment.service_type,
            designTitle: appointment.designTitle || appointment.design_title,
            date: appointment.date || appointment.appointment_date,
            time: appointment.time || appointment.start_time,
            status: appointment.status,
            paymentStatus: (!appointment.price || appointment.price <= 0) ? 'unpaid' : (appointment.paymentStatus || appointment.payment_status || 'unpaid'),
            notes: appointment.notes,
            price: appointment.price,
            tattooPrice: appointment.tattooPrice || appointment.tattoo_price || 0,
            piercingPrice: appointment.piercingPrice || appointment.piercing_price || 0,
            beforePhoto: appointment.beforePhoto,
            referenceImage: appointment.referenceImage,
            manualPaidAmount: appointment.manualPaidAmount || 0,
            manualPaymentMethod: appointment.manualPaymentMethod || 'Cash',
            rejectionReason: appointment.rejectionReason || '',
            rescheduleReason: '',
            isReferral: !!appointment.isReferral,
            consultationNotes: appointment.consultationNotes || '',
            quotedPrice: appointment.quotedPrice || '',
            sessionNumber: appointment.sessionNumber || '',
            totalSessions: appointment.totalSessions || '',
            discountAmount: appointment.discountAmount || 0,
            discountType: appointment.discountType || 'flat'
        });
        setClientSearch(appointment.clientName);
        initialFormDataRef.current = {
            clientId: appointment.clientId || appointment.customer_id,
            artistId: isRealArtist ? storedArtistId : '',
            secondaryArtistId: appointment.secondary_artist_id || '',
            commissionSplit: appointment.commission_split || 50,
            serviceType: appointment.serviceType || appointment.service_type,
            designTitle: appointment.designTitle || appointment.design_title,
            date: appointment.date || appointment.appointment_date,
            time: appointment.time || appointment.start_time,
            status: appointment.status,
            paymentStatus: (!appointment.price || appointment.price <= 0) ? 'unpaid' : (appointment.paymentStatus || appointment.payment_status || 'unpaid'),
            notes: appointment.notes,
            price: appointment.price,
            tattooPrice: appointment.tattooPrice || appointment.tattoo_price || 0,
            piercingPrice: appointment.piercingPrice || appointment.piercing_price || 0,
            beforePhoto: appointment.beforePhoto,
            referenceImage: appointment.referenceImage,
            manualPaidAmount: appointment.manualPaidAmount || 0,
            manualPaymentMethod: appointment.manualPaymentMethod || 'Cash',
            rejectionReason: appointment.rejectionReason || '',
            rescheduleReason: '',
            isReferral: !!appointment.isReferral,
            consultationNotes: appointment.consultationNotes || '',
            quotedPrice: appointment.quotedPrice || '',
            sessionNumber: appointment.sessionNumber || '',
            totalSessions: appointment.totalSessions || '',
            discountAmount: appointment.discountAmount || 0,
            discountType: appointment.discountType || 'flat'
        };
        openModal();
        // Fetch any pending reschedule request for this appointment
        setPendingRescheduleRequest(null);
        setRescheduleRequestNotes('');
        fetchRescheduleRequest(appointment.id);
        // Feature B: Load project timeline if this appointment belongs to a project
        setProjectTimeline(null);
        if (appointment.project_id) fetchProjectTimeline(appointment.project_id);
    };

    // handleDelete deprecated — replaced by Reschedule flow
    // eslint-disable-next-line no-unused-vars
    const _handleDeleteDeprecated = (id) => {
        showConfirm('Are you sure you want to delete this appointment? This cannot be undone.', () => {
            setAppointments(appointments.filter(a => a.id !== id));
            Axios.delete(`${API_URL}/api/admin/appointments/${id}`)
                .then(() => fetchAppointments())
                .catch(err => console.error(err))
                .finally(() => setConfirmDialog(prev => ({ ...prev, isOpen: false })));
        });
    };

    const handleAddNew = (prefilledDate = null) => {
        setSelectedAppointment(null);
        setModalTab('details');
        setFormData({
            clientId: '',
            artistId: '',
            secondaryArtistId: '',
            commissionSplit: 50,
            serviceType: '',
            date: prefilledDate || new Date().toISOString().split('T')[0],
            time: '13:00',
            status: 'pending',
            paymentStatus: 'unpaid',
            notes: '',
            price: 0,
            tattooPrice: 0,
            piercingPrice: 0,
            beforePhoto: null,
            referenceImage: null,
            manualPaidAmount: 0,
            manualPaymentMethod: 'Cash',
            rejectionReason: '',
            rescheduleReason: '',
            isReferral: false,
            consultationNotes: '',
            quotedPrice: '',
            sessionNumber: '',
            totalSessions: '',
            discountAmount: 0,
            discountType: 'flat'
        });
        setClientSearch('');
        initialFormDataRef.current = { ...formData, clientId: '', artistId: '', secondaryArtistId: '', commissionSplit: 50, serviceType: '', date: prefilledDate || new Date().toISOString().split('T')[0], time: '13:00', status: 'pending', paymentStatus: 'unpaid', notes: '', price: 0, tattooPrice: 0, piercingPrice: 0, beforePhoto: null, referenceImage: null, manualPaidAmount: 0, manualPaymentMethod: 'Cash', rejectionReason: '', rescheduleReason: '', isReferral: false };
        openModal();
    };

    const handleRebookNextSession = (appointment) => {
        const nextSessionNumber = (appointment.sessionNumber || appointment.session_number || 1) + 1;
        setSelectedAppointment(null);
        setModalTab('details');
        setFormData({
            clientId: appointment.clientId || appointment.customer_id,
            artistId: appointment.artistId || appointment.artist_id,
            secondaryArtistId: appointment.secondary_artist_id || '',
            commissionSplit: appointment.commission_split || 50,
            serviceType: appointment.serviceType || appointment.service_type,
            designTitle: appointment.designTitle || appointment.design_title,
            date: new Date().toISOString().split('T')[0],
            time: '13:00',
            status: 'pending',
            paymentStatus: 'unpaid',
            notes: `Continuation of project: ${appointment.designTitle || appointment.design_title}`,
            price: appointment.price || 0,
            tattooPrice: appointment.tattooPrice || appointment.tattoo_price || 0,
            piercingPrice: appointment.piercingPrice || appointment.piercing_price || 0,
            beforePhoto: null,
            referenceImage: appointment.referenceImage || '',
            manualPaidAmount: 0,
            manualPaymentMethod: 'Cash',
            rejectionReason: '',
            rescheduleReason: '',
            // Feature B: carry project linkage forward
            projectId: appointment.project_id || null,
            sessionNumber: nextSessionNumber,
            totalSessions: appointment.totalSessions || appointment.total_sessions || ''
        });
        setClientSearch(appointment.clientName);
        setProjectTimeline(null);

        showConfirm(`Are you sure you want to Rebook a next session for this project?`, () => {
            openModal();
        });
    };

    const handleSave = async () => {
        const isConsultation = formData.serviceType === 'Consultation';
        const isTattooSession = !isConsultation;
        const isDualService = formData.serviceType === 'Tattoo + Piercing';
        // Detect dual-topic consultation by checking notes for piercing references
        const isDualConsultation = isConsultation && (formData.notes || '').toLowerCase().includes('piercing');
        const requiresDualStaff = isDualService || isDualConsultation;

        const hasNoArtist = !formData.artistId || String(formData.artistId) === 'null' || String(formData.artistId) === 'undefined' || String(formData.artistId) === '0' || String(formData.artistId).trim() === '' || !artists.some(a => String(a.id) === String(formData.artistId));
        const hasNoSecondaryArtist = !formData.secondaryArtistId || String(formData.secondaryArtistId) === 'null' || String(formData.secondaryArtistId) === 'undefined' || String(formData.secondaryArtistId) === '0' || String(formData.secondaryArtistId).trim() === '' || !artists.some(a => String(a.id) === String(formData.secondaryArtistId));

        // Basic required fields: Client + Date (+ Time for consultations)
        if (!formData.clientId || !formData.date || (isConsultation && !formData.time)) {
            setModalTab('details');
            showAlert('Missing Required Information', `Please fill in all required fields (Client, Date${isConsultation ? ', Time' : ''}).`, 'warning');
            return;
        }

        const isCancellingOrRejecting = formData.status === 'cancelled' || formData.status === 'rejected';

        // Tattoo Session specific validations - always enforced (except when cancelling/rejecting)
        if (isTattooSession && hasNoArtist && !isCancellingOrRejecting) {
            setModalTab('details');
            showAlert('Staff Required', 'This session requires a Staff member to be assigned. Please select a staff member in the Details tab.', 'warning');
            return;
        }

        // Dual-service validations - require both staff members
        if (requiresDualStaff && hasNoSecondaryArtist && !isCancellingOrRejecting) {
            setModalTab('details');
            const label = isDualService ? 'Tattoo + Piercing' : 'dual-topic Consultation';
            showAlert('Piercing Staff Required', `A ${label} session requires both a Primary Staff and a Piercing Staff to be assigned. You may select the same person for both roles if they handle both services.`, 'warning');
            return;
        }

        let priceInput = formData.price ? String(formData.price).replace(/[^0-9.]/g, '') : '0';
        let priceValue = parseFloat(priceInput);
        const finalPrice = (!priceValue || priceValue < 0) ? 0 : priceValue;

        // Dual-service split price validation
        if (isDualService && !isCancellingOrRejecting) {
            const tp = Number(formData.tattooPrice) || 0;
            const pp = Number(formData.piercingPrice) || 0;
            const newErrors = {};
            if (tp <= 0) newErrors.tattooPrice = 'Tattoo quote is required';
            if (pp <= 0) newErrors.piercingPrice = 'Piercing quote is required';
            if (Object.keys(newErrors).length > 0) {
                setErrors(newErrors);
                setModalTab('pricing');
                showAlert('Split Pricing Required', 'Both the Tattoo Quote and Piercing Quote must be greater than zero for a Tattoo + Piercing session.', 'warning');
                return;
            }
        }

        // Block completing a tattoo session without staff + price
        if (isTattooSession && formData.status === 'completed') {
            if (hasNoArtist) {
                setModalTab('details');
                showAlert('Cannot Complete', 'A staff member must be assigned before marking this session as completed.', 'warning');
                return;
            }
            if (requiresDualStaff && hasNoSecondaryArtist) {
                setModalTab('details');
                showAlert('Cannot Complete', 'Both staff members must be assigned before marking a dual-service session as completed.', 'warning');
                return;
            }
            if (finalPrice <= 0) {
                setModalTab('pricing');
                showAlert('Cannot Complete', 'A price must be set before marking this session as completed.', 'warning');
                return;
            }
        }

        if (isTattooSession && finalPrice <= 0 && !isCancellingOrRejecting) {
            setModalTab('pricing');
            showAlert('Pricing Required', 'A Tattoo Session requires a price to be set. Please enter the service price in the Pricing tab before saving.', 'warning');
            return;
        }

        // Minimum price check: ₱5,000 applies to the total (piercing portion is disregarded for the minimum)
        if (isTattooSession && finalPrice > 0 && finalPrice < 5000 && !isCancellingOrRejecting) {
            setModalTab('pricing');
            showAlert('Minimum Price', 'The minimum quote for a Tattoo Session is ₱5,000 (base reservation/downpayment rate). Please adjust the price accordingly.', 'warning');
            return;
        }

        const doSave = async () => {
            setIsSavingAppointment(true);
            try {
                const payload = {
                    customerId: formData.clientId,
                    artistId: formData.artistId,
                    secondaryArtistId: formData.secondaryArtistId || null,
                    commissionSplit: formData.commissionSplit || 50,
                    serviceType: formData.serviceType,
                    designTitle: formData.designTitle,
                    date: formData.date,
                    startTime: formData.time,
                    status: formData.status,
                    notes: formData.notes,
                    price: finalPrice,
                    beforePhoto: formData.beforePhoto,
                    manualPaidAmount: parseFloat(formData.manualPaidAmount) || 0,
                    manualPaymentMethod: formData.manualPaymentMethod,
                    rejectionReason: formData.status === 'rejected' ? formData.rejectionReason : null,
                    rescheduleReason: formData.rescheduleReason,
                    isReferral: formData.isReferral || false,
                    consultationNotes: formData.consultationNotes || null,
                    quotedPrice: formData.quotedPrice || null,
                    tattooPrice: isDualService ? (Number(formData.tattooPrice) || 0) : null,
                    piercingPrice: isDualService ? (Number(formData.piercingPrice) || 0) : null,
                    sessionNumber: formData.totalSessions ? (parseInt(formData.sessionNumber) || 1) : null,
                    totalSessions: formData.totalSessions ? (parseInt(formData.totalSessions) || null) : null,
                    // Feature B: carry project_id on rebooks
                    projectId: formData.projectId || null,
                    discountAmount: parseFloat(formData.discountAmount) || 0,
                    discountType: parseFloat(formData.discountAmount) > 0 ? (formData.discountType || 'flat') : null
                };

                // Only include paymentStatus if the admin explicitly changed it from
                // the value loaded at modal open time. This prevents accidental overwrite
                // of webhook-set values (e.g. 'downpayment_paid' -> 'unpaid').
                const adminChangedPaymentStatus = selectedAppointment
                    && initialFormDataRef.current
                    && formData.paymentStatus !== initialFormDataRef.current.paymentStatus;
                if (!selectedAppointment || adminChangedPaymentStatus) {
                    payload.paymentStatus = formData.paymentStatus;
                }

                if (selectedAppointment) {
                    await Axios.put(`${API_URL}/api/admin/appointments/${selectedAppointment.id}`, payload);
                } else {
                    // Feature B: Auto-create a tattoo_project when totalSessions > 1 and no project yet
                    const totalSessNum = parseInt(formData.totalSessions) || 0;
                    const hasExistingProject = !!formData.projectId;
                    let resolvedProjectId = formData.projectId || null;

                    if (totalSessNum > 1 && !hasExistingProject) {
                        try {
                            const projRes = await Axios.post(`${API_URL}/api/projects`, {
                                customer_id: formData.clientId,
                                artist_id: formData.artistId,
                                design_title: formData.designTitle || 'Multi-Session Project',
                                total_sessions_planned: totalSessNum,
                                notes: formData.notes || null
                            });
                            if (projRes.data.success) resolvedProjectId = projRes.data.project_id;
                        } catch (projErr) {
                            console.error('[B-2] Failed to auto-create project:', projErr.message);
                        }
                    }

                    payload.projectId = resolvedProjectId;
                    const aptRes = await Axios.post(`${API_URL}/api/admin/appointments`, payload);

                    // Link the seed appointment to the project (session 1)
                    if (resolvedProjectId && aptRes.data?.id) {
                        Axios.put(`${API_URL}/api/projects/${resolvedProjectId}/link-session`, {
                            appointment_id: aptRes.data.id,
                            session_number: parseInt(formData.sessionNumber) || 1
                        }).catch(e => console.warn('[B-2] Could not link session to project:', e.message));
                    }
                }
                closeModal(true);
                fetchAppointments();
            } catch (error) {
                console.error('Error saving appointment:', error);
                const msg = error.response?.data?.message || 'Failed to save appointment. Please check if your data was filled correctly.';
                showAlert('Save Failed', msg, 'danger');
            } finally {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                setIsSavingAppointment(false);
            }
        };

        showConfirm(
            selectedAppointment ? 'Confirm Update' : 'Confirm Creation',
            selectedAppointment
                ? `Are you sure you want to save the changes made to this appointment for ${clientSearch || 'this client'}? This will update the appointment record and may trigger a notification to the customer.`
                : `Are you sure you want to create a new appointment for ${clientSearch || 'this client'}? A notification will be sent to them once confirmed.`,
            doSave
        );
    };

    const handleConfirmReschedule = async () => {
        if (!rescheduleModal.date) return showAlert('Date Required', 'Please select a new date.', 'warning');
        if (formData.serviceType === 'Consultation' && !rescheduleModal.time) return showAlert('Time Required', 'Please select a new time.', 'warning');
        
        try {
            const payload = {
                customerId: formData.clientId,
                artistId: formData.artistId,
                secondaryArtistId: formData.secondaryArtistId || null,
                commissionSplit: formData.commissionSplit || 50,
                serviceType: formData.serviceType,
                designTitle: formData.designTitle,
                date: rescheduleModal.date,
                startTime: rescheduleModal.time,
                status: formData.status,
                paymentStatus: formData.paymentStatus,
                notes: formData.notes,
                price: formData.price,
                beforePhoto: formData.beforePhoto,
                manualPaidAmount: parseFloat(formData.manualPaidAmount) || 0,
                manualPaymentMethod: formData.manualPaymentMethod,
                rescheduleReason: rescheduleModal.reason
            };
            
            await Axios.put(`${API_URL}/api/admin/appointments/${selectedAppointment.id}`, payload);
            
            setFormData(prev => ({
                ...prev,
                date: rescheduleModal.date,
                time: rescheduleModal.time,
                rescheduleReason: rescheduleModal.reason
            }));
            
            setRescheduleModal(prev => ({...prev, isOpen: false}));
            closeModal();
            fetchAppointments();
            setConfirmDialog({ 
                isOpen: true, 
                title: 'Success', 
                message: 'Appointment successfully rescheduled.', 
                type: 'info', 
                isAlert: true,
                onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })) 
            });
        } catch (err) {
            console.error('Error rescheduling appointment:', err);
            showAlert('Error', 'Failed to reschedule appointment.', 'danger');
        }
    };

    const handleApplyManualPayment = async () => {
        const remainingBalance = Math.max(0, formData.price - (selectedAppointment?.totalPaid || 0));
        const inputAmount = parseFloat(manualPaymentModal.amount);

        if (!inputAmount || inputAmount <= 0) return;

        if (inputAmount > remainingBalance) {
            showAlert('Invalid Amount', `Amount exceeds the remaining balance of ₱${remainingBalance.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'warning');
            return;
        }

        setIsRecordingPayment(true);
        try {
            const res = await Axios.post(`${API_URL}/api/admin/appointments/${selectedAppointment.id}/manual-payment`, {
                amount: manualPaymentModal.amount,
                method: manualPaymentModal.method
            });
            if (res.data.success) {
                setManualPaymentModal({ ...manualPaymentModal, isOpen: false, amount: '' });
                // Refresh the list and update the locally selected appointment to show the new balance
                const newList = await fetchAppointments();
                const freshData = newList.find(a => a.id === selectedAppointment.id);
                if (freshData) setSelectedAppointment(freshData);
            }
        } catch (error) {
            showAlert("Payment Failed", error.response?.data?.message || "Failed to record payment", "danger");
        } finally {
            setIsRecordingPayment(false);
        }
    };

    const handleMultiSession = () => {
        setFormData({ ...formData, notes: formData.notes + '\n[Multi-Session: Session 1 of X]' });
    };

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'scheduled': return 'scheduled';
            case 'confirmed': return 'confirmed';
            case 'completed': return 'completed';
            case 'pending': return 'pending';
            case 'cancelled': return 'cancelled';
            case 'rejected': return 'cancelled';
            case 'in_progress': return 'in-progress';
            case 'incomplete': return 'incomplete';
            default: return 'scheduled';
        }
    };

    const handleExport = () => {
        showConfirm('Confirm Export', 'Are you sure you want to download a CSV export of the currently filtered appointments?', () => {
            const headerRows = generateReportHeader('Appointments Export', {
                'Status': statusFilter !== 'all' ? statusFilter : null,
                'Service': serviceFilter !== 'all' ? serviceFilter : null,
                'Date': dateFilter || null,
                'Search': searchTerm || null,
                'View': viewMode
            });

            const columnHeaders = ['Appointment ID', 'Client Name', 'Artist', 'Service Type', 'Date', 'Time', 'Status', 'Price (₱)'];
            const dataRows = filteredAppointments.map(a => [
                a.id,
                a.clientName,
                a.artistName,
                a.serviceType,
                a.date,
                a.time,
                a.status,
                a.price || 0
            ]);

            downloadCsv([...headerRows, columnHeaders, ...dataRows], 'appointments_export');
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        });
    };

    const handlePrint = () => {
        showConfirm('Confirm Print', 'Are you sure you want to generate a printable report of the currently filtered appointments?', () => {
            const printWindow = window.open('', '_blank');
            const printData = filteredAppointments.map(a =>
                `<tr>
                    <td>${a.clientName || 'N/A'}</td>
                    <td>${a.artistName || 'N/A'}</td>
                    <td>${a.serviceType || 'N/A'}</td>
                    <td>${a.date || 'N/A'}</td>
                    <td>${a.time || 'N/A'}</td>
                    <td>${(a.status || '').toUpperCase()}</td>
                    <td>₱${parseFloat(a.price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>`
            ).join('');

            printWindow.document.write(`
                <html>
                    <head>
                        <title>Print Appointments</title>
                        <style>
                            body { font-family: sans-serif; padding: 20px; color: #333; }
                            h1 { color: #1e293b; text-align: center; }
                            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 14px; }
                            th { background-color: #f1f5f9; color: #475569; }
                        </style>
                    </head>
                    <body>
                        <h1>Appointments Schedule</h1>
                        <p style="text-align:center;">Generated on ${new Date().toLocaleString()}</p>
                        <table>
                            <thead>
                                <tr>
                                    <th>Client Name</th>
                                    <th>Artist</th>
                                    <th>Service Type</th>
                                    <th>Date</th>
                                    <th>Time</th>
                                    <th>Status</th>
                                    <th>Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${printData}
                            </tbody>
                        </table>
                    </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();
            // Slight delay to ensure rendering before printing
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            }, 250);
        });
    };

    const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
    const currentItems = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Compute autocomplete suggestions dynamically from the dataset
    const searchSuggestions = Array.from(new Set([
        ...appointments.map(a => (a.id || '').toString()),
        ...appointments.map(a => (a.clientName || '').trim()),
        ...appointments.map(a => (a.artistName || '').trim())
    ])).filter(Boolean);

    return (
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter">
                {/* Print Only Header */}
                <div className="print-only-header">
                    <div className="admin-st-c6657cae">
                        <div>
                            <h1 className="admin-st-b43c9608">InkVistAR Studio</h1>
                            <p className="admin-m-0">Appointments & Schedule Report</p>
                        </div>
                        <div className="admin-st-7851dbc0">
                            <p className="admin-m-0">Date: {new Date().toLocaleDateString()}</p>
                            <p className="admin-m-0">View: {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}</p>
                        </div>
                    </div>
                </div>
                <header className="portal-header">
                    <div className="header-title">
                        <h1>Appointment Management</h1>
                    </div>
                    <div className="header-actions">
                        <div className="modern-view-toggle">
                            <div className="toggle-slider" style={{ transform: `translateX(${viewMode === 'calendar' ? '100%' : '0'})` }} />
                            <button
                                className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                                onClick={() => setViewMode('list')}
                                title="List View"
                            >
                                <List size={16} /> <span>List</span>
                            </button>
                            <button
                                className={`toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                                onClick={() => setViewMode('calendar')}
                                title="Calendar View"
                            >
                                <Calendar size={16} /> <span>Calendar</span>
                            </button>
                        </div>
                        <button className="btn btn-primary" onClick={handleAddNew}>
                            + New Appointment
                        </button>
                        <button className="btn btn-secondary icon-btn" onClick={handleExport} title="Export to CSV">
                            <FileText size={18} />
                        </button>
                        <button className="btn btn-secondary icon-btn" onClick={handlePrint} title="Print Appointments">
                            <Printer size={18} />
                        </button>
                    </div>
                </header>
                <p className="header-subtitle">Real-time schedule monitoring and booking oversight</p>

                {viewMode === 'calendar' ? (
                    <div className="calendar-split-view">
                    <div className="data-card admin-st-96be3bbd calendar-main-pane">
                        <div className="calendar-header admin-st-07952507">
                            <div className="admin-st-f21b09cf">
                                <button onClick={() => changeMonth(-1)} className="action-btn admin-m-0"><ChevronLeft size={20} /></button>
                                <button onClick={() => setCurrentDate(new Date())} className="action-btn admin-st-505e88db">Today</button>
                                <button onClick={() => changeMonth(1)} className="action-btn admin-m-0"><ChevronRight size={20} /></button>
                            </div>
                            <h2 className="admin-st-dcacbd6e">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setShowCalendarLegend(v => !v)}
                                    title="Show color legend"
                                    style={{
                                        width: '30px', height: '30px', borderRadius: '50%',
                                        border: '1.5px solid #cbd5e1',
                                        background: showCalendarLegend ? '#6366f1' : 'white',
                                        color: showCalendarLegend ? 'white' : '#64748b',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem',
                                        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                                        transition: 'all 0.2s ease', flexShrink: 0
                                    }}
                                >
                                    i
                                </button>
                                {showCalendarLegend && (
                                    <div
                                        style={{
                                            position: 'absolute', top: '38px', right: 0,
                                            background: 'white', borderRadius: '12px',
                                            boxShadow: '0 8px 30px rgba(0,0,0,0.14)',
                                            border: '1px solid #e2e8f0',
                                            padding: '14px 18px', zIndex: 999,
                                            minWidth: '220px', cursor: 'default'
                                        }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <p style={{ margin: '0 0 10px', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Booking Status Legend</p>
                                        {[
                                            { color: '#38bdf8', label: 'Confirmed' },
                                            { color: '#f59e0b', label: 'Pending' },
                                            { color: '#7c3aed', label: 'Scheduled' },
                                            { color: '#0284c7', label: 'In Session' },
                                            { color: '#22c55e', label: 'Completed' },
                                            { color: '#ef4444', label: 'Incomplete' },
                                            { color: '#94a3b8', label: 'Cancelled / Rejected' },
                                        ].map(({ color, label }) => (
                                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 0 2px ${color}33` }} />
                                                <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 500 }}>{label}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="calendar-grid admin-st-3d636867">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                <div key={d} className="admin-st-24b38fb3">{d}</div>
                            ))}
                            {[...Array(firstDayOfMonth)].map((_, i) => <div key={`empty-${i}`} className="admin-st-e2f83dcd"></div>)}
                            {[...Array(daysInMonth)].map((_, i) => {
                                const day = i + 1;
                                const dayAppts = getAppointmentsForDate(day);
                                const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();

                                return (
                                    <div key={day} style={{
                                        border: selectedDay === day
                                            ? '2px solid #7c3aed'
                                            : isToday ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                        padding: '8px',
                                        borderRadius: '8px',
                                        backgroundColor: selectedDay === day ? '#f5f3ff' : 'white',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        position: 'relative',
                                        boxShadow: selectedDay === day ? '0 0 0 3px rgba(124,58,237,0.15)' : 'none'
                                    }}
                                        className="calendar-day-cell"
                                        onClick={() => handleDayClick(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, day) }>
                                        <div style={{ fontWeight: 'bold', marginBottom: '5px', color: isToday ? '#6366f1' : '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>{day}</span>
                                            <Plus size={12} className="admin-st-0dbc0f09" />
                                        </div>
                                        {/* Booking count badge — styled like the sidenav notification-badge */}
                                        {dayAppts.length > 0 && (
                                            <div style={{
                                                position: 'absolute', top: '6px', right: '6px',
                                                background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                                                color: '#fff',
                                                fontSize: '0.62rem', fontWeight: 800,
                                                minWidth: '18px', height: '18px',
                                                padding: '0 5px', borderRadius: '9px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                boxShadow: '0 2px 6px rgba(99,102,241,0.45)',
                                                lineHeight: 1, letterSpacing: '-0.3px',
                                                pointerEvents: 'none'
                                            }}>
                                                {dayAppts.length > 99 ? '99+' : dayAppts.length}
                                            </div>
                                        )}
                                        <div className="admin-st-5e598434">

                                            {dayAppts.length > 0 && (
                                                <div className="admin-st-3c36f78c">
                                                    {dayAppts.slice(0, 5).map(apt => {
                                                        let dotColor = '#7c3aed'; // default: scheduled (dark purple)
                                                        if (apt.status === 'confirmed') dotColor = '#38bdf8';
                                                        else if (apt.status === 'pending') dotColor = '#f59e0b';
                                                        else if (apt.status === 'in_progress') dotColor = '#0284c7';
                                                        else if (apt.status === 'completed') dotColor = '#22c55e';
                                                        else if (apt.status === 'incomplete') dotColor = '#ef4444';
                                                        else if (apt.status === 'cancelled' || apt.status === 'rejected') dotColor = '#94a3b8';
                                                        return (
                                                            <div key={apt.id} style={{
                                                                width: '8px',
                                                                height: '8px',
                                                                borderRadius: '50%',
                                                                backgroundColor: dotColor
                                                            }} title={formatStatus(apt.status)} />
                                                        );
                                                    })}
                                                    {dayAppts.length > 5 && <span className="admin-st-ba210a9a">+</span>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="day-view-panel data-card">
                        <div className="day-view-header">
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>
                                {new Date(
                                    currentDate.getFullYear(),
                                    currentDate.getMonth(),
                                    selectedDay || 1
                                ).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </h3>
                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                {getAppointmentsForDate(selectedDay || 1).length} Bookings
                            </span>
                        </div>
                        <div className="day-view-body">
                            {getAppointmentsForDate(selectedDay || 1).map((apt, index) => (
                                <div
                                    key={apt.id}
                                    className="glass-card day-view-apt-card waterfall-item"
                                    style={{ animationDelay: `${index * 0.05}s` }}
                                    onClick={() => handleEdit(apt)}
                                    title="View appointment details"
                                >
                                    <div className="admin-st-a5c3808d">
                                        <div style={{
                                            width: '40px', height: '40px', borderRadius: '50%',
                                            backgroundColor: '#f1f5f9', overflow: 'hidden',
                                            border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                        }}>
                                            {apt.clientAvatar && apt.clientAvatar.length > 10 ? (
                                                <img 
                                                    src={apt.clientAvatar} 
                                                    alt="Profile" 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                    onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; const span = document.createElement('span'); span.style.cssText = 'font-size:14px;font-weight:bold;color:#94a3b8;'; span.textContent = (apt.clientName || '?').replace(/\(Guest\)/i,'').trim().split(' ').filter(p=>p).map((p,i,a)=> i===0||i===a.length-1?p[0]:'').filter(Boolean).join('').toUpperCase().substring(0,2); e.target.parentElement.appendChild(span); }}
                                                />
                                            ) : (
                                                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#94a3b8' }}>
                                                    {getInitials(apt.clientName)}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#be9055', fontFamily: 'monospace', letterSpacing: '0.02em', marginBottom: '2px' }}>
                                                #{getDisplayCode(apt.bookingCode, apt.id)}
                                            </span>
                                            <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.95rem' }}>
                                                {apt.clientName}
                                                {apt.isGuestPlaceholder && (
                                                    <span style={{
                                                        display: 'inline-block', marginLeft: '6px', padding: '1px 7px',
                                                        fontSize: '0.6rem', fontWeight: '700', borderRadius: '20px',
                                                        background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)',
                                                        color: '#b45309', border: '1px solid #f59e0b44',
                                                        verticalAlign: 'middle', letterSpacing: '0.02em'
                                                    }} title="This booking was made by an unregistered guest">GUEST</span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{apt.serviceType || 'Tattoo Session'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span className={`badge status-${getStatusColor(apt.status)}`} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                                {formatStatus(apt.status)}
                                            </span>
                                            {apt.hasPendingRescheduleRequest && (
                                                <span style={{
                                                    padding: '2px 6px', borderRadius: '6px', fontSize: '0.6rem',
                                                    fontWeight: 700, background: '#fffbeb', color: '#d97706',
                                                    border: '1px solid #fde68a'
                                                }}>
                                                    <RefreshCw size={10} />
                                                </span>
                                            )}
                                        </div>
                                        <span style={{ color: '#6366f1', fontWeight: '600', fontSize: '0.85rem' }}>{formatTime12Hour(apt.start_time || apt.time)}</span>
                                    </div>
                                </div>
                            ))}
                            {getAppointmentsForDate(selectedDay || 1).length === 0 && (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 1rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                    <Calendar size={32} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                                    No appointments scheduled for this date.
                                </div>
                            )}
                        </div>
                        <div className="day-view-footer">
                            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
                                handleAddNew(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDay || 1).padStart(2, '0')}`);
                            }}>
                                <Plus size={16} style={{ marginRight: '6px' }} /> Add Appointment
                            </button>
                        </div>
                    </div>
                    </div>
                ) : (
                    <>
                        <div className="premium-filter-bar premium-filter-bar--stacked" style={{ margin: '0 0 2rem 0' }}>
                            <div className="premium-search-box premium-search-box--full" style={{ position: 'relative' }} ref={searchRef}>
                                <Search size={16} className="text-muted" />
                                <input
                                    type="text"
                                    placeholder="Search appointments by ID, client, or artist..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setShowSuggestions(true);
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    style={{ width: '100%', paddingRight: '120px' }}
                                    maxLength={100}
                                />
                                {showSuggestions && searchTerm && searchSuggestions.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase())).length > 0 && (
                                    <div className="autocomplete-dropdown waterfall-dropdown">
                                        {searchSuggestions
                                            .filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
                                            .slice(0, 8)
                                            .map((suggestion, index) => (
                                                <div 
                                                    key={suggestion} 
                                                    className="autocomplete-item waterfall-item"
                                                    style={{ animationDelay: `${index * 0.05}s` }}
                                                    onClick={() => {
                                                        setSearchTerm(suggestion);
                                                        setShowSuggestions(false);
                                                    }}
                                                >
                                                    {suggestion}
                                                </div>
                                            ))}
                                    </div>
                                )}
                                {(searchTerm || statusFilter !== 'all' || serviceFilter !== 'all' || dateFilter || timePeriodFilter !== 'all') && (
                                    <button
                                        onClick={() => {
                                            setSearchTerm('');
                                            setQuickFilter('all');
                                            setStatusFilter('all');
                                            setServiceFilter('all');
                                            setDateFilter('');
                                            setTimePeriodFilter('all');
                                        }}
                                        className="btn btn-secondary"
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <X size={12} /> Clear Filters
                                    </button>
                                )}
                            </div>

                            <div className="premium-filters-row">
                                <CustomSelect 
                                    value={statusFilter} 
                                    onChange={setStatusFilter} 
                                    icon={Filter}
                                    label="Filter:"
                                    options={[
                                        { value: 'all', label: 'All Status' },
                                        { value: 'confirmed', label: 'Confirmed' },
                                        { value: 'scheduled', label: 'Scheduled' },
                                        { value: 'pending', label: 'Pending' },
                                        { value: 'completed', label: 'Completed' },
                                        { value: 'cancelled', label: 'Cancelled' },
                                        { value: 'rejected', label: 'Rejected' }
                                    ]}
                                />

                                <CustomSelect 
                                    value={serviceFilter} 
                                    onChange={setServiceFilter} 
                                    options={[
                                        { value: 'all', label: 'All Services' },
                                        { value: 'Tattoo Session', label: 'Tattoo Session' },
                                        { value: 'Consultation', label: 'Consultation' },
                                        { value: 'Piercing', label: 'Piercing' },
                                        { value: 'Follow-up', label: 'Follow-up' },
                                        { value: 'Touch-up', label: 'Touch-up' }
                                    ]}
                                />

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CustomSelect 
                                        value={timePeriodFilter} 
                                        onChange={(val) => { setTimePeriodFilter(val); if (val !== 'all') setDateFilter(''); }} 
                                        icon={Calendar}
                                        options={[
                                            { value: 'all', label: 'All Time' },
                                            { value: 'weekly', label: 'This Week' },
                                            { value: 'monthly', label: 'This Month' },
                                            { value: 'yearly', label: 'This Year' }
                                        ]}
                                    />
                                    <input
                                        type="date"
                                        value={dateFilter}
                                        onChange={(e) => { setDateFilter(e.target.value); if (e.target.value) setTimePeriodFilter('all'); }}
                                        className="custom-select-trigger"
                                        style={{ height: '38px', minWidth: '140px', color: dateFilter ? '#1e293b' : '#94a3b8' }}
                                        title="Select specific date"
                                    />
                                </div>

                                <CustomSelect 
                                    value={sortBy} 
                                    onChange={setSortBy} 
                                    icon={SlidersHorizontal}
                                    label="Sort:"
                                    options={[
                                        { value: 'date', label: 'Date' },
                                        { value: 'client', label: 'Client' },
                                        { value: 'artist', label: 'Artist' },
                                        { value: 'status', label: 'Status' }
                                    ]}
                                />
                            </div>
                        </div>

                        <div className="stats-row">
                            <div className="stat-item">
                                <span className="stat-label">Total Appointments</span>
                                <span className="stat-count">{appointments.length}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Scheduled</span>
                                <span className="stat-count">{appointments.filter(a => a.status === 'scheduled').length}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Completed</span>
                                <span className="stat-count">{appointments.filter(a => a.status === 'completed').length}</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-label">Pending</span>
                                <span className="stat-count">{appointments.filter(a => a.status === 'pending').length}</span>
                            </div>
                        </div>

                        <div className="table-card-container">
                            <div className="table-responsive">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Appointment ID</th>
                                            <th>Client Name</th>
                                            <th>Staff</th>
                                            <th>Service</th>
                                            <th>Date</th>
                                            <th>Time</th>
                                            <th>Status</th>
                                            <th>Payment</th>
                                            <th>Price</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan="10" className="no-data admin-st-3927920f">Loading appointments...</td></tr>
                                        ) : currentItems.length > 0 ? (
                                            currentItems.map((appointment) => (
                                                <tr key={appointment.id}>
                                                    <td data-label="Appointment ID">
                                                        <span style={{ fontFamily: 'monospace', fontWeight: '600', color: '#1e293b' }}>
                                                            {getDisplayCode(appointment.bookingCode, appointment.id)}
                                                        </span>
                                                    </td>
                                                    <td data-label="Client Name">
                                                        {appointment.clientName}
                                                        {appointment.isGuestPlaceholder && (
                                                            <span style={{
                                                                display: 'inline-block', marginLeft: '6px', padding: '1px 7px',
                                                                fontSize: '0.65rem', fontWeight: '700', borderRadius: '20px',
                                                                background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)',
                                                                color: '#b45309', border: '1px solid #f59e0b44',
                                                                verticalAlign: 'middle', letterSpacing: '0.02em'
                                                            }} title="This booking was made by an unregistered guest">GUEST</span>
                                                        )}
                                                    </td>
                                                    <td data-label="Staff">{appointment.artistName}</td>
                                                    <td data-label="Service" className="admin-st-775cebbf" title={appointment.serviceType}>
                                                        {appointment.serviceType}
                                                        {appointment.consultationMethod && (
                                                            <span style={{
                                                                display: 'inline-block', marginLeft: '6px', padding: '2px 8px',
                                                                borderRadius: '6px', fontSize: '0.7rem', fontWeight: '700',
                                                                background: appointment.consultationMethod === 'Face-to-Face' ? '#dcfce7' : '#ede9fe',
                                                                color: appointment.consultationMethod === 'Face-to-Face' ? '#166534' : '#5b21b6',
                                                                border: `1px solid ${appointment.consultationMethod === 'Face-to-Face' ? '#bbf7d0' : '#ddd6fe'}`,
                                                                verticalAlign: 'middle', whiteSpace: 'nowrap'
                                                            }}>
                                                                {appointment.consultationMethod}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td data-label="Date">{appointment.date}</td>
                                                    <td data-label="Time">{appointment.time}</td>
                                                    <td data-label="Status">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span className={`badge status-${getStatusColor(appointment.status || 'pending')}`}>
                                                                {appointment.status}
                                                            </span>
                                                            {appointment.hasPendingRescheduleRequest && (
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                                    padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem',
                                                                    fontWeight: 700, background: '#fffbeb', color: '#d97706',
                                                                    border: '1px solid #fde68a', whiteSpace: 'nowrap',
                                                                    animation: 'pulse 2s ease-in-out infinite'
                                                                }}>
                                                                    <RefreshCw size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> Resched.
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td data-label="Payment">
                                                        {appointment.paymentStatus === 'paid' ? (
                                                            <span className="badge status-confirmed admin-st-4c344c9a">Fully Paid</span>
                                                        ) : appointment.paymentStatus === 'downpayment_paid' ? (
                                                            <span className="badge admin-st-4a6cc9f0">Downpayment</span>
                                                        ) : appointment.price > 0 ? (
                                                            appointment.totalPaid >= appointment.price ? (
                                                                <span className="badge status-confirmed admin-st-4c344c9a">Fully Paid</span>
                                                            ) : appointment.totalPaid > 0 ? (
                                                                <span className="badge admin-st-4a6cc9f0">Balance: ₱{(appointment.price - appointment.totalPaid).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            ) : (
                                                                <span className="badge admin-st-07684bc7">Unpaid</span>
                                                            )
                                                        ) : (
                                                            <span className="badge admin-st-2d1fd819">No Charge</span>
                                                        )}
                                                    </td>
                                                    <td data-label="Price">₱{Number(appointment.price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                    <td data-label="Actions" className="actions-cell">
                                                        {appointment.status === 'pending' && (
                                                            <>
                                                                <button
                                                                    className="action-btn admin-st-bb9a2c41"
                                                                    onClick={() => handleStatusUpdate(appointment.id, 'confirmed', appointment.clientName)}
                                                                    title="Approve this pending appointment"
                                                                    style={{ background: 'rgba(16,185,129,0.12)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.35)' }}
                                                                >
                                                                    <Check size={14} />
                                                                </button>
                                                                <button
                                                                    className="action-btn admin-st-02e8d890"
                                                                    onClick={() => handleStatusUpdate(appointment.id, 'rejected', appointment.clientName)}
                                                                    title="Reject this pending appointment"
                                                                    style={{ background: 'rgba(239,68,68,0.10)', color: '#dc2626', border: '1.5px solid rgba(239,68,68,0.3)' }}
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {appointment.status?.toLowerCase() === 'confirmed' && (
                                                            <button
                                                                className="action-btn view-btn admin-st-5d943a90"
                                                                onClick={() => handleStatusUpdate(appointment.id, 'completed', appointment.clientName)}
                                                                title="Mark as Done"
                                                            >
                                                                <Check size={14} className="admin-st-da4d9cdd" />
                                                            </button>
                                                        )}
                                                        <button className="action-btn edit-btn" onClick={() => handleEdit(appointment)}>
                                                            Edit
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="10" className="no-data">No appointments found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                                itemsPerPage={itemsPerPage}
                                onItemsPerPageChange={(newVal) => {
                                    setItemsPerPage(newVal);
                                    setCurrentPage(1);
                                }}
                                totalItems={filteredAppointments.length}
                                unit="appointments"
                            />
                        </div>
                    </>
                )}

                {/* Archive Record Modal — Read-only view for completed sessions */}
                {appointmentModal.mounted && archiveMode && selectedAppointment && (
                    <div className={`modal-overlay ${appointmentModal.visible ? 'open' : ''}`} onClick={() => closeModal(true)}>
                        <div className="modal-content xl admin-st-980ed307" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="admin-flex-center admin-gap-20">
                                    <div className="admin-st-e836bc9c">
                                        <Image size={28} className="text-bronze" />
                                    </div>
                                    <div>
                                        <h2 className="admin-m-0">Archive Record: {selectedAppointment.clientName}</h2>
                                        <p className="admin-st-107902df">Project: {selectedAppointment.designTitle}</p>
                                    </div>
                                </div>
                                <button className="close-btn" onClick={() => closeModal(true)}><X size={24} /></button>
                            </div>

                            <div className="modal-body admin-st-92565e46">
                                <div className="admin-st-232d6dae">
                                    {/* Left Column: Visual Archive & Notes */}
                                    <div className="admin-st-14907636">
                                        {/* Performance Metrics Row */}
                                        <div className="admin-st-4155de1d">
                                            <div className="admin-st-6af16ee8">
                                                <label className="admin-st-8e71d7c8">Procedure Date</label>
                                                <div className="admin-st-e9a1fb1d">{selectedAppointment.date}</div>
                                                <div className="admin-st-76f4deed">Started at {selectedAppointment.time}</div>
                                            </div>
                                            <div className="admin-st-6af16ee8">
                                                <label className="admin-st-8e71d7c8">Primary Artist</label>
                                                <div className="admin-st-e9a1fb1d">{selectedAppointment.artistName}</div>
                                                <div className="admin-st-76f4deed">Senior Tattoo Artist</div>
                                            </div>
                                            <div className="admin-st-6af16ee8">
                                                <label className="admin-st-8e71d7c8">Session Duration</label>
                                                <div className="admin-st-e9a1fb1d" style={{ fontFamily: 'monospace' }}>{formatDuration(selectedAppointment.sessionDuration)}</div>
                                                <div className="admin-st-76f4deed">Total active time</div>
                                            </div>
                                            <div className="admin-st-306fe11e">
                                                <label className="admin-st-e634a3e2">Revenue Item</label>
                                                <div className="admin-st-7626e003">₱{selectedAppointment.price.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                <div className="admin-st-f6d8a8be">Payment Confirmed</div>
                                            </div>
                                        </div>

                                        {/* Visual Documentation */}
                                        <div className="admin-st-2f580e88">
                                            <div className="admin-st-02ffc1e1">
                                                <label className="admin-st-c3be2f4d">Before State</label>
                                                <div className="admin-st-e36c5fa1">
                                                    {selectedAppointment.beforePhoto ? (
                                                        <img src={selectedAppointment.beforePhoto} alt="Before" className="admin-st-9e218869 lightbox-trigger" onClick={() => setLightboxSrc(selectedAppointment.beforePhoto)} />
                                                    ) : (
                                                        <div className="admin-st-d8e4e0a4">
                                                            <Image size={32} className="admin-st-c4c91f37" />
                                                            <div className="admin-st-fb2a7115">No initial documentation</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="admin-st-02ffc1e1">
                                                <label className="admin-st-c3be2f4d">After State</label>
                                                <div className="admin-st-e36c5fa1">
                                                    {selectedAppointment.afterPhoto ? (
                                                        <img src={selectedAppointment.afterPhoto} alt="After" className="admin-st-9e218869 lightbox-trigger" onClick={() => setLightboxSrc(selectedAppointment.afterPhoto)} />
                                                    ) : (
                                                        <div className="admin-st-d8e4e0a4">
                                                            <Image size={32} className="admin-st-c4c91f37" />
                                                            <div className="admin-st-fb2a7115">No final documentation</div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Artist Notes Archive */}
                                        <div className="admin-st-02ffc1e1">
                                            <label className="admin-st-f7d8f00c">
                                                <FileText size={14} /> Procedure Narrative
                                            </label>
                                            <div className="admin-st-a5a703dd">
                                                {selectedAppointment.notes || 'No notes were recorded for this session.'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Logistics & Supplies */}
                                    <div className="admin-st-ff43421e">
                                        {/* Audit Trail */}
                                        {(() => {
                                            let parsedLog = [];
                                            try {
                                                if (selectedAppointment.auditLog) {
                                                    parsedLog = typeof selectedAppointment.auditLog === 'string' ? JSON.parse(selectedAppointment.auditLog) : selectedAppointment.auditLog;
                                                }
                                            } catch (e) { /* ignore parse errors */ }
                                            return parsedLog.length > 0 ? (
                                                <div className="admin-st-8f4d2ab5" style={{ marginBottom: '16px' }}>
                                                    <label className="admin-st-3092c0d2">
                                                        <List size={14} /> Session Audit Trail
                                                    </label>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginTop: '12px' }}>
                                                        {parsedLog.map((entry, idx) => (
                                                            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: idx < parsedLog.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.action && entry.action.includes('Started') ? '#10b981' : entry.action && entry.action.includes('Completed') ? '#6366f1' : entry.action && entry.action.includes('Paused') ? '#f59e0b' : entry.action && entry.action.includes('Aborted') ? '#ef4444' : '#3b82f6', marginTop: '5px', flexShrink: 0 }} />
                                                                <div style={{ flex: 1 }}>
                                                                    <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1e293b' }}>{entry.action}</span>
                                                                </div>
                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{entry.timestamp}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null;
                                        })()}

                                        <div className="admin-st-8f4d2ab5">
                                            <label className="admin-st-3092c0d2">
                                                <Package size={14} /> Logistics & Consumables
                                            </label>

                                            <div className="admin-st-6ece488c">
                                                {archiveMaterials.materials && archiveMaterials.materials.length > 0 ? (
                                                    <div className="admin-st-b8aaf979">
                                                        {archiveMaterials.materials.map((mat, idx) => (
                                                            <div key={idx} className="admin-st-432a8b30">
                                                                <div className="admin-st-19bd18ad">
                                                                    <span className="admin-st-34acc2e5">{mat.quantity}x {mat.item_name}</span>
                                                                    <span className="admin-st-fef01c14">Itemized Consumable</span>
                                                                </div>
                                                                <span className={`badge status-consumed admin-st-12e5feb7`} >{mat.status.toUpperCase()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="admin-st-998876b3">
                                                        <Package size={32} className="admin-st-f0ce07d4" />
                                                        <p className="admin-st-ab5697c1">No materials were itemized for this specific procedure.</p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="admin-st-0e3ab090">
                                                <div>
                                                    <div className="admin-st-3de2cbb8">Logistics Cost</div>
                                                    <div className="admin-st-0481d00f">₱{archiveMaterials.totalCost?.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 0}</div>
                                                </div>
                                                <div className="admin-st-7851dbc0">
                                                    <div className="admin-st-def2f630">{archiveMaterials.materials ? archiveMaterials.materials.length : 0}</div>
                                                    <div className="admin-st-3de2cbb8">Items Used</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        className="btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}
                                        onClick={() => {
                                            // Switch to editable mode
                                            setArchiveMode(false);
                                            setModalTab('details');
                                            const storedArtistId = selectedAppointment.artistId || selectedAppointment.artist_id;
                                            const isRealArtist = artists.some(a => String(a.id) === String(storedArtistId));
                                            setFormData({
                                                clientId: selectedAppointment.clientId || selectedAppointment.customer_id,
                                                artistId: isRealArtist ? storedArtistId : '',
                                                secondaryArtistId: selectedAppointment.secondary_artist_id || '',
                                                commissionSplit: selectedAppointment.commission_split || 50,
                                                serviceType: selectedAppointment.serviceType || selectedAppointment.service_type,
                                                designTitle: selectedAppointment.designTitle || selectedAppointment.design_title,
                                                date: selectedAppointment.date || selectedAppointment.appointment_date,
                                                time: selectedAppointment.time || selectedAppointment.start_time,
                                                status: selectedAppointment.status,
                                                paymentStatus: (!selectedAppointment.price || selectedAppointment.price <= 0) ? 'unpaid' : (selectedAppointment.paymentStatus || selectedAppointment.payment_status || 'unpaid'),
                                                notes: selectedAppointment.notes,
                                                price: selectedAppointment.price,
                                                beforePhoto: selectedAppointment.beforePhoto,
                                                referenceImage: selectedAppointment.referenceImage,
                                                manualPaidAmount: selectedAppointment.manualPaidAmount || 0,
                                                manualPaymentMethod: selectedAppointment.manualPaymentMethod || 'Cash',
                                                rejectionReason: selectedAppointment.rejectionReason || '',
                                                rescheduleReason: '',
                                                isReferral: !!selectedAppointment.isReferral,
                                                consultationNotes: selectedAppointment.consultationNotes || '',
                                                quotedPrice: selectedAppointment.quotedPrice || ''
                                            });
                                            setClientSearch(selectedAppointment.clientName);
                                            initialFormDataRef.current = null;
                                        }}
                                    >
                                        <FileText size={16} /> Edit Appointment
                                    </button>
                                    <button
                                        className="btn"
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' }}
                                        onClick={() => window.open(`/admin/appointments/${selectedAppointment.id}/print`, '_blank')}
                                    >
                                        <Printer size={16} /> Print Record
                                    </button>
                                    {selectedAppointment.waiverAcceptedAt && (
                                        <button
                                            className="btn"
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, rgba(190,144,85,0.12), rgba(190,144,85,0.06))', color: '#92400e', borderColor: 'rgba(190,144,85,0.3)' }}
                                            onClick={() => window.open(`/admin/appointments/${selectedAppointment.id}/waiver`, '_blank')}
                                        >
                                            <ShieldCheck size={16} /> View Waiver
                                        </button>
                                    )}
                                </div>
                                <button className="btn btn-primary admin-st-6948e5f9" onClick={() => closeModal(true)}>Done Reviewing</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Appointment Modal (Editable) */}
                {appointmentModal.mounted && !archiveMode && (
                    <div className={`modal-overlay ${appointmentModal.visible ? 'open' : ''}`} onClick={() => closeModal()}>
                        <div className="modal-content xl" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="admin-st-15246701">
                                    <div className="admin-st-18a02d52">
                                        <h2 className="admin-m-0">{selectedAppointment ? `Edit Appointment ${getDisplayCode(selectedAppointment.bookingCode, selectedAppointment.id)}` : 'New Appointment'}</h2>
                                        <div className="modal-tabs">
                                            <button
                                                className={`modal-tab-btn ${modalTab === 'details' ? 'active' : ''}`}
                                                onClick={() => setModalTab('details')}
                                            >
                                                <Info size={16} /> Details
                                            </button>
                                            <button
                                                className={`modal-tab-btn ${modalTab === 'pricing' ? 'active' : ''}`}
                                                onClick={() => setModalTab('pricing')}
                                            >
                                                <PhilippinePeso size={16} /> Pricing
                                            </button>
                                            <button
                                                className={`modal-tab-btn ${modalTab === 'notes' ? 'active' : ''}`}
                                                onClick={() => setModalTab('notes')}
                                            >
                                                <FileText size={16} /> Session Log
                                            </button>
                                        </div>
                                    </div>
                                    <div className="admin-st-f21b09cf">
                                        <span className={`badge status-${getStatusColor(formData.status)}`}>{formData.status}</span>
                                        {selectedAppointment && selectedAppointment.price > 0 && (
                                            <div className="badge admin-st-d2713882">
                                                <span>Paid: ₱{Number(selectedAppointment.totalPaid).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ₱{Number(formData.price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                {selectedAppointment.totalPaid < formData.price && (
                                                    <span className="admin-st-14a76a5d">(Bal: ₱{(Number(formData.price) - Number(selectedAppointment.totalPaid)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button className="close-btn" onClick={() => closeModal()}><X size={24} /></button>
                            </div>
                            <div className="modal-body">
                                {/* Reschedule Request Decision Panel */}
                                {pendingRescheduleRequest && pendingRescheduleRequest.status === 'pending' && (
                                    <div style={{
                                        margin: '0 0 20px',
                                        padding: '16px 20px',
                                        borderRadius: '12px',
                                        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                                        border: '1px solid #fde68a',
                                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
                                        animation: 'fadeIn 0.3s ease'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                            <div style={{
                                                width: '40px', height: '40px', borderRadius: '50%',
                                                background: '#fef3c7', border: '2px solid #f59e0b',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                            }}>
                                                <Clock size={20} color="#d97706" />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#92400e' }}>
                                                    <RefreshCw size={16} style={{ display: 'inline', verticalAlign: '-2px' }} /> Reschedule Request Pending
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#b45309' }}>
                                                    From: <strong>{pendingRescheduleRequest.customer_name}</strong> — submitted {new Date(pendingRescheduleRequest.created_at).toLocaleString()}
                                                </div>
                                            </div>
                                            {pendingRescheduleRequest.seconds_remaining > 0 && (
                                                <div style={{
                                                    marginLeft: 'auto', padding: '4px 12px', borderRadius: '8px',
                                                    background: '#fef3c7', border: '1px solid #fcd34d',
                                                    fontSize: '0.8rem', fontWeight: 700, color: '#d97706', whiteSpace: 'nowrap'
                                                }}>
                                                    <Clock size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {Math.floor(pendingRescheduleRequest.seconds_remaining / 3600)}h {Math.floor((pendingRescheduleRequest.seconds_remaining % 3600) / 60)}m left
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid-2col" style={{ gap: '12px', marginBottom: '14px' }}>
                                            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.8)', border: '1px solid #fde68a' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requested Date</div>
                                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                                                    {new Date(pendingRescheduleRequest.requested_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                                    {pendingRescheduleRequest.requested_time && ` at ${pendingRescheduleRequest.requested_time}`}
                                                </div>
                                            </div>
                                            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.8)', border: '1px solid #fde68a' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason</div>
                                                <div style={{ fontSize: '0.9rem', color: '#1e293b' }}>{pendingRescheduleRequest.reason}</div>
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: '12px' }}>
                                            <label style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Admin Notes (optional)</label>
                                            <textarea
                                                value={rescheduleRequestNotes}
                                                onChange={(e) => setRescheduleRequestNotes(e.target.value)}
                                                placeholder="Add a note for the customer (visible if rejected)..."
                                                rows={2}
                                                maxLength={500}
                                                style={{
                                                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                                                    border: '1px solid #fde68a', fontSize: '0.85rem', color: '#1e293b',
                                                    background: 'rgba(255,255,255,0.9)', resize: 'vertical',
                                                    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box'
                                                }}
                                            />
                                        </div>

                                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-secondary"
                                                disabled={rescheduleRequestDeciding}
                                                onClick={() => handleRescheduleRequestDecision('reject')}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', borderColor: '#fca5a5', background: '#fef2f2' }}
                                            >
                                                <X size={16} /> Reject Request
                                            </button>
                                            <button
                                                className="btn btn-primary"
                                                disabled={rescheduleRequestDeciding}
                                                onClick={() => handleRescheduleRequestDecision('approve')}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#16a34a', border: 'none' }}
                                            >
                                                <Check size={16} /> {rescheduleRequestDeciding ? 'Processing...' : 'Approve & Reschedule'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {modalTab === 'details' && (
                                    <>
                                    {/* B-4: Project Timeline — shown when the open appointment is part of a project */}
                                    {selectedAppointment?.project_id && (
                                        <SessionTimeline
                                            project={projectTimeline}
                                            currentSessionId={selectedAppointment?.id}
                                            isAdmin={true}
                                            loading={projectTimelineLoading}
                                            onProjectUpdated={() => {
                                                fetchProjectTimeline(selectedAppointment.project_id);
                                                fetchAppointments();
                                            }}
                                        />
                                    )}
                                    <div className="grid-3col" style={{ gap: '24px', alignItems: 'stretch' }}>
                                        {/* Left Column: People & Service */}
                                        <div className="admin-st-d295c8d6" style={{ justifyContent: 'flex-start' }}>
                                            <div>
                                                <label className="premium-input-label">Client Information</label>
                                                {formData.clientId ? (
                                                    <div className="admin-st-013bb379" style={{ padding: '12px', alignItems: 'center' }}>
                                                        <div className="admin-st-b0dbc89c" style={{ gap: '16px' }}>
                                                            {selectedAppointment && selectedAppointment.clientAvatar ? (
                                                                <div style={{
                                                                    width: '44px', height: '44px', borderRadius: '50%',
                                                                    backgroundColor: '#f1f5f9', overflow: 'hidden',
                                                                    border: '2px solid white', boxShadow: '0 2px 4px -1px rgba(0,0,0,0.1)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                                }}>
                                                                    <img src={selectedAppointment.clientAvatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                </div>
                                                            ) : (
                                                                <div style={{
                                                                    width: '44px', height: '44px', borderRadius: '50%',
                                                                    backgroundColor: '#f1f5f9', overflow: 'hidden',
                                                                    border: '2px solid white', boxShadow: '0 2px 4px -1px rgba(0,0,0,0.1)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                                }}>
                                                                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#be9055' }}>
                                                                        {getInitials(clients.find(c => c.id == formData.clientId)?.name || clientSearch)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <span className="admin-st-0e40c814" style={{ fontSize: '0.95rem', fontWeight: '600' }}>
                                                                {clients.find(c => c.id == formData.clientId)?.name || clientSearch}
                                                            </span>
                                                        </div>
                                                        <button type="button" onClick={() => { setFormData(prev => ({ ...prev, clientId: null })); setClientSearch(''); }} className="admin-st-f32d59a5">
                                                            <X size={20} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="admin-st-d85c4e64">
                                                        <div className="premium-search-box admin-st-c7f79b45">
                                                            <Search size={18} />
                                                            <input
                                                                type="text"
                                                                placeholder="Search for a client..."
                                                                value={clientSearch}
                                                                onChange={(e) => setClientSearch(e.target.value)}
                                                                onFocus={() => setClientDropdownOpen(true)}
                                                                onBlur={() => setTimeout(() => setClientDropdownOpen(false), 200)}
                                                                maxLength={100}
                                                            />
                                                        </div>
                                                        {(clientDropdownOpen || clientSearch) && (
                                                            <div className="glass-card admin-st-83ac1cb2">
                                                                {clients.filter(c => c.name && c.name.toLowerCase().includes(clientSearch.toLowerCase())).map(c => (
                                                                    <div key={c.id} className="admin-st-824731e9" onClick={() => { setFormData({ ...formData, clientId: c.id }); setClientSearch(c.name); }}>
                                                                        <User size={16} color="#be9055" />
                                                                        <span className="admin-st-9d3db44b">{c.name}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Health & Safety — EDIT MODE: client has data */}
                                            {selectedAppointment && (selectedAppointment.clientHealthConditions?.length > 0 || selectedAppointment.clientAllergens?.length > 0) && (
                                                <div style={{
                                                    marginTop: '12px', padding: '14px 16px', borderRadius: '12px',
                                                    background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                                                    border: '1.5px solid #fed7aa', boxShadow: '0 2px 8px rgba(249,115,22,0.1)'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                        <ShieldAlert size={16} color="#ea580c" />
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Health &amp; Safety</span>
                                                    </div>
                                                    {selectedAppointment.clientHealthConditions?.length > 0 && (
                                                        <div style={{ marginBottom: '8px' }}>
                                                            <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Health Conditions</p>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                                {selectedAppointment.clientHealthConditions.map(c => (
                                                                    <span key={c} style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(190,144,85,0.15)', border: '1.5px solid rgba(190,144,85,0.4)', color: '#92400e' }}>{c}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {selectedAppointment.clientAllergens?.length > 0 && (
                                                        <div>
                                                            <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Known Allergens</p>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                                {selectedAppointment.clientAllergens.map(a => (
                                                                    <span key={a} style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>{a}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Health & Safety — EDIT MODE: client has no data on file */}
                                            {selectedAppointment && selectedAppointment.clientHealthConditions?.length === 0 && selectedAppointment.clientAllergens?.length === 0 && formData.clientId && (
                                                <div style={{
                                                    marginTop: '12px', padding: '10px 14px', borderRadius: '10px',
                                                    background: '#f8fafc', border: '1px dashed #cbd5e1',
                                                    display: 'flex', alignItems: 'center', gap: '8px'
                                                }}>
                                                    <Heart size={14} color="#94a3b8" />
                                                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>No health or allergy data on file for this client.</span>
                                                </div>
                                            )}

                                            {/* Health & Safety — CREATE MODE: fetched data display or reminder */}
                                            {!selectedAppointment && formData.clientId && clientHealthData.loaded && (
                                                clientHealthData.conditions.length > 0 || clientHealthData.allergens.length > 0 ? (
                                                    // Client has health data — show it as an alert
                                                    <div style={{
                                                        marginTop: '12px', padding: '14px 16px', borderRadius: '12px',
                                                        background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                                                        border: '1.5px solid #fed7aa', boxShadow: '0 2px 8px rgba(249,115,22,0.1)'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                                            <ShieldAlert size={16} color="#ea580c" />
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Health &amp; Safety</span>
                                                        </div>
                                                        {clientHealthData.conditions.length > 0 && (
                                                            <div style={{ marginBottom: '8px' }}>
                                                                <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Health Conditions</p>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                                    {clientHealthData.conditions.map(c => (
                                                                        <span key={c} style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(190,144,85,0.15)', border: '1.5px solid rgba(190,144,85,0.4)', color: '#92400e' }}>{c}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {clientHealthData.allergens.length > 0 && (
                                                            <div>
                                                                <p style={{ margin: '0 0 6px', fontSize: '0.72rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Known Allergens</p>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                                    {clientHealthData.allergens.map(a => (
                                                                        <span key={a} style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>{a}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    // No health data on file — show a soft reminder to ask verbally
                                                    <div style={{
                                                        marginTop: '12px', padding: '12px 14px', borderRadius: '10px',
                                                        background: 'linear-gradient(135deg, #fffbeb 0%, #fef9c3 100%)',
                                                        border: '1.5px solid #fde68a',
                                                        display: 'flex', alignItems: 'flex-start', gap: '10px'
                                                    }}>
                                                        <Heart size={15} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
                                                        <div>
                                                            <p style={{ margin: '0 0 3px', fontSize: '0.8rem', fontWeight: 700, color: '#92400e' }}>Health Reminder</p>
                                                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#b45309', lineHeight: 1.5 }}>
                                                                This client has no health or allergy data on file. Please verbally ask them about any known conditions or allergens before scheduling.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )
                                            )}

                                            {/* Loading state while fetching */}
                                            {!selectedAppointment && formData.clientId && clientHealthData.loading && (
                                                <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Heart size={14} color="#94a3b8" />
                                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Checking health profile...</span>
                                                </div>
                                            )}

                                            <div>
                                                <label className="premium-input-label">Service Details</label>
                                                <div>
                                                    <div className="admin-st-fefecdf0">
                                                        <div className="premium-input-group">
                                                            <label className={`admin-st-b8618eb2 ${errors.serviceType ? 'text-red-500' : ''}`}>Service Type *</label>
                                                            <select value={formData.serviceType} onChange={(e) => handleInputChange('serviceType', e.target.value)} className={`premium-select-v2 ${errors.serviceType ? 'border-red-500 bg-red-50' : ''}`}>
                                                                <option value="Tattoo Session">Tattoo Session</option>
                                                                <option value="Consultation">Consultation</option>
                                                                <option value="Piercing">Piercing</option>
                                                                <option value="Tattoo + Piercing">Tattoo + Piercing</option>
                                                                <option value="Touch-up">Touch-up</option>
                                                            </select>
                                                            {errors.serviceType && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>{errors.serviceType}</span>}
                                                        </div>
                                                        <div className="premium-input-group">
                                                            <label className={`admin-st-b8618eb2 ${errors.designTitle ? 'text-red-500' : ''}`}>Design / Idea</label>
                                                            <input type="text" value={formData.designTitle} onChange={(e) => handleInputChange('designTitle', filterName(e.target.value).slice(0, 50))} maxLength={50} className={`premium-input-v2 ${errors.designTitle ? 'border-red-500 bg-red-50' : ''}`} placeholder="e.g. Neo-Trad" />
                                                            {errors.designTitle && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>{errors.designTitle}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Consultation Method badge (visible when it exists) */}
                                                {selectedAppointment?.consultationMethod && (
                                                    <div style={{
                                                        marginTop: '12px', padding: '12px 16px', borderRadius: '10px',
                                                        background: selectedAppointment.consultationMethod === 'Face-to-Face' ? '#f0fdf4' : '#f5f3ff',
                                                        border: `1px solid ${selectedAppointment.consultationMethod === 'Face-to-Face' ? '#bbf7d0' : '#ddd6fe'}`,
                                                        display: 'flex', alignItems: 'center', gap: '10px'
                                                    }}>
                                                        <span style={{
                                                            padding: '4px 10px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700',
                                                            background: selectedAppointment.consultationMethod === 'Face-to-Face' ? '#dcfce7' : '#ede9fe',
                                                            color: selectedAppointment.consultationMethod === 'Face-to-Face' ? '#166534' : '#5b21b6'
                                                        }}>
                                                            {selectedAppointment.consultationMethod}
                                                        </span>
                                                        <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: '500' }}>
                                                            {selectedAppointment.consultationMethod === 'Face-to-Face'
                                                                ? 'Customer will visit the studio in person'
                                                                : `Customer prefers to be contacted via ${selectedAppointment.consultationMethod.replace('Online (', '').replace(')', '') || 'messaging'}`}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Column 2: Staff & Schedule */}
                                        <div className="admin-st-d295c8d6" style={{ justifyContent: 'flex-start' }}>
                                            <div>
                                                <label className="premium-input-label">Staff Assignment</label>
                                                {(() => {
                                                    const isDualService = formData.serviceType === 'Tattoo + Piercing';
                                                    const isDualConsultation = formData.serviceType === 'Consultation' && (formData.notes || '').toLowerCase().includes('piercing');
                                                    const requiresDualStaff = isDualService || isDualConsultation;
                                                    const primaryLabel = isDualService
                                                        ? <span><Syringe size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Tattoo Artist <span style={{ color: '#ef4444' }}>*</span></span>
                                                        : <span>Primary Staff <span style={{ color: '#ef4444' }}>*</span></span>;
                                                    const secondaryLabel = isDualService
                                                        ? <span><Wrench size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Piercer <span style={{ color: '#ef4444' }}>*</span></span>
                                                        : requiresDualStaff
                                                            ? <span>Secondary Staff <span style={{ color: '#ef4444' }}>*</span></span>
                                                            : 'Tattoo Artist 2';
                                                    return (
                                                <div>
                                                    <div className="admin-st-fefecdf0">
                                                        <div className="premium-input-group">
                                                            <label className="admin-st-b8618eb2">{primaryLabel}</label>
                                                            <select value={formData.artistId} onChange={(e) => handleInputChange('artistId', e.target.value)} className="premium-select-v2">
                                                                <option value="">Select Staff</option>
                                                                {artists.map(a => <option key={a.id} value={a.id}>{a.name}{a.specialization ? ` — ${a.specialization}` : ''}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="premium-input-group">
                                                            <label className="admin-st-b8618eb2" style={{ whiteSpace: 'nowrap' }}>
                                                                {secondaryLabel}
                                                                {selectedAppointment?.status === 'completed' && <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: '4px', fontWeight: 500 }}>(Locked)</span>}
                                                            </label>
                                                            <select value={formData.secondaryArtistId || ''} onChange={(e) => handleInputChange('secondaryArtistId', e.target.value)} className="premium-select-v2" disabled={selectedAppointment?.status === 'completed'}
                                                                style={requiresDualStaff && !formData.secondaryArtistId ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px rgba(245,158,11,0.15)' } : {}}
                                                            >
                                                                <option value="">{requiresDualStaff ? 'Select Staff (Required)' : 'None (Solo)'}</option>
                                                                {artists.map(a => <option key={a.id} value={a.id}>{a.name}{a.specialization ? ` — ${a.specialization}` : ''}</option>)}
                                                            </select>
                                                            {requiresDualStaff && (
                                                                <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600, marginTop: '4px', display: 'block' }}>
                                                                    <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Dual topic selected
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {/* Commission split slider: only for collab tattoo sessions (NOT for Tattoo + Piercing dual-service) */}
                                                    {formData.secondaryArtistId && formData.serviceType !== 'Consultation' && formData.serviceType !== 'Tattoo + Piercing' && (
                                                        <div className="admin-st-953ba7ac">
                                                            <label className="admin-st-15b3be7e">Split % (Artist 1/Artist 2):</label>
                                                            <input type="number" min="1" max="99" value={formData.commissionSplit} onChange={(e) => setFormData({ ...formData, commissionSplit: clampNumber(e.target.value, 1, 99) })} className="premium-input-v2 admin-st-e070afd8" disabled={selectedAppointment?.status === 'completed'} />
                                                            <span className="admin-st-7206c648">/ {100 - (formData.commissionSplit || 0)}</span>
                                                        </div>
                                                    )}
                                                    {/* Dual-service note: commission is per-service-line */}
                                                    {formData.secondaryArtistId && formData.serviceType === 'Tattoo + Piercing' && (
                                                        <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.75rem', color: '#166534', fontWeight: 500 }}>
                                                            <CheckCircle size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> Commission calculated per service line — Tattoo Artist earns from tattoo quote, Piercer earns from piercing quote.
                                                        </div>
                                                    )}
                                                </div>
                                                    );
                                                })()}

                                                {/* ── Artist Referral ── */}
                                                {(() => {
                                                    const isSolo = !formData.secondaryArtistId || String(formData.secondaryArtistId) === '' || String(formData.secondaryArtistId) === 'null';
                                                    const isCompleted = selectedAppointment?.status === 'completed';
                                                    const canToggle = isSolo && !isCompleted;

                                                    const handleReferralToggle = (e) => {
                                                        const newValue = e.target.checked;
                                                        const newSplit = newValue ? '70% Artist / 30% Studio' : '30% Artist / 70% Studio';
                                                        showConfirm(
                                                            newValue ? 'Enable Artist Referral' : 'Remove Artist Referral',
                                                            `This will change the commission split to ${newSplit}. Proceed?`,
                                                            () => {
                                                                handleInputChange('isReferral', newValue);
                                                                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                                                            }
                                                        );
                                                    };

                                                    return (
                                                        <div className="premium-input-group" style={{ marginTop: '8px' }}>
                                                            <label className="admin-st-b8618eb2">Commission</label>
                                                            <label style={{
                                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                                padding: '10px 14px',
                                                                background: '#f8fafc',
                                                                border: `1px solid ${formData.isReferral ? 'rgba(16, 185, 129, 0.35)' : '#e2e8f0'}`,
                                                                borderRadius: '12px',
                                                                cursor: canToggle ? 'pointer' : 'not-allowed',
                                                                opacity: canToggle ? 1 : 0.45,
                                                                transition: 'all 0.2s ease',
                                                                fontSize: '0.88rem', fontWeight: 500,
                                                                color: '#1e293b'
                                                            }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!formData.isReferral}
                                                                    onChange={canToggle ? handleReferralToggle : undefined}
                                                                    disabled={!canToggle}
                                                                    style={{ accentColor: '#10b981', width: '16px', height: '16px', cursor: canToggle ? 'pointer' : 'not-allowed' }}
                                                                />
                                                                <span>Artist Referral</span>
                                                                {formData.isReferral && (
                                                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>70/30</span>
                                                                )}
                                                            </label>
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            <div>
                                                    <label className="premium-input-label">
                                                        <Clock size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                                                        Booking Date & Time
                                                    </label>
                                                    {selectedAppointment ? (
                                                        /* ── Read-only info cards for existing appointments ── */
                                                        <div>
                                                            <div className="grid-2col" style={{ gap: '12px', alignItems: 'stretch' }}>
                                                                <div style={{
                                                                    background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0',
                                                                    padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px'
                                                                }}>
                                                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Scheduled Date</span>
                                                                    <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>
                                                                        {formData.date ? new Date(formData.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                                                    </span>
                                                                </div>
                                                                {formData.time && (
                                                                    <div style={{
                                                                        background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0',
                                                                        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px'
                                                                    }}>
                                                                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Time Slot</span>
                                                                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e293b' }}>
                                                                            {(() => { const [h, m] = formData.time.split(':'); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; })()}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* ── Editable inputs for new appointments ── */
                                                        <div>
                                                            <div className="admin-st-fefecdf0">
                                                                <div className="premium-input-group">
                                                                    <label className={`admin-st-b8618eb2 ${errors.date ? 'text-red-500' : ''}`}>Date *</label>
                                                                    <input type="date" value={formData.date} onChange={(e) => handleInputChange('date', e.target.value)} className={`premium-input-v2 ${errors.date ? 'border-red-500 bg-red-50' : ''}`} />
                                                                    {errors.date && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>{errors.date}</span>}
                                                                </div>
                                                                {formData.serviceType === 'Consultation' && (
                                                                    <div className="premium-input-group">
                                                                        <label className={`admin-st-b8618eb2 ${errors.time ? 'text-red-500' : ''}`}>Time *</label>
                                                                        <input type="time" value={formData.time} onChange={(e) => handleInputChange('time', e.target.value)} className={`premium-input-v2 ${errors.time ? 'border-red-500 bg-red-50' : ''}`} />
                                                                        {errors.time && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>{errors.time}</span>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                        </div>

                                        {/* Column 3: Status */}
                                        <div className="admin-st-d295c8d6" style={{ justifyContent: 'flex-start' }}>
                                            <div>
                                                <label className="premium-input-label">Booking Status</label>
                                                <div>
                                                    <div className="premium-input-group">
                                                        <label className="admin-st-b8618eb2">Booking Status</label>
                                                        <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="premium-select-v2">
                                                            <option value="pending">Pending Review</option>
                                                            <option value="confirmed">Confirmed</option>
                                                            <option value="completed">Completed</option>
                                                            <option value="cancelled">Cancelled</option>
                                                            <option value="rejected">Rejected</option>
                                                        </select>
                                                    </div>
                                                    {formData.status === 'rejected' && (
                                                        <div className="premium-input-group" style={{ marginTop: '12px' }}>
                                                            <label className="admin-st-b8618eb2">Rejection Reason</label>
                                                            <textarea
                                                                className="premium-input-v2"
                                                                style={{ minHeight: '80px', resize: 'vertical' }}
                                                                maxLength="500"
                                                                value={formData.rejectionReason || ''}
                                                                onChange={(e) => setFormData({ ...formData, rejectionReason: e.target.value })}
                                                                placeholder="Please provide a reason for rejecting this appointment (Sent to customer)"
                                                            />
                                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right', marginTop: '4px' }}>
                                                                {formData.rejectionReason ? formData.rejectionReason.length : 0}/500 characters
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* --- PIERCING JEWELRY SELECTIONS (read-only info panel) --- */}
                                        {(() => {
                                            let jewels = [];
                                            try {
                                                const raw = selectedAppointment?.piercingJewelry || selectedAppointment?.piercing_jewelry;
                                                if (raw) jewels = typeof raw === 'string' ? JSON.parse(raw) : raw;
                                            } catch (e) { /* ignore */ }
                                            if (!Array.isArray(jewels) || jewels.length === 0) return null;
                                            return (
                                                <div style={{ gridColumn: '1 / -1', marginTop: '4px', padding: '18px 20px', background: 'linear-gradient(135deg, rgba(190,144,85,0.06) 0%, rgba(190,144,85,0.02) 100%)', border: '1.5px solid rgba(190,144,85,0.25)', borderRadius: '14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                                                        <Gem size={18} color="#be9055" />
                                                        <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.9rem' }}>Piercing Jewelry Selections</span>
                                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '20px', background: 'rgba(190,144,85,0.15)', color: '#be9055', fontWeight: '700' }}>
                                                            {jewels.filter(j => j.type === 'studio').length > 0
                                                                ? `${jewels.filter(j => j.type === 'studio').length} studio item(s) — auto-held on confirm`
                                                                : 'Client brings own jewelry'}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                                        {jewels.map((j, idx) => (
                                                            <div key={idx} style={{ background: 'white', borderRadius: '10px', padding: '12px 14px', border: `1.5px solid ${j.type === 'studio' ? 'rgba(190,144,85,0.3)' : '#e2e8f0'}`, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                                    <Gem size={12} color="#be9055" />
                                                                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#1e293b' }}>{j.bodyPart}</span>
                                                                </div>
                                                                {j.type === 'studio' ? (
                                                                    <>
                                                                        <span style={{ fontSize: '0.82rem', color: '#334155', fontWeight: '600' }}>{j.itemName}</span>
                                                                        <span style={{ fontSize: '0.78rem', color: '#be9055', fontWeight: '700' }}>₱{parseFloat(j.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                                                        <span style={{ fontSize: '0.68rem', fontWeight: '700', marginTop: '2px', padding: '2px 6px', borderRadius: '6px', alignSelf: 'flex-start', background: ['confirmed','in_progress','completed'].includes(selectedAppointment?.status) ? '#f0fdf4' : '#fef9f2', color: ['confirmed','in_progress','completed'].includes(selectedAppointment?.status) ? '#166534' : '#92400e' }}>
                                                                            {['confirmed','in_progress','completed'].includes(selectedAppointment?.status) ? 'Stock Held' : 'Pending Hold'}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>Client will bring own jewelry</span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    </>
                                )}



                                {modalTab === 'pricing' && (
                                    /* Pricing Tab View */
                                    <div className="fade-in admin-st-9628d1ce">
                                        <div className="admin-st-dd4f6313">
                                            <div className="admin-st-e5b0a825">
                                                {/* Dual-service: show split price inputs */}
                                                {formData.serviceType === 'Tattoo + Piercing' ? (
                                                    <>
                                                        <div className="form-group">
                                                            <label className={`admin-st-6ad161f7 ${errors.tattooPrice ? 'text-red-500' : ''}`}><Syringe size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Tattoo Quote (₱) *</label>
                                                            <input 
                                                                type="text" 
                                                                inputMode="numeric"
                                                                value={formData.tattooPrice === 0 || formData.tattooPrice === '0' ? '' : formData.tattooPrice} 
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                                                    const val = raw === '' ? 0 : Number(raw);
                                                                    setFormData(prev => ({ ...prev, tattooPrice: val, price: val + (Number(prev.piercingPrice) || 0) }));
                                                                }} 
                                                                placeholder="e.g. 5000"
                                                                className={`premium-input-v2 admin-st-1a49bbe7 ${errors.tattooPrice ? 'border-red-500 bg-red-50' : ''}`} 
                                                            />
                                                            {errors.tattooPrice && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>{errors.tattooPrice}</span>}
                                                        </div>
                                                        <div className="form-group">
                                                            <label className={`admin-st-6ad161f7 ${errors.piercingPrice ? 'text-red-500' : ''}`}><Wrench size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Piercing Quote (₱) *</label>
                                                            <input 
                                                                type="text" 
                                                                inputMode="numeric"
                                                                value={formData.piercingPrice === 0 || formData.piercingPrice === '0' ? '' : formData.piercingPrice} 
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                                                    const val = raw === '' ? 0 : Number(raw);
                                                                    setFormData(prev => ({ ...prev, piercingPrice: val, price: (Number(prev.tattooPrice) || 0) + val }));
                                                                }} 
                                                                placeholder="e.g. 2500"
                                                                className={`premium-input-v2 admin-st-1a49bbe7 ${errors.piercingPrice ? 'border-red-500 bg-red-50' : ''}`} 
                                                            />
                                                            {errors.piercingPrice && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>{errors.piercingPrice}</span>}
                                                        </div>
                                                        {/* Auto-computed total display */}
                                                        <div style={{ gridColumn: '1 / -1', marginTop: '4px', padding: '12px 16px', borderRadius: '10px', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Combined Total:</span>
                                                                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>₱{Number(formData.price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                            {formData.secondaryArtistId && (Number(formData.tattooPrice) > 0 || Number(formData.piercingPrice) > 0) && (
                                                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b' }}>
                                                                        <span><Syringe size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {artists.find(a => String(a.id) === String(formData.artistId))?.name || 'Tattoo Artist'} earns (30%):</span>
                                                                        <span style={{ fontWeight: 600, color: '#059669' }}>₱{(Number(formData.tattooPrice) * 0.30).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b' }}>
                                                                        <span><Wrench size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {artists.find(a => String(a.id) === String(formData.secondaryArtistId))?.name || 'Piercer'} earns (30%):</span>
                                                                        <span style={{ fontWeight: 600, color: '#059669' }}>₱{(Number(formData.piercingPrice) * 0.30).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div className="form-group">
                                                        <label className={`admin-st-6ad161f7 ${errors.price ? 'text-red-500' : ''}`}>Total Quote (₱) *</label>
                                                        <input 
                                                            type="text" 
                                                            inputMode="numeric"
                                                            value={formData.price === 0 || formData.price === '0' ? '' : formData.price} 
                                                            onChange={(e) => {
                                                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                                                handleInputChange('price', raw === '' ? 0 : Number(raw));
                                                            }} 
                                                            placeholder="e.g. 5000"
                                                            className={`premium-input-v2 admin-st-1a49bbe7 ${errors.price ? 'border-red-500 bg-red-50' : ''}`} 
                                                        />
                                                        {errors.price && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>{errors.price}</span>}
                                                    </div>
                                                )}
                                                <div className="form-group">
                                                    <label className="admin-st-6ad161f7">Payment Strategy</label>
                                                    <select value={formData.paymentStatus} onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })} className="premium-select-v2 admin-st-c8e7c63b">
                                                        <option value="unpaid">Draft (Unquoted)</option>
                                                        <option value="downpayment_paid">Downpayment Collected</option>
                                                        <option value="paid">Fully Paid</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {selectedAppointment && (
                                                <div className="admin-st-4344b743">
                                                    <div className="admin-st-7c85a4a1">
                                                        <span className="admin-st-9e124000">Total Collected:</span>
                                                        <span className="admin-st-3947f0f7">₱{Number(selectedAppointment.totalPaid).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div className="admin-st-ddde571d">
                                                        <span className="admin-st-9e124000">Remaining Balance:</span>
                                                        <span className="admin-st-da5d65cf">₱{Math.max(0, Number(formData.price) - Number(selectedAppointment.totalPaid)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="admin-st-422e3858">
                                                <button className="btn admin-st-c52b9668" onClick={() => setModalTab('details')}>Back to Details</button>

                                                {formData.price > 0 && formData.paymentStatus === 'unpaid' && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-primary admin-st-2b208132"
                                                        onClick={() => {
                                                            showAlert('Payment Link Sent', `A digital payment checkout link for ₱${formData.price.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} has been routed to the client.`, 'success');
                                                        }}
                                                    >
                                                        <CreditCard size={20} /> Request Digital Payment
                                                    </button>
                                                )}

                                                {selectedAppointment && (
                                                    <button className="btn btn-primary admin-st-f9f5beee" onClick={() => setManualPaymentModal({ isOpen: true, amount: Math.max(0, formData.price - selectedAppointment.totalPaid), method: 'Cash' })}>
                                                        <PhilippinePeso size={20} /> Record Manual Payment
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {modalTab === 'notes' && (
                                    /* Session Log Tab View */
                                    <div className="grid-3col" style={{ gap: '24px' }}>
                                        {/* Left Column: Session Summary & Notes */}
                                        <div className="admin-st-d295c8d6">
                                            <div>
                                                <label className="admin-st-739a1b05">Session Details Summary</label>
                                                <div className="admin-st-ae64ad42">
                                                    <div className="admin-flex-between">
                                                        <span className="admin-st-26b52dcd">Client:</span>
                                                        <span className="admin-st-0e40c814">
                                                            {formData.clientId
                                                                ? (clients.find(c => c.id == formData.clientId)?.name || clientSearch || 'Selected')
                                                                : <span style={{ color: '#94a3b8', fontWeight: 500, fontStyle: 'italic' }}>Not assigned yet</span>
                                                            }
                                                        </span>
                                                    </div>
                                                    <div className="admin-flex-between">
                                                        <span className="admin-st-26b52dcd">Artist:</span>
                                                        <span className="admin-st-0e40c814">
                                                            {formData.artistId
                                                                ? (artists.find(a => String(a.id) === String(formData.artistId))?.name || 'Assigned')
                                                                : <span style={{ color: '#94a3b8', fontWeight: 500, fontStyle: 'italic' }}>Not assigned yet</span>
                                                            }
                                                        </span>
                                                    </div>
                                                    <div className="admin-flex-between">
                                                        <span className="admin-st-26b52dcd">Service Type:</span>
                                                        <span className="admin-st-0e40c814">{formData.serviceType || <span style={{ color: '#94a3b8', fontWeight: 500, fontStyle: 'italic' }}>Not selected</span>}</span>
                                                    </div>
                                                    <div className="admin-flex-between">
                                                        <span className="admin-st-26b52dcd">Design / Idea:</span>
                                                        <span className="admin-st-0e40c814">{formData.designTitle || <span style={{ color: '#94a3b8', fontWeight: 500, fontStyle: 'italic' }}>N/A</span>}</span>
                                                    </div>
                                                    <div className="admin-flex-between">
                                                        <span className="admin-st-26b52dcd">Scheduled For:</span>
                                                        <span className="admin-st-afc165d9">
                                                            {formData.date
                                                                ? `${formData.date}${formData.time ? ` at ${formData.time}` : ''}`
                                                                : <span style={{ color: '#94a3b8', fontWeight: 500, fontStyle: 'italic' }}>No date set</span>
                                                            }
                                                        </span>
                                                    </div>
                                                    <div className="admin-flex-between">
                                                        <span className="admin-st-26b52dcd">Status:</span>
                                                        <span className={`badge status-${getStatusColor(formData.status)}`} style={{ fontSize: '0.8rem' }}>{formData.status || 'pending'}</span>
                                                    </div>
                                                    {formData.price > 0 && (
                                                        <div className="admin-flex-between">
                                                            <span className="admin-st-26b52dcd">Price:</span>
                                                            <span className="admin-st-0e40c814">₱{Number(formData.price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                    )}
                                                    {formData.totalSessions > 0 && (
                                                        <div className="admin-flex-between">
                                                            <span className="admin-st-26b52dcd">Session:</span>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                                                                {formData.sessionNumber || 1} of {formData.totalSessions}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {parseFloat(formData.discountAmount) > 0 && (
                                                        <div className="admin-flex-between">
                                                            <span className="admin-st-26b52dcd">Discount:</span>
                                                            <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem' }}>
                                                                {formData.discountType === 'percent' ? `${formData.discountAmount}%` : `₱${Number(formData.discountAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} off
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="admin-st-739a1b05">Internal Session Notes</label>
                                                <textarea
                                                    value={formData.notes || ''}
                                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                                    className="premium-input-v2"
                                                    style={{ minHeight: '120px', resize: 'vertical' }}
                                                    maxLength={1000}
                                                    placeholder={selectedAppointment
                                                        ? "Add detailed internal notes, placement instructions, or specific client requests..."
                                                        : "Add any notes about this new appointment — placement preferences, client requests, design specifics, scheduling notes, etc."
                                                    }
                                                />
                                            </div>

                                            {/* Multi-Session Project Toggle (Task 1.2) */}
                                            <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(99, 102, 241, 0.04)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: formData.totalSessions ? '14px' : 0 }}>
                                                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Layers size={16} style={{ color: '#6366f1' }} />
                                                        Multi-Session Project
                                                    </label>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={!!formData.totalSessions}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setFormData({ ...formData, totalSessions: 2, sessionNumber: 1 });
                                                                } else {
                                                                    setFormData({ ...formData, totalSessions: '', sessionNumber: '' });
                                                                }
                                                            }}
                                                            style={{ width: '18px', height: '18px', accentColor: '#6366f1' }}
                                                        />
                                                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Enabled</span>
                                                    </label>
                                                </div>
                                                {!!formData.totalSessions && (
                                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Session #</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max={formData.totalSessions || 10}
                                                                value={formData.sessionNumber || 1}
                                                                onChange={(e) => setFormData({ ...formData, sessionNumber: Math.min(Math.max(1, parseInt(e.target.value) || 1), parseInt(formData.totalSessions) || 10) })}
                                                                className="premium-input-v2"
                                                                style={{ textAlign: 'center' }}
                                                            />
                                                        </div>
                                                        <span style={{ fontSize: '1.1rem', color: '#94a3b8', fontWeight: 700, paddingTop: '18px' }}>of</span>
                                                        <div style={{ flex: 1 }}>
                                                            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Total Sessions</label>
                                                            <input
                                                                type="number"
                                                                min="2"
                                                                max="10"
                                                                value={formData.totalSessions || 2}
                                                                onChange={(e) => {
                                                                    const val = Math.min(Math.max(2, parseInt(e.target.value) || 2), 10);
                                                                    setFormData({ ...formData, totalSessions: val, sessionNumber: Math.min(parseInt(formData.sessionNumber) || 1, val) });
                                                                }}
                                                                className="premium-input-v2"
                                                                style={{ textAlign: 'center' }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Special Discount Section (Task 1.3) */}
                                            <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(245, 158, 11, 0.04)', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                                    <Tag size={16} style={{ color: '#f59e0b' }} />
                                                    Special Discount
                                                </label>
                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>Type</label>
                                                        <select
                                                            value={formData.discountType || 'flat'}
                                                            onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                                                            className="premium-select-v2"
                                                            style={{ fontSize: '0.85rem' }}
                                                        >
                                                            <option value="flat">Flat (₱)</option>
                                                            <option value="percent">Percentage (%)</option>
                                                        </select>
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                                                            Amount {formData.discountType === 'percent' ? '(%)' : '(₱)'}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={formData.discountType === 'percent' ? 100 : (formData.price || 0)}
                                                            value={formData.discountAmount || ''}
                                                            onChange={(e) => {
                                                                let val = parseFloat(e.target.value) || 0;
                                                                if (formData.discountType === 'percent') val = Math.min(val, 100);
                                                                else val = Math.min(val, formData.price || 999999);
                                                                setFormData({ ...formData, discountAmount: val });
                                                            }}
                                                            className="premium-input-v2"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                </div>
                                                {parseFloat(formData.discountAmount) > 0 && formData.price > 0 && (
                                                    <div style={{ marginTop: '10px', padding: '8px 12px', background: '#fefce8', borderRadius: '8px', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.8rem', color: '#92400e' }}>Effective Price:</span>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#b45309' }}>
                                                            ₱{(() => {
                                                                const p = parseFloat(formData.price) || 0;
                                                                const d = parseFloat(formData.discountAmount) || 0;
                                                                const eff = formData.discountType === 'percent' ? p * (1 - d / 100) : Math.max(0, p - d);
                                                                return eff.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                            })()}
                                                            <span style={{ fontSize: '0.7rem', color: '#d97706', marginLeft: '4px' }}>
                                                                (was ₱{Number(formData.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                                            </span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Consultation Summary Fields — Only visible for Consultation appointments */}
                                            {formData.serviceType === 'Consultation' && (
                                                <div style={{ marginTop: '20px' }}>
                                                    <label className="admin-st-739a1b05" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <ClipboardList size={16} />
                                                        Consultation Summary
                                                        <span style={{
                                                            fontSize: '0.7rem',
                                                            background: 'linear-gradient(135deg, #dcfce7, #d1fae5)',
                                                            color: '#166534',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            fontWeight: 600,
                                                            border: '1px solid #bbf7d0',
                                                            marginLeft: '4px'
                                                        }}>Sent to Customer</span>
                                                    </label>
                                                    <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>
                                                        These fields are included in the <strong style={{ color: '#64748b' }}>Consultation Summary Email</strong> sent to the customer when this appointment is marked as <strong style={{ color: '#10b981' }}>Completed</strong>.
                                                    </p>

                                                    <div className="premium-input-group" style={{ marginBottom: '14px' }}>
                                                        <label className="admin-st-b8618eb2">Artist's Notes</label>
                                                        <textarea
                                                            value={formData.consultationNotes || ''}
                                                            onChange={(e) => setFormData({ ...formData, consultationNotes: e.target.value })}
                                                            className="premium-input-v2"
                                                            style={{ minHeight: '110px', resize: 'vertical', borderColor: 'rgba(190,144,85,0.25)' }}
                                                            maxLength={2000}
                                                            placeholder="Summarize the consultation outcome — design ideas discussed, placement preferences, tattoo size, style preferences, any special considerations, aftercare advice given, etc."
                                                        />
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Visible to the customer in their summary email</span>
                                                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{(formData.consultationNotes || '').length}/2000</span>
                                                        </div>
                                                    </div>

                                                    <div className="premium-input-group">
                                                        <label className="admin-st-b8618eb2">Quoted Price (₱)</label>
                                                        <div style={{ position: 'relative' }}>
                                                            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontWeight: 600, fontSize: '0.95rem', pointerEvents: 'none' }}>₱</span>
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                value={formData.quotedPrice === 0 || formData.quotedPrice === '0' ? '' : formData.quotedPrice}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                                                    setFormData({ ...formData, quotedPrice: raw === '' ? '' : Number(raw) });
                                                                }}
                                                                className="premium-input-v2"
                                                                style={{ paddingLeft: '30px', borderColor: 'rgba(190,144,85,0.25)' }}
                                                                placeholder="e.g. 5000 (optional)"
                                                            />
                                                        </div>
                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                                                            Optional estimated price quote — shown in the customer's summary email if provided
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Middle Column: Project Session History */}
                                        <div className="admin-st-d295c8d6">
                                            <div className="admin-w-full">
                                                <h4 className="admin-st-739a1b05" style={{ margin: 0, marginBottom: '12px' }}>
                                                    Project Session History
                                                </h4>
                                                {(selectedAppointment && formData.designTitle) ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {appointments.filter(a => a.customer_id === selectedAppointment.customer_id && a.design_title === formData.designTitle)
                                                        .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
                                                        .map((session, idx) => (
                                                            <div key={session.id} style={{ display: 'flex', flexDirection: 'column', padding: '10px 14px', borderRadius: '8px', background: session.id === selectedAppointment.id ? '#eff6ff' : '#f8fafc', border: `1px solid ${session.id === selectedAppointment.id ? '#bfdbfe' : '#e2e8f0'}` }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                                    <span style={{ fontWeight: session.id === selectedAppointment.id ? '700' : '600', color: session.id === selectedAppointment.id ? '#2563eb' : '#475569', fontSize: '0.95rem' }}>Session {idx + 1}</span>
                                                                    <span className={`badge status-${session.status.toLowerCase() === 'completed' ? 'active' : session.status.toLowerCase() === 'pending' ? 'pending' : 'expired'}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                                                        {session.status}
                                                                    </span>
                                                                </div>
                                                                <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Calendar size={12} />
                                                                    {new Date(session.appointment_date).toLocaleDateString()} at {session.start_time}
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                                ) : (
                                                    <div className="admin-st-28e6a799">
                                                        <Clock size={40} className="admin-st-04217666" style={{ marginBottom: '8px', opacity: 0.5 }} />
                                                        <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: '#94a3b8' }}>No session history</p>
                                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1', textAlign: 'center' }}>
                                                            Save this appointment with a design title to track its multiphase session history here.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right Column: Reference Assets */}
                                        <div className="admin-st-d295c8d6">
                                            <div>
                                                <label className="admin-st-739a1b05">Reference Assets</label>
                                                <div className="admin-st-699063a3">
                                                    {/* Reference Image (Booking Data) */}
                                                    {(formData.referenceImage || selectedAppointment?.referenceImage) ? (
                                                        <div className="admin-w-full">
                                                            <label className="admin-st-e7eee706">Reference from Booking</label>
                                                            <img
                                                                src={formData.referenceImage || selectedAppointment?.referenceImage}
                                                                alt="Reference"
                                                                className="admin-st-ab1ba3de lightbox-trigger"
                                                                onClick={() => setLightboxSrc(formData.referenceImage || selectedAppointment?.referenceImage)}
                                                            />
                                                        </div>
                                                    ) : null}

                                                    {/* Before Photo (Studio Log) */}
                                                    {(formData.beforePhoto || selectedAppointment?.beforePhoto) ? (
                                                        <div style={{ width: '100%', borderTop: (formData.referenceImage || selectedAppointment?.referenceImage) ? '1px dashed #e2e8f0' : 'none', paddingTop: (formData.referenceImage || selectedAppointment?.referenceImage) ? '20px' : '0' }}>
                                                            <label className="admin-st-e7eee706">Stage Photo (Before)</label>
                                                            <img
                                                                src={formData.beforePhoto || selectedAppointment?.beforePhoto}
                                                                alt="Before"
                                                                className="admin-st-ab1ba3de lightbox-trigger"
                                                                onClick={() => setLightboxSrc(formData.beforePhoto || selectedAppointment?.beforePhoto)}
                                                            />
                                                        </div>
                                                    ) : null}

                                                    {/* After Photo */}
                                                    {selectedAppointment?.afterPhoto ? (
                                                        <div style={{ width: '100%', borderTop: '1px dashed #e2e8f0', paddingTop: '20px' }}>
                                                            <label className="admin-st-e7eee706">Result Photo (After)</label>
                                                            <img
                                                                src={selectedAppointment.afterPhoto}
                                                                alt="After"
                                                                className="admin-st-ab1ba3de lightbox-trigger"
                                                                onClick={() => setLightboxSrc(selectedAppointment.afterPhoto)}
                                                            />
                                                        </div>
                                                    ) : null}

                                                    {!(formData.referenceImage || selectedAppointment?.referenceImage || formData.beforePhoto || selectedAppointment?.beforePhoto || selectedAppointment?.afterPhoto) && (
                                                        <div className="admin-st-28e6a799">
                                                            <Image size={48} className="admin-st-04217666" />
                                                            <p style={{ margin: '0 0 4px 0', fontWeight: 600, color: '#94a3b8' }}>No reference images</p>
                                                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1' }}>
                                                                {selectedAppointment
                                                                    ? 'No images were attached to this appointment.'
                                                                    : 'Reference images can be attached by clients during booking or added later.'
                                                                }
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer admin-st-ac2eb647">
                                <div className="admin-st-f232bb1d">
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {selectedAppointment && (
                                            <>
                                                {formData.status === 'confirmed' && (
                                                <button
                                                    type="button"
                                                    className="btn"
                                                    onClick={() => {
                                                        setRescheduleModal({
                                                            isOpen: true,
                                                            date: formData.date || '',
                                                            time: formData.time || '',
                                                            reason: ''
                                                        });
                                                    }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}
                                                >
                                                    <Calendar size={16} /> Reschedule
                                                </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn"
                                                    onClick={() => window.open(`/admin/appointments/${selectedAppointment.id}/print`, '_blank')}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' }}
                                                >
                                                    <Printer size={16} /> Print Record
                                                </button>
                                                {selectedAppointment.waiverAcceptedAt && (
                                                    <button
                                                        type="button"
                                                        className="btn"
                                                        onClick={() => window.open(`/admin/appointments/${selectedAppointment.id}/waiver`, '_blank')}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, rgba(190,144,85,0.12), rgba(190,144,85,0.06))', color: '#92400e', borderColor: 'rgba(190,144,85,0.3)' }}
                                                    >
                                                        <ShieldCheck size={16} /> View Waiver
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <button className="btn btn-primary admin-st-a3930dd9" onClick={handleSave} disabled={isSavingAppointment} style={{ opacity: isSavingAppointment ? 0.7 : 1, cursor: isSavingAppointment ? 'not-allowed' : 'pointer' }}>
                                        {isSavingAppointment ? 'Saving...' : (selectedAppointment ? 'Update Appointment' : 'Create Appointment')}
                                    </button>
                                </div>
                                <button className="btn btn-secondary admin-st-2b5b349d" onClick={() => closeModal()} onMouseEnter={(e) => e.target.style.backgroundColor = '#e2e8f0'}
                                    onMouseLeave={(e) => e.target.style.backgroundColor = '#f1f5f9'}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Manual Payment Modal */}
                {manualPaymentModal.isOpen && (
                    <div className="modal-overlay admin-st-b92d1844">
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Record Payment</h2>
                                <button className="close-btn" onClick={() => setManualPaymentModal({ ...manualPaymentModal, isOpen: false })}><X size={24} /></button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group admin-mb-20">
                                    <label className="admin-st-80a8a11c">Payment Amount (₱)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="form-input admin-st-22430afb"
                                        value={manualPaymentModal.amount}
                                        onChange={(e) => setManualPaymentModal({ ...manualPaymentModal, amount: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="admin-st-80a8a11c">Payment Method</label>
                                    <select
                                        className="form-input"
                                        value={manualPaymentModal.method}
                                        onChange={(e) => setManualPaymentModal({ ...manualPaymentModal, method: e.target.value })}
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="GCash">GCash</option>
                                        <option value="Bank Transfer">Bank Transfer</option>
                                        <option value="Card">Card</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setManualPaymentModal({ ...manualPaymentModal, isOpen: false })}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleApplyManualPayment} disabled={isRecordingPayment} style={{ opacity: isRecordingPayment ? 0.7 : 1, cursor: isRecordingPayment ? 'not-allowed' : 'pointer' }}>{isRecordingPayment ? 'Recording...' : 'Record Payment'}</button>
                            </div>
                        </div>
                    </div>
                )}


            </div>

            
            {/* Reschedule Modal */}
            {rescheduleModal.isOpen && (
                <div className="modal-overlay admin-st-032d51d4" onClick={() => setRescheduleModal({ ...rescheduleModal, isOpen: false })}>
                    <div className="modal-content premium-modal admin-st-eabe81b2" style={{ maxWidth: '28vw' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Reschedule Session</h3>
                            <button className="close-btn" onClick={() => setRescheduleModal({ ...rescheduleModal, isOpen: false })}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="premium-input-group">
                                <label className="admin-st-b8618eb2">New Date</label>
                                <input type="date" value={rescheduleModal.date} onChange={e => setRescheduleModal({ ...rescheduleModal, date: e.target.value })} className="premium-input-v2" />
                            </div>
                            <div className="premium-input-group" style={{ marginTop: '16px' }}>
                                <label className="admin-st-b8618eb2">New Time</label>
                                <input type="time" value={rescheduleModal.time} onChange={e => setRescheduleModal({ ...rescheduleModal, time: e.target.value })} className="premium-input-v2" />
                            </div>
                            <div className="premium-input-group" style={{ marginTop: '16px' }}>
                                <label className="admin-st-b8618eb2">Reason for Reschedule (Optional)</label>
                                <textarea
                                    className="premium-input-v2"
                                    value={rescheduleModal.reason}
                                    onChange={e => setRescheduleModal({ ...rescheduleModal, reason: e.target.value })}
                                    placeholder="Explain to the customer why the schedule is changed..."
                                    rows="3"
                                    maxLength={500}
                                    style={{ resize: 'vertical', minHeight: '80px' }}
                                ></textarea>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-primary" onClick={handleConfirmReschedule} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                <Calendar size={18} /> Confirm Reschedule
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            <ConfirmModal
                {...confirmDialog}
                onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
            />
            <ImageLightbox src={lightboxSrc} alt="Appointment photo" onClose={() => setLightboxSrc(null)} />
        </div>
    );
}

export default AdminAppointments;
