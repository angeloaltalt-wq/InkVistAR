import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import Axios from 'axios';
import { CheckCircle, ChevronLeft, ChevronRight, Calendar, User, MessageSquare, Info, Image as ImageIcon, Upload, MapPin, UserPlus, Clock, CalendarCheck, UserCog, Gift, Check, Paintbrush, Gem, Star, CreditCard, Eye, Shield, Bell, Sparkles, Award, Video, Users, FileWarning } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_URL, SOCKET_URL } from '../config';
import io from 'socket.io-client';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import WaiverFormModal from './WaiverFormModal';
const BodyModelViewer = lazy(() => import('./BodyModelViewer'));

export default function CustomerBookingWizard({ customerId, onBack, isPublic = false }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false); // For API calls
    const [errors, setErrors] = useState({}); // Field-level inline errors
    const [activeFeature, setActiveFeature] = useState(0);
    const [showExitModal, setShowExitModal] = useState(false);
    const [showEmailConfirmModal, setShowEmailConfirmModal] = useState(false);
    const [conflictModal, setConflictModal] = useState({ show: false, title: '', message: '', returnToStep: null });
    const [waiverAccepted, setWaiverAccepted] = useState(false);
    const [showWaiverModal, setShowWaiverModal] = useState(false);
    const [waiverAcceptedAt, setWaiverAcceptedAt] = useState(null);
    const [photoMarketingConsent, setPhotoMarketingConsent] = useState(true);
    const { executeRecaptcha } = useGoogleReCaptcha();
    
    const user = JSON.parse(localStorage.getItem('user'));

    // ═══ Device ID for rolling booking limit ═══
    const [deviceId] = useState(() => {
        let id = localStorage.getItem('inkvistar_device_id');
        if (!id) {
            id = 'dev_' + crypto.randomUUID();
            localStorage.setItem('inkvistar_device_id', id);
        }
        return id;
    });
    
    const placementNotesRef = useRef(null);
    const [formData, setFormData] = useState({
        firstName: user?.name ? user.name.split(' ')[0] : '',
        lastName: user?.name ? user.name.split(' ').slice(1).join(' ') : '',
        suffix: '',
        email: user?.email || '',
        phone: '',
        date: '',
        time: '',
        designTitle: '',
        notes: '',
        placement: [],
        consultationFor: [], // ['tattoo','piercing']
        consultationMethod: 'Face-to-Face', // 'Face-to-Face' or 'Online'
        onlinePlatform: '', // 'Messenger' or 'Instagram'
        placementNotes: '',
        referenceImage: null,
        phoneCode: '+63',
        piercingJewelry: [] // [{ bodyPart, type: 'studio'|'own', itemId, itemName, price }]
    });

    // Toggle a value in/out of an array field
    const toggleArrayField = (field, item) => {
        setFormData(prev => {
            const arr = prev[field] || [];
            const isAdding = !arr.includes(item);
            if (isAdding && item === 'Other') {
                setTimeout(() => {
                    if (placementNotesRef.current) placementNotesRef.current.focus();
                }, 50);
            }
            return { ...prev, [field]: isAdding ? [...arr, item] : arr.filter(x => x !== item) };
        });
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
    };

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [bookedDates, setBookedDates] = useState({});
    const [studioCapacity, setStudioCapacity] = useState(1);
    const [jewelryItems, setJewelryItems] = useState([]); // Available jewelry from inventory

    const [authView, setAuthView] = useState('register'); // 'login' or 'register'
    useEffect(() => {
        let interval;
        if (step === 5) {
            interval = setInterval(() => {
                setActiveFeature((prev) => (prev + 1) % features.length);
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [step]);

    const features = [
        {
            icon: <Eye size={48} color="#be9055" />,
            title: "AR Tattoo Try-On",
            desc: "Preview your tattoo in augmented reality before committing to the real thing.",
            bgColor: "#fdf2e9"
        },
        {
            icon: <Paintbrush size={48} color="#be9055" />,
            title: "Healing Journey Tracker",
            desc: "Access customized aftercare guides and track your tattoo's healing process.",
            bgColor: "#f9ebe0"
        },
        {
            icon: <Award size={48} color="#be9055" />,
            title: "My Tattoo History",
            desc: "View your completed works and manage your personal tattoo profile.",
            bgColor: "#faf0e4"
        },
        {
            icon: <Star size={48} color="#be9055" />,
            title: "Gallery & Favorites",
            desc: "Browse our full portfolio, save favorites, and find your next inspiration.",
            bgColor: "#f5e6d5"
        },
        {
            icon: <CalendarCheck size={48} color="#be9055" />,
            title: "Manage Appointments",
            desc: "Easily view, reschedule, or cancel your past and upcoming sessions.",
            bgColor: "#fdf2e9"
        },
        {
            icon: <MessageSquare size={48} color="#be9055" />,
            title: "Direct Communication",
            desc: "Chat securely with your artist and the studio for questions or updates.",
            bgColor: "#f9ebe0"
        },
        {
            icon: <Bell size={48} color="#be9055" />,
            title: "Smart Notifications",
            desc: "Get reminders for upcoming sessions, aftercare tips, and announcements.",
            bgColor: "#faf0e4"
        }
    ];

    useEffect(() => {
        // Fetch global capacity availability for the entire studio
        fetchAvailability();
        // Fetch available jewelry items for piercing selection
        fetchJewelryItems();
        
        // Handle incoming data from Gallery/Artists
        if (location.state && location.state.designTitle) {
            setFormData(prev => ({
                ...prev,
                designTitle: location.state.designTitle
            }));
        }
    }, [location.state]);

    // ═══ Real-time slot conflict detection via Socket.IO ═══
    // Listens for slot_booked broadcasts from the backend so that Laptop 2
    // instantly knows when Laptop 1 just claimed the same date+time slot.
    useEffect(() => {
        const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

        socket.on('slot_booked', ({ date: bookedDate, time: bookedTime }) => {
            setFormData(prev => {
                // Only trigger if the user currently has this exact slot selected
                // and hasn't already submitted (step < 5)
                if (prev.date === bookedDate && prev.time === bookedTime) {
                    // Refresh the calendar so the newly blocked slot is reflected visually
                    fetchAvailability();
                    setConflictModal({
                        show: true,
                        title: 'Slot Just Taken',
                        message: 'Someone else just requested this time slot a moment before you. The calendar has been refreshed — please select a different date or time to continue.',
                        returnToStep: 3
                    });
                }
                return prev; // no state change — side effects only
            });
        });

        return () => socket.disconnect();
    }, []);

    const fetchJewelryItems = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/inventory/jewelry`);
            if (res.data.success) setJewelryItems(res.data.items || []);
        } catch (e) {
            console.warn('[WARN] Could not load jewelry inventory:', e.message);
        }
    };

    // Update a piercing jewelry selection for a specific body part
    const setPiercingJewelryForPart = (bodyPart, selection) => {
        setFormData(prev => {
            const existing = (prev.piercingJewelry || []).filter(j => j.bodyPart !== bodyPart);
            return { ...prev, piercingJewelry: selection ? [...existing, { bodyPart, ...selection }] : existing };
        });
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
                    if (!bookings[dateStr]) bookings[dateStr] = { consultationTimes: [], sessionCount: 0 };
                    const sType = (b.service_type || '').toLowerCase();
                    if (sType === 'consultation') {
                        if (b.start_time) bookings[dateStr].consultationTimes.push(b.start_time.substring(0, 5));
                    } else {
                        bookings[dateStr].sessionCount += 1;
                    }
                });
                setBookedDates(bookings);
            }
        } catch (error) {
            console.error('Error fetching availability:', error);
        }
    };

    const handleInputChange = (field, value) => {
        let val = value;
        if (field === 'firstName' || field === 'lastName' || field === 'suffix') {
            val = val.replace(/[^a-zA-Z\s-']/g, '').replace(/^\s+/, '');
        } else if (field === 'email') {
            val = val.replace(/\s/g, '');
        } else if (typeof val === 'string') {
            val = val.replace(/^\s+/, '');
        }
        
        setFormData(prev => ({ ...prev, [field]: val }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData({ ...formData, referenceImage: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async () => {
        let finalCustomerId;
        const currentUser = JSON.parse(localStorage.getItem('user'));

        if (currentUser) {
            finalCustomerId = currentUser.id;
        } else {
            // Guest booking: use 'admin' sentinel — backend resolveAdminIds() maps this to the actual admin user ID
            finalCustomerId = 'admin'; 
        }
        finalizeBooking(finalCustomerId);
    };

    const finalizeBooking = async (uid) => {
        setLoading(true);
        
        if (!executeRecaptcha) {
            alert('reCAPTCHA not loaded. Please try again.');
            setLoading(false);
            return;
        }

        try {
            const token = await executeRecaptcha('booking');
            if (!token) {
                alert('CAPTCHA verification failed to execute.');
                setLoading(false);
                return;
            }

            const currentUser = JSON.parse(localStorage.getItem('user'));
            const generatedName = `${formData.firstName} ${formData.lastName} ${formData.suffix}`.replace(/\s+/g, ' ').trim();

            const placementStr = formData.placement.join(', ') || 'Not specified';
            const consultTypeStr = formData.consultationFor.length > 0 ? formData.consultationFor.join(' & ') : 'General';
            const consultMethodStr = formData.consultationMethod === 'Online' ? `Online (${formData.onlinePlatform || 'TBD'})` : 'Face-to-Face';

            const response = await Axios.post(`${API_URL}/api/admin/appointments`, {
                customerId: uid,
                artistId: 'admin',
                date: formData.date,
                startTime: formData.time || '13:00',
                endTime: formData.time || '13:00',
                serviceType: 'Consultation',
                designTitle: formData.designTitle,
                notes: `DESIGN DETAILS\nIdea: ${formData.designTitle}\nConsultation for: ${consultTypeStr}\nConsultation method: ${consultMethodStr}\nPlacement: ${placementStr}${formData.placementNotes ? `\nSpecific notes: ${formData.placementNotes}` : ''}\nNotes: ${formData.notes || 'No additional notes'}\n\nCLIENT CONTEXT\nName: ${currentUser?.name || generatedName}\nEmail: ${currentUser?.email || formData.email}\nPhone: ${formData.phoneCode || '+63'}${formData.phone.replace(/^0+/, '')}`,
                referenceImage: formData.referenceImage,
                status: 'pending',
                price: 0,
                isFromWizard: true,
                customerName: currentUser?.name || generatedName,
                captchaToken: token,
                deviceId: deviceId,
                consultationMethod: consultMethodStr,
                guestEmail: !currentUser ? formData.email : null,
                guestPhone: !currentUser ? `${formData.phoneCode || '+63'}${formData.phone.replace(/^0+/, '')}` : null,
                waiverAcceptedAt: waiverAcceptedAt || new Date().toISOString(),
                photoMarketingConsent: photoMarketingConsent,
                piercingJewelry: (formData.piercingJewelry && formData.piercingJewelry.length > 0) ? formData.piercingJewelry : undefined
            });

            if (response.data.success) {
                if (!currentUser && response.data.id) {
                    sessionStorage.setItem('orphanAppointmentId', response.data.id);
                }
                if (!currentUser) {
                    sessionStorage.setItem('wizardPrefill', JSON.stringify({
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        suffix: formData.suffix,
                        email: formData.email,
                        phone: formData.phone
                    }));
                }
                setStep(5); // Show consultation completed screen on step 5
            } else {
                alert('Request Failed: ' + (response.data.message || 'An unknown error occurred.'));
            }
        } catch (error) {
            console.error('Error finalizing booking:', error);
            const status = error.response?.status;
            const code = error.response?.data?.code;
            const msg = error.response?.data?.message || '';

            if (status === 409 || code === 'SLOT_TAKEN') {
                // Slot conflict — show premium conflict modal and bounce back to scheduling
                await fetchAvailability(); // Refresh calendar data
                setConflictModal({
                    show: true,
                    title: 'Scheduling Conflict',
                    message: 'This time slot was just booked by another client while you were completing your form. Please select a different time to continue.',
                    returnToStep: 3
                });
            } else if (status === 429) {
                setConflictModal({
                    show: true,
                    title: 'Booking Limit Reached',
                    message: msg || 'You have reached the maximum number of pending consultation requests. Please wait for one to be confirmed before booking another.',
                    returnToStep: null
                });
            } else {
                setConflictModal({
                    show: true,
                    title: 'Request Failed',
                    message: msg || 'Something went wrong while submitting your booking. Please try again.',
                    returnToStep: null
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const changeMonth = (increment) => {
        const newDate = new Date(currentMonth);
        newDate.setMonth(newDate.getMonth() + increment);
        setCurrentMonth(newDate);
    };

    const renderCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        const days = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const maxDate = new Date();
        maxDate.setMonth(today.getMonth() + 4); // Max 4 months in advance
        maxDate.setHours(23, 59, 59, 999);

        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} />);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const checkDate = new Date(year, month, i);
            const isSelected = formData.date === dateStr;
            const isPast = checkDate <= today;
            const isTooFar = checkDate > maxDate;
            
            const dateData = bookedDates[dateStr] || { consultationTimes: [], sessionCount: 0 };
            // Wizard is Consultation-only: evaluate only consultation time slots (7 max: 13:00–19:00)
            const consultationSlotsTaken = dateData.consultationTimes.length;
            const isFull = consultationSlotsTaken >= 7;
            const isBusy = consultationSlotsTaken >= 5;

            let bgColor = 'white';
            let textColor = '#1e293b';
            let borderColor = '#e2e8f0';

            if (isPast || isTooFar) {
                bgColor = '#f8fafc';
                textColor = '#cbd5e1';
                borderColor = 'transparent';
            } else if (isFull) {
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
                <button
                    key={i}
                    onClick={() => {
                        if (isFull) {
                            alert('Booking is not allowed on a full day. Please choose another date.');
                            return;
                        }
                        setFormData({ ...formData, date: dateStr, time: '' });
                    }}
                    disabled={isPast || isTooFar || isFull}
                    style={{
                        padding: '10px 4px',
                        border: isSelected ? '2px solid #be9055' : `1px solid ${borderColor}`,
                        backgroundColor: bgColor,
                        color: textColor,
                        borderRadius: '10px',
                        cursor: isPast || isTooFar || isFull ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: "'Inter', sans-serif",
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        opacity: isPast || isTooFar ? 0.4 : (isFull ? 0.65 : 1),
                        boxShadow: isSelected ? '0 0 0 3px rgba(193, 154, 107, 0.2)' : 'none'
                    }}
                >
                    <span style={{fontWeight: isSelected ? '700' : '500', fontSize: '0.95rem'}}>{i}</span>
                </button>
            );
        }

        return (
            <div className="wizard-calendar-container" style={{backgroundColor: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                    <button onClick={() => changeMonth(-1)} style={{background:'none', border:'none', cursor:'pointer', color:'#64748b'}}><ChevronLeft size={24}/></button>
                    <span style={{fontSize: '1.2rem', fontWeight: '700', color: '#1e293b'}}>{monthNames[month]} {year}</span>
                    <button onClick={() => changeMonth(1)} style={{background:'none', border:'none', cursor:'pointer', color:'#64748b'}}><ChevronRight size={24}/></button>
                </div>
                <div className="grid-calendar-header" style={{marginBottom: '12px', color: '#94a3b8', fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                    <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
                </div>
                <div className="grid-calendar-days">
                    {days}
                </div>
                <div className="calendar-legend">
                    <div className="calendar-legend-item"><div className="calendar-legend-swatch" style={{backgroundColor: '#dcfce7', border: '1px solid #bbf7d0'}}/> Available</div>
                    <div className="calendar-legend-item"><div className="calendar-legend-swatch" style={{backgroundColor: '#fef9c3', border: '1px solid #fde68a'}}/> Limited</div>
                    <div className="calendar-legend-item"><div className="calendar-legend-swatch" style={{backgroundColor: '#fee2e2', border: '1px solid #fecaca'}}/> Full</div>
                </div>
            </div>
        );
    };


    const renderStep1 = () => (
        <div className="fade-in">
            <h3 style={{fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <MessageSquare className="text-bronze" size={24} /> 1. Share Your Vision
            </h3>
            <p style={{color: '#64748b', marginBottom: '32px'}}>Tell us roughly what you're looking for so we can match you with the right artist. All fields are required.</p>

            <div className="grid-wizard-step">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: 0, position: 'relative' }}>
                        <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Idea Name <span style={{ color: '#ef4444', fontWeight: '400' }}>*</span></label>
                        <input
                            type="text"
                            className={`form-input ${errors.designTitle ? 'error' : ''}`}
                            placeholder="e.g. Fine-line Floral, Traditional Blackwork, Realistic Portrait"
                            value={formData.designTitle}
                            onChange={(e) => handleInputChange('designTitle', e.target.value)}
                            minLength={5}
                            maxLength={150}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                            {errors.designTitle ? (
                                <small style={{color: '#ef4444', fontSize: '0.8rem'}}>{errors.designTitle}</small>
                            ) : <span />}
                            <small style={{color: '#94a3b8', fontSize: '0.8rem'}}>{formData.designTitle.length}/150</small>
                        </div>
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Additional Details (Placement, Size, etc.)</label>
                        <textarea
                            rows="5"
                            className="form-input"
                            placeholder="Explain the concept here"
                            value={formData.notes}
                            onChange={(e) => handleInputChange('notes', e.target.value)}
                            maxLength={500}
                            style={{ resize: 'none' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                            <small style={{color: '#94a3b8', fontSize: '0.8rem'}}>{formData.notes.length}/500</small>
                        </div>
                    </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
                    <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Reference Image (Optional)</label>
                    <div 
                        onClick={() => document.getElementById('wizard-ref-img').click()}
                        style={{ 
                            flex: 1, border: '2px dashed #e2e8f0', borderRadius: '12px', 
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                            cursor: 'pointer', background: formData.referenceImage ? '#f8fafc' : 'transparent', overflow: 'hidden',
                            minHeight: '180px'
                        }}
                    >
                        {formData.referenceImage ? (
                            <img src={formData.referenceImage} alt="Ref" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                            <>
                                <ImageIcon size={32} color="#94a3b8" />
                                <span style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '10px' }}>Upload inspiration or sketches</span>
                            </>
                        )}
                        <input type="file" id="wizard-ref-img" hidden accept="image/*" onChange={handleImageUpload} />
                    </div>
                </div>
            </div>
        </div>
    );

    const tattooBodyParts = ["Face", "Neck", "Chest", "Back", "Left Shoulder", "Right Shoulder", "Left Upper Arm", "Right Upper Arm", "Left Forearm", "Right Forearm", "Left Wrist", "Right Wrist", "Left Hand", "Right Hand", "Left Ribs", "Right Ribs", "Left Hip", "Right Hip", "Left Thigh", "Right Thigh", "Left Calf", "Right Calf", "Left Ankle", "Right Ankle", "Other"];
    const piercingBodyParts = ["Left Ear Lobe", "Right Ear Lobe", "Left Helix", "Right Helix", "Left Tragus", "Right Tragus", "Left Conch", "Right Conch", "Left Industrial", "Right Industrial", "Left Nostril", "Right Nostril", "Septum", "Left Eyebrow", "Right Eyebrow", "Lip/Oral", "Navel", "Left Nipple", "Right Nipple", "Other"];

    const renderStepPlacement = () => {
        const showTattoo = formData.consultationFor.includes('tattoo');
        const showPiercing = formData.consultationFor.includes('piercing');

        // Determine handler for 3D model clicks
        const handleModelToggle = (partName, category) => {
            toggleArrayField('placement', partName);
        };

        return (
        <div className="fade-in">
            <h3 style={{fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <MapPin className="text-bronze" size={22} /> 2. Placement
            </h3>

            {/* Consultation type toggle */}
            <p style={{color: '#64748b', marginBottom: '12px', fontSize: '0.95rem'}}>What is this consultation for?</p>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                {[{ key: 'tattoo', label: 'Tattoo', icon: <Paintbrush size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />, color: '#be9055' }, { key: 'piercing', label: 'Piercing', icon: <Gem size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />, color: '#be9055' }].map(opt => {
                    const isActive = formData.consultationFor.includes(opt.key);
                    return (
                        <button
                            key={opt.key} type="button"
                            onClick={() => toggleArrayField('consultationFor', opt.key)}
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
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '-12px', marginBottom: '16px', textAlign: 'center' }}>Select both if your consultation covers tattoo and piercing</p>

            {/* Consultation Method: Face-to-Face vs Online */}
            <p style={{color: '#64748b', marginBottom: '12px', fontSize: '0.95rem'}}>How would you like this consultation?</p>
            <div style={{ display: 'flex', gap: '12px', marginBottom: formData.consultationMethod === 'Online' ? '12px' : '20px' }}>
                {[
                    { key: 'Face-to-Face', label: 'Face-to-Face', icon: <Users size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />, color: '#be9055' },
                    { key: 'Online', label: 'Online', icon: <Video size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />, color: '#be9055' }
                ].map(opt => {
                    const isActive = formData.consultationMethod === opt.key;
                    return (
                        <button
                            key={opt.key} type="button"
                            onClick={() => setFormData(prev => ({ ...prev, consultationMethod: opt.key, onlinePlatform: opt.key === 'Face-to-Face' ? '' : prev.onlinePlatform }))}
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
            {formData.consultationMethod === 'Online' && (
                <div style={{ marginBottom: '20px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontWeight: '700', color: '#1e293b', marginBottom: '10px', fontSize: '0.88rem' }}>Which platform do you prefer?</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {['Messenger', 'Instagram'].map(platform => {
                            const isActive = formData.onlinePlatform === platform;
                            const color = '#be9055';
                            return (
                                <button
                                    key={platform} type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, onlinePlatform: platform }))}
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
                    {!formData.onlinePlatform && (
                        <p style={{ fontSize: '0.78rem', color: '#f59e0b', marginTop: '8px', textAlign: 'center' }}>Please select your preferred messaging platform</p>
                    )}
                </div>
            )}

            {/* Main layout: 3D Model on left, stacked button grids on right */}
            {(showTattoo || showPiercing) && (
                <div className="grid-2col" style={{ marginBottom: '12px' }}>
                    <Suspense fallback={<div style={{ height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '16px', color: '#94a3b8' }}>Loading 3D Model...</div>}>
                        <BodyModelViewer
                            selectedTattoo={formData.placement.filter(p => tattooBodyParts.includes(p))}
                            selectedPiercing={formData.placement.filter(p => piercingBodyParts.includes(p))}
                            onToggle={handleModelToggle}
                            tattooParts={showTattoo ? tattooBodyParts : []}
                            piercingParts={showPiercing ? piercingBodyParts : []}
                            height={showTattoo && showPiercing ? 440 : 400}
                        />
                    </Suspense>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: showTattoo && showPiercing ? '440px' : '400px', paddingRight: '4px' }}>
                        {showTattoo && (
                            <>
                                <p style={{ fontWeight: '700', color: '#1e293b', margin: 0, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Paintbrush size={15} color="#be9055" /> Tattoo Placement
                                </p>
                                <div className="grid-placement-parts">
                                    {tattooBodyParts.map(part => {
                                        const isSelected = formData.placement.includes(part);
                                        return (
                                            <button key={part} type="button" onClick={() => toggleArrayField('placement', part)} style={{
                                                padding: '9px 5px', borderRadius: '10px',
                                                border: `2px solid ${isSelected ? '#be9055' : (errors.placement ? '#ef4444' : '#e2e8f0')}`,
                                                background: isSelected ? '#be9055' : 'white',
                                                color: isSelected ? 'white' : '#1e293b',
                                                fontWeight: '600', fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.2s',
                                                boxShadow: isSelected ? '0 3px 10px rgba(193, 154, 107, 0.3)' : 'none'
                                            }}>
                                                {isSelected && <Check size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />}
                                                {part}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {showTattoo && showPiercing && <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />}

                        {showPiercing && (
                            <>
                                <p style={{ fontWeight: '700', color: '#1e293b', margin: 0, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Gem size={15} color="#be9055" /> Piercing Placement
                                </p>
                                <div className="grid-placement-parts">
                                    {piercingBodyParts.map(part => {
                                        const isSelected = formData.placement.includes(part);
                                        return (
                                            <button key={`p-${part}`} type="button" onClick={() => toggleArrayField('placement', part)} style={{
                                                padding: '9px 5px', borderRadius: '10px',
                                                border: `2px solid ${isSelected ? '#be9055' : '#e2e8f0'}`,
                                                background: isSelected ? '#be9055' : 'white',
                                                color: isSelected ? 'white' : '#1e293b',
                                                fontWeight: '600', fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.2s',
                                                boxShadow: isSelected ? '0 3px 10px rgba(193, 154, 107, 0.3)' : 'none'
                                            }}>
                                                {isSelected && <Check size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />}
                                                {part}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Selection summary */}
            {formData.placement.length > 0 && (
                <div style={{ marginTop: '16px', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#166534' }}>
                    <Check size={14} color="#16a34a" /> <strong>Selected:</strong> {formData.placement.join(', ')}
                </div>
            )}

            {/* Specific location notes (required when Other is selected) */}
            <div style={{ marginTop: '12px' }}>
                <label style={{ fontWeight: '600', color: '#1e293b', marginBottom: '6px', display: 'block', fontSize: '0.88rem' }}>
                    Specific location notes
                    {formData.placement.includes('Other') && <span style={{ color: '#ef4444', fontWeight: '400' }}> *</span>}
                </label>
                <input
                    ref={placementNotesRef}
                    type="text"
                    className={`form-input ${errors.placementNotes ? 'error' : ''}`}
                    placeholder="e.g. Left inner forearm, near elbow"
                    value={formData.placementNotes}
                    onChange={(e) => { setFormData({...formData, placementNotes: e.target.value}); if (errors.placementNotes) setErrors(prev => ({...prev, placementNotes: ''})); }}
                    maxLength={200}
                    style={formData.placement.includes('Other') && !formData.placementNotes.trim() ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.15)' } : {}}
                />
                {errors.placementNotes && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.82rem'}}>{errors.placementNotes}</small>}
            </div>

            {/* ═══ JEWELRY SELECTION SECTION ═══ */}
            {formData.consultationFor.includes('piercing') && (() => {
                const piercingSelected = formData.placement.filter(p => piercingBodyParts.includes(p));
                if (piercingSelected.length === 0) return null;
                return (
                    <div style={{ marginTop: '20px', padding: '20px', background: 'linear-gradient(135deg, #fdf8f0 0%, #fef9f2 100%)', border: '2px solid rgba(190,144,85,0.25)', borderRadius: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                            <Gem size={20} color="#be9055" />
                            <p style={{ fontWeight: '800', color: '#1e293b', margin: 0, fontSize: '1rem' }}>Jewelry Selection</p>
                            <span style={{ fontSize: '0.72rem', background: '#be9055', color: 'white', padding: '2px 8px', borderRadius: '20px', fontWeight: '700' }}>Required</span>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '16px', marginTop: '4px' }}>
                            Please select a jewelry preference for each piercing location. Studio jewelry is sourced from our curated, hypoallergenic inventory.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {piercingSelected.map(bodyPart => {
                                const currentSel = (formData.piercingJewelry || []).find(j => j.bodyPart === bodyPart);
                                const isSelected = !!currentSel;
                                return (
                                    <div key={bodyPart} style={{
                                        background: 'white', borderRadius: '12px', padding: '16px',
                                        border: `1.5px solid ${errors.piercingJewelry ? '#ef4444' : (isSelected ? '#be9055' : '#e2e8f0')}`,
                                        boxShadow: isSelected ? '0 2px 12px rgba(190,144,85,0.12)' : 'none',
                                        transition: 'all 0.2s'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                            <Gem size={14} color="#be9055" />
                                            <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.88rem' }}>{bodyPart}</span>
                                            {isSelected && (
                                                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#16a34a', fontWeight: '700' }}>
                                                    <Check size={12} /> {currentSel.type === 'own' ? "Client's own" : currentSel.itemName}
                                                </span>
                                            )}
                                        </div>

                                        {/* Studio jewelry options */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                                            {jewelryItems.map(item => {
                                                const isItemSel = currentSel?.type === 'studio' && currentSel?.itemId === item.id;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setPiercingJewelryForPart(bodyPart, { type: 'studio', itemId: item.id, itemName: item.name, price: parseFloat(item.retail_price) || parseFloat(item.cost) || 0 });
                                                            if (errors.piercingJewelry) setErrors(prev => ({ ...prev, piercingJewelry: '' }));
                                                        }}
                                                        title={`Select ${item.name} — ₱${parseFloat(item.retail_price || item.cost || 0).toFixed(2)}`}
                                                        style={{
                                                            padding: '10px 8px', borderRadius: '10px', textAlign: 'center', cursor: 'pointer',
                                                            border: `2px solid ${isItemSel ? '#be9055' : '#e2e8f0'}`,
                                                            background: isItemSel ? '#be905515' : '#f8fafc',
                                                            transition: 'all 0.18s ease', position: 'relative'
                                                        }}
                                                    >
                                                        {isItemSel && <Check size={12} color="#be9055" style={{ position: 'absolute', top: '5px', right: '5px' }} />}
                                                        {item.image ? (
                                                            <img src={item.image} alt={item.name} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', marginBottom: '6px', display: 'block', margin: '0 auto 6px' }} />
                                                        ) : (
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#f0e8da', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>
                                                                <Gem size={18} color="#be9055" />
                                                            </div>
                                                        )}
                                                        <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: '700', color: '#1e293b', lineHeight: 1.2 }}>{item.name}</p>
                                                        <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: '#be9055', fontWeight: '700' }}>
                                                            ₱{parseFloat(item.retail_price || item.cost || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </p>
                                                        <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: '#94a3b8' }}>{item.current_stock} in stock</p>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Divider */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' }}>
                                            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '600' }}>OR</span>
                                            <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                                        </div>

                                        {/* Bring own jewelry option */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPiercingJewelryForPart(bodyPart, { type: 'own', itemId: null, itemName: "Client's own jewelry", price: 0 });
                                                if (errors.piercingJewelry) setErrors(prev => ({ ...prev, piercingJewelry: '' }));
                                            }}
                                            title="I will bring my own jewelry or have a custom preference"
                                            style={{
                                                width: '100%', padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                                                border: `2px solid ${currentSel?.type === 'own' ? '#be9055' : '#e2e8f0'}`,
                                                background: currentSel?.type === 'own' ? '#be905510' : '#f8fafc',
                                                color: currentSel?.type === 'own' ? '#be9055' : '#64748b',
                                                fontWeight: '700', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px',
                                                transition: 'all 0.18s ease'
                                            }}
                                        >
                                            {currentSel?.type === 'own' && <Check size={14} />}
                                            <Sparkles size={14} />
                                            I will bring my own jewelry / Custom preference
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        {errors.piercingJewelry && <small style={{ color: '#ef4444', display: 'block', marginTop: '10px', fontSize: '0.82rem', textAlign: 'center' }}>{errors.piercingJewelry}</small>}
                    </div>
                );
            })()}

            {errors.placement && <small style={{color: '#ef4444', display: 'block', marginTop: '10px', fontSize: '0.85rem', textAlign: 'center'}}>{errors.placement}</small>}
        </div>
        );
    };

    const renderStepScheduling = () => (
        <div className="fade-in">
            <h3 style={{fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <Calendar className="text-bronze" size={22} /> 3. Select Date & Time
            </h3>
            <p style={{color: '#64748b', marginBottom: '20px', fontSize: '0.95rem'}}>Select a date for your free in-studio consultation.</p>
            
            <div className="grid-calendar-layout">
                <div>{renderCalendar()}</div>
                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                     <label style={{fontWeight: '700', color: '#1e293b', marginBottom: '12px', display: 'block', fontSize: '0.9rem', textTransform: 'uppercase'}}>Available Times</label>
                     <div className="grid-time-slots">
                        {['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map(t => {
                            let isDisabled = false;
                            if (formData.date) {
                                const checkDate = new Date(`${formData.date}T${t}:00`);
                                if (checkDate <= new Date()) isDisabled = true;
                                if (bookedDates[formData.date] && bookedDates[formData.date].consultationTimes.includes(t)) isDisabled = true;
                            } else {
                                isDisabled = true; // Wait for date selection
                            }

                            return (
                            <button
                                key={t}
                                onClick={() => {
                                    if (isDisabled) return;
                                    setFormData({...formData, time: t});
                                    if (errors.date) setErrors(prev => ({...prev, date: ''}));
                                }}
                                disabled={isDisabled}
                                style={{
                                    padding: '10px 4px',
                                    borderRadius: '8px',
                                    border: formData.time === t ? '2px solid #be9055' : '1px solid #e2e8f0',
                                    backgroundColor: formData.time === t ? '#fffcf0' : (isDisabled ? 'transparent' : 'white'),
                                    fontWeight: formData.time === t ? '700' : '500',
                                    color: formData.time === t ? '#1e293b' : (isDisabled ? '#cbd5e1' : '#64748b'),
                                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                                    fontSize: '0.85rem',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {t === '12:00' ? '12:00 PM' : 
                                 parseInt(t) > 12 ? `${parseInt(t) - 12}:00 PM` : `${t} PM`}
                            </button>
                            );
                        })}
                     </div>
                     <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#94a3b8', lineHeight: '1.4' }}>
                        <Info size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                        Time slots are 1 hour each.
                     </div>
                </div>
            </div>
            {errors.date && <small style={{color: '#ef4444', display: 'block', marginTop: '12px', fontSize: '0.85rem', textAlign: 'center'}}>{errors.date}</small>}
        </div>
    );

    const renderStepContact = () => (
        <div className="fade-in">
            <h3 style={{fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <User className="text-bronze" size={22} /> 4. Contact Details
            </h3>
            <p style={{color: '#64748b', marginBottom: '20px', fontSize: '0.95rem'}}>How should we reach out regarding your request?</p>

            <div style={{ padding: '24px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="grid-form-row" style={{ marginBottom: '16px' }}>
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block', fontSize: '0.85rem' }}>First Name *</label>
                        <input
                            type="text"
                            className={`form-input ${errors.firstName ? 'error' : ''}`}
                            placeholder="John"
                            value={formData.firstName}
                            onChange={(e) => handleInputChange('firstName', e.target.value)}
                            disabled={!!user}
                            style={{ padding: '10px' }}
                            maxLength={50}
                        />
                        {errors.firstName && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.75rem'}}>{errors.firstName}</small>}
                    </div>
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block', fontSize: '0.85rem' }}>Last Name *</label>
                        <input
                            type="text"
                            className={`form-input ${errors.lastName ? 'error' : ''}`}
                            placeholder="Doe"
                            value={formData.lastName}
                            onChange={(e) => handleInputChange('lastName', e.target.value)}
                            disabled={!!user}
                            style={{ padding: '10px' }}
                            maxLength={50}
                        />
                        {errors.lastName && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.75rem'}}>{errors.lastName}</small>}
                    </div>
                    <div className="form-group" style={{ position: 'relative' }}>
                        <label style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block', fontSize: '0.85rem' }}>Suffix</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Jr., Sr., III"
                            value={formData.suffix}
                            onChange={(e) => handleInputChange('suffix', e.target.value)}
                            disabled={!!user}
                            style={{ padding: '10px' }}
                            maxLength={5}
                        />
                    </div>
                </div>
                <div style={{ marginBottom: '16px' }} className="form-group">
                    <label style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block', fontSize: '0.85rem' }}>Email Address *</label>
                    <input
                        type="email"
                        className={`form-input ${errors.email ? 'error' : ''}`}
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        disabled={!!user}
                        style={{ padding: '10px' }}
                        maxLength={254}
                    />
                    {errors.email && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.75rem'}}>{errors.email}</small>}
                    {!user && (
                        <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#be9055', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Info size={13} style={{ flexShrink: 0 }} /> Your booking confirmation and status updates will be sent to this email.
                        </p>
                    )}
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                    <label style={{ fontWeight: '700', color: '#1e293b', marginBottom: '6px', display: 'block', fontSize: '0.85rem' }}>Phone Number *</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <select 
                            className="form-input" 
                            style={{ width: '110px', flexShrink: 0, appearance: 'menulist', padding: '10px' }}
                            value={formData.phoneCode || '+63'} 
                            onChange={(e) => handleInputChange('phoneCode', e.target.value)}
                        >
                            <option value="+63">PH (+63)</option>
                            <option value="+1">US/CA (+1)</option>
                            <option value="+44">UK (+44)</option>
                            <option value="+61">AU (+61)</option>
                            <option value="+81">JP (+81)</option>
                            <option value="+82">KR (+82)</option>
                            <option value="+65">SG (+65)</option>
                            <option value="+86">CN (+86)</option>
                            <option value="+33">FR (+33)</option>
                            <option value="+49">DE (+49)</option>
                            <option value="+39">IT (+39)</option>
                            <option value="+34">ES (+34)</option>
                            <option value="+91">IN (+91)</option>
                            <option value="+55">BR (+55)</option>
                            <option value="+52">MX (+52)</option>
                            <option value="+27">ZA (+27)</option>
                            <option value="+971">AE (+971)</option>
                            <option value="+64">NZ (+64)</option>
                            <option value="+62">ID (+62)</option>
                            <option value="+60">MY (+60)</option>
                            <option value="+66">TH (+66)</option>
                        </select>
                        <input 
                            type="tel" 
                            className={`form-input ${errors.phone ? 'error' : ''}`} 
                            placeholder="9171234567" 
                            value={formData.phone} 
                            onChange={(e) => handleInputChange('phone', e.target.value.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, 11))} 
                            style={{ flex: 1, padding: '10px' }}
                            maxLength={11}
                        />
                    </div>
                    {errors.phone && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.75rem'}}>{errors.phone}</small>}
                </div>
            </div>
            <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center' }}>
                <CheckCircle size={12} style={{ marginRight: '4px' }} />
                Your data is secure and will only be used to contact you about this booking.
            </p>

            {/* Waiver Consent Toggle */}
            <div style={{ margin: '20px 0 8px', padding: '16px 20px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.6, textAlign: 'left' }}>
                    <input
                        type="checkbox"
                        checked={waiverAccepted}
                        onChange={(e) => {
                            const checked = e.target.checked;
                            setWaiverAccepted(checked);
                            if (checked) {
                                setShowWaiverModal(true);
                            } else {
                                setWaiverAcceptedAt(null);
                            }
                        }}
                        style={{ width: '20px', height: '20px', marginTop: '2px', accentColor: '#be9055', flexShrink: 0 }}
                    />
                    <span>
                        I have read and agree to the{' '}
                        <button
                            type="button"
                            onClick={() => setShowWaiverModal(true)}
                            style={{ background: 'none', border: 'none', color: '#be9055', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit' }}
                        >
                            Service Waiver & Release of Liability
                        </button>
                        <span style={{ color: '#ef4444' }}> *</span>
                    </span>
                </label>
                {errors.waiver && <small style={{ color: '#ef4444', display: 'block', marginTop: '8px', fontSize: '0.8rem', paddingLeft: '32px' }}>{errors.waiver}</small>}
            </div>

            {/* Waiver Modal */}
            <WaiverFormModal
                isOpen={showWaiverModal}
                onClose={() => setShowWaiverModal(false)}
                onAccept={() => {
                    setWaiverAccepted(true);
                    setWaiverAcceptedAt(new Date().toISOString());
                    setShowWaiverModal(false);
                    if (errors.waiver) setErrors(prev => ({ ...prev, waiver: '' }));
                }}
                clientName={`${formData.firstName} ${formData.lastName}`.trim() || undefined}
                photoConsent={photoMarketingConsent}
                onPhotoConsentChange={setPhotoMarketingConsent}
            />
        </div>
    );

    const renderExitModal = () => (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
        }}>
            <div className="fade-in" style={{
                backgroundColor: 'white', padding: '40px', borderRadius: '24px',
                maxWidth: '450px', width: '90%', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
                <div style={{ backgroundColor: '#fee2e2', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                    <Info size={32} color="#dc2626" />
                </div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '12px' }}>Are you sure?</h3>
                <p style={{ color: '#64748b', marginBottom: '32px', lineHeight: '1.6' }}>
                    By skipping account creation, you'll miss out on tracking your request, direct artist messaging, and managing future bookings easily.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button 
                        onClick={() => { setShowExitModal(false); setShowEmailConfirmModal(true); }}
                        className="exit-confirm-btn"
                        style={{
                            padding: '14px', borderRadius: '12px', border: 'none',
                            backgroundColor: 'red', color: 'white', fontWeight: '700',
                            cursor: 'pointer', transition: 'all 0.3s ease'
                        }}
                    >
                        No thanks
                    </button>
                    <button 
                        onClick={() => setShowExitModal(false)}
                        style={{
                            padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0',
                            backgroundColor: 'white', color: '#1e293b', fontWeight: '700',
                            cursor: 'pointer'
                        }}
                    >
                        Create Account
                    </button>
                </div>
            </div>
        </div>
    );

    const renderEmailConfirmModal = () => (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)'
        }}>
            <div className="fade-in" style={{
                backgroundColor: 'white', padding: '40px', borderRadius: '24px',
                maxWidth: '450px', width: '90%', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
                <div style={{ backgroundColor: '#f0fdf4', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', border: '2px solid #bbf7d0' }}>
                    <CheckCircle size={32} color="#16a34a" />
                </div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginBottom: '12px' }}>You're All Set!</h3>
                <p style={{ color: '#64748b', marginBottom: '20px', lineHeight: '1.7', fontSize: '0.95rem' }}>
                    Don't worry — we'll keep you updated! A confirmation email with your booking details has been sent to:
                </p>
                <div style={{ padding: '12px 20px', background: 'rgba(193,154,107,0.08)', border: '1px solid rgba(193,154,107,0.2)', borderRadius: '12px', marginBottom: '20px' }}>
                    <p style={{ margin: 0, fontWeight: '700', color: '#be9055', fontSize: '1rem' }}>{formData.email}</p>
                </div>
                <p style={{ color: '#475569', marginBottom: '12px', lineHeight: '1.6', fontSize: '0.9rem', fontWeight: 600 }}>
                    Our team will reach out to you within 24 hours via call or message to confirm your consultation and discuss details.
                </p>
                <p style={{ color: '#64748b', marginBottom: '28px', lineHeight: '1.6', fontSize: '0.85rem' }}>
                    You'll also receive SMS and email notifications whenever there's an update to your booking status — like confirmation, scheduling changes, or your price quote.
                </p>
                <button 
                    onClick={() => navigate('/')}
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
                    Got It, Back to Home
                </button>
            </div>
        </div>
    );

    const renderConflictModal = () => (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(6px)'
        }}>
            <div className="fade-in" style={{
                backgroundColor: 'white', padding: '40px', borderRadius: '24px',
                maxWidth: '460px', width: '90%', textAlign: 'center',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
                <div style={{
                    backgroundColor: '#fef3c7', width: '68px', height: '68px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px', border: '2px solid #fde68a'
                }}>
                    <Clock size={32} color="#d97706" />
                </div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1e293b', marginBottom: '12px' }}>
                    {conflictModal.title}
                </h3>
                <p style={{ color: '#64748b', marginBottom: '28px', lineHeight: '1.7', fontSize: '0.95rem' }}>
                    {conflictModal.message}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {conflictModal.returnToStep && (
                        <button
                            onClick={() => {
                                setFormData(prev => ({ ...prev, time: '' }));
                                setStep(conflictModal.returnToStep);
                                setConflictModal({ show: false, title: '', message: '', returnToStep: null });
                            }}
                            style={{
                                width: '100%', padding: '14px 24px',
                                background: '#be9055', color: '#fff', border: 'none',
                                borderRadius: '12px', fontSize: '0.95rem', fontWeight: 700,
                                cursor: 'pointer', transition: 'all 0.2s ease',
                                boxShadow: '0 4px 12px rgba(193,154,107,0.3)',
                                fontFamily: "'Inter', sans-serif"
                            }}
                            title="Go back to choose a different time slot"
                        >
                            Choose a Different Time
                        </button>
                    )}
                    <button
                        onClick={() => {
                            setConflictModal({ show: false, title: '', message: '', returnToStep: null });
                            if (!conflictModal.returnToStep) navigate('/');
                        }}
                        style={{
                            width: '100%', padding: '12px 24px',
                            background: 'transparent', color: '#64748b',
                            border: '1px solid #e2e8f0', borderRadius: '12px',
                            fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
                            fontFamily: "'Inter', sans-serif"
                        }}
                        title={conflictModal.returnToStep ? 'Close this dialog' : 'Return to the homepage'}
                    >
                        {conflictModal.returnToStep ? 'Dismiss' : 'Back to Home'}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderConsultationCompletedPage = () => (
        <div className="fade-in data-card" style={{
            border: 'none',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            borderRadius: '24px',
            overflow: 'hidden',
            padding: '0'
        }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: window.innerWidth <= 768 ? '1fr' : '1fr 1fr',
                minHeight: window.innerWidth <= 768 ? 'auto' : '520px'
            }}>
                {/* Left Column: Confirmation + CTA */}
                <div style={{
                    padding: window.innerWidth <= 768 ? '36px 24px 28px' : '48px 44px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}>
                    <h2 style={{
                        fontSize: window.innerWidth <= 768 ? '1.5rem' : '1.8rem',
                        fontWeight: '800',
                        color: '#1e293b',
                        marginBottom: '14px',
                        lineHeight: '1.25'
                    }}>
                        Consultation Request Completed!
                    </h2>

                    <p style={{
                        fontSize: '0.95rem',
                        lineHeight: '1.7',
                        color: '#64748b',
                        marginBottom: '28px',
                        maxWidth: '420px'
                    }}>
                        Thank you for your interest in a <strong style={{ color: '#1e293b' }}>{formData.designTitle}</strong> consultation. We'll contact you within 24 hours to discuss your vision and schedule your session.
                    </p>

                    <p style={{
                        fontSize: '0.82rem',
                        color: '#94a3b8',
                        marginBottom: '32px'
                    }}>
                        Please check your email (including Spam/Junk folder) for a confirmation.
                    </p>

                    {/* CTA Buttons — always visible */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '320px' }}>
                        <button
                            onClick={() => navigate('/register')}
                            className="btn btn-primary"
                            style={{
                                padding: '14px 28px',
                                fontSize: '0.95rem',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                backgroundColor: '#be9055',
                                borderColor: '#be9055',
                                color: 'white',
                                fontWeight: '700',
                                borderRadius: '10px',
                                boxShadow: '0 4px 12px rgba(193, 154, 107, 0.3)',
                                cursor: 'pointer',
                                transition: 'all 0.3s'
                            }}
                        >
                            <UserPlus size={18} /> Create an Account
                        </button>
                        <button
                            onClick={() => setShowEmailConfirmModal(true)}
                            className="btn btn-secondary"
                            style={{
                                padding: '12px 28px',
                                fontSize: '0.9rem',
                                borderRadius: '10px',
                                cursor: 'pointer'
                            }}
                        >
                            No Thanks
                        </button>
                    </div>

                    {/* Important Note */}
                    <div style={{
                        marginTop: '28px',
                        padding: '12px 16px',
                        backgroundColor: '#f8fafc',
                        borderLeft: '4px solid #be9055',
                        borderRadius: '0 8px 8px 0',
                        maxWidth: '320px'
                    }}>
                        <p style={{
                            margin: 0,
                            fontSize: '0.8rem',
                            lineHeight: '1.5',
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px'
                        }}>
                            <Info size={16} color="#be9055" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span><strong>Please Note:</strong> An account is required to pursue and confirm an actual online session booking for your tattoo.</span>
                        </p>
                    </div>
                </div>

                {/* Right Column: Feature Carousel */}
                <div style={{
                    padding: window.innerWidth <= 768 ? '0 24px 36px' : '48px 44px 48px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    borderLeft: window.innerWidth <= 768 ? 'none' : '1px solid #f1f5f9',
                    borderTop: window.innerWidth <= 768 ? '1px solid #f1f5f9' : 'none'
                }}>
                    <h3 style={{
                        fontSize: '1.15rem',
                        fontWeight: '700',
                        color: '#1e293b',
                        marginBottom: '6px'
                    }}>
                        Track Your Request & More
                    </h3>
                    <p style={{
                        fontSize: '0.82rem',
                        color: '#64748b',
                        marginBottom: '20px'
                    }}>
                        Create an account to unlock these features:
                    </p>

                    {/* Compact Feature Carousel */}
                    <div style={{ position: 'relative' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                            minHeight: '180px'
                        }}>
                            <button
                                onClick={() => setActiveFeature((prev) => (prev - 1 + features.length) % features.length)}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0, transition: 'all 0.2s' }}
                            >
                                <ChevronLeft size={18} />
                            </button>

                            <div style={{ width: '100%', maxWidth: '320px', position: 'relative', height: '180px' }}>
                                {features.map((feature, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            position: 'absolute',
                                            top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: feature.bgColor,
                                            borderRadius: '16px',
                                            padding: '24px',
                                            textAlign: 'center',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
                                            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                            opacity: activeFeature === index ? 1 : 0,
                                            transform: activeFeature === index ? 'scale(1)' : 'scale(0.92)',
                                            pointerEvents: activeFeature === index ? 'all' : 'none',
                                            visibility: activeFeature === index ? 'visible' : 'hidden'
                                        }}
                                    >
                                        <div style={{ marginBottom: '12px' }}>{feature.icon}</div>
                                        <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#1e293b', marginBottom: '6px' }}>{feature.title}</h4>
                                        <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: '1.5', margin: 0 }}>{feature.desc}</p>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => setActiveFeature((prev) => (prev + 1) % features.length)}
                                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexShrink: 0, transition: 'all 0.2s' }}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        {/* Slide Indicators */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '16px' }}>
                            {features.map((_, i) => (
                                <div
                                    key={i}
                                    onClick={() => setActiveFeature(i)}
                                    style={{
                                        width: activeFeature === i ? '20px' : '6px',
                                        height: '6px',
                                        borderRadius: '3px',
                                        backgroundColor: activeFeature === i ? '#be9055' : '#e2e8f0',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease'
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {showExitModal && renderExitModal()}
            {showEmailConfirmModal && renderEmailConfirmModal()}
            {conflictModal.show && renderConflictModal()}
        </div>
    );

    if (step === 5) return renderConsultationCompletedPage();

    return (
        <div className="data-card wizard-card">
            
            <div className="wizard-header">
                <h2>Request Consultation</h2>
                <div style={{display: 'flex', gap: '8px', flexShrink: 0}}>
                    {[1, 2, 3, 4].map(s => (
                        <div key={s} className="wizard-step-indicator" style={{
                            backgroundColor: step >= s ? '#be9055' : '#e2e8f0'
                        }} />
                    ))}
                </div>
            </div>

            <div className="wizard-body">
                {step === 1 && renderStep1()}
                {step === 2 && renderStepPlacement()} {/* Step 2: Placement */}
                {step === 3 && renderStepScheduling()} {/* Step 3: Scheduling */}
                {step === 4 && renderStepContact()} {/* Step 4: Contact Info */}
            </div>
            
            <div className="wizard-footer">
                <button 
                    onClick={() => setStep(Math.max(1, step - 1))} 
                    disabled={step === 1} 
                    className="btn btn-secondary" 
                    style={{
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        padding: '12px 24px',
                        borderRadius: '12px',
                        fontWeight: '600',
                        opacity: step === 1 ? 0 : 1, 
                        transition: 'all 0.3s ease', 
                        visibility: step === 1 ? 'hidden' : 'visible',
                        border: '1px solid #e2e8f0'
                    }}
                >
                    <ChevronLeft size={20} /> Previous
                </button>
                
                {step < 4 ? (
                    <button 
                        onClick={() => { 
                            const newErrors = {};
                            if (step === 1 && !formData.designTitle) newErrors.designTitle = 'Please tell us about your tattoo idea'; 
                            if (step === 2 && formData.consultationFor.length === 0) newErrors.placement = 'Please select what this consultation is for (Tattoo, Piercing, or both)';
                            else if (step === 2 && formData.consultationMethod === 'Online' && !formData.onlinePlatform) newErrors.placement = 'Please select your preferred messaging platform (Messenger or Instagram)';
                            else if (step === 2 && formData.placement.length === 0) newErrors.placement = 'Please select at least one placement area';
                            else if (step === 2 && formData.placement.includes('Other') && !formData.placementNotes.trim()) newErrors.placementNotes = 'Please describe the specific location since you selected "Other"';
                            else if (step === 2 && formData.consultationFor.includes('piercing')) {
                                // Validate jewelry selection: every piercing body part needs a selection
                                const piercingParts = formData.placement.filter(p => piercingBodyParts.includes(p));
                                const missingJewelry = piercingParts.filter(part =>
                                    !(formData.piercingJewelry || []).some(j => j.bodyPart === part)
                                );
                                if (missingJewelry.length > 0) {
                                    newErrors.piercingJewelry = `Please select a jewelry option for: ${missingJewelry.join(', ')}`;
                                }
                            }
                            if (step === 3 && (!formData.date || !formData.time)) newErrors.date = 'Please select a preferred date and time';
                            
                            if (Object.keys(newErrors).length > 0) {
                                setErrors(newErrors);
                                return;
                            }
                            setStep(step + 1);
                        }} 
                        className="btn btn-primary" 
                        style={{
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            padding: '12px 32px',
                            backgroundColor: '#be9055',
                            borderColor: '#be9055',
                            color: 'white',
                            fontWeight: '700',
                            borderRadius: '12px',
                            boxShadow: '0 4px 12px rgba(193, 154, 107, 0.3)',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        Next Step <ChevronRight size={20} />
                    </button>
                ) : (
                    <button 
                        onClick={() => {
                            const newErrors = {};
                            if (!formData.firstName) newErrors.firstName = 'First Name is required';
                            if (!formData.lastName) newErrors.lastName = 'Last Name is required';
                            if (!formData.email) newErrors.email = 'Email Address is required';
                            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Please enter a valid email format';
                            
                            if (!formData.phone) newErrors.phone = 'Phone Number is required';
                            else if (!/^\+?\d{10,15}$/.test((formData.phoneCode || '+63') + formData.phone.replace(/^0+/, ''))) newErrors.phone = 'Please enter a valid phone number';
                            
                            if (!waiverAccepted) newErrors.waiver = 'You must accept the Service Waiver to proceed';
                            
                            if (Object.keys(newErrors).length > 0) {
                                setErrors(newErrors);
                                return;
                            }
                            handleSubmit();
                        }} 
                        disabled={loading} 
                        className="btn btn-primary" 
                        style={{
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '10px', 
                            backgroundColor: '#1e293b', 
                            borderColor: '#1e293b', 
                            padding: '12px 36px',
                            color: 'white',
                            fontWeight: '700',
                            borderRadius: '12px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        {loading ? 'Sending...' : 'Request Consultation'} <CheckCircle size={20} />
                    </button>
                )}
            </div>
            {conflictModal.show && renderConflictModal()}
        </div>
    );
}
