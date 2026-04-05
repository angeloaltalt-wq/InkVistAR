import React, { useState, useEffect, useCallback, useRef } from 'react';
import Axios from 'axios';
import { CheckCircle, ChevronLeft, ChevronRight, Calendar, User, MessageSquare, Info, Image as ImageIcon, Upload, MapPin, UserPlus, Clock, CalendarCheck, UserCog, Gift } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_URL } from '../config';

export default function CustomerBookingWizard({ customerId, onBack, isPublic = false }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false); // For API calls
    const [errors, setErrors] = useState({}); // Field-level inline errors
    const [activeFeature, setActiveFeature] = useState(0);
    const [showExitModal, setShowExitModal] = useState(false);
    
    const user = JSON.parse(localStorage.getItem('user'));
    
    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        phone: '',
        date: '',
        time: '13:00',
        designTitle: '',
        notes: '', // This will also capture additional details like placement and size
        placement: '',
        referenceImage: null,
        phoneCode: '+63'
    });

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [bookedDates, setBookedDates] = useState({});

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
            icon: <Clock size={48} color="#C19A6B" />,
            title: "Track Status",
            desc: "Monitor your consultation request and appointment progress in real-time.",
            bgColor: "#fdf2e9"
        },
        {
            icon: <CalendarCheck size={48} color="#C19A6B" />,
            title: "Manage Appointments",
            desc: "Easily view, reschedule, or cancel your past and upcoming sessions.",
            bgColor: "#f8fafc"
        },
        {
            icon: <MessageSquare size={48} color="#C19A6B" />,
            title: "Direct Communication",
            desc: "Chat securely with your artist and the studio for any questions or updates.",
            bgColor: "#f0fdf4"
        },
        {
            icon: <UserCog size={48} color="#C19A6B" />,
            title: "Personalized Profile",
            desc: "Manage your personal details, preferences, and tattoo history in one place.",
            bgColor: "#f5f3ff"
        },
        {
            icon: <Gift size={48} color="#C19A6B" />,
            title: "Exclusive Benefits",
            desc: "Receive special offers, loyalty rewards, and early access to new designs.",
            bgColor: "#fff7ed"
        }
    ];

    useEffect(() => {
        // Fetch global availability for the studio (Artist 1 / Admin)
        fetchAvailability(1);
        
        // Handle incoming data from Gallery/Artists
        if (location.state && location.state.designTitle) {
            setFormData(prev => ({
                ...prev,
                designTitle: location.state.designTitle
            }));
        }
    }, [location.state]);

    const fetchAvailability = async (artistId) => {
        try {
            const response = await Axios.get(`${API_URL}/api/artist/${artistId}/availability`);
            if (response.data.success) {
                const bookings = {};
                response.data.bookings.forEach(b => {
                    const dateStr = typeof b.appointment_date === 'string' 
                        ? b.appointment_date.substring(0, 10) 
                        : new Date(b.appointment_date).toISOString().split('T')[0];
                    if (!bookings[dateStr]) bookings[dateStr] = { count: 0 };
                    bookings[dateStr].count += 1;
                });
                setBookedDates(bookings);
            }
        } catch (error) {
            console.error('Error fetching availability:', error);
        }
    };

    const handleInputChange = (field, value) => {
        let val = value;
        if (field === 'name') {
            val = val.replace(/[^a-zA-Z\s-]/g, '').replace(/^\s+/, '');
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
            // For anonymous bookings, use a default artistId (e.g., Studio Admin ID 1) as customerId temporarily
            finalCustomerId = 1; // This is a workaround to satisfy the backend's NOT NULL constraint for customer_id
        }
        finalizeBooking(finalCustomerId);
    };

    const finalizeBooking = async (uid) => {
        setLoading(true);
        try {
            const currentUser = JSON.parse(localStorage.getItem('user'));

            const response = await Axios.post(`${API_URL}/api/admin/appointments`, {
                customerId: uid, // This will be the actual user ID or the placeholder ID (1)
                artistId: 1, // Default Studio Account
                date: formData.date,
                startTime: formData.time,
                endTime: formData.time,
                serviceType: 'Consultation',
                designTitle: formData.designTitle, // This is the tattoo idea
                notes: `DESIGN DETAILS\nIdea: ${formData.designTitle}\nPlacement: ${formData.placement}\nNotes: ${formData.notes || 'No additional notes'}\n\nCLIENT CONTEXT\nName: ${currentUser?.name || formData.name}\nEmail: ${currentUser?.email || formData.email}\nPhone: ${formData.phoneCode || '+63'}${formData.phone}`,
                referenceImage: formData.referenceImage,
                status: 'pending',
                price: 0 // Free consultation
            });

            if (response.data.success) {
                if (!currentUser && response.data.id) {
                    sessionStorage.setItem('orphanAppointmentId', response.data.id);
                }
                setStep(5); // Show consultation completed screen on step 5
            } else {
                alert('Request Failed: ' + (response.data.message || 'An unknown error occurred.'));
            }
        } catch (error) {
            console.error('Booking error:', error);
            alert('Request Failed. Please check your connection and try again.');
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
        maxDate.setMonth(today.getMonth() + 3);
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
            
            const dateData = bookedDates[dateStr] || { count: 0 };
            const isFull = dateData.count >= 5; // Studios have more capacity than individual artists
            const isBusy = dateData.count > 2;

            let statusColor = '#10b981'; 
            if (isFull) statusColor = '#ef4444';
            else if (isBusy) statusColor = '#f59e0b';

            days.push(            
                <button
                    key={i}
                    onClick={() => {
                        if (isFull) {
                            alert('Booking is not allowed on a full day. Please choose another date.');
                            return;
                        }
                        setFormData({ ...formData, date: dateStr });
                    }}
                    disabled={isPast || isTooFar}
                    style={{
                        padding: '12px',
                        border: isSelected ? '2px solid #C19A6B' : '1px solid #f1f5f9',
                        backgroundColor: isSelected ? '#fffcf0' : (isPast || isTooFar ? '#f8fafc' : 'white'),
                        color: isPast || isTooFar ? '#cbd5e1' : (isFull ? '#ef4444' : '#1e293b'),
                        borderRadius: '10px',
                        cursor: isPast || isTooFar ? 'default' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <span style={{fontWeight: isSelected ? '700' : '500', fontSize: '1rem'}}>{i}</span>
                    {!isPast && !isTooFar && (
                        <div style={{width: '4px', height: '4px', borderRadius: '2px', backgroundColor: statusColor}} />
                    )}
                </button>
            );
        }

        return (
            <div style={{backgroundColor: 'white', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
                    <button onClick={() => changeMonth(-1)} style={{background:'none', border:'none', cursor:'pointer', color:'#64748b'}}><ChevronLeft size={24}/></button>
                    <span style={{fontSize: '1.2rem', fontWeight: '700', color: '#1e293b'}}>{monthNames[month]} {year}</span>
                    <button onClick={() => changeMonth(1)} style={{background:'none', border:'none', cursor:'pointer', color:'#64748b'}}><ChevronRight size={24}/></button>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '12px', color: '#94a3b8', fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                    <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px'}}>
                    {days}
                </div>
                <div style={{display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '24px', fontSize: '0.85rem', color: '#64748b', fontWeight: '500'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}><div style={{width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#10b981'}}/> Available</div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}><div style={{width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#f59e0b'}}/> Busy</div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}><div style={{width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#ef4444'}}/> Full</div>
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

            <div className="form-group" style={{marginBottom: '24px', position: 'relative'}}>
                <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Tattoo Idea / Style *</label>
                <input
                    type="text"
                    className={`form-input ${errors.designTitle ? 'error' : ''}`}
                    placeholder="e.g. Fine-line Floral, Traditional Blackwork, Realistic Portrait"
                    value={formData.designTitle}
                    onChange={(e) => handleInputChange('designTitle', e.target.value)}
                />
                {errors.designTitle && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem'}}>{errors.designTitle}</small>}
            </div>
            
            <div className="form-group" style={{marginBottom: '24px'}}>
                <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Reference Image (Optional)</label>
                <div 
                    onClick={() => document.getElementById('wizard-ref-img').click()}
                    style={{ 
                        height: '140px', border: '2px dashed #e2e8f0', borderRadius: '12px', 
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                        cursor: 'pointer', background: formData.referenceImage ? '#f8fafc' : 'transparent', overflow: 'hidden'
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

            <div className="form-group">
                <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Additional Details (Placement, Size, etc.)</label>
                <textarea
                    rows="5"
                    className="form-input"
                    placeholder="Where on your body? How large? Any specific details or meaning?"
                    value={formData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                />
            </div>
        </div>
    );

    const renderStepPlacement = () => (
        <div className="fade-in">
            <h3 style={{fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <MapPin className="text-bronze" size={24} /> 2. Placement
            </h3>
            <p style={{color: '#64748b', marginBottom: '32px'}}>Where on your body would you like this tattoo?</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                {["Forearm", "Upper Arm", "Shoulder", "Chest", "Back", "Ribs", "Thigh", "Calf", "Neck", "Wrist", "Hand", "Ankle"].map(part => (
                    <button
                        key={part} type="button"
                        onClick={() => {
                            setFormData({...formData, placement: part});
                            if (errors.placement) setErrors(prev => ({...prev, placement: ''}));
                        }}
                        style={{
                            padding: '16px', borderRadius: '12px', border: `2px solid ${formData.placement === part ? '#C19A6B' : (errors.placement ? '#ef4444' : '#e2e8f0')}`,
                            background: formData.placement === part ? '#C19A6B' : 'white',
                            color: formData.placement === part ? 'white' : '#1e293b',
                            fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        {part}
                    </button>
                ))}
            </div>
            {errors.placement && <small style={{color: '#ef4444', display: 'block', marginTop: '12px', fontSize: '0.9rem', textAlign: 'center'}}>{errors.placement}</small>}
        </div>
    );

    const renderStepScheduling = () => (
        <div className="fade-in">
            <h3 style={{fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <Calendar className="text-bronze" size={24} /> 3. Schedule Consultation
            </h3>
            <p style={{color: '#64748b', marginBottom: '32px'}}>Consultations are free. Select a date to meet in-studio and discuss your design.</p>
            
            <div style={{display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 250px', gap: '32px'}}>
                <div>{renderCalendar()}</div>
                <div>
                     <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '12px', display: 'block'}}>Preferred Time</label>
                     <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                        {['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map(t => (
                            <button
                                key={t}
                                onClick={() => {
                                    setFormData({...formData, time: t});
                                    if (errors.date) setErrors(prev => ({...prev, date: ''}));
                                }}
                                style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: formData.time === t ? '2px solid #C19A6B' : '1px solid #e2e8f0',
                                    backgroundColor: formData.time === t ? '#fffcf0' : 'white',
                                    fontWeight: formData.time === t ? '700' : '500',
                                    color: formData.time === t ? '#1e293b' : '#64748b',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {t === '12:00' ? '12:00 PM' : 
                                 parseInt(t) > 12 ? `${parseInt(t) - 12}:00 PM` : `${t} PM`}
                            </button>
                        ))}
                     </div>
                </div>
            </div>
            {errors.date && <small style={{color: '#ef4444', display: 'block', marginTop: '16px', fontSize: '0.9rem', textAlign: 'center'}}>{errors.date}</small>}
        </div>
    );

    const renderStepContact = () => (
        <div className="fade-in">
            <h3 style={{fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <User className="text-bronze" size={24} /> 4. Contact Information
            </h3>
            <p style={{color: '#64748b', marginBottom: '32px'}}>How should we reach out to you regarding your request?</p>

            <div style={{ padding: '32px', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div className="form-group" style={{ marginBottom: '20px', position: 'relative' }}>
                    <label style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block' }}>Full Name *</label>
                    <input
                        type="text"
                        className={`form-input ${errors.name ? 'error' : ''}`}
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        disabled={!!user}
                    />
                    {errors.name && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem'}}>{errors.name}</small>}
                </div>
                <div className="form-group" style={{ marginBottom: '20px', position: 'relative' }}>
                    <label style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block' }}>Email Address *</label>
                    <input
                        type="email"
                        className={`form-input ${errors.email ? 'error' : ''}`}
                        placeholder="john.doe@example.com"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        disabled={!!user}
                    />
                    {errors.email && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem'}}>{errors.email}</small>}
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                    <label style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block' }}>Phone Number *</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <select 
                            className="form-input" 
                            style={{ width: '110px', flexShrink: 0, appearance: 'menulist' }}
                            value={formData.phoneCode || '+63'} 
                            onChange={(e) => handleInputChange('phoneCode', e.target.value)}
                        >
                            <option value="+63">+63 (PH)</option>
                            <option value="+1">+1 (US)</option>
                            <option value="+44">+44 (UK)</option>
                            <option value="+61">+61 (AU)</option>
                            <option value="+81">+81 (JP)</option>
                            <option value="+82">+82 (KR)</option>
                            <option value="+65">+65 (SG)</option>
                        </select>
                        <input 
                            type="tel" 
                            className={`form-input ${errors.phone ? 'error' : ''}`} 
                            placeholder="9171234567" 
                            value={formData.phone} 
                            onChange={(e) => handleInputChange('phone', e.target.value.replace(/[^0-9]/g, ''))} 
                            style={{ flex: 1 }}
                        />
                    </div>
                    {errors.phone && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem'}}>{errors.phone}</small>}
                </div>
            </div>
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
                        onClick={() => navigate('/')}
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

    const renderConsultationCompletedPage = () => (
        <div className="fade-in" style={{
            textAlign: 'center',
            padding: '60px 40px',
            backgroundColor: 'white',
            borderRadius: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}>
            <div style={{
                width: '100px', height: '100px', backgroundColor: '#f0fdf4', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px'
            }}>
                <CheckCircle size={54} color="#16a34a" />
            </div>
            <h2 style={{ fontSize: '2rem', fontWeight: '800', color: '#1e293b', marginBottom: '16px' }}>
                Consultation Request Completed!
            </h2>
            <p style={{ color: '#64748b', maxWidth: '600px', margin: '0 auto 20px', fontSize: '1.1rem', lineHeight: '1.6' }}>
                Thank you for your interest in a {formData.designTitle} consultation. We've received your request and will contact you within the next 24 hours to discuss your vision and schedule your session. Please check your email for a confirmation. We look forward to bringing your vision to life!
            </p>

            <div style={{
                marginTop: '50px',
                paddingTop: '30px',
                borderTop: '1px solid #f1f5f9',
                maxWidth: '800px', // Increased max-width for the new layout
                margin: '40px auto 0 auto',
                textAlign: 'center'
            }}>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#1e293b', marginBottom: '15px' }}>
                    Track Your Request & More with an InkVistAR Account!
                </h3>
                <p style={{ color: '#64748b', marginBottom: '20px' }}>
                    Create an account to unlock these powerful features and enhance your InkVistAR experience:
                </p>

                {/* Widget Carousel Section */}
                <div style={{ position: 'relative', marginTop: '30px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '20px',
                        minHeight: '220px'
                    }}>
                        <button 
                            onClick={() => setActiveFeature((prev) => (prev - 1 + features.length) % features.length)}
                            style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'all 0.2s' }}
                        >
                            <ChevronLeft size={24} />
                        </button>

                        <div style={{ 
                            width: '100%', 
                            maxWidth: '400px', 
                            perspective: '1000px',
                            position: 'relative',
                            height: '220px'
                        }}>
                            {features.map((feature, index) => (
                                <div 
                                    key={index}
                                    style={{
                                        position: 'absolute',
                                        top: 0, left: 0, right: 0, bottom: 0,
                                        backgroundColor: feature.bgColor,
                                        borderRadius: '24px',
                                        padding: '32px',
                                        textAlign: 'center',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                        transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                                        opacity: activeFeature === index ? 1 : 0,
                                        transform: activeFeature === index 
                                            ? 'translateX(0) scale(1)' 
                                            : index < activeFeature 
                                                ? 'translateX(-50px) scale(0.9)' 
                                                : 'translateX(50px) scale(0.9)',
                                        pointerEvents: activeFeature === index ? 'all' : 'none',
                                        visibility: activeFeature === index ? 'visible' : 'hidden'
                                    }}
                                >
                                    <div style={{ marginBottom: '16px' }}>{feature.icon}</div>
                                    <h4 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>{feature.title}</h4>
                                    <p style={{ color: '#64748b', fontSize: '1rem', lineHeight: '1.5' }}>{feature.desc}</p>
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={() => setActiveFeature((prev) => (prev + 1) % features.length)}
                            style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '44px', height: '44px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', transition: 'all 0.2s' }}
                        >
                            <ChevronRight size={24} />
                        </button>
                    </div>

                    {/* Slide Indicators */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
                        {features.map((_, i) => (
                            <div 
                                key={i}
                                onClick={() => setActiveFeature(i)}
                                style={{ 
                                    width: activeFeature === i ? '24px' : '8px', 
                                    height: '8px', 
                                    borderRadius: '4px', 
                                    backgroundColor: activeFeature === i ? '#C19A6B' : '#e2e8f0',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease'
                                }} 
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '50px' }}>
                <button
                    onClick={() => navigate('/register', { state: { prefill: { name: formData.name, email: formData.email, phone: formData.phone } } })}
                    className="btn btn-primary"
                    style={{ padding: '14px 36px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#C19A6B', borderColor: '#C19A6B', color: 'white', fontWeight: '700', boxShadow: '0 4px 12px rgba(193, 154, 107, 0.4)' }}
                >
                    <UserPlus size={20} /> Create an Account
                </button>
                <button
                    onClick={() => setShowExitModal(true)}
                    className="btn btn-secondary"
                    style={{ padding: '12px 32px', fontSize: '1rem' }}
                >
                    No Thanks
                </button>
            </div>
            {showExitModal && renderExitModal()}
        </div>
    );

    if (step === 5) return renderConsultationCompletedPage();

    return (
        <div className="data-card" style={{border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', borderRadius: '24px', position: 'relative'}}>
            
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #f1f5f9', paddingBottom: '32px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                    <h2 style={{margin: 0, fontSize: '1.4rem', fontWeight: '800', color: '#1e293b'}}>Request Consultation</h2>
                    <span style={{backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: '700', padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase'}}>Studio-Lead Flow</span>
                </div>
                <div style={{display: 'flex', gap: '12px'}}> {/* Progress bar for 4 steps */}
                    {[1, 2, 3, 4].map(s => (
                        <div key={s} style={{
                            width: '30px', height: '4px', borderRadius: '2px', 
                            backgroundColor: step >= s ? '#C19A6B' : '#e2e8f0',
                            transition: 'all 0.4s ease'
                        }} />
                    ))}
                </div>
            </div>

            <div style={{minHeight: '400px'}}>
                {step === 1 && renderStep1()}
                {step === 2 && renderStepPlacement()} {/* Step 2: Placement */}
                {step === 3 && renderStepScheduling()} {/* Step 3: Scheduling */}
                {step === 4 && renderStepContact()} {/* Step 4: Contact Info */}
            </div>
            
            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '48px', paddingTop: '32px', borderTop: '1px solid #f1f5f9'}}>
                <button 
                    onClick={() => setStep(Math.max(1, step - 1))} 
                    disabled={step === 1} 
                    className="btn btn-secondary" 
                    style={{display: 'flex', alignItems: 'center', gap: '8px', opacity: step === 1 ? 0 : 1, transition: 'opacity 0.2s', visibility: step === 1 ? 'hidden' : 'visible'}}
                >
                    <ChevronLeft size={20} /> Previous
                </button>
                
                {step < 4 ? (
                    <button 
                        onClick={() => { 
                            const newErrors = {};
                            if (step === 1 && !formData.designTitle) newErrors.designTitle = 'Please tell us about your tattoo idea'; 
                            if (step === 2 && !formData.placement) newErrors.placement = 'Please select a placement area';
                            if (step === 3 && (!formData.date || !formData.time)) newErrors.date = 'Please select a preferred date and time';
                            
                            if (Object.keys(newErrors).length > 0) {
                                setErrors(newErrors);
                                return;
                            }
                            setStep(step + 1);
                        }} 
                        className="btn btn-primary" 
                        style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 28px'}}
                    >
                        Next Step <ChevronRight size={20} />
                    </button>
                ) : (
                    <button 
                        onClick={() => {
                            const newErrors = {};
                            if (!formData.name) newErrors.name = 'Full Name is required';
                            if (!formData.email) newErrors.email = 'Email Address is required';
                            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Please enter a valid email format';
                            
                            if (!formData.phone) newErrors.phone = 'Phone Number is required';
                            else if (!/^\+?\d{10,15}$/.test((formData.phoneCode || '+63') + formData.phone)) newErrors.phone = 'Please enter a valid phone number';
                            
                            if (Object.keys(newErrors).length > 0) {
                                setErrors(newErrors);
                                return;
                            }
                            handleSubmit();
                        }} 
                        disabled={loading} 
                        className="btn btn-primary" 
                        style={{display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1e293b', borderColor: '#1e293b', padding: '12px 32px'}}
                    >
                        {loading ? 'Sending...' : 'Request Consultation'} <CheckCircle size={20} />
                    </button>
                )}
            </div>
        </div>
    );
}
