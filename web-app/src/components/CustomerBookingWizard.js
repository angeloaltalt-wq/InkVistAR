import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { CheckCircle, ChevronLeft, ChevronRight, Calendar, User, MessageSquare, Info, Image as ImageIcon, Upload, MapPin, Lock, UserPlus, LogIn } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_URL } from '../config';

export default function CustomerBookingWizard({ customerId, onBack, isPublic = false }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false); // For API calls
    
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
        referenceImage: null
    });

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [bookedDates, setBookedDates] = useState({});

    const [authView, setAuthView] = useState('register'); // 'login' or 'register'
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
        if (!formData.date || !formData.designTitle || !formData.placement || !formData.name || !formData.email || !formData.phone) {
            alert('Please fill in all required fields: Name, Email, Phone, Date, Tattoo Idea, and Placement.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            alert('Please enter a valid email address.');
            return;
        }
        if (!/^\+?\d{10,15}$/.test(formData.phone)) { // Basic phone number validation
            alert('Please enter a valid phone number.');
            return;
        }

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
                notes: `DESIGN DETAILS\nIdea: ${formData.designTitle}\nPlacement: ${formData.placement}\nNotes: ${formData.notes || 'No additional notes'}\n\nCLIENT CONTEXT\nName: ${currentUser?.name || formData.name}\nEmail: ${currentUser?.email || formData.email}`,
                referenceImage: formData.referenceImage,
                status: 'pending',
                price: 0 // Free consultation
            });

            if (response.data.success) {
                setStep(4); // Show new consultation completed screen
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

            {/* Customer Contact Information (if not logged in) */}
            {!user && (
                <div style={{ marginBottom: '32px', padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', marginBottom: '15px' }}>Your Contact Information</h4>
                    <div className="form-group" style={{ marginBottom: '15px' }}>
                        <label style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block' }}>Your Full Name *</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="John Doe"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '15px' }}>
                        <label style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block' }}>Your Email *</label>
                        <input
                            type="email"
                            className="form-input"
                            placeholder="john.doe@example.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block' }}>Your Phone Number *</label>
                        <input type="tel" className="form-input" placeholder="+639171234567" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} required />
                    </div>
                </div>
            )}
            
            <div className="form-group" style={{marginBottom: '24px'}}>
                <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Tattoo Idea / Style *</label>
                <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Fine-line Floral, Traditional Blackwork, Realistic Portrait"
                    value={formData.designTitle}
                    onChange={(e) => setFormData({ ...formData, designTitle: e.target.value })}
                />
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
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
                        onClick={() => setFormData({...formData, placement: part})}
                        style={{
                            padding: '16px', borderRadius: '12px', border: `2px solid ${formData.placement === part ? '#C19A6B' : '#e2e8f0'}`,
                            background: formData.placement === part ? '#C19A6B' : 'white',
                            color: formData.placement === part ? 'white' : '#1e293b',
                            fontWeight: '600', fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        {part}
                    </button>
                ))}
            </div>
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
                                onClick={() => setFormData({...formData, time: t})}
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
                Thank you for your interest in a {formData.designTitle} consultation. We've received your request and will contact you within the next 24 hours to discuss your vision and schedule your session. Please check your email for a confirmation.
            </p>

            <div style={{
                marginTop: '40px', paddingTop: '30px', borderTop: '1px solid #f1f5f9',
                maxWidth: '600px', margin: '40px auto 0 auto', textAlign: 'left'
            }}>
                <h3 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#1e293b', marginBottom: '15px' }}>
                    Track Your Request & More with an InkVistAR Account!
                </h3>
                <p style={{ color: '#64748b', marginBottom: '20px' }}>
                    Creating an account allows you to:
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#475569', fontSize: '1rem', lineHeight: '1.8' }}>
                    <li style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}><CheckCircle size={18} color="#10b981" /> Track the status of your consultation request.</li>
                    <li style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}><CheckCircle size={18} color="#10b981" /> View your past and upcoming appointments.</li>
                    <li style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}><CheckCircle size={18} color="#10b981" /> Communicate directly with your artist.</li>
                    <li style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}><CheckCircle size={18} color="#10b981" /> Manage your profile and preferences.</li>
                    <li style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}><CheckCircle size={18} color="#10b981" /> Access exclusive offers and updates.</li>
                </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '50px' }}>
                <button
                    onClick={() => navigate('/register', { state: { prefill: { name: formData.name, email: formData.email, phone: formData.phone } } })}
                    className="btn btn-primary"
                    style={{ padding: '12px 32px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <UserPlus size={20} /> Create an Account
                </button>
                <button
                    onClick={() => navigate('/')}
                    className="btn btn-secondary"
                    style={{ padding: '12px 32px', fontSize: '1rem' }}
                >
                    No thanks, return home
                </button>
            </div>
        </div>
    );

    if (step === 4) return renderConsultationCompletedPage();

    return (
        <div className="data-card" style={{border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', borderRadius: '24px', position: 'relative'}}>
            
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #f1f5f9', paddingBottom: '32px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                    <h2 style={{margin: 0, fontSize: '1.4rem', fontWeight: '800', color: '#1e293b'}}>Request Consultation</h2>
                    <span style={{backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: '700', padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase'}}>Studio-Lead Flow</span>
                </div>
                <div style={{display: 'flex', gap: '12px'}}> {/* Progress bar for 3 steps */}
                    {[1, 2, 3].map(s => (
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
                
                {step < 3 ? ( // Changed from step < 4 to step < 3
                    <button 
                        onClick={() => { 
                            if (step === 1 && !formData.designTitle) return alert('Please tell us about your tattoo idea'); 
                            if (step === 2 && !formData.placement) return alert('Please select a placement area');
                            if (step === 3 && (!formData.date || !formData.time)) return alert('Please select a preferred date and time');
                            
                            setStep(step + 1);
                        }} 
                        className="btn btn-primary" 
                        style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 28px'}}
                    >
                        Next Step <ChevronRight size={20} />
                    </button>
                ) : (
                    <button 
                        onClick={handleSubmit} 
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
