import './CustomerStyles.css';
import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Axios from 'axios';
import { Search, ChevronLeft, ChevronRight, Filter, CreditCard, Eye, CheckCircle, Info, X, Calendar, Inbox, Plus, Upload, Camera, Image as ImageIcon, User, Scissors, Heart, Sparkles, Check, ArrowRight, ArrowLeft, MapPin, Receipt, CalendarDays, Clock, AlertTriangle, RotateCcw, PlusCircle, History, MessageSquare, Paintbrush, Gem, Video, Users, ShieldCheck, RefreshCw, Syringe, Wrench, Layers, Circle } from 'lucide-react';
import './PortalStyles.css';
import { API_URL } from '../config';
import CustomerSideNav from '../components/CustomerSideNav';
import Pagination from '../components/Pagination';
import ConfirmModal from '../components/ConfirmModal';
import ImageLightbox from '../components/ImageLightbox';
import { getDisplayCode } from '../utils/formatters';
const BodyModelViewer = lazy(() => import('../components/BodyModelViewer'));

function CustomerBookings(){
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('upcoming');
    const [timePeriodFilter, setTimePeriodFilter] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const navigate = useNavigate();
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem('user'));
    const customerId = user ? user.id : null;

    // New Booking Form States
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const [bookingStep, setBookingStep] = useState(1);
    const [artists, setArtists] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [studioCapacity, setStudioCapacity] = useState(1);
    const [bookedDates, setBookedDates] = useState({});
    const [completedAppointments, setCompletedAppointments] = useState([]);
    const [migrationModal, setMigrationModal] = useState({ show: false, count: 0 });
    
    const placementNotesRef = useRef(null);
    const [bookingData, setBookingData] = useState({
        artistId: null,
        bookingType: '', // 'new' or 'followup'
        selectedServices: [], // e.g. ['Tattoo Session', 'Piercing']
        followupAppointmentId: null,
        date: '',
        startTime: '',
        designTitle: '',
        placement: [],
        piercingPlacement: [],
        consultationFor: [], // ['tattoo','piercing'] — only used when service is Consultation
        consultationMethod: 'Face-to-Face', // 'Face-to-Face' or 'Online'
        onlinePlatform: '', // 'Messenger' or 'Instagram'
        placementNotes: '',
        notes: '',
        referenceImage: null,
    });

    const [errors, setErrors] = useState({});

    const validateBookingField = (name, value, currentData = bookingData) => {
        let errorMsg = '';
        if (name === 'designTitle') {
            if (value.trim().length > 0 && value.trim().length < 3) errorMsg = 'Design title must be at least 3 characters.';
            else if (value.trim().length > 100) errorMsg = 'Design title cannot exceed 100 characters.';
        }
        if (name === 'notes') {
            if (value.trim().length > 2000) errorMsg = 'Notes cannot exceed 2000 characters.';
        }
        if (name === 'placementNotes') {
            const hasOtherPlacement = (currentData.placement && currentData.placement.includes('Other')) || 
                                      (currentData.piercingPlacement && currentData.piercingPlacement.includes('Other'));
            if (hasOtherPlacement && value.trim().length === 0) {
                errorMsg = 'Please specify the exact location in the notes field.';
            } else if (value.trim().length > 200) {
                errorMsg = 'Placement notes cannot exceed 200 characters.';
            }
        }

        setErrors(prev => ({ ...prev, [name]: errorMsg }));
        return !errorMsg;
    };

    const handleBookingFormChange = (e) => {
        const { name, value } = e.target;
        const newData = { ...bookingData, [name]: value };
        setBookingData(newData);
        validateBookingField(name, value, newData);
    };

    // Derive the composite serviceType string from selectedServices for backend compatibility
    const getDerivedServiceType = (services) => {
        if (!services || services.length === 0) return '';
        if (services.includes('Tattoo Session') && services.includes('Piercing')) return 'Tattoo + Piercing';
        return services[0]; // Single service
    };

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalTab, setModalTab] = useState('details');
    const [selectedApt, setSelectedApt] = useState(null);
    const [modalTransactions, setModalTransactions] = useState([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [showAftercare, setShowAftercare] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ 
        isOpen: false, 
        title: '', 
        message: '', 
        onConfirm: null, 
        type: 'danger',
        isAlert: false 
    });
    const [lightboxSrc, setLightboxSrc] = useState(null);

    // Project Timeline
    const [projectTimeline, setProjectTimeline] = useState(null);
    const [projectTimelineLoading, setProjectTimelineLoading] = useState(false);
    const [timelineCollapsed, setTimelineCollapsed] = useState(false);

    // Reschedule states
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleTime, setRescheduleTime] = useState('');
    const [rescheduleMonth, setRescheduleMonth] = useState(new Date());
    const [isRescheduling, setIsRescheduling] = useState(false);
    const [rescheduleReason, setRescheduleReason] = useState('');
    const [rescheduleReasonText, setRescheduleReasonText] = useState('');
    const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);

    // Reschedule REQUEST states (for <7 day window)
    const [isRescheduleRequestModalOpen, setIsRescheduleRequestModalOpen] = useState(false);
    const [rescheduleRequestData, setRescheduleRequestData] = useState({ date: '', time: '', reason: '', reasonText: '' });
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
    const [showRequestConfirm, setShowRequestConfirm] = useState(false);
    const [pendingRescheduleRequest, setPendingRescheduleRequest] = useState(null);

    // Cancellation states
    const [cancelModal, setCancelModal] = useState({ isOpen: false, appointmentId: null, reason: '' });
    const [isCancelling, setIsCancelling] = useState(false);

    // Cancellation deadline quick-cancel states
    const [graceCancelModal, setGraceCancelModal] = useState({ isOpen: false, appointment: null, reason: '', customReason: '' });
    const [isGraceCancelling, setIsGraceCancelling] = useState(false);

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

    // Check for migrated guest appointments on first load
    useEffect(() => {
        const migratedCount = localStorage.getItem('migratedAppointments');
        if (migratedCount && parseInt(migratedCount) > 0) {
            setMigrationModal({ show: true, count: parseInt(migratedCount) });
            localStorage.removeItem('migratedAppointments');
        }
    }, []);

    useEffect(() => {
        const fetchArtists = async () => {
            try {
                const res = await Axios.get(`${API_URL}/api/customer/artists`);
                if (res.data.success) setArtists(res.data.artists);
            } catch (e) { console.error("Error fetching artists:", e); }
        };
        const fetchAvailability = async () => {
            try {
                const response = await Axios.get(`${API_URL}/api/public/calendar-availability`);
                if (response.data.success) {
                    setStudioCapacity(response.data.totalArtists || 1);
                    const bookings = {};
                    response.data.bookings.forEach(b => {
                        const dateStr = typeof b.appointment_date === 'string' 
                            ? b.appointment_date.substring(0, 10) 
                            : new Date(b.appointment_date).toISOString().split('T')[0];
                        if (!bookings[dateStr]) bookings[dateStr] = { consultationTimes: [], piercingTimes: [], sessionCount: 0 };
                        const sType = (b.service_type || '').toLowerCase();
                        if (sType === 'consultation') {
                            if (b.start_time) bookings[dateStr].consultationTimes.push(b.start_time.substring(0, 5));
                        } else if (sType === 'piercing') {
                            if (b.start_time) bookings[dateStr].piercingTimes.push(b.start_time.substring(0, 5));
                        } else if (sType === 'tattoo + piercing') {
                            // Bundle: consumes from both tattoo AND piercing pools
                            bookings[dateStr].sessionCount += 1;
                            if (b.start_time) bookings[dateStr].piercingTimes.push(b.start_time.substring(0, 5));
                        } else {
                            // Tattoo Session, Follow-up, Touch-up
                            bookings[dateStr].sessionCount += 1;
                        }
                    });
                    setBookedDates(bookings);
                }
            } catch (error) {
                console.error('Error fetching availability:', error);
            }
        };

        fetchArtists();
        fetchAvailability();

        // Handle auto-open from Gallery
        if (location.state?.autoOpenBooking) {
            setBookingData(prev => ({ ...prev, designTitle: location.state.designTitle || '' }));
            setIsBookingModalOpen(true);
        }
    }, [location.state]);

    useEffect(() => {
        const fetchAppointments = async () => {
            if (!customerId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try{
                const res = await Axios.get(`${API_URL}/api/customer/${customerId}/appointments`);
                if (res.data.success) {
                    // Ensure price is parsed as a number
                    const formattedAppointments = (res.data.appointments || []).map(appt => ({
                        ...appt,
                        price: parseFloat(appt.price) || 0
                    }));
                    setAppointments(formattedAppointments);
                } else {
                    showAlert("Fetch Error", 'Could not fetch your bookings: ' + res.data.message, "danger");
                }
            } catch(e){ 
                console.error("Error fetching bookings:", e.response || e);
                showAlert("Connection Error", 'Failed to connect to the server while fetching bookings. Please try again later.', "danger");
            } finally {
                setLoading(false);
            }
        };
        fetchAppointments();
    }, [customerId]);



    // Filter Logic
    const filteredAppointments = appointments.filter(apt => {
        const displayCode = getDisplayCode(apt.booking_code, apt.id);
        const matchesSearch = displayCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (apt.booking_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                              (apt.design_title || '').toLowerCase().includes(searchTerm.toLowerCase());
                              
        let matchesStatus = false;
        const status = (apt.status || '').toLowerCase();
        if (statusFilter === 'all') {
            matchesStatus = true;
        } else if (statusFilter === 'upcoming') {
            matchesStatus = ['pending', 'confirmed', 'in_progress', 'scheduled'].includes(status);
        } else if (statusFilter === 'history') {
            matchesStatus = ['completed', 'finished', 'cancelled', 'rejected'].includes(status);
        } else {
            matchesStatus = status === statusFilter.toLowerCase();
        }
        
        return matchesSearch && matchesStatus;
    }).filter(apt => {
        // Time period filter
        if (timePeriodFilter === 'all') return true;
        const d = new Date(apt.appointment_date);
        const now = new Date();
        if (timePeriodFilter === 'weekly') {
            const dayOfWeek = now.getDay();
            const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - mondayOffset);
            weekStart.setHours(0, 0, 0, 0);
            return d >= weekStart;
        }
        if (timePeriodFilter === 'monthly') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        if (timePeriodFilter === 'yearly') {
            return d.getFullYear() === now.getFullYear();
        }
        if (timePeriodFilter === 'custom' && customStartDate && customEndDate) {
            const start = new Date(customStartDate + 'T00:00:00');
            const end = new Date(customEndDate + 'T23:59:59');
            return d >= start && d <= end;
        }
        return true;
    }).sort((a, b) => b.id - a.id); // Default to most recently added (highest ID)

    // Pagination Logic
    const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
    const displayedAppointments = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handlePay = (appointment, type = 'deposit') => {
        if (!appointment.price || appointment.price <= 0) {
            showAlert("Quotation Pending", "Price has not been set by the studio yet. Please wait for confirmation.", "info");
            return;
        }
        const remainingBalance = appointment.price - (appointment.total_paid || 0);
        navigate(`/pay-mongo?appointmentId=${appointment.id}&price=${appointment.price}`, { 
            state: { 
                appointmentId: appointment.id, 
                price: appointment.price,
                remainingBalance: remainingBalance,
                type: type,
                serviceType: appointment.service_type || 'Tattoo Session',
                bookingCode: appointment.booking_code
            } 
        });
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const appointmentIdQuery = params.get('appointment');
        const stateAppointmentId = location.state?.openAppointmentId;
        const targetId = appointmentIdQuery || stateAppointmentId;
        
        if (targetId && appointments.length > 0) {
            const target = appointments.find(a => a.id.toString() === targetId.toString());
            if (target) {
                handleViewDetails(target);
                if (appointmentIdQuery) {
                    window.history.replaceState({}, '', '/customer/bookings');
                }
                if (stateAppointmentId) {
                    // Clear the state so it doesn't reopen on refresh
                    navigate(location.pathname, { replace: true, state: {} });
                }
            }
        }
    }, [appointments, location.state, location.pathname, navigate]);

    const handleViewDetails = async (appt) => {
        setSelectedApt(appt);
        setModalTab('details');
        setIsModalOpen(true);
        setModalLoading(true);
        setPendingRescheduleRequest(null);
        if (appt.project_id) {
            setProjectTimelineLoading(true);
            try {
                const timelineRes = await Axios.get(`${API_URL}/api/projects/${appt.project_id}`);
                if (timelineRes.data.success) {
                    setProjectTimeline(timelineRes.data.project || null);
                }
            } catch (e) {
                console.error("Error fetching timeline:", e);
                setProjectTimeline(null);
            } finally {
                setProjectTimelineLoading(false);
            }
        } else {
            setProjectTimeline(null);
        }

        try {
            const res = await Axios.get(`${API_URL}/api/appointments/${appt.id}/transactions`);
            if (res.data.success) {
                setModalTransactions(res.data.transactions || []);
            }
        } catch (e) {
            console.error("Error fetching transactions:", e);
        } finally {
            setModalLoading(false);
        }
        // Fetch reschedule request status in background
        fetchRescheduleRequestStatus(appt.id);
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                showAlert('Validation Error', 'Only image files are allowed.', 'warning');
                return;
            }
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                showAlert('Validation Error', 'Upload failed. File size must be under 5MB.', 'warning');
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setBookingData({ ...bookingData, referenceImage: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    // Calendar Logic
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const renderCalendarDays = () => {
        const days = [];
        const today = new Date();
        today.setHours(0,0,0,0);

        const maxDate = new Date();
        maxDate.setMonth(today.getMonth() + 3);
        maxDate.setHours(23, 59, 59, 999);

        // Only block dates where the customer has a PENDING tattoo-type appointment.
        // Consultations & piercings use time slots, so they don't block the whole date.
        const myTattooBlockedDates = new Set();
        const tattooTypeServices = ['tattoo session', 'tattoo + piercing'];
        appointments.forEach(a => {
            if (['pending'].includes(a.status)) {
                const sType = (a.service_type || '').toLowerCase();
                if (tattooTypeServices.includes(sType)) {
                    const d = typeof a.appointment_date === 'string' 
                        ? a.appointment_date.substring(0, 10) 
                        : new Date(a.appointment_date).toISOString().split('T')[0];
                    myTattooBlockedDates.add(d);
                }
            }
        });

        for (let i = 0; i < firstDayOfMonth; i++) days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
        
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
            const isSelected = bookingData.date === dateStr;
            const isPast = dateObj <= today;
            const isTooFar = dateObj > maxDate;

            // For tattoo-type services, block if customer already has a pending tattoo on this date
            // For consultation/piercing, never block the whole date (time slot picker handles it)
            const selectedService = getDerivedServiceType(bookingData.selectedServices).toLowerCase();
            const isSlotBasedService = ['consultation', 'piercing'].includes(selectedService);
            const hasMySession = !isSlotBasedService && myTattooBlockedDates.has(dateStr);

            const dateData = bookedDates[dateStr] || { consultationTimes: [], piercingTimes: [], sessionCount: 0 };

            // Dynamic evaluation based on selected service type — three independent pools
            let isFull = false;
            let isBusy = false;

            if (selectedService === 'consultation') {
                // Consultation pool: 7 time slots (1PM–7PM)
                const slotsTaken = dateData.consultationTimes.length;
                isFull = slotsTaken >= 7;
                isBusy = slotsTaken >= 5;
            } else if (selectedService === 'piercing') {
                // Piercing pool: 7 time slots (1PM–7PM)
                const slotsTaken = dateData.piercingTimes.length;
                isFull = slotsTaken >= 7;
                isBusy = slotsTaken >= 1; // Show as limited if any slot is taken
            } else if (selectedService === 'tattoo + piercing') {
                // Bundle: must check BOTH tattoo pool AND piercing pool
                const tattooFull = dateData.sessionCount >= studioCapacity;
                const piercingFull = dateData.piercingTimes.length >= 7;
                isFull = tattooFull || piercingFull;
                isBusy = dateData.sessionCount >= Math.max(1, studioCapacity - 1) || dateData.piercingTimes.length >= 5;
            } else if (selectedService) {
                // Tattoo Session, Follow-up, Touch-up: artist capacity pool
                isFull = dateData.sessionCount >= studioCapacity;
                isBusy = dateData.sessionCount >= Math.max(1, studioCapacity - 1);
            }
            // If no service selected yet, show all dates as available (no blocking)

            const isDisabled = isPast || isTooFar || hasMySession || isFull;

            let bgColor = 'white';
            let textColor = '#1e293b';
            let borderColor = '#e2e8f0';

            if (isPast || isTooFar) {
                bgColor = '#f8fafc';
                textColor = '#cbd5e1';
                borderColor = 'transparent';
            } else if (hasMySession || isFull) {
                bgColor = '#fee2e2';
                textColor = '#991b1b';
                borderColor = '#fecaca';
            } else if (isBusy) {
                bgColor = '#fef9c3';
                textColor = '#854d0e';
                borderColor = '#fde68a';
            } else {
                bgColor = '#dcfce7';
                textColor = '#166534';
                borderColor = '#bbf7d0';
            }

            if (isSelected) {
                borderColor = '#be9055';
            }

            days.push(
                <div 
                    className={`calendar-day ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`} 
                    key={i}
                    style={{ backgroundColor: bgColor, color: textColor, border: isSelected ? '2px solid #be9055' : `1px solid ${borderColor}`, opacity: isPast || isTooFar ? 0.4 : (hasMySession || isFull ? 0.65 : 1), boxShadow: isSelected ? '0 0 0 3px rgba(193, 154, 107, 0.2)' : 'none' }}
                    onClick={() => { 
                        if (isDisabled) { 
                            if (hasMySession) {
                                showAlert("Date Unavailable", "You already have a session booked on this date. Please choose another date.", "warning"); 
                            } else if (isFull) { 
                                showAlert("Fully Booked", "This date is fully booked. Please choose another date.", "warning"); 
                            }
                            return; 
                        } 
                        setBookingData({...bookingData, date: dateStr, startTime: ''}); 
                    }} 
                >
                    <span style={{ fontWeight: isSelected ? '700' : '500' }}>{i}</span>
                </div>
            );
        }
        return days;
    };

    const closeBookingModal = () => {
        setIsBookingModalOpen(false);
        setBookingData({ artistId: null, bookingType: '', selectedServices: [], followupAppointmentId: null, date: '', startTime: '', designTitle: '', placement: [], piercingPlacement: [], consultationFor: [], placementNotes: '', notes: '', referenceImage: null });
        setErrors({});
        setBookingStep(1);
    };

    const fetchCompletedAppointments = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/customer/${customerId}/appointments`);
            if (res.data.success) {
                setCompletedAppointments(
                    (res.data.appointments || []).filter(a => ['completed', 'finished'].includes((a.status || '').toLowerCase()))
                );
            }
        } catch (e) { console.error('Error fetching completed appointments:', e); }
    };

    // Toggle a value in/out of an array field in bookingData
    const togglePlacementItem = (field, item) => {
        setBookingData(prev => {
            const arr = prev[field] || [];
            const isAdding = !arr.includes(item);
            if (isAdding && item === 'Other') {
                setTimeout(() => {
                    if (placementNotesRef.current) placementNotesRef.current.focus();
                }, 50);
            }
            const newData = { ...prev, [field]: isAdding ? [...arr, item] : arr.filter(x => x !== item) };
            if (field === 'placement' || field === 'piercingPlacement') {
                validateBookingField('placementNotes', newData.placementNotes, newData);
            }
            return newData;
        });
    };

    const handleNextStep = () => {
        if (Object.values(errors).some(e => e)) {
            return showAlert("Validation Error", "Please fix errors on this page before proceeding.", "warning");
        }
        const derivedType = getDerivedServiceType(bookingData.selectedServices);
        if (bookingStep === 1) {
            if (!bookingData.bookingType) return showAlert("Required Field", "Please select whether this is a new booking or a follow-up.", "warning");
            if (bookingData.bookingType === 'followup' && !bookingData.followupAppointmentId) return showAlert("Required Field", "Please select which previous appointment this is a follow-up for.", "warning");
            if (bookingData.selectedServices.length === 0) return showAlert("Required Field", "Please select at least one service type.", "warning");
        }
        if (bookingStep === 2 && !bookingData.designTitle) {
            setErrors(prev => ({...prev, designTitle: 'Please tell us about your tattoo idea'}));
            return;
        }
        if (bookingStep === 3 && bookingData.placement.length === 0 && derivedType !== 'Consultation') {
            return showAlert("Required Field", "Please select at least one placement area for your session.", "warning");
        }
        if (bookingStep === 3 && derivedType === 'Consultation' && bookingData.consultationFor.length === 0) {
            return showAlert("Required Field", "Please indicate what this consultation is for (Tattoo, Piercing, or both).", "warning");
        }
        if (bookingStep === 3 && derivedType === 'Consultation' && bookingData.placement.length === 0) {
            return showAlert("Required Field", "Please select at least one body area you're considering.", "warning");
        }
        if (bookingStep === 3 && derivedType === 'Tattoo + Piercing' && bookingData.piercingPlacement.length === 0) {
            return showAlert("Required Field", "Please also select the piercing location for your bundled session.", "warning");
        }
        // Validate location notes when 'Other' is selected
        if (bookingStep === 3 && (bookingData.placement.includes('Other') || bookingData.piercingPlacement.includes('Other')) && !bookingData.placementNotes.trim()) {
            return showAlert("Required Field", "You selected 'Other' — please describe the specific location in the notes field.", "warning");
        }
        setBookingStep(bookingStep + 1);
    };

    const handleSubmitBooking = async (e) => {
        if (e) e.preventDefault();
        const derivedType = getDerivedServiceType(bookingData.selectedServices);

        if (!bookingData.date || (['Consultation', 'Piercing', 'Tattoo + Piercing'].includes(derivedType) && !bookingData.startTime)) {
            return showAlert("Required Field", "Please select an available date" + (['Consultation', 'Piercing', 'Tattoo + Piercing'].includes(derivedType) ? " and time slot" : "") + " from the calendar.", "warning");
        }
        if (!bookingData.date || !derivedType || (bookingData.placement.length === 0 && derivedType !== 'Consultation')) {
            showAlert("Missing Info", "Please select a service, placement, and date.", "warning");
            return;
        }

        setIsSubmitting(true);
        try {
            const placementStr = bookingData.placement.join(', ');
            const piercingStr = bookingData.piercingPlacement.join(', ');
            let placementLine;
            if (derivedType === 'Tattoo + Piercing') {
                placementLine = `Tattoo Placement: ${placementStr}\nPiercing Location: ${piercingStr}`;
            } else if (derivedType === 'Piercing') {
                placementLine = `Piercing Location: ${placementStr}`;
            } else if (derivedType === 'Consultation') {
                const consultType = bookingData.consultationFor.join(' & ');
                const consultMethodStr = bookingData.consultationMethod === 'Online' ? `Online (${bookingData.onlinePlatform || 'TBD'})` : 'Face-to-Face';
                placementLine = `Consultation for: ${consultType}\nConsultation method: ${consultMethodStr}\nAreas of interest: ${placementStr}`;
            } else {
                placementLine = `Placement: ${placementStr}`;
            }
            if (bookingData.placementNotes) {
                placementLine += `\nSpecific notes: ${bookingData.placementNotes}`;
            }

            // Build follow-up reference if applicable
            let followupNote = '';
            if (bookingData.bookingType === 'followup' && bookingData.followupAppointmentId) {
                const refAppt = completedAppointments.find(a => a.id === bookingData.followupAppointmentId);
                const refCode = refAppt ? getDisplayCode(refAppt.booking_code, refAppt.id) : `#${bookingData.followupAppointmentId}`;
                followupNote = `\n\nFollow-up of Booking ${refCode}`;
            }

            const consultMethodPayload = derivedType === 'Consultation' ? (bookingData.consultationMethod === 'Online' ? `Online (${bookingData.onlinePlatform || 'TBD'})` : 'Face-to-Face') : null;

            const res = await Axios.post(`${API_URL}/api/customer/appointments`, {
                customerId,
                artistId: bookingData.artistId,
                date: bookingData.date,
                startTime: ['Consultation', 'Piercing', 'Tattoo + Piercing'].includes(derivedType) ? bookingData.startTime : '13:00',
                endTime: ['Consultation', 'Piercing', 'Tattoo + Piercing'].includes(derivedType) ? bookingData.startTime : '13:00',
                serviceType: derivedType,
                designTitle: bookingData.designTitle,
                notes: `${placementLine}\n\nDetails: ${bookingData.notes}${followupNote}`,
                referenceImage: bookingData.referenceImage,
                consultationMethod: consultMethodPayload
            });

            if (res.data.success) {
                showAlert("Booking Requested", "Your session request has been sent! A confirmation notification with details has been added to your account.", "success");
                setIsBookingModalOpen(false);
                setBookingData({ artistId: null, bookingType: '', selectedServices: [], followupAppointmentId: null, date: '', startTime: '', designTitle: '', placement: [], piercingPlacement: [], consultationFor: [], consultationMethod: 'Face-to-Face', onlinePlatform: '', placementNotes: '', notes: '', referenceImage: null });
                const fetchRes = await Axios.get(`${API_URL}/api/customer/${customerId}/appointments`);
                if (fetchRes.data.success) setAppointments(fetchRes.data.appointments);
            }
        } catch (err) {
            if (err.response?.status === 429) {
                showAlert("Booking Limit Reached", err.response.data.message || "You have too many pending requests. Please wait for one to be confirmed.", "warning");
            } else {
                showAlert("Booking Error", err.response?.data?.message || "Failed to submit request.", "danger");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const bodyParts = [
        "Face", "Neck", "Chest", "Back", "Left Shoulder", "Right Shoulder", "Left Upper Arm", "Right Upper Arm", "Left Forearm", "Right Forearm", "Left Wrist", "Right Wrist", "Left Hand", "Right Hand", "Left Ribs", "Right Ribs", "Left Hip", "Right Hip", "Left Thigh", "Right Thigh", "Left Calf", "Right Calf", "Left Ankle", "Right Ankle"
    ];

    const rescheduleReasonOptions = [
        'Schedule conflict',
        'Medical/Health reason',
        'Travel/Transportation issue',
        'Personal emergency',
        'Availability of companion',
        'Other'
    ];

    const handleOpenReschedule = (appt) => {
        const now = new Date();
        const apptDate = new Date(appt.appointment_date);
        if (appt.start_time) {
            const [h, m] = appt.start_time.split(':');
            apptDate.setHours(parseInt(h), parseInt(m), 0, 0);
        } else {
            apptDate.setHours(23, 59, 59, 999);
        }
        const msInAWeek = 7 * 24 * 60 * 60 * 1000;
        const msIn12Hours = 12 * 60 * 60 * 1000;
        const timeUntilAppt = apptDate - now;

        if ((appt.reschedule_count || 0) >= 1) {
            showAlert("Reschedule Limit Reached", "You have already used your 1 allowed reschedule for this appointment. If this is an emergency, please contact the studio directly.", "warning");
            return;
        }

        // Check for existing pending request
        if (pendingRescheduleRequest && pendingRescheduleRequest.status === 'pending') {
            showAlert("Request Pending", "You already have a pending reschedule request for this appointment. Please wait for the studio to review it.", "info");
            return;
        }

        if (timeUntilAppt < msInAWeek) {
            // Within 1 week — check 12-hour minimum
            if (timeUntilAppt < msIn12Hours) {
                showAlert("Too Close to Appointment", "Reschedule requests cannot be made for appointments less than 12 hours away. Please contact the studio directly.", "warning");
                return;
            }
            // Open the RESCHEDULE REQUEST modal instead
            setRescheduleRequestData({ date: '', time: '', reason: '', reasonText: '' });
            setShowRequestConfirm(false);
            setRescheduleMonth(new Date());
            setIsRescheduleRequestModalOpen(true);
            return;
        }

        setRescheduleDate('');
        setRescheduleTime('');
        setRescheduleMonth(new Date());
        setRescheduleReason('');
        setRescheduleReasonText('');
        setShowRescheduleConfirm(false);
        setIsRescheduleModalOpen(true);
    };

    const handleReschedulePreSubmit = () => {
        if (!rescheduleDate) {
            showAlert("Required", "Please select a new date.", "warning");
            return;
        }
        if (!rescheduleReason) {
            showAlert("Required", "Please select a reason for rescheduling.", "warning");
            return;
        }
        if (rescheduleReason === 'Other' && !rescheduleReasonText.trim()) {
            showAlert("Required", "Please describe your reason for rescheduling.", "warning");
            return;
        }
        setShowRescheduleConfirm(true);
    };

    const handleSubmitReschedule = async () => {
        const finalReason = rescheduleReason === 'Other' ? rescheduleReasonText.trim() : rescheduleReason;
        setIsRescheduling(true);
        try {
            const res = await Axios.put(`${API_URL}/api/customer/appointments/${selectedApt.id}/reschedule`, {
                customerId,
                newDate: rescheduleDate,
                newTime: rescheduleTime || null,
                reason: finalReason
            });
            if (res.data.success) {
                showAlert("Rescheduled", res.data.message, "success");
                setIsRescheduleModalOpen(false);
                setShowRescheduleConfirm(false);
                setIsModalOpen(false);
                // Refresh appointments
                const fetchRes = await Axios.get(`${API_URL}/api/customer/${customerId}/appointments`);
                if (fetchRes.data.success) setAppointments(fetchRes.data.appointments.map(a => ({ ...a, price: parseFloat(a.price) || 0 })));
            }
        } catch (err) {
            showAlert("Reschedule Failed", err.response?.data?.message || "An error occurred while rescheduling.", "danger");
        } finally {
            setIsRescheduling(false);
            setShowRescheduleConfirm(false);
        }
    };

    // ────── Reschedule Request Submission ──────
    const handleSubmitRescheduleRequest = async () => {
        const finalReason = rescheduleRequestData.reason === 'Other' ? rescheduleRequestData.reasonText.trim() : rescheduleRequestData.reason;
        setIsSubmittingRequest(true);
        try {
            const res = await Axios.post(`${API_URL}/api/customer/appointments/${selectedApt.id}/reschedule-request`, {
                customerId,
                requestedDate: rescheduleRequestData.date,
                requestedTime: rescheduleRequestData.time || null,
                reason: finalReason
            });
            if (res.data.success) {
                showAlert("Request Submitted", res.data.message, "success");
                setIsRescheduleRequestModalOpen(false);
                setShowRequestConfirm(false);
                setIsModalOpen(false);
                // Refresh appointments
                const fetchRes = await Axios.get(`${API_URL}/api/customer/${customerId}/appointments`);
                if (fetchRes.data.success) setAppointments(fetchRes.data.appointments.map(a => ({ ...a, price: parseFloat(a.price) || 0 })));
            }
        } catch (err) {
            showAlert("Request Failed", err.response?.data?.message || "An error occurred while submitting your request.", "danger");
        } finally {
            setIsSubmittingRequest(false);
            setShowRequestConfirm(false);
        }
    };

    // Fetch reschedule request status for a selected appointment
    const fetchRescheduleRequestStatus = async (appointmentId) => {
        try {
            const res = await Axios.get(`${API_URL}/api/customer/appointments/${appointmentId}/reschedule-request?customerId=${customerId}`);
            if (res.data.success) {
                setPendingRescheduleRequest(res.data.request);
            } else {
                setPendingRescheduleRequest(null);
            }
        } catch (e) {
            setPendingRescheduleRequest(null);
        }
    };

    // ────── Cancellation Logic ──────
    const handleCancelBooking = (appt) => {
        if (appt.status !== 'pending') {
            showAlert('Cannot Cancel', 'Only pending bookings that haven\'t been confirmed by the studio can be cancelled.', 'warning');
            return;
        }
        if (appt.payment_status && appt.payment_status !== 'unpaid') {
            showAlert('Cannot Cancel', 'You cannot cancel an appointment that has already been paid for. Please contact the studio directly.', 'warning');
            return;
        }
        // Check recent cancellations (client-side pre-check)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentCancels = appointments.filter(a => 
            a.status === 'cancelled' && new Date(a.updated_at || a.appointment_date) >= thirtyDaysAgo
        ).length;
        if (recentCancels >= 3) {
            showAlert('Cancellation Limit Reached', 'You have cancelled 3 bookings in the last 30 days. Please contact the studio directly for assistance.', 'warning');
            return;
        }
        setCancelModal({ isOpen: true, appointmentId: appt.id, reason: '' });
        setIsModalOpen(false); // Close details modal to prevent stacking
    };

    const submitCancellation = async () => {
        if (cancelModal.reason.trim().length < 10) {
            showAlert('Reason Required', 'Please provide at least 10 characters explaining why you are cancelling.', 'warning');
            return;
        }
        setIsCancelling(true);
        try {
            const res = await Axios.put(`${API_URL}/api/customer/appointments/${cancelModal.appointmentId}/cancel`, {
                customerId,
                reason: cancelModal.reason.trim()
            });
            if (res.data.success) {
                showAlert('Booking Cancelled', res.data.message, 'success');
                setCancelModal({ isOpen: false, appointmentId: null, reason: '' });
                setIsModalOpen(false);
                // Refresh appointments
                const fetchRes = await Axios.get(`${API_URL}/api/customer/${customerId}/appointments`);
                if (fetchRes.data.success) setAppointments(fetchRes.data.appointments.map(a => ({ ...a, price: parseFloat(a.price) || 0 })));
            }
        } catch (err) {
            showAlert('Cancellation Failed', err.response?.data?.message || 'An error occurred while cancelling.', 'danger');
        } finally {
            setIsCancelling(false);
        }
    };

    // ────── Cancellation Deadline Logic ──────
    const getGraceSecondsRemaining = (appointment) => {
        if (!appointment?.appointment_date) return 0;
        
        const serviceType = (appointment.service_type || '').toLowerCase();
        const isConsultation = serviceType.includes('consultation');
        const deadlineDays = isConsultation ? 3 : 7;
        
        const apptDate = new Date(appointment.appointment_date);
        apptDate.setHours(23, 59, 59, 999); // End of appointment day
        
        const deadlineDate = new Date(apptDate.getTime() - deadlineDays * 24 * 60 * 60 * 1000);
        const remaining = Math.max(0, Math.floor((deadlineDate - new Date()) / 1000));
        return remaining;
    };

    const isWithinGracePeriod = (appointment) => {
        return getGraceSecondsRemaining(appointment) > 0;
    };

    const openGraceCancelModal = (appt) => {
        setGraceCancelModal({ isOpen: true, appointment: appt, reason: '', customReason: '' });
        setIsModalOpen(false); // Close details modal to prevent stacking
    };

    const submitGracePeriodCancel = async () => {
        const { appointment, reason, customReason } = graceCancelModal;
        const finalReason = reason === 'Other' ? customReason.trim() : reason;

        if (!finalReason || finalReason.length < 10) {
            showAlert('Reason Required', 'Please select or type a reason (at least 10 characters).', 'warning');
            return;
        }

        setIsGraceCancelling(true);
        try {
            const res = await Axios.put(`${API_URL}/api/customer/appointments/${appointment.id}/cancel`, {
                customerId,
                reason: finalReason,
                isGracePeriod: true
            });
            if (res.data.success) {
                showAlert('Booking Cancelled', res.data.message, 'success');
                setGraceCancelModal({ isOpen: false, appointment: null, reason: '', customReason: '' });
                setIsModalOpen(false);
                // Refresh appointments
                const fetchRes = await Axios.get(`${API_URL}/api/customer/${customerId}/appointments`);
                if (fetchRes.data.success) setAppointments(fetchRes.data.appointments.map(a => ({ ...a, price: parseFloat(a.price) || 0 })));
            }
        } catch (err) {
            showAlert('Cancellation Failed', err.response?.data?.message || 'An error occurred.', 'danger');
        } finally {
            setIsGraceCancelling(false);
        }
    };

    const renderRescheduleCalendar = () => {
        const days = [];
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const now = new Date();
        const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
        twelveHoursFromNow.setHours(0,0,0,0);

        const maxDate = new Date();
        maxDate.setMonth(today.getMonth() + 3);

        const currentApptDate = selectedApt ? new Date(selectedApt.appointment_date) : null;
        if (currentApptDate) currentApptDate.setHours(0,0,0,0);

        // Collect all dates where this customer already has active appointments (excluding the one being rescheduled)
        const bookedDateSet = new Set();
        appointments.forEach(a => {
            if (a.id !== selectedApt?.id && !['completed', 'cancelled', 'rejected'].includes(a.status)) {
                const d = typeof a.appointment_date === 'string' 
                    ? a.appointment_date.substring(0, 10) 
                    : new Date(a.appointment_date).toISOString().split('T')[0];
                bookedDateSet.add(d);
            }
        });

        const daysInM = new Date(rescheduleMonth.getFullYear(), rescheduleMonth.getMonth() + 1, 0).getDate();
        const firstDay = new Date(rescheduleMonth.getFullYear(), rescheduleMonth.getMonth(), 1).getDay();

        for (let i = 0; i < firstDay; i++) days.push(<div key={`re-${i}`} className="calendar-day empty"></div>);
        for (let i = 1; i <= daysInM; i++) {
            const dateStr = `${rescheduleMonth.getFullYear()}-${String(rescheduleMonth.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dateObj = new Date(rescheduleMonth.getFullYear(), rescheduleMonth.getMonth(), i);
            const isSelected = rescheduleDate === dateStr;
            const isPast = dateObj < twelveHoursFromNow;
            const isTooFar = dateObj > maxDate;
            const isSameAsCurrentAppt = currentApptDate ? dateObj.getTime() === currentApptDate.getTime() : false;
            const isAlreadyBooked = bookedDateSet.has(dateStr);
            
            const dateData = bookedDates[dateStr] || { consultationTimes: [], piercingTimes: [], sessionCount: 0 };
            // Evaluate based on the service type of the appointment being rescheduled
            let isFull = false;
            let isBusy = false;
            const apptService = (selectedApt?.service_type || '').toLowerCase();
            if (apptService === 'consultation') {
                isFull = dateData.consultationTimes.length >= 7;
                isBusy = dateData.consultationTimes.length >= 5;
            } else if (apptService === 'piercing') {
                isFull = dateData.piercingTimes.length >= 7;
                isBusy = dateData.piercingTimes.length >= 1; // Show as limited if any slot is taken
            } else if (apptService === 'tattoo + piercing') {
                isFull = dateData.sessionCount >= studioCapacity || dateData.piercingTimes.length >= 7;
                isBusy = dateData.sessionCount >= Math.max(1, studioCapacity - 1) || dateData.piercingTimes.length >= 5;
            } else {
                isFull = dateData.sessionCount >= studioCapacity;
                isBusy = dateData.sessionCount >= Math.max(1, studioCapacity - 1);
            }

            const isDisabled = isPast || isTooFar || isSameAsCurrentAppt || isAlreadyBooked || isFull;

            let bgColor = 'white';
            let textColor = '#1e293b';
            let borderColor = '#e2e8f0';

            if (isPast || isTooFar || isSameAsCurrentAppt) {
                bgColor = '#f8fafc';
                textColor = '#cbd5e1';
                borderColor = 'transparent';
            } else if (isAlreadyBooked || isFull) {
                bgColor = '#fee2e2';
                textColor = '#991b1b';
                borderColor = '#fecaca';
            } else if (isBusy) {
                bgColor = '#fef9c3';
                textColor = '#854d0e';
                borderColor = '#fde68a';
            } else {
                bgColor = '#dcfce7';
                textColor = '#166534';
                borderColor = '#bbf7d0';
            }

            if (isSelected) {
                borderColor = '#be9055';
            }

            days.push(
                <div key={i} className={`calendar-day ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}
                    style={{ backgroundColor: bgColor, color: textColor, border: isSelected ? '2px solid #be9055' : `1px solid ${borderColor}`, opacity: isPast || isTooFar || isSameAsCurrentAppt ? 0.4 : (isAlreadyBooked || isFull ? 0.65 : 1), boxShadow: isSelected ? '0 0 0 3px rgba(193, 154, 107, 0.2)' : 'none' }}
                    onClick={() => { if (!isDisabled) setRescheduleDate(dateStr); }}
                    title={isAlreadyBooked ? 'You already have a session on this date' : isSameAsCurrentAppt ? 'This is the current appointment date' : isFull ? 'This date is fully booked' : ''}
                >
                    <span style={{ fontWeight: isSelected ? '700' : '500' }}>{i}</span>
                </div>
            );
        }
        return days;
    };

    return (<>
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
            <header className="portal-header">
                <div className="header-title">
                    <h1>My Bookings</h1>
                </div>
                <div className="header-actions">
                    <button className="action-btn customer-st-98cc44d8" onClick={() => { setBookingStep(1); setIsBookingModalOpen(true); }} >
                        <Plus size={16} /> Book New Session
                    </button>
                </div>
            </header>
            <div className="portal-content">
                {loading ? <div className="no-data">Loading...</div> : (
                        <div className="table-card-container customer-st-e54796c6" >
                            <div className="card-header-v2">
                                <div className="customer-st-416869c2" >
                                    <div className="customer-st-1910a4be" >
                                        <Filter size={18} color="#64748b" />
                                        <select className="pagination-select customer-st-03930596" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }} >
                                            <option value="upcoming">Active / Upcoming</option>
                                            <option value="history">History (Done / Cancelled)</option>
                                            <option value="all">All Bookings</option>
                                            <option value="confirmed">Confirmed Only</option>
                                            <option value="pending">Pending Only</option>
                                        </select>
                                    </div>
                                    <div className="customer-st-1910a4be" >
                                        <Calendar size={18} color="#64748b" />
                                        <select className="pagination-select customer-st-03930596" value={timePeriodFilter} onChange={(e) => { setTimePeriodFilter(e.target.value); if (e.target.value !== 'custom') { setCustomStartDate(''); setCustomEndDate(''); } setCurrentPage(1); }} >
                                            <option value="all">All Time</option>
                                            <option value="weekly">This Week</option>
                                            <option value="monthly">This Month</option>
                                            <option value="yearly">This Year</option>
                                            <option value="custom">Custom Range</option>
                                        </select>
                                        {timePeriodFilter === 'custom' && (
                                            <>
                                                <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="pagination-select customer-st-03930596" style={{ width: '130px', padding: '4px 8px' }} />
                                                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>to</span>
                                                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="pagination-select customer-st-03930596" style={{ width: '130px', padding: '4px 8px' }} />
                                            </>
                                        )}
                                    </div>
                                    <div className="customer-st-e64759bd" >
                                        <Search className="customer-st-73ad8fa0" size={16} />
                                        <input className="pagination-select customer-st-5ce7667d" type="text" placeholder="Search bookings..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
                                    </div>
                                </div>
                                <span className="status-badge-v2 pending">{filteredAppointments.length} Bookings</span>
                            </div>

                            {displayedAppointments.length ? (
                                <>
                                    <div className="table-responsive">
                                        <table className="portal-table mobile-card-table">
                                            <thead><tr><th>ID</th><th>Service</th><th>Date</th><th>Time</th><th>Status</th><th>Price</th><th>Payment</th></tr></thead>
                                            <tbody>{displayedAppointments.map(a=> (
                                                <tr key={a.id} onClick={() => handleViewDetails(a)} style={{ cursor: 'pointer' }} className="clickable-row hover-bg">
                                                    <td className="customer-st-968fd1b5" data-label="ID">
                                                        <span style={{ fontFamily: 'monospace', fontWeight: '600', color: '#1e293b' }}>
                                                            {getDisplayCode(a.booking_code, a.id)}
                                                        </span>
                                                    </td>
                                                    <td data-label="Service">{a.service_type || 'Tattoo'}</td>
                                                    <td data-label="Date">{new Date(a.appointment_date).toLocaleDateString()}</td>
                                                    <td data-label="Time">{a.start_time ? new Date(`1970-01-01T${a.start_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''}</td>
                                                    <td data-label="Status">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                                                            <span className={`status-badge ${a.status.toLowerCase()}`}>{a.status}</span>
                                                        </div>
                                                    </td>
                                                    <td data-label="Price">
                                                        {a.price > 0 ? (
                                                            <div className="customer-st-52ddb992" >₱{Number(a.price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                                        ) : a.project_id && a.session_number > 1 ? (
                                                            <span className="customer-st-b8eb7d87" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }} >Included in Project</span>
                                                        ) : (
                                                            <span className="customer-st-b8eb7d87" >Pending Quote</span>
                                                        )}
                                                    </td>
                                                    <td data-label="Payment">
                                                        <div className="customer-st-929a545b" style={{display: 'flex', justifyContent: 'flex-start'}}>
                                                            {a.status === 'pending' && a.price > 0 && a.payment_status === 'unpaid' ? (
                                                                <button 
                                                                    className="btn btn-primary" 
                                                                    style={{padding: '6px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'}}
                                                                    onClick={(e) => { e.stopPropagation(); handlePay(a); }} 
                                                                >
                                                                    <CreditCard size={14}/> Pay Deposit
                                                                </button>
                                                            ) : a.payment_status === 'paid' && a.price > 0 ? (
                                                                <span className="status-badge-v2 confirmed customer-st-abded735" >
                                                                    <CheckCircle size={12}/> Fully Paid
                                                                </span>
                                                            ) : a.payment_status === 'paid' && (!a.price || a.price <= 0) ? (
                                                                <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>Free</span>
                                                            ) : a.payment_status === 'downpayment_paid' ? (
                                                                <button 
                                                                    className="btn btn-primary" 
                                                                    style={{padding: '6px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', background: '#be9055', color: 'white', border: 'none', boxShadow: '0 4px 10px rgba(245, 158, 11, 0.3)'}}
                                                                    onClick={(e) => { e.stopPropagation(); handlePay(a, 'balance'); }}
                                                                >
                                                                    <CreditCard size={14}/> Pay Balance
                                                                </button>
                                                            ) : a.status === 'completed' ? (
                                                                <button className="btn btn-primary customer-st-6c6e14b5" onClick={(e) => { e.stopPropagation(); setSelectedApt(a); setShowAftercare(true); }} >
                                                                    <Heart size={14}/> Aftercare
                                                                </button>
                                                            ) : (
                                                                <span className="customer-st-48e66a80" >-</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}</tbody>
                                        </table>
                                    </div>
                                    
                                    <Pagination 
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPageChange={setCurrentPage}
                                        itemsPerPage={itemsPerPage}
                                        onItemsPerPageChange={setItemsPerPage}
                                        totalItems={filteredAppointments.length}
                                        unit="bookings"
                                    />
                                </>
                            ) : (
                                <div className="no-data-container customer-st-282aded5" >
                                    <Inbox size={48} className="no-data-icon" />
                                    <p className="no-data-text">No bookings found matching your criteria.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Details Modal */}
            {isModalOpen && selectedApt && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3 style={{ margin: 0 }}>Appointment Details</h3>
                                <div className="modern-view-toggle" style={{ marginTop: '10px' }}>
                                    <button 
                                        type="button"
                                        className={`toggle-btn ${modalTab === 'details' ? 'active' : ''}`} 
                                        onClick={() => setModalTab('details')}
                                    >
                                        <Info size={14} /> Details
                                    </button>
                                    <button 
                                        type="button"
                                        className={`toggle-btn ${modalTab === 'transactions' ? 'active' : ''}`} 
                                        onClick={() => setModalTab('transactions')}
                                    >
                                        <Receipt size={14} /> Transactions
                                    </button>
                                </div>
                            </div>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            {modalTab === 'details' ? (
                                <>
                                    <div className="customer-st-5c49f804" >
                                        <div className="customer-st-e8eceac8" >
                                            <label className="customer-st-3c5cf8dd" >Service Type</label>
                                            <p className="customer-st-5d13f831" >{selectedApt.service_type || 'General Session'}</p>
                                        </div>
                                    </div>

                                    <div className="customer-st-654b1414" >
                                        <label className="customer-st-627edbaf" >Vision & Booking Notes</label>
                                        <div className="customer-st-6f352cca" >
                                            <h4 className="customer-st-232eb362" >{selectedApt.design_title}</h4>
                                            <p className="customer-st-590a9062" >
                                                {selectedApt.notes || 'No specific notes provided.'}
                                            </p>
                                            
                                            {selectedApt.reference_image && (
                                                <div className="customer-st-2dc9a8a0" >
                                                    <p className="customer-st-af520488" >Reference Image</p>
                                                    <div className="customer-st-e6f3b223" >
                                                        <img className="customer-st-454ebe6d lightbox-trigger" src={selectedApt.reference_image} alt="Reference" onClick={(e) => { e.stopPropagation(); setLightboxSrc(selectedApt.reference_image); }} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Reschedule Request Badge */}
                                    {pendingRescheduleRequest && (
                                        <div style={{
                                            margin: '16px 0',
                                            padding: '14px 16px',
                                            borderRadius: '12px',
                                            border: `1px solid ${
                                                pendingRescheduleRequest.status === 'pending' ? 'rgba(245,158,11,0.3)' :
                                                pendingRescheduleRequest.status === 'approved' ? 'rgba(16,185,129,0.3)' :
                                                pendingRescheduleRequest.status === 'rejected' ? 'rgba(239,68,68,0.3)' :
                                                'rgba(148,163,184,0.3)'
                                            }`,
                                            background: pendingRescheduleRequest.status === 'pending' ? '#fffbeb' :
                                                pendingRescheduleRequest.status === 'approved' ? '#f0fdf4' :
                                                pendingRescheduleRequest.status === 'rejected' ? '#fef2f2' :
                                                '#f8fafc',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '12px'
                                        }}>
                                            <div style={{
                                                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: pendingRescheduleRequest.status === 'pending' ? '#fef3c7' :
                                                    pendingRescheduleRequest.status === 'approved' ? '#dcfce7' :
                                                    pendingRescheduleRequest.status === 'rejected' ? '#fee2e2' : '#f1f5f9'
                                            }}>
                                                {pendingRescheduleRequest.status === 'pending' && <Clock size={18} color="#d97706" />}
                                                {pendingRescheduleRequest.status === 'approved' && <CheckCircle size={18} color="#16a34a" />}
                                                {pendingRescheduleRequest.status === 'rejected' && <X size={18} color="#dc2626" />}
                                                {pendingRescheduleRequest.status === 'expired' && <AlertTriangle size={18} color="#94a3b8" />}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px', color: '#1e293b' }}>
                                                    {pendingRescheduleRequest.status === 'pending' && 'Reschedule Request Pending'}
                                                    {pendingRescheduleRequest.status === 'approved' && 'Reschedule Request Approved'}
                                                    {pendingRescheduleRequest.status === 'rejected' && 'Reschedule Request Declined'}
                                                    {pendingRescheduleRequest.status === 'expired' && 'Reschedule Request Expired'}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.5' }}>
                                                    {pendingRescheduleRequest.status === 'pending' && (
                                                        <>Awaiting studio review. Requested date: <strong>{new Date(pendingRescheduleRequest.requested_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                                                        {pendingRescheduleRequest.seconds_remaining > 0 && (
                                                            <span style={{ display: 'block', marginTop: '4px', color: '#d97706', fontWeight: 600 }}>
                                                                Expires in {Math.floor(pendingRescheduleRequest.seconds_remaining / 3600)}h {Math.floor((pendingRescheduleRequest.seconds_remaining % 3600) / 60)}m
                                                            </span>
                                                        )}
                                                        </>
                                                    )}
                                                    {pendingRescheduleRequest.status === 'approved' && 'Your appointment has been rescheduled as requested.'}
                                                    {pendingRescheduleRequest.status === 'rejected' && (
                                                        <>Your request was declined. {pendingRescheduleRequest.admin_notes && <><br/><strong>Studio notes:</strong> {pendingRescheduleRequest.admin_notes}</>}</>
                                                    )}
                                                    {pendingRescheduleRequest.status === 'expired' && 'This request expired because no action was taken within 24 hours.'}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* B-M1: Project Timeline */}
                                    {(projectTimeline || projectTimelineLoading) && (
                                        <div style={{ marginBottom: '24px' }}>
                                            <button
                                                type="button"
                                                onClick={() => setTimelineCollapsed(!timelineCollapsed)}
                                                style={{
                                                    width: '100%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '12px 16px',
                                                    backgroundColor: 'rgba(15,23,42,0.03)',
                                                    border: '1px solid rgba(190,144,85,0.3)',
                                                    borderRadius: timelineCollapsed ? '12px' : '12px 12px 0 0',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    outline: 'none'
                                                }}
                                                aria-label={timelineCollapsed ? 'Expand project timeline' : 'Collapse project timeline'}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Layers size={16} color="#be9055" />
                                                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#be9055', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Project Timeline</span>
                                                    {projectTimeline?.design_title && (
                                                        <span style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic', marginLeft: '4px' }}>{projectTimeline.design_title}</span>
                                                    )}
                                                    <div style={{
                                                        padding: '2px 8px', borderRadius: '20px', marginLeft: '6px',
                                                        backgroundColor: projectTimeline?.status === 'active' ? 'rgba(190,144,85,0.15)' : 'rgba(20,163,74,0.15)'
                                                    }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: '700', color: projectTimeline?.status === 'active' ? '#be9055' : '#16a34a' }}>
                                                            {projectTimeline?.status === 'completed_early' ? 'Done Early' : projectTimeline?.status === 'completed' ? 'Completed' : 'Active'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span style={{ color: '#be9055', fontSize: '1.2rem', fontWeight: 'bold' }}>{timelineCollapsed ? '+' : '−'}</span>
                                            </button>

                                            {!timelineCollapsed && (
                                                <div style={{
                                                    backgroundColor: '#ffffff',
                                                    border: '1px solid rgba(190,144,85,0.2)',
                                                    borderTop: 'none',
                                                    borderRadius: '0 0 12px 12px',
                                                    padding: '20px 16px'
                                                }}>
                                                    {projectTimelineLoading ? (
                                                        <div style={{ textAlign: 'center', padding: '10px', color: '#be9055' }}>Loading timeline...</div>
                                                    ) : (() => {
                                                        if (!projectTimeline) return null;
                                                        const sessions = projectTimeline.sessions || [];
                                                        const planned = Math.max(projectTimeline.total_sessions_planned || 1, sessions.reduce((m, s) => Math.max(m, s.session_number || 0), 0));
                                                        const nodes = Array.from({ length: planned }, (_, i) => ({
                                                            num: i + 1,
                                                            session: sessions.find(s => (s.session_number || 0) === i + 1)
                                                        }));
                                                        const completedCount = sessions.filter(s => s.status === 'completed').length;
                                                        return (
                                                            <>
                                                                <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', paddingBottom: '8px', paddingLeft: '8px', paddingRight: '8px' }} className="hide-scrollbar">
                                                                    {nodes.map((node, idx) => {
                                                                        const isCompleted = node.session?.status === 'completed';
                                                                        const isCurrent = node.session?.id === selectedApt?.id;
                                                                        const isPlanned = !node.session;
                                                                        const isLast = idx === nodes.length - 1;
                                                                        const dotBg = isCompleted ? 'rgba(190,144,85,0.1)' : isCurrent ? 'rgba(245,158,11,0.15)' : '#f1f5f9';
                                                                        const dotBorder = isCompleted ? '#be9055' : isCurrent ? '#f59e0b' : '#cbd5e1';
                                                                        const labelColor = isCompleted ? '#be9055' : isCurrent ? '#d97706' : '#64748b';
                                                                        
                                                                        return (
                                                                            <div key={node.num} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                                                                {idx > 0 && (
                                                                                    <div style={{ width: '32px', height: '2px', borderRadius: '2px', backgroundColor: isCompleted ? '#be9055' : '#e2e8f0' }} />
                                                                                )}
                                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 4px' }}>
                                                                                    <div style={{
                                                                                        width: '36px', height: '36px', borderRadius: '18px',
                                                                                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                                                                                        border: `${isCompleted ? '2px' : isCurrent ? '2.5px' : '1.5px'} solid ${dotBorder}`,
                                                                                        backgroundColor: dotBg,
                                                                                        boxShadow: isCurrent ? '0 4px 10px rgba(245,158,11,0.25)' : 'none',
                                                                                        transition: 'all 0.3s'
                                                                                    }}>
                                                                                        {isCompleted ? <CheckCircle size={16} color="#be9055" /> : isPlanned ? <Circle size={12} color="#94a3b8" /> : <span style={{ fontSize: '0.8rem', fontWeight: '700', color: isCurrent ? '#d97706' : '#475569' }}>{node.num}</span>}
                                                                                    </div>
                                                                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: labelColor, marginTop: '6px' }}>S{node.num}</span>
                                                                                    {node.session?.appointment_date && (
                                                                                        <span style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap' }}>
                                                                                            {new Date(node.session.appointment_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {!isLast && (
                                                                                    <div style={{ width: '32px', height: '2px', borderRadius: '2px', backgroundColor: nodes[idx+1]?.session ? '#be9055' : '#e2e8f0' }} />
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '16px', paddingTop: '12px', borderTop: '1px dashed #e2e8f0' }}>
                                                                    <Clock size={14} color="#64748b" />
                                                                    <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '500' }}>{completedCount} of {planned} sessions completed</span>
                                                                </div>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <h4 className="customer-st-6f90639a" >Financial Summary</h4>
                                    <div className="billing-summary customer-st-aa822c5e" >
                                        {/* Line-item breakdown for dual-service appointments */}
                                        {selectedApt.service_type === 'Tattoo + Piercing' && (Number(selectedApt.tattoo_price) > 0 || Number(selectedApt.piercing_price) > 0) && (
                                            <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '10px', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Service Breakdown</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <span style={{ fontSize: '0.88rem', color: '#475569' }}><Syringe size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Tattoo Session</span>
                                                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>₱{Number(selectedApt.tattoo_price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.88rem', color: '#475569' }}><Wrench size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Piercing Service</span>
                                                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>₱{Number(selectedApt.piercing_price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="customer-st-56da6dbd" >
                                            <span className="customer-st-504f25fa" >Total Service Price:</span>
                                            {selectedApt.price > 0 ? (
                                                <span className="customer-st-c6cdc897" >₱{selectedApt.price.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            ) : selectedApt.project_id && selectedApt.session_number > 1 ? (
                                                <span className="customer-st-c6cdc897" style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>Included in Project Price</span>
                                            ) : (
                                                <span className="customer-st-c6cdc897" style={{ color: '#f59e0b', fontSize: '0.9rem' }}>Pending Quote</span>
                                            )}
                                        </div>
                                        <div className="customer-st-56da6dbd" >
                                            <span className="customer-st-504f25fa" >Amount Paid:</span>
                                            <span className="customer-st-49af0fbb" >
                                                ₱{Number(selectedApt.total_paid || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <hr className="customer-st-b45fb1af" />
                                        <div className="customer-st-4110ceca" >
                                            <span className="customer-st-e7b1617c" >Remaining Balance:</span>
                                            <span className="customer-st-58e71408" >
                                                ₱{Math.max(0, selectedApt.price - (selectedApt.total_paid || 0)).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        
                                        {/* Inline Payment Buttons mirroring the external list design */}
                                        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                            {(['pending', 'confirmed', 'scheduled'].includes(selectedApt.status.toLowerCase())) && selectedApt.price > 0 && selectedApt.payment_status === 'unpaid' && (
                                                <button 
                                                    className="btn btn-primary" 
                                                    style={{padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'}}
                                                    onClick={() => handlePay(selectedApt)} 
                                                >
                                                    <CreditCard size={16}/> Pay Deposit Now
                                                </button>
                                            )}
                                            
                                            {selectedApt.payment_status === 'downpayment_paid' && (
                                                <button 
                                                    className="btn btn-primary" 
                                                    style={{padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px', background: '#be9055', color: 'white', border: 'none', boxShadow: '0 4px 10px rgba(245, 158, 11, 0.3)'}}
                                                    onClick={() => handlePay(selectedApt, 'balance')}
                                                >
                                                    <CreditCard size={16}/> Pay Remaining Balance
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="customer-st-5c49f804">
                                    {modalLoading ? (
                                        <p style={{ color: '#64748b' }}>Loading transactions...</p>
                                    ) : modalTransactions.length > 0 ? (
                                        <div style={{width: '100%'}}>
                                            {modalTransactions.map(t => (
                                                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #e2e8f0' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{new Date(t.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric'})}</span>
                                                        <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {t.payment_method || 'PayMongo'} 
                                                            {t.paymongo_payment_id && <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' }}>{t.paymongo_payment_id.substring(0,8)}</span>}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                        <span style={{ fontWeight: 700, color: t.status.toLowerCase() === 'paid' ? '#10b981' : '#f59e0b', fontSize: '1.1rem' }}>₱{(t.amount/100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: t.status.toLowerCase()==='paid'? '#ecfdf5' : '#fff7ed', color: t.status.toLowerCase()==='paid'?'#059669':'#ea580c', borderRadius: '12px', fontWeight: 600 }}>{t.status.toUpperCase()}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '40px 10px', color: '#94a3b8' }}>
                                            <Inbox size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                                            <p style={{ fontSize: '0.95rem' }}>No payment history exists for this session yet.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="modal-footer modal-footer-spaced" >
                            <button className="btn btn-secondary btn-close-modal" onClick={() => setIsModalOpen(false)}>Close</button>
                            {selectedApt.waiver_accepted_at && (
                                <button
                                    className="btn btn-secondary btn-action-waiver"
                                    onClick={() => window.open(`/customer/waiver/${selectedApt.id}`, '_blank')}
                                >
                                    <ShieldCheck size={16} /> View Waiver
                                </button>
                            )}
                            
                            {(['pending', 'confirmed', 'scheduled'].includes(selectedApt.status.toLowerCase())) && (
                                <button 
                                    className={`btn btn-secondary btn-action-reschedule ${(selectedApt.reschedule_count || 0) >= 1 ? 'disabled-state' : ''}`}
                                    onClick={() => handleOpenReschedule(selectedApt)}
                                >
                                    <CalendarDays size={16}/> Reschedule{(selectedApt.reschedule_count || 0) >= 1 ? ' (Used)' : ''}
                                </button>
                            )}
                            
                            {/* Deadline Cancel (available before cutoff: 3 days for consultations, 7 days for sessions) */}
                            {!['cancelled', 'completed', 'finished'].includes(selectedApt.status.toLowerCase()) && isWithinGracePeriod(selectedApt) && (
                                <GracePeriodTimer appointment={selectedApt} onCancel={openGraceCancelModal} />
                            )}

                            {/* Standard Cancel (only for pending, unpaid, after deadline) */}
                            {selectedApt.status.toLowerCase() === 'pending' && !isWithinGracePeriod(selectedApt) && (
                                <button 
                                    className="btn btn-secondary btn-action-cancel" 
                                    onClick={() => handleCancelBooking(selectedApt)}
                                >
                                    <X size={16}/> Cancel Booking
                                </button>
                            )}
                            
                            {(['pending', 'confirmed', 'scheduled'].includes(selectedApt.status.toLowerCase())) && selectedApt.price > 0 && selectedApt.payment_status === 'unpaid' && (
                                <button className="btn btn-primary btn-action-pay-deposit" onClick={() => handlePay(selectedApt)} >
                                    <CreditCard size={18}/> Pay Deposit
                                </button>
                            )}
                            
                            {selectedApt.payment_status === 'downpayment_paid' && (
                                <button 
                                    className="btn btn-primary btn-action-pay-balance" 
                                    onClick={() => handlePay(selectedApt, 'balance')}
                                >
                                    <CreditCard size={18}/> Pay Remaining Balance
                                </button>
                            )}
                            
                            {selectedApt.payment_status === 'paid' && selectedApt.price > 0 && (
                                <div className="status-badge-v2 confirmed badge-fully-paid" >
                                    <CheckCircle size={18}/> Fully Paid
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}



            {showAftercare && selectedApt && (
                <div className="modal-overlay" onClick={() => setShowAftercare(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="customer-st-da70abb8" ><Heart size={24} color="#10b981" /> Aftercare Guide</h2>
                            <button className="close-btn" onClick={() => setShowAftercare(false)}><X size={24} /></button>
                        </div>
                        <div className="modal-body">
                            <p className="customer-st-5242ed5e" >Congratulations on your new tattoo! Proper aftercare is crucial for vibrant colors and smooth healing. Please follow these steps carefully:</p>
                            
                            <div className="customer-st-409d6bf5" >
                                <div className="customer-st-360705c8" >
                                    <h4 className="customer-st-e458bee7" >1. The First Hours</h4>
                                    <p className="customer-st-c9d8a99f" >
                                        Leave the bandage on for 2-4 hours. Wash gently with warm water and fragrance-free antibacterial soap. Do not scrub.
                                    </p>
                                </div>
                                
                                <div className="customer-st-360705c8" >
                                    <h4 className="customer-st-e458bee7" >2. Healing Phase (14 Days)</h4>
                                    <p className="customer-st-c9d8a99f" >
                                        Apply a thin layer of unscented lotion 2-3 times a day. Do NOT pick or scratch scabs. Avoid direct sunlight and swimming.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="customer-st-040844df" >
                                <p className="customer-st-e7d774e4" >
                                    Questions? Reach out to your artist immediately if red, swollen, or hot to the touch.
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary customer-st-1daa6293" onClick={() => setShowAftercare(false)}>Got it!</button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Reschedule Modal */}
            {isRescheduleModalOpen && selectedApt && (
                <div className="modal-overlay" onClick={() => { setIsRescheduleModalOpen(false); setShowRescheduleConfirm(false); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><CalendarDays size={20} color="#6366f1" /> Reschedule Appointment</h3>
                            <button className="close-btn" onClick={() => { setIsRescheduleModalOpen(false); setShowRescheduleConfirm(false); }}><X size={20} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            {/* Confirmation overlay */}
                            {showRescheduleConfirm ? (
                                <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                        <AlertTriangle size={28} color="#f59e0b" />
                                    </div>
                                    <h3 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '1.15rem' }}>Are you sure you want to reschedule?</h3>
                                    <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 8px' }}>
                                        You are only allowed to reschedule this appointment <strong style={{ color: '#dc2626' }}>once</strong>.
                                    </p>
                                    <p style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: '600', margin: '0 0 20px' }}>
                                        After this, you will not be able to reschedule again.
                                    </p>
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '20px', textAlign: 'left' }}>
                                        <p style={{ margin: '0 0 6px', fontSize: '0.85rem', color: '#64748b' }}><strong style={{ color: '#1e293b' }}>New Date:</strong> {new Date(rescheduleDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}><strong style={{ color: '#1e293b' }}>Reason:</strong> {rescheduleReason === 'Other' ? rescheduleReasonText : rescheduleReason}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                        <button className="btn btn-secondary" onClick={() => setShowRescheduleConfirm(false)} style={{ minWidth: '100px' }}>Go Back</button>
                                        <button 
                                            className="btn btn-primary"
                                            disabled={isRescheduling}
                                            onClick={handleSubmitReschedule}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minWidth: '160px' }}
                                        >
                                            {isRescheduling ? 'Rescheduling...' : <><CalendarDays size={16}/> Yes, Reschedule</>}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                        <AlertTriangle size={18} color="#d97706" style={{ marginTop: '2px', flexShrink: 0 }} />
                                        <div style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: '1.5' }}>
                                            <strong>Reschedule Policy:</strong> You may reschedule <strong>once</strong> per appointment. Rescheduling is only allowed if the appointment is more than 1 week away. This action cannot be undone.
                                        </div>
                                    </div>

                                    <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '12px', fontWeight: '600' }}>Select a new date:</p>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                            <button type="button" onClick={() => setRescheduleMonth(new Date(rescheduleMonth.getFullYear(), rescheduleMonth.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><ChevronLeft size={20}/></button>
                                            <span style={{ fontWeight: '700', color: '#1e293b' }}>{monthNames[rescheduleMonth.getMonth()]} {rescheduleMonth.getFullYear()}</span>
                                            <button type="button" onClick={() => setRescheduleMonth(new Date(rescheduleMonth.getFullYear(), rescheduleMonth.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><ChevronRight size={20}/></button>
                                        </div>
                                        <div className="grid-calendar-days" style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                                            {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} style={{ fontWeight: '700', color: '#94a3b8', padding: '6px 0' }}>{d}</div>)}
                                            {renderRescheduleCalendar()}
                                        </div>
                                    </div>

                                    {rescheduleDate && (
                                        <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <CheckCircle size={18} color="#16a34a" />
                                            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#166534' }}>New date: {new Date(rescheduleDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                        </div>
                                    )}

                                    {/* Reschedule Reason */}
                                    <div style={{ marginTop: '20px' }}>
                                        <label style={{ fontSize: '0.9rem', color: '#475569', fontWeight: '600', display: 'block', marginBottom: '8px' }}>Reason for rescheduling <span style={{ color: '#ef4444' }}>*</span></label>
                                        <select 
                                            value={rescheduleReason} 
                                            onChange={(e) => { setRescheduleReason(e.target.value); if (e.target.value !== 'Other') setRescheduleReasonText(''); }}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: rescheduleReason ? '#1e293b' : '#94a3b8', background: 'white', outline: 'none', cursor: 'pointer' }}
                                        >
                                            <option value="" disabled>Select a reason...</option>
                                            {rescheduleReasonOptions.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>

                                        {rescheduleReason === 'Other' && (
                                            <div style={{ marginTop: '10px' }}>
                                                <textarea
                                                    value={rescheduleReasonText}
                                                    onChange={(e) => { if (e.target.value.length <= 300) setRescheduleReasonText(e.target.value); }}
                                                    placeholder="Please describe your reason..."
                                                    maxLength={300}
                                                    rows={3}
                                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#1e293b', resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                                                />
                                                <span style={{ fontSize: '0.75rem', color: rescheduleReasonText.length >= 280 ? '#ef4444' : '#94a3b8', float: 'right', marginTop: '4px' }}>
                                                    {rescheduleReasonText.length}/300
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        {!showRescheduleConfirm && (
                            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
                                <button className="btn btn-secondary" onClick={() => setIsRescheduleModalOpen(false)}>Cancel</button>
                                <button 
                                    className="btn btn-primary"
                                    disabled={!rescheduleDate || !rescheduleReason || (rescheduleReason === 'Other' && !rescheduleReasonText.trim())}
                                    onClick={handleReschedulePreSubmit}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (!rescheduleDate || !rescheduleReason) ? 0.5 : 1 }}
                                >
                                    <CalendarDays size={16}/> Reschedule Session
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Reschedule REQUEST Modal (for appointments within 1 week) */}
            {isRescheduleRequestModalOpen && selectedApt && (
                <div className="modal-overlay" onClick={() => { setIsRescheduleRequestModalOpen(false); setShowRequestConfirm(false); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={20} color="#d97706" /> Request Reschedule</h3>
                            <button className="close-btn" onClick={() => { setIsRescheduleRequestModalOpen(false); setShowRequestConfirm(false); }}><X size={20} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            {showRequestConfirm ? (
                                <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                        <Clock size={28} color="#d97706" />
                                    </div>
                                    <h3 style={{ margin: '0 0 8px', color: '#1e293b', fontSize: '1.15rem' }}>Submit Reschedule Request?</h3>
                                    <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 8px' }}>
                                        This request will be sent to the studio for review. It is <strong style={{ color: '#d97706' }}>not an instant reschedule</strong>.
                                    </p>
                                    <p style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: '600', margin: '0 0 20px' }}>
                                        The studio must respond within 24 hours or the request will expire.
                                    </p>
                                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '20px', textAlign: 'left' }}>
                                        <p style={{ margin: '0 0 6px', fontSize: '0.85rem', color: '#64748b' }}><strong style={{ color: '#1e293b' }}>Requested Date:</strong> {new Date(rescheduleRequestData.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}><strong style={{ color: '#1e293b' }}>Reason:</strong> {rescheduleRequestData.reason === 'Other' ? rescheduleRequestData.reasonText : rescheduleRequestData.reason}</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                        <button className="btn btn-secondary" onClick={() => setShowRequestConfirm(false)} style={{ minWidth: '100px' }}>Go Back</button>
                                        <button 
                                            className="btn btn-primary"
                                            disabled={isSubmittingRequest}
                                            onClick={handleSubmitRescheduleRequest}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minWidth: '160px', background: '#d97706', color: 'white' }}
                                        >
                                            {isSubmittingRequest ? 'Submitting...' : <><Clock size={16}/> Submit Request</>}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '12px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                        <AlertTriangle size={18} color="#ea580c" style={{ marginTop: '2px', flexShrink: 0 }} />
                                        <div style={{ fontSize: '0.85rem', color: '#9a3412', lineHeight: '1.5' }}>
                                            <strong>Request-Based Reschedule:</strong> Since your appointment is within 1 week, this will be submitted as a <strong>request</strong> for the studio to review. You will be notified of their decision within <strong>24 hours</strong>. If approved, this will count as your 1 allowed reschedule.
                                        </div>
                                    </div>

                                    <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '12px', fontWeight: '600' }}>Select your preferred new date:</p>
                                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                            <button type="button" onClick={() => setRescheduleMonth(new Date(rescheduleMonth.getFullYear(), rescheduleMonth.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><ChevronLeft size={20}/></button>
                                            <span style={{ fontWeight: '700', color: '#1e293b' }}>{monthNames[rescheduleMonth.getMonth()]} {rescheduleMonth.getFullYear()}</span>
                                            <button type="button" onClick={() => setRescheduleMonth(new Date(rescheduleMonth.getFullYear(), rescheduleMonth.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}><ChevronRight size={20}/></button>
                                        </div>
                                        <div className="grid-calendar-days" style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                                            {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} style={{ fontWeight: '700', color: '#94a3b8', padding: '6px 0' }}>{d}</div>)}
                                            {(() => {
                                                const year = rescheduleMonth.getFullYear();
                                                const month = rescheduleMonth.getMonth();
                                                const firstDay = new Date(year, month, 1).getDay();
                                                const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                const today = new Date(); today.setHours(0,0,0,0);
                                                
                                                const now = new Date();
                                                const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
                                                twelveHoursFromNow.setHours(0,0,0,0);

                                                const cells = [];
                                                for (let i = 0; i < firstDay; i++) cells.push(<div key={`empty-${i}`} />);
                                                for (let day = 1; day <= daysInMonth; day++) {
                                                    const dateObj = new Date(year, month, day);
                                                    dateObj.setHours(0,0,0,0);
                                                    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                                                    const isPast = dateObj < twelveHoursFromNow;
                                                    const isSelected = rescheduleRequestData.date === dateStr;
                                                    cells.push(
                                                        <div
                                                            key={day}
                                                            onClick={() => !isPast && setRescheduleRequestData(prev => ({...prev, date: dateStr}))}
                                                            style={{
                                                                padding: '8px 4px', borderRadius: '8px', cursor: isPast ? 'not-allowed' : 'pointer',
                                                                background: isSelected ? '#d97706' : 'transparent',
                                                                color: isSelected ? 'white' : isPast ? '#cbd5e1' : '#1e293b',
                                                                fontWeight: isSelected ? '700' : '500',
                                                                opacity: isPast ? 0.4 : 1,
                                                                transition: 'all 0.15s',
                                                            }}
                                                        >{day}</div>
                                                    );
                                                }
                                                return cells;
                                            })()}
                                        </div>
                                    </div>

                                    {rescheduleRequestData.date && (
                                        <div style={{ marginTop: '16px', padding: '12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <CalendarDays size={18} color="#ea580c" />
                                            <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#9a3412' }}>Requested date: {new Date(rescheduleRequestData.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                        </div>
                                    )}

                                    {/* Reason */}
                                    <div style={{ marginTop: '20px' }}>
                                        <label style={{ fontSize: '0.9rem', color: '#475569', fontWeight: '600', display: 'block', marginBottom: '8px' }}>Reason for reschedule request <span style={{ color: '#ef4444' }}>*</span></label>
                                        <select 
                                            value={rescheduleRequestData.reason} 
                                            onChange={(e) => setRescheduleRequestData(prev => ({...prev, reason: e.target.value, reasonText: e.target.value !== 'Other' ? '' : prev.reasonText}))}
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: rescheduleRequestData.reason ? '#1e293b' : '#94a3b8', background: 'white', outline: 'none', cursor: 'pointer' }}
                                        >
                                            <option value="" disabled>Select a reason...</option>
                                            {rescheduleReasonOptions.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>

                                        {rescheduleRequestData.reason === 'Other' && (
                                            <div style={{ marginTop: '10px' }}>
                                                <textarea
                                                    value={rescheduleRequestData.reasonText}
                                                    onChange={(e) => { if (e.target.value.length <= 300) setRescheduleRequestData(prev => ({...prev, reasonText: e.target.value})); }}
                                                    placeholder="Please describe your reason..."
                                                    maxLength={300}
                                                    rows={3}
                                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', color: '#1e293b', resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                                                />
                                                <span style={{ fontSize: '0.75rem', color: rescheduleRequestData.reasonText.length >= 280 ? '#ef4444' : '#94a3b8', float: 'right', marginTop: '4px' }}>
                                                    {rescheduleRequestData.reasonText.length}/300
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        {!showRequestConfirm && (
                            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
                                <button className="btn btn-secondary" onClick={() => setIsRescheduleRequestModalOpen(false)}>Cancel</button>
                                <button 
                                    className="btn btn-primary"
                                    disabled={!rescheduleRequestData.date || !rescheduleRequestData.reason || (rescheduleRequestData.reason === 'Other' && !rescheduleRequestData.reasonText.trim())}
                                    onClick={() => setShowRequestConfirm(true)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: (!rescheduleRequestData.date || !rescheduleRequestData.reason) ? 0.5 : 1, background: '#d97706', color: 'white' }}
                                >
                                    <Clock size={16}/> Submit Request
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Custom New Booking Modal */}
            {isBookingModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content large" style={{ width: '95vw', maxWidth: '1050px', height: '92vh', maxHeight: '900px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div className="modal-header">
                            <h2 className="customer-st-da70abb8" ><Sparkles size={24} color="#be9055" /> New Booking Request</h2>
                            <button className="close-btn" onClick={closeBookingModal}><X size={24} /></button>
                        </div>
                        <div style={{ padding: '0 24px', paddingTop: '16px' }} >
                            <div className="customer-st-befb1147" >
                                <div className="customer-st-f93c6e1f" >
                                    {[1, 2, 3, 4].map(step => (
                                        <div key={step} style={{ 
                                            height: '4px', flex: 1, borderRadius: '2px',
                                            background: bookingStep >= step ? '#be9055' : '#e2e8f0',
                                            transition: 'all 0.4s ease'
                                        }} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body customer-st-4a472601" >
                                
                                {bookingStep === 1 && (
                                    <div className="fade-in">
                                        <h3 className="customer-st-69ffca42" >1. Service Type</h3>

                                        {/* Phase A: Booking Type Toggle */}
                                        <div className="form-group">
                                            <label className="customer-st-36716a21" >Is this a new booking or a follow-up?</label>
                                            <div className="grid-2col" style={{ marginBottom: '20px' }}>
                                                {[
                                                    { key: 'new', label: 'New Booking', icon: <PlusCircle size={22} />, desc: 'Book a brand new session' },
                                                    { key: 'followup', label: 'Follow-Up', icon: <History size={22} />, desc: 'Continue from a past booking' }
                                                ].map(opt => (
                                                    <div
                                                        key={opt.key}
                                                        onClick={() => {
                                                            setBookingData({...bookingData, bookingType: opt.key, selectedServices: [], followupAppointmentId: null});
                                                            if (opt.key === 'followup') fetchCompletedAppointments();
                                                        }}
                                                        style={{
                                                            padding: '20px', borderRadius: '14px',
                                                            border: `2px solid ${bookingData.bookingType === opt.key ? '#be9055' : '#e2e8f0'}`,
                                                            background: bookingData.bookingType === opt.key ? '#fffdf5' : 'white',
                                                            cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                                                            boxShadow: bookingData.bookingType === opt.key ? '0 4px 12px rgba(218,165,32,0.15)' : 'none'
                                                        }}
                                                    >
                                                        <div style={{ color: bookingData.bookingType === opt.key ? '#be9055' : '#64748b', marginBottom: '8px' }}>{opt.icon}</div>
                                                        <span style={{ fontWeight: '700', fontSize: '1rem', color: '#1e293b', display: 'block' }}>{opt.label}</span>
                                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{opt.desc}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Follow-Up: Past Appointment Picker */}
                                        {bookingData.bookingType === 'followup' && (
                                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                                <label className="customer-st-36716a21" >Which previous appointment is this a follow-up for?</label>
                                                {completedAppointments.length === 0 ? (
                                                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                        <Inbox size={28} style={{ marginBottom: '8px' }} />
                                                        <p style={{ margin: 0, fontSize: '0.9rem' }}>No completed appointments found. You don't have any past sessions to follow up on.</p>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                                                        {completedAppointments.map(apt => {
                                                            const isSelected = bookingData.followupAppointmentId === apt.id;
                                                            return (
                                                                <div
                                                                    key={apt.id}
                                                                    onClick={() => setBookingData({...bookingData, followupAppointmentId: apt.id})}
                                                                    style={{
                                                                        padding: '14px 16px', borderRadius: '10px',
                                                                        border: `2px solid ${isSelected ? '#be9055' : '#e2e8f0'}`,
                                                                        background: isSelected ? '#fffdf5' : 'white',
                                                                        cursor: 'pointer', transition: 'all 0.2s',
                                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                                                    }}
                                                                >
                                                                    <div>
                                                                        <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.9rem' }}>
                                                                            {getDisplayCode(apt.booking_code, apt.id)}
                                                                        </span>
                                                                        <span style={{ color: '#64748b', fontSize: '0.85rem', marginLeft: '10px' }}>
                                                                            {apt.service_type} — {new Date(apt.appointment_date).toLocaleDateString()}
                                                                        </span>
                                                                    </div>
                                                                    {isSelected && <Check size={18} color="#be9055" />}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Phase B: Service Checkboxes (shown after booking type selected) */}
                                        {bookingData.bookingType && (bookingData.bookingType === 'new' || bookingData.followupAppointmentId) && (
                                            <div className="form-group">
                                                <label className="customer-st-36716a21" >Select your services</label>
                                                <div className="grid-3col">
                                                    {[
                                                        { key: 'Tattoo Session', icon: <Sparkles size={20} />, color: '#be9055' },
                                                        { key: 'Consultation', icon: <MessageSquare size={20} />, color: '#3b82f6' },
                                                        { key: 'Piercing', icon: <Scissors size={20} />, color: '#8b5cf6' }
                                                    ].map(svc => {
                                                        const isChecked = bookingData.selectedServices.includes(svc.key);
                                                        // Mutual exclusion: Consultation is exclusive vs Tattoo/Piercing
                                                        const isDisabled = (
                                                            (svc.key === 'Consultation' && (bookingData.selectedServices.includes('Tattoo Session') || bookingData.selectedServices.includes('Piercing'))) ||
                                                            ((svc.key === 'Tattoo Session' || svc.key === 'Piercing') && bookingData.selectedServices.includes('Consultation'))
                                                        );
                                                        return (
                                                            <div
                                                                key={svc.key}
                                                                onClick={() => {
                                                                    if (isDisabled) return;
                                                                    const current = [...bookingData.selectedServices];
                                                                    if (isChecked) {
                                                                        setBookingData({...bookingData, selectedServices: current.filter(s => s !== svc.key)});
                                                                    } else {
                                                                        setBookingData({...bookingData, selectedServices: [...current, svc.key]});
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '18px 12px', borderRadius: '12px',
                                                                    border: `2px solid ${isChecked ? svc.color : isDisabled ? '#f1f5f9' : '#e2e8f0'}`,
                                                                    background: isChecked ? `${svc.color}08` : isDisabled ? '#f8fafc' : 'white',
                                                                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                                    textAlign: 'center', transition: 'all 0.2s',
                                                                    opacity: isDisabled ? 0.45 : 1,
                                                                    position: 'relative'
                                                                }}
                                                            >
                                                                {/* Checkbox indicator */}
                                                                <div style={{
                                                                    position: 'absolute', top: '8px', right: '8px',
                                                                    width: '20px', height: '20px', borderRadius: '5px',
                                                                    border: `2px solid ${isChecked ? svc.color : '#cbd5e1'}`,
                                                                    background: isChecked ? svc.color : 'white',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    transition: 'all 0.2s'
                                                                }}>
                                                                    {isChecked && <Check size={14} color="white" strokeWidth={3} />}
                                                                </div>
                                                                <div style={{ color: isChecked ? svc.color : (isDisabled ? '#cbd5e1' : '#64748b'), marginBottom: '8px' }}>{svc.icon}</div>
                                                                <span style={{ fontWeight: '700', fontSize: '0.9rem', color: isDisabled ? '#cbd5e1' : '#1e293b' }}>{svc.key}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {bookingData.selectedServices.includes('Tattoo Session') && bookingData.selectedServices.includes('Piercing') && (
                                                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Sparkles size={16} color="#d97706" />
                                                        <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: '500' }}>Bundled: Tattoo + Piercing in the same session</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="customer-st-59166514" >
                                            <p className="customer-st-7b7d7267" >
                                                <Info className="customer-st-ff2b4fb6" size={14} />
                                                <strong>Artist Assignment:</strong> Our studio management will review your design and assign the best-suited resident artist for your specific style and complexity.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {bookingStep === 2 && (() => {
                                    const derivedType = getDerivedServiceType(bookingData.selectedServices);
                                    return (
                                    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                        <h3 className="customer-st-69ffca42" >2. Design Details</h3>
                                        <div className="grid-2col" style={{ flex: 1, minHeight: 0 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
                                                <div className="form-group" style={{ marginBottom: 0 }}>
                                                    <label className="customer-st-67198c20" >Idea Name <span style={{ color: '#ef4444', fontWeight: '400' }}>*</span></label>
                                                    <input 
                                                        type="text" className="form-input" placeholder="e.g. Traditional Dagger with Flowers" 
                                                        name="designTitle" maxLength={150}
                                                        value={bookingData.designTitle} onChange={handleBookingFormChange}
                                                        style={{ border: errors.designTitle ? '1px solid #ef4444' : undefined }}
                                                    />
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                                        {errors.designTitle ? <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>{errors.designTitle}</span> : <span />}
                                                        <small style={{ color: (bookingData.designTitle?.length || 0) >= 140 ? '#ef4444' : '#94a3b8', fontSize: '0.75rem' }}>{bookingData.designTitle?.length || 0}/150</small>
                                                    </div>
                                                </div>
                                                <div className="form-group customer-st-5d155c93" style={{ marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                                                    <label className="customer-st-67198c20" >Tell us your story (Optional)</label>
                                                    <textarea 
                                                        className="form-input" placeholder="Explain the concept here"
                                                        name="notes" maxLength={500}
                                                        value={bookingData.notes} onChange={handleBookingFormChange}
                                                        style={{ resize: 'none', border: errors.notes ? '1px solid #ef4444' : undefined, flex: 1 }}
                                                    />
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                                        {errors.notes ? <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>{errors.notes}</span> : <span />}
                                                        <small style={{ color: (bookingData.notes?.length || 0) >= 480 ? '#ef4444' : '#94a3b8', fontSize: '0.75rem' }}>{bookingData.notes?.length || 0}/500</small>
                                                    </div>
                                                </div>
                                                {derivedType === 'Tattoo + Piercing' && (
                                                    <div style={{ padding: '14px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '12px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                        <Sparkles size={18} color="#d97706" style={{ marginTop: '2px', flexShrink: 0 }} />
                                                        <div style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: '1.5' }}>
                                                            <strong>Bundled Service:</strong> You are booking a tattoo session and a piercing back-to-back on the same day. Both placements will be captured in the next step.
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="form-group customer-st-5d155c93" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                                                <label className="customer-st-67198c20" >Reference Image</label>
                                                <div 
                                                    onClick={() => document.getElementById('modal-ref-img').click()}
                                                    style={{ 
                                                        flex: 1, border: '2px dashed #e2e8f0', borderRadius: '12px', 
                                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                                                        cursor: 'pointer', background: bookingData.referenceImage ? '#f8fafc' : 'transparent', overflow: 'hidden',
                                                        minHeight: '180px'
                                                    }}
                                                >
                                                    {bookingData.referenceImage ? (
                                                        <img className="customer-st-2fbefd4f" src={bookingData.referenceImage} alt="Ref" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                    ) : (
                                                        <>
                                                            <ImageIcon size={32} color="#94a3b8" style={{ marginBottom: '8px' }} />
                                                            <span className="customer-st-4b235664" style={{ fontSize: '0.85rem', textAlign: 'center', padding: '0 10px' }} >Upload a photo or sketch</span>
                                                        </>
                                                    )}
                                                    <input type="file" id="modal-ref-img" hidden accept="image/*" onChange={handleImageUpload} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    );
                                })()}

                                {bookingStep === 3 && (() => {
                                    const derivedType = getDerivedServiceType(bookingData.selectedServices);
                                    const tattooBodyParts = ["Face", "Neck", "Chest", "Back", "Left Shoulder", "Right Shoulder", "Left Upper Arm", "Right Upper Arm", "Left Forearm", "Right Forearm", "Left Wrist", "Right Wrist", "Left Hand", "Right Hand", "Left Ribs", "Right Ribs", "Left Hip", "Right Hip", "Left Thigh", "Right Thigh", "Left Calf", "Right Calf", "Left Ankle", "Right Ankle", "Other"];
                                    const piercingBodyParts = ["Left Ear Lobe", "Right Ear Lobe", "Left Helix", "Right Helix", "Left Tragus", "Right Tragus", "Left Conch", "Right Conch", "Left Industrial", "Right Industrial", "Left Nostril", "Right Nostril", "Septum", "Left Eyebrow", "Right Eyebrow", "Lip/Oral", "Navel", "Left Nipple", "Right Nipple", "Other"];

                                    // Decide which placement buttons to show
                                    const showTattooPlacement = bookingData.selectedServices.includes('Tattoo Session')
                                        || (derivedType === 'Consultation' && bookingData.consultationFor.includes('tattoo'));
                                    const showPiercingPlacement = bookingData.selectedServices.includes('Piercing')
                                        || (derivedType === 'Consultation' && bookingData.consultationFor.includes('piercing'));

                                    // Determine which array holds piercing selections
                                    const piercingField = (derivedType === 'Tattoo + Piercing' || (derivedType === 'Consultation' && showTattooPlacement)) ? 'piercingPlacement' : 'placement';

                                    // Handler for 3D model clicks — routes to correct array
                                    const handleModelToggle = (partName, category) => {
                                        if (category === 'tattoo') togglePlacementItem('placement', partName);
                                        else if (category === 'piercing') togglePlacementItem(piercingField, partName);
                                    };

                                    return (
                                    <div className="fade-in">
                                        <h3 className="customer-st-69ffca42" >3. Placement</h3>

                                        {/* Consultation sub-question: What is this consultation for? */}
                                        {derivedType === 'Consultation' && (
                                            <div style={{ marginBottom: '20px' }}>
                                                <p className="customer-st-b943a453" style={{ marginBottom: '10px' }}>What is this consultation for?</p>
                                                <div style={{ display: 'flex', gap: '12px' }}>
                                                    {[{ key: 'tattoo', label: 'Tattoo', icon: <Paintbrush size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />, color: '#be9055' }, { key: 'piercing', label: 'Piercing', icon: <Gem size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />, color: '#be9055' }].map(opt => {
                                                        const isActive = bookingData.consultationFor.includes(opt.key);
                                                        return (
                                                            <button
                                                                key={opt.key} type="button"
                                                                onClick={() => togglePlacementItem('consultationFor', opt.key)}
                                                                style={{
                                                                    flex: 1, padding: '14px', borderRadius: '12px',
                                                                    border: `2px solid ${isActive ? opt.color : '#e2e8f0'}`,
                                                                    background: isActive ? `${opt.color}15` : 'white',
                                                                    color: isActive ? opt.color : '#64748b',
                                                                    fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s', position: 'relative'
                                                                }}
                                                            >
                                                                {isActive && <Check size={16} style={{ position: 'absolute', top: '6px', right: '6px' }} />}
                                                                {opt.icon}{opt.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '6px', textAlign: 'center' }}>You can select both if your consultation covers tattoo and piercing</p>

                                                {/* Consultation Method: Face-to-Face vs Online */}
                                                <p className="customer-st-b943a453" style={{ marginBottom: '10px', marginTop: '16px' }}>How would you like this consultation?</p>
                                                <div style={{ display: 'flex', gap: '12px' }}>
                                                    {[
                                                        { key: 'Face-to-Face', label: 'Face-to-Face', icon: <Users size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />, color: '#be9055' },
                                                        { key: 'Online', label: 'Online', icon: <Video size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />, color: '#be9055' }
                                                    ].map(opt => {
                                                        const isActive = bookingData.consultationMethod === opt.key;
                                                        return (
                                                            <button
                                                                key={opt.key} type="button"
                                                                onClick={() => setBookingData(prev => ({ ...prev, consultationMethod: opt.key, onlinePlatform: opt.key === 'Face-to-Face' ? '' : prev.onlinePlatform }))}
                                                                style={{
                                                                    flex: 1, padding: '14px', borderRadius: '12px',
                                                                    border: `2px solid ${isActive ? opt.color : '#e2e8f0'}`,
                                                                    background: isActive ? `${opt.color}15` : 'white',
                                                                    color: isActive ? opt.color : '#64748b',
                                                                    fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer',
                                                                    transition: 'all 0.2s', position: 'relative'
                                                                }}
                                                            >
                                                                {isActive && <Check size={16} style={{ position: 'absolute', top: '6px', right: '6px' }} />}
                                                                {opt.icon}{opt.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {/* Online Platform Selector */}
                                                {bookingData.consultationMethod === 'Online' && (
                                                    <div style={{ marginTop: '12px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                                        <p style={{ fontWeight: '700', color: '#1e293b', marginBottom: '10px', fontSize: '0.88rem' }}>Which platform do you prefer?</p>
                                                        <div style={{ display: 'flex', gap: '10px' }}>
                                                            {['Messenger', 'Instagram'].map(platform => {
                                                                const isActive = bookingData.onlinePlatform === platform;
                                                                const color = '#be9055';
                                                                return (
                                                                    <button
                                                                        key={platform} type="button"
                                                                        onClick={() => setBookingData(prev => ({ ...prev, onlinePlatform: platform }))}
                                                                        style={{
                                                                            flex: 1, padding: '12px', borderRadius: '10px',
                                                                            border: `2px solid ${isActive ? color : '#e2e8f0'}`,
                                                                            background: isActive ? `${color}12` : 'white',
                                                                            color: isActive ? color : '#64748b',
                                                                            fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer',
                                                                            transition: 'all 0.2s', position: 'relative'
                                                                        }}
                                                                    >
                                                                        {isActive && <Check size={14} style={{ position: 'absolute', top: '5px', right: '5px' }} />}
                                                                        {platform}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                        {!bookingData.onlinePlatform && (
                                                            <p style={{ fontSize: '0.78rem', color: '#f59e0b', marginTop: '8px', textAlign: 'center' }}>Please select your preferred messaging platform</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Main layout: 3D Model on left, button grids on right */}
                                        {(showTattooPlacement || showPiercingPlacement) && (
                                            <div className="grid-2col" style={{ marginBottom: '12px' }}>
                                                {/* 3D Body Model (shared for both tattoo + piercing) */}
                                                <Suspense fallback={<div style={{ height: '340px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '16px' }}>Loading 3D Model...</div>}>
                                                    <BodyModelViewer
                                                        selectedTattoo={bookingData.placement}
                                                        selectedPiercing={bookingData[piercingField]}
                                                        onToggle={handleModelToggle}
                                                        tattooParts={showTattooPlacement ? tattooBodyParts : []}
                                                        piercingParts={showPiercingPlacement ? piercingBodyParts : []}
                                                        height={showTattooPlacement && showPiercingPlacement ? 440 : 400}
                                                    />
                                                </Suspense>

                                                {/* Button Grids (stacked) */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: showTattooPlacement && showPiercingPlacement ? '440px' : '400px', paddingRight: '4px' }}>
                                                    {showTattooPlacement && (
                                                        <>
                                                            <p style={{ fontWeight: '700', color: '#1e293b', margin: 0, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <Paintbrush size={15} color="#be9055" /> Tattoo Placement
                                                                {bookingData.placement.length > 0 && <span style={{ fontSize: '0.72rem', background: '#be9055', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>{bookingData.placement.length} selected</span>}
                                                            </p>
                                                            {(() => {
                                                                const groups = {
                                                                    'Head / Neck': ['Face', 'Neck'],
                                                                    'Upper Body': ['Chest', 'Back', 'Left Shoulder', 'Right Shoulder', 'Left Ribs', 'Right Ribs', 'Left Hip', 'Right Hip'],
                                                                    'Arms': ['Left Upper Arm', 'Right Upper Arm', 'Left Forearm', 'Right Forearm'],
                                                                    'Hands / Wrists': ['Left Wrist', 'Right Wrist', 'Left Hand', 'Right Hand'],
                                                                    'Lower Body': ['Left Thigh', 'Right Thigh', 'Left Calf', 'Right Calf'],
                                                                    'Feet / Ankles': ['Left Ankle', 'Right Ankle'],
                                                                    'Custom': ['Other']
                                                                };
                                                                return (
                                                                    <div style={{ maxHeight: '320px', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                        {Object.entries(groups).map(([group, parts]) => (
                                                                            <div key={group}>
                                                                                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '6px 0 4px' }}>{group}</p>
                                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                                    {parts.map(part => {
                                                                                        const isSelected = bookingData.placement.includes(part);
                                                                                        return (
                                                                                            <button key={part} type="button" onClick={() => togglePlacementItem('placement', part)} style={{
                                                                                                padding: '7px 12px', borderRadius: '8px',
                                                                                                border: `1.5px solid ${isSelected ? '#be9055' : '#e2e8f0'}`,
                                                                                                background: isSelected ? '#be9055' : 'white',
                                                                                                color: isSelected ? 'white' : '#1e293b',
                                                                                                fontWeight: '600', fontSize: '0.78rem', cursor: 'pointer',
                                                                                                transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                                                boxShadow: isSelected ? '0 2px 8px rgba(193,154,107,0.3)' : 'none'
                                                                                            }}>
                                                                                                {isSelected && <Check size={11} />}
                                                                                                {part}
                                                                                            </button>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </>
                                                    )}

                                                    {showTattooPlacement && showPiercingPlacement && (
                                                        <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />
                                                    )}

                                                    {showPiercingPlacement && (
                                                        <>
                                                            <p style={{ fontWeight: '700', color: '#1e293b', margin: 0, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <Gem size={15} color="#4FC3F7" /> Piercing Placement
                                                                {bookingData[piercingField].length > 0 && <span style={{ fontSize: '0.72rem', background: '#4FC3F7', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>{bookingData[piercingField].length} selected</span>}
                                                            </p>
                                                            {(() => {
                                                                const pGroups = {
                                                                    'Ears': ['Left Ear Lobe', 'Right Ear Lobe', 'Left Helix', 'Right Helix', 'Left Tragus', 'Right Tragus', 'Left Conch', 'Right Conch', 'Left Industrial', 'Right Industrial'],
                                                                    'Nose / Face': ['Left Nostril', 'Right Nostril', 'Septum', 'Left Eyebrow', 'Right Eyebrow'],
                                                                    'Mouth / Lips': ['Lip/Oral'],
                                                                    'Torso': ['Navel', 'Left Nipple', 'Right Nipple'],
                                                                    'Custom': ['Other']
                                                                };
                                                                return (
                                                                    <div style={{ maxHeight: '320px', overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                        {Object.entries(pGroups).map(([group, parts]) => (
                                                                            <div key={group}>
                                                                                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '6px 0 4px' }}>{group}</p>
                                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                                    {parts.map(part => {
                                                                                        const isSelected = bookingData[piercingField].includes(part);
                                                                                        return (
                                                                                            <button key={`p-${part}`} type="button" onClick={() => togglePlacementItem(piercingField, part)} style={{
                                                                                                padding: '7px 12px', borderRadius: '8px',
                                                                                                border: `1.5px solid ${isSelected ? '#4FC3F7' : '#e2e8f0'}`,
                                                                                                background: isSelected ? '#4FC3F7' : 'white',
                                                                                                color: isSelected ? 'white' : '#1e293b',
                                                                                                fontWeight: '600', fontSize: '0.78rem', cursor: 'pointer',
                                                                                                transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                                                boxShadow: isSelected ? '0 2px 8px rgba(79,195,247,0.3)' : 'none'
                                                                                            }}>
                                                                                                {isSelected && <Check size={11} />}
                                                                                                {part}
                                                                                            </button>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <div className="form-group customer-st-842c3fb4" >
                                            <label className="customer-st-fc6d29da" >
                                                Specific location notes
                                                {(bookingData.placement.includes('Other') || bookingData.piercingPlacement.includes('Other')) && (
                                                    <span style={{ color: '#ef4444', fontWeight: '400' }}> *</span>
                                                )}
                                            </label>
                                            <input 
                                                ref={placementNotesRef}
                                                type="text" className="form-input" placeholder={showTattooPlacement && showPiercingPlacement ? 'e.g. Left inner forearm tattoo, right ear helix piercing' : 'e.g. Left inner forearm, near elbow'}
                                                name="placementNotes"
                                                value={bookingData.placementNotes} onChange={handleBookingFormChange} 
                                                maxLength={200}
                                                style={{
                                                    borderColor: errors.placementNotes || ((bookingData.placement.includes('Other') || bookingData.piercingPlacement.includes('Other')) && !bookingData.placementNotes.trim()) ? '#ef4444' : undefined,
                                                    boxShadow: errors.placementNotes || ((bookingData.placement.includes('Other') || bookingData.piercingPlacement.includes('Other')) && !bookingData.placementNotes.trim()) ? '0 0 0 2px rgba(239,68,68,0.15)' : undefined
                                                }}
                                            />
                                            {errors.placementNotes && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.placementNotes}</span>}
                                        </div>

                                        {/* Selection summary */}
                                        {(bookingData.placement.length > 0 || bookingData.piercingPlacement.length > 0) && (
                                            <div style={{ marginTop: '12px', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {bookingData.placement.length > 0 && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#166534' }}>
                                                        <Check size={14} color="#16a34a" />
                                                        <strong>{showPiercingPlacement && showTattooPlacement ? 'Tattoo:' : 'Placement:'}</strong>
                                                        {bookingData.placement.join(', ')}
                                                    </div>
                                                )}
                                                {bookingData.piercingPlacement.length > 0 && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#166534' }}>
                                                        <Check size={14} color="#16a34a" /> <strong>Piercing:</strong> {bookingData.piercingPlacement.join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })()}

                                {bookingStep === 4 && (() => {
                                    const derivedType = getDerivedServiceType(bookingData.selectedServices);
                                    return (
                                    <div className="fade-in">
                                        <h3 className="customer-st-69ffca42" >4. Schedule Your Session</h3>
                                        <div className="customer-st-d1b64d7a" >
                                            <div className="calendar-container customer-st-8601e470" >
                                                <div className="customer-st-0c5ea219" >
                                                    <button className="customer-st-67331937" type="button" onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} ><ChevronLeft size={20}/></button>
                                                    <span className="customer-st-52ddb992" >{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
                                                    <button className="customer-st-67331937" type="button" onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} ><ChevronRight size={20}/></button>
                                                </div>
                                                <div className="calendar-grid grid-calendar-days" style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                                                    {['S','M','T','W','T','F','S'].map(d => <div className="customer-st-1894d8a4" key={d} >{d}</div>)}
                                                    {renderCalendarDays()}
                                                </div>
                                            </div>
                                            {['Consultation', 'Piercing', 'Tattoo + Piercing'].includes(derivedType) && (
                                                <div className="time-slots">
                                                    <label className="customer-st-36716a21" >Preferred Time Slot {derivedType === 'Tattoo + Piercing' ? '(for piercing)' : ''}</label>
                                                    <div className="customer-st-caa523c7" >
                                                        {['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map(t => {
                                                            let isDisabled = false;
                                                            if (bookingData.date) {
                                                                const checkDate = new Date(`${bookingData.date}T${t}:00`);
                                                                if (checkDate <= new Date()) isDisabled = true;
                                                                // Check the correct pool based on service type
                                                                const pool = derivedType === 'Consultation' ? 'consultationTimes' : 'piercingTimes';
                                                                if (bookedDates[bookingData.date] && bookedDates[bookingData.date][pool].includes(t)) isDisabled = true;
                                                            } else {
                                                                isDisabled = true; // Wait for date selection
                                                            }

                                                            return (
                                                            <div 
                                                                key={t}
                                                                onClick={() => {
                                                                    if (!isDisabled) setBookingData({...bookingData, startTime: t});
                                                                }}
                                                                style={{
                                                                    padding: '12px', borderRadius: '8px', border: `1px solid ${bookingData.startTime === t ? '#be9055' : '#e2e8f0'}`,
                                                                    background: bookingData.startTime === t ? '#be9055' : (isDisabled ? '#f8fafc' : 'white'),
                                                                    color: bookingData.startTime === t ? 'white' : (isDisabled ? '#cbd5e1' : '#1e293b'),
                                                                    textAlign: 'center', cursor: isDisabled ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.9rem',
                                                                    opacity: isDisabled ? 0.6 : 1
                                                                }}
                                                            >
                                                                {parseInt(t) > 12 ? (parseInt(t)-12) + ':00 PM' : t + ':00 PM'}
                                                            </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {bookingData.date && bookingData.startTime && (
                                            <div className="customer-st-21be8237" >
                                                <CheckCircle size={20} color="#16a34a" />
                                                <span className="customer-st-e295ad00" >
                                                    Selected: {new Date(bookingData.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} at {bookingData.startTime}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    );
                                })()}
                            </div>

                            <div className="modal-footer" style={{ display: 'flex', flexDirection: 'row', gap: '16px', padding: '16px 24px', borderTop: '1px solid #e2e8f0' }} >
                                <button 
                                    className="btn" 
                                    type="button" 
                                    onClick={() => bookingStep === 1 ? closeBookingModal() : setBookingStep(bookingStep - 1)} 
                                    style={{ 
                                        flex: 1,
                                        background: bookingStep === 1 ? '#ef4444' : '#64748b', 
                                        color: 'white', 
                                        border: 'none', 
                                        padding: '12px', 
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        fontWeight: '600',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {bookingStep === 1 ? 'Cancel' : <><ArrowLeft size={16}/> Previous</>}
                                </button>
                                
                                {bookingStep < 4 ? (
                                    <button 
                                        className="btn" 
                                        type="button" 
                                        onClick={handleNextStep}
                                        style={{ 
                                            flex: 1,
                                            background: '#be9055', 
                                            color: 'white', 
                                            border: 'none', 
                                            padding: '12px', 
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            fontWeight: '600',
                                            fontSize: '0.95rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Next Step <ArrowRight size={16}/>
                                    </button>
                                ) : (
                                    <button 
                                        className="btn" 
                                        type="button" 
                                        onClick={handleSubmitBooking} 
                                        disabled={isSubmitting}
                                        style={{ 
                                            flex: 1,
                                            background: '#22c55e', 
                                            color: 'white', 
                                            border: 'none', 
                                            padding: '12px', 
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            fontWeight: '600',
                                            fontSize: '0.95rem',
                                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                            opacity: isSubmitting ? 0.7 : 1
                                        }}
                                    >
                                        {isSubmitting ? 'Submitting...' : 'Complete Booking'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                /* Premium Glassmorphism Overrides for Customer Bookings */
                .table-card-container {
                    background: rgba(255, 255, 255, 0.7) !important;
                    backdrop-filter: blur(24px) !important;
                    -webkit-backdrop-filter: blur(24px) !important;
                    border: 1px solid rgba(255, 255, 255, 0.6) !important;
                    border-radius: 24px !important;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.6) !important;
                    overflow: hidden !important;
                    animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .portal-table thead th {
                    background: rgba(248, 250, 252, 0.4) !important;
                    border-bottom: 1px solid rgba(226, 232, 240, 0.5) !important;
                    font-weight: 700 !important;
                    color: #64748b !important;
                    text-transform: uppercase !important;
                    letter-spacing: 0.8px !important;
                    font-size: 0.75rem !important;
                    padding: 20px 24px !important;
                    text-align: left !important;
                }
                .portal-table tbody td {
                    padding: 18px 24px !important;
                    border-bottom: 1px solid rgba(226, 232, 240, 0.4) !important;
                    color: #334155 !important;
                    font-weight: 500 !important;
                    text-align: left !important;
                }
                .clickable-row.hover-bg {
                    position: relative;
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
                    z-index: 1;
                }
                .clickable-row.hover-bg:hover {
                    background: rgba(255, 255, 255, 0.95) !important;
                    transform: translateY(-3px) !important;
                    box-shadow: 0 12px 24px -8px rgba(0, 0, 0, 0.08), 0 4px 8px -4px rgba(0, 0, 0, 0.03) !important;
                    z-index: 10;
                    border-radius: 12px;
                }
                .clickable-row.hover-bg:hover td {
                    border-bottom-color: transparent !important;
                    color: #0f172a !important;
                }
                .clickable-row.hover-bg:hover td:first-child {
                    border-top-left-radius: 12px;
                    border-bottom-left-radius: 12px;
                }
                .clickable-row.hover-bg:hover td:last-child {
                    border-top-right-radius: 12px;
                    border-bottom-right-radius: 12px;
                }

                .action-btn.customer-st-98cc44d8 {
                    background: linear-gradient(135deg, #1e293b, #0f172a) !important;
                    border: none !important;
                    box-shadow: 0 4px 15px rgba(15, 23, 42, 0.2) !important;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
                    overflow: hidden;
                    position: relative;
                    border-radius: 12px !important;
                }
                .action-btn.customer-st-98cc44d8::after {
                    content: '';
                    position: absolute;
                    top: 0; left: -100%;
                    width: 50%; height: 100%;
                    background: linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent);
                    transform: skewX(-20deg);
                    animation: shimmer 3s infinite;
                }
                .action-btn.customer-st-98cc44d8:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 0 8px 25px rgba(15, 23, 42, 0.3) !important;
                }
                @keyframes shimmer {
                    0% { left: -100%; }
                    20% { left: 200%; }
                    100% { left: 200%; }
                }
                .card-header-v2 {
                    background: transparent !important;
                    border-bottom: 1px solid rgba(226, 232, 240, 0.5) !important;
                    padding: 24px 28px !important;
                }
                .pagination-select {
                    background-color: rgba(255, 255, 255, 0.8) !important;
                    backdrop-filter: blur(8px) !important;
                    border: 1px solid rgba(226, 232, 240, 0.8) !important;
                    border-radius: 12px !important;
                    padding: 10px 14px !important;
                    transition: all 0.2s !important;
                }
                .pagination-select:focus {
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15) !important;
                    border-color: #818cf8 !important;
                }

                .calendar-day {
                    aspect-ratio: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.2s;
                    font-family: 'Inter', sans-serif;
                }
                .calendar-day:hover:not(.disabled):not(.selected) { filter: brightness(0.95); }
                .calendar-day.selected { border: 2px solid #be9055 !important; box-shadow: 0 0 0 3px rgba(193, 154, 107, 0.2) !important; font-weight: 700; }
                .calendar-day.disabled { cursor: not-allowed; pointer-events: none; }
                .close-btn {
                    position: absolute;
                    right: 1.5rem;
                    top: 50%;
                    transform: translateY(-50%);
                    z-index: 10;
                }
                .fade-in { animation: fadeIn 0.3s ease-in-out; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.85; transform: scale(1.03); } }
            `}</style>

            {/* Cancellation Reason Modal */}
            {cancelModal.isOpen && (
                <div className="modal-overlay" style={{ zIndex: 2100 }} onClick={() => !isCancelling && setCancelModal({ isOpen: false, appointmentId: null, reason: '' })}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#dc2626' }}>
                                <AlertTriangle size={22} color="#dc2626" /> Cancel Booking
                            </h3>
                            <button className="close-btn" onClick={() => !isCancelling && setCancelModal({ isOpen: false, appointmentId: null, reason: '' })}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            {/* Warning Banner */}
                            <div style={{
                                background: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
                                border: '1px solid #fecaca',
                                borderRadius: '12px',
                                padding: '14px 16px',
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px'
                            }}>
                                <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#991b1b', fontWeight: 600 }}>This action cannot be undone</p>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#b91c1c' }}>
                                        Once cancelled, you'll need to create a new booking. Excessive cancellations (3+ per month) may result in temporary restrictions.
                                    </p>
                                </div>
                            </div>

                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                                Why are you cancelling this booking?
                            </label>
                            <textarea
                                value={cancelModal.reason}
                                onChange={(e) => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder="Please describe your reason for cancelling (e.g., schedule conflict, change of mind, emergency)..."
                                rows={4}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: `1px solid ${cancelModal.reason.length >= 10 ? '#a7f3d0' : cancelModal.reason.length > 0 ? '#fde68a' : '#e2e8f0'}`,
                                    fontSize: '0.9rem',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                    background: '#f8fafc',
                                    boxSizing: 'border-box'
                                }}
                                maxLength={500}
                                disabled={isCancelling}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                                <span style={{ fontSize: '0.75rem', color: cancelModal.reason.length < 10 && cancelModal.reason.length > 0 ? '#f59e0b' : '#94a3b8' }}>
                                    {cancelModal.reason.length < 10 ? `${10 - cancelModal.reason.length} more characters needed` : <><Check size={12} style={{display:'inline', verticalAlign:'middle'}} /> Reason is valid</>}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {cancelModal.reason.length}/500
                                </span>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setCancelModal({ isOpen: false, appointmentId: null, reason: '' })}
                                disabled={isCancelling}
                                style={{ padding: '8px 20px' }}
                            >
                                Back
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={submitCancellation}
                                disabled={isCancelling || cancelModal.reason.trim().length < 10}
                                style={{
                                    padding: '8px 20px',
                                    background: cancelModal.reason.trim().length >= 10 ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#cbd5e1',
                                    color: 'white',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: cancelModal.reason.trim().length >= 10 ? 'pointer' : 'not-allowed',
                                    opacity: isCancelling ? 0.7 : 1
                                }}
                            >
                                {isCancelling ? 'Cancelling...' : <><X size={16}/> Confirm Cancellation</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Deadline Quick Cancel Modal */}
            {graceCancelModal.isOpen && graceCancelModal.appointment && (
                <div className="modal-overlay" style={{ zIndex: 2100 }} onClick={() => !isGraceCancelling && setGraceCancelModal({ isOpen: false, appointment: null, reason: '', customReason: '' })}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#dc2626' }}>
                                <AlertTriangle size={22} color="#dc2626" /> Quick Cancel
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <GracePeriodTimer appointment={graceCancelModal.appointment} onCancel={() => {}} />
                                <button className="close-btn" onClick={() => !isGraceCancelling && setGraceCancelModal({ isOpen: false, appointment: null, reason: '', customReason: '' })}>
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            {/* Info Banner */}
                            <div style={{
                                background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
                                border: '1px solid #bfdbfe',
                                borderRadius: '12px',
                                padding: '14px 16px',
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px'
                            }}>
                                <Info size={18} color="#3b82f6" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#1e40af', fontWeight: 600 }}>Cancellation Deadline</p>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#1d4ed8' }}>
                                        You are within the allowed window to cancel this booking before your deadline. This action cannot be undone.
                                    </p>
                                </div>
                            </div>

                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', marginBottom: '10px' }}>
                                Why are you cancelling?
                            </label>

                            {/* Quick Reason Buttons */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                                {[
                                    'Wrong service selected',
                                    'Booked the wrong date',
                                    'Accidental booking',
                                    'Changed my mind',
                                    'Duplicate booking',
                                    'Wrong artist selected',
                                    'Need to reschedule instead',
                                    'Other'
                                ].map(reason => (
                                    <button
                                        key={reason}
                                        onClick={() => setGraceCancelModal(prev => ({
                                            ...prev,
                                            reason,
                                            customReason: reason === 'Other' ? prev.customReason : ''
                                        }))}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: '20px',
                                            border: `1.5px solid ${graceCancelModal.reason === reason ? '#dc2626' : '#e2e8f0'}`,
                                            background: graceCancelModal.reason === reason
                                                ? 'linear-gradient(135deg, #fef2f2, #fff1f2)'
                                                : '#f8fafc',
                                            color: graceCancelModal.reason === reason ? '#dc2626' : '#475569',
                                            fontSize: '0.82rem',
                                            fontWeight: graceCancelModal.reason === reason ? 700 : 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            fontFamily: "'Inter', sans-serif",
                                            transform: graceCancelModal.reason === reason ? 'scale(1.02)' : 'scale(1)',
                                            boxShadow: graceCancelModal.reason === reason ? '0 2px 8px rgba(220, 38, 38, 0.15)' : 'none'
                                        }}
                                        disabled={isGraceCancelling}
                                    >
                                        {graceCancelModal.reason === reason ? <><Check size={12} style={{display:'inline', verticalAlign:'middle', marginRight:'2px'}} /></> : ''}{reason}
                                    </button>
                                ))}
                            </div>

                            {/* Custom reason textarea (shown when "Other" selected) */}
                            {graceCancelModal.reason === 'Other' && (
                                <div style={{ marginBottom: '12px' }}>
                                    <textarea
                                        value={graceCancelModal.customReason}
                                        onChange={(e) => setGraceCancelModal(prev => ({ ...prev, customReason: e.target.value }))}
                                        placeholder="Please describe why you're cancelling..."
                                        rows={3}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            borderRadius: '10px',
                                            border: `1px solid ${graceCancelModal.customReason.length >= 10 ? '#a7f3d0' : graceCancelModal.customReason.length > 0 ? '#fde68a' : '#e2e8f0'}`,
                                            fontSize: '0.9rem',
                                            resize: 'vertical',
                                            fontFamily: 'inherit',
                                            outline: 'none',
                                            transition: 'border-color 0.2s',
                                            background: '#f8fafc',
                                            boxSizing: 'border-box'
                                        }}
                                        maxLength={500}
                                        disabled={isGraceCancelling}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                        <span style={{ fontSize: '0.75rem', color: graceCancelModal.customReason.length < 10 && graceCancelModal.customReason.length > 0 ? '#f59e0b' : '#94a3b8' }}>
                                            {graceCancelModal.customReason.length < 10 ? `${10 - graceCancelModal.customReason.length} more characters needed` : <><Check size={12} style={{display:'inline', verticalAlign:'middle'}} /> Reason is valid</>}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                            {graceCancelModal.customReason.length}/500
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Selected reason preview */}
                            {graceCancelModal.reason && graceCancelModal.reason !== 'Other' && (
                                <div style={{
                                    background: '#f0fdf4',
                                    border: '1px solid #bbf7d0',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: '4px'
                                }}>
                                    <Check size={16} color="#16a34a" />
                                    <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>
                                        Reason: {graceCancelModal.reason}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '16px 20px', borderTop: '1px solid #e2e8f0' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setGraceCancelModal({ isOpen: false, appointment: null, reason: '', customReason: '' })}
                                disabled={isGraceCancelling}
                                style={{ padding: '8px 20px' }}
                            >
                                Keep Booking
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={submitGracePeriodCancel}
                                disabled={isGraceCancelling || !graceCancelModal.reason || (graceCancelModal.reason === 'Other' && graceCancelModal.customReason.trim().length < 10)}
                                style={{
                                    padding: '8px 20px',
                                    background: graceCancelModal.reason && (graceCancelModal.reason !== 'Other' || graceCancelModal.customReason.trim().length >= 10) ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#cbd5e1',
                                    color: 'white',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: graceCancelModal.reason && (graceCancelModal.reason !== 'Other' || graceCancelModal.customReason.trim().length >= 10) ? 'pointer' : 'not-allowed',
                                    opacity: isGraceCancelling ? 0.7 : 1
                                }}
                            >
                                {isGraceCancelling ? 'Cancelling...' : <><X size={16}/> Cancel This Booking</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

            {/* Migration Success Modal */}
            {migrationModal.show && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, animation: 'fadeIn 0.3s ease'
                }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.5)', borderRadius: '24px',
                        padding: '40px 36px 32px', maxWidth: '420px', width: '90%', textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                        animation: 'slideUp 0.35s ease', fontFamily: "'Inter', sans-serif"
                    }}>
                        <div style={{
                            width: '72px', height: '72px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(193,154,107,0.15), rgba(193,154,107,0.05))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px', border: '2px solid rgba(193,154,107,0.2)'
                        }}>
                            <span style={{ fontSize: '32px', color: '#be9055', fontWeight: 700 }}>i</span>
                        </div>
                        <h2 style={{ color: '#1e293b', fontSize: '1.3rem', fontWeight: 700, margin: '0 0 8px' }}>
                            Prior Consultation Data Found!
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '0.92rem', lineHeight: 1.7, margin: '0 0 20px' }}>
                            Based on your account email, we found <strong style={{ color: '#be9055' }}>{migrationModal.count} consultation request{migrationModal.count > 1 ? 's' : ''}</strong> you made before creating your account. {migrationModal.count > 1 ? 'They have' : 'It has'} been automatically migrated to this account.
                        </p>
                        <div style={{
                            padding: '14px 20px', background: 'rgba(193,154,107,0.08)',
                            border: '1px solid rgba(193,154,107,0.15)', borderRadius: '12px',
                            marginBottom: '24px'
                        }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>
                                You can now view and track {migrationModal.count > 1 ? 'these bookings' : 'this booking'} in your <strong style={{ color: '#1e293b' }}>My Bookings</strong> page. Our team will reach out to confirm details.
                            </p>
                        </div>
                        <button
                            onClick={() => setMigrationModal({ show: false, count: 0 })}
                            style={{
                                width: '100%', padding: '14px 24px',
                                background: '#be9055',
                                color: '#fff', border: 'none', borderRadius: '12px',
                                fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer',
                                transition: 'all 0.2s ease', boxShadow: '0 4px 12px rgba(193,154,107,0.3)',
                                fontFamily: "'Inter', sans-serif"
                            }}
                            onMouseEnter={e => e.target.style.transform = 'translateY(-1px)'}
                            onMouseLeave={e => e.target.style.transform = 'translateY(0)'}
                        >
                            Got It, View My Bookings
                        </button>
                    </div>
                </div>
            )}
        </div>
        <ImageLightbox src={lightboxSrc} alt="Reference image" onClose={() => setLightboxSrc(null)} />
    </>);
}

export default CustomerBookings;

// ────── Cancellation Deadline Timer Button (Sub-component) ──────
// Renders a live countdown cancel button based on service-type deadline.
function GracePeriodTimer({ appointment, onCancel }) {
    const [secondsLeft, setSecondsLeft] = useState(() => {
        if (!appointment?.appointment_date) return 0;
        
        const serviceType = (appointment.service_type || '').toLowerCase();
        const isConsultation = serviceType.includes('consultation');
        const deadlineDays = isConsultation ? 3 : 7;
        
        const apptDate = new Date(appointment.appointment_date);
        apptDate.setHours(23, 59, 59, 999); // End of appointment day
        
        const deadlineDate = new Date(apptDate.getTime() - deadlineDays * 24 * 60 * 60 * 1000);
        return Math.max(0, Math.floor((deadlineDate - new Date()) / 1000));
    });

    useEffect(() => {
        if (secondsLeft <= 0) return;
        const interval = setInterval(() => {
            setSecondsLeft(prev => {
                if (prev <= 1) { clearInterval(interval); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [secondsLeft > 0]);

    if (secondsLeft <= 0) return null;

    const days = Math.floor(secondsLeft / (24 * 3600));
    const hours = Math.floor((secondsLeft % (24 * 3600)) / 3600);
    const mins = Math.floor((secondsLeft % 3600) / 60);
    const secs = secondsLeft % 60;

    let timeString = '';
    if (days > 0) timeString = `${days}d ${hours}h`;
    else if (hours > 0) timeString = `${hours}h ${mins}m`;
    else timeString = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Urgency increases as time runs out (less than 2 hours, less than 24 hours, etc)
    const urgency = secondsLeft < 2 * 3600 ? 1 : secondsLeft < 24 * 3600 ? 0.6 : 0.3;

    return (
        <button
            onClick={(e) => { e.stopPropagation(); onCancel(appointment); }}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 14px', borderRadius: '10px', fontSize: '0.8rem',
                fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                border: '1px solid #fecaca',
                background: `rgba(254, 226, 226, ${0.3 + urgency * 0.4})`,
                color: '#dc2626',
                transition: 'all 0.3s ease',
                animation: secondsLeft < 60 ? 'pulse 1.5s ease-in-out infinite' : 'none'
            }}
            title="Cancel this booking before the deadline"
        >
            <Clock size={13} />
            Cancel ({timeString})
        </button>
    );
}
