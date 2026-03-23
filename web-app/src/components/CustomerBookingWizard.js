import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { CheckCircle, ChevronLeft, ChevronRight, Calendar, User, MessageSquare, Info } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_URL } from '../config';

export default function CustomerBookingWizard({ customerId, onBack, isPublic = false }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    
    const user = JSON.parse(localStorage.getItem('user'));
    
    const [formData, setFormData] = useState({
        name: user?.name || '',
        email: user?.email || '',
        phone: '',
        date: '',
        time: '13:00',
        designTitle: '',
        notes: ''
    });

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [bookedDates, setBookedDates] = useState({});

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

    const handleSubmit = async () => {
        if (!formData.date || !formData.designTitle || !formData.name || !formData.email) {
            alert('Please fill in all required fields.');
            return;
        }

        // Handle unauthenticated leading
        if (!customerId && !isPublic) {
            sessionStorage.setItem('pendingBooking', JSON.stringify({
                ...formData,
                artistId: 1, // Default Studio Account
                serviceType: 'Consultation'
            }));
            navigate('/login?redirect=booking');
            return;
        }

        setLoading(true);
        try {
            const response = await Axios.post(`${API_URL}/api/admin/appointments`, {
                customerId: customerId || 0, // 0 for public leads if not logged in
                artistId: 1, // Default Studio Account
                date: formData.date,
                startTime: formData.time,
                endTime: formData.time,
                designTitle: `CONSULTATION: ${formData.designTitle}`,
                notes: `Client: ${formData.name}\nEmail: ${formData.email}\nPhone: ${formData.phone}\n\nNotes: ${formData.notes}`,
                status: 'pending',
                price: 0 // Free consultation
            });

            if (response.data.success) {
                if (customerId) {
                    navigate('/booking-confirmation', { state: { appointmentId: response.data.id, isConsultation: true } });
                } else {
                    setStep(4); // Show success message
                }
            } else {
                alert('Request Failed: ' + (response.data.message || 'An unknown error occurred.'));
            }
        } catch (error) {
            console.error('Booking error:', error);
            alert('Request Failed. Please try again or contact us directly.');
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
        
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} />);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const checkDate = new Date(year, month, i);
            const isSelected = formData.date === dateStr;
            const isPast = checkDate <= today;
            
            const dateData = bookedDates[dateStr] || { count: 0 };
            const isFull = dateData.count >= 5; // Studios have more capacity than individual artists
            const isBusy = dateData.count > 2;

            let statusColor = '#10b981'; 
            if (isFull) statusColor = '#ef4444';
            else if (isBusy) statusColor = '#f59e0b';

            days.push(
                <button
                    key={i}
                    onClick={() => !isPast && !isFull && setFormData({ ...formData, date: dateStr })}
                    disabled={isPast || isFull}
                    style={{
                        padding: '12px',
                        border: isSelected ? '2px solid #C19A6B' : '1px solid #f1f5f9',
                        backgroundColor: isSelected ? '#fffcf0' : (isPast || isFull ? '#f8fafc' : 'white'),
                        color: isPast || isFull ? '#cbd5e1' : '#1e293b',
                        borderRadius: '10px',
                        cursor: isPast || isFull ? 'default' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '2px',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <span style={{fontWeight: isSelected ? '700' : '500', fontSize: '1rem'}}>{i}</span>
                    {!isPast && (
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
            <p style={{color: '#64748b', marginBottom: '32px'}}>Tell us roughly what you're looking for so we can match you with the right artist.</p>
            
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

    const renderStep2 = () => (
        <div className="fade-in">
            <h3 style={{fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <Calendar className="text-bronze" size={24} /> 2. Schedule Consultation
            </h3>
            <p style={{color: '#64748b', marginBottom: '32px'}}>Consultations are free. Select a date to meet in-studio and discuss your design.</p>
            
            <div style={{display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 250px', gap: '32px'}}>
                <div>{renderCalendar()}</div>
                <div>
                     <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '12px', display: 'block'}}>Preferred Time</label>
                     <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
                        {['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'].map(t => (
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
                                {t.replace(':00', t.startsWith('12') ? ' PM' : ' PM')}
                            </button>
                        ))}
                     </div>
                </div>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="fade-in">
            <h3 style={{fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <User className="text-bronze" size={24} /> 3. Contact Information
            </h3>
            <p style={{color: '#64748b', marginBottom: '32px'}}>How can we reach you to confirm your consultation?</p>
            
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px'}}>
                <div className="form-group">
                    <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Full Name *</label>
                    <input
                        type="text"
                        className="form-input"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        disabled={!!user}
                    />
                </div>
                <div className="form-group">
                    <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Email Address *</label>
                    <input
                        type="email"
                        className="form-input"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={!!user}
                    />
                </div>
                <div className="form-group" style={{gridColumn: 'span 2'}}>
                    <label style={{fontWeight: '600', color: '#1e293b', marginBottom: '8px', display: 'block'}}>Phone Number *</label>
                    <input
                        type="tel"
                        className="form-input"
                        placeholder="e.g. +63 9xx xxx xxxx"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                </div>
            </div>

            <div style={{marginTop: '40px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', gap: '15px', alignItems: 'flex-start'}}>
                <Info className="text-bronze" size={20} style={{marginTop: '2px'}} />
                <div style={{fontSize: '0.9rem', color: '#475569', lineHeight: '1.6'}}>
                    <strong>What happens next?</strong><br />
                    Once submitted, our studio manager will review your request and confirm the consultation time via email or phone. During the consultation, we'll finalize the design, quote the full price, and assign the best artist for your project.
                </div>
            </div>
        </div>
    );

    const renderSuccess = () => (
        <div style={{textAlign: 'center', padding: '60px 40px'}}>
            <div style={{width: '100px', height: '100px', backgroundColor: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px'}}>
                <CheckCircle size={54} color="#16a34a" />
            </div>
            <h2 style={{fontSize: '2rem', fontWeight: '800', color: '#1e293b', marginBottom: '16px'}}>Consultation Request Sent</h2>
            <p style={{color: '#64748b', maxWidth: '500px', margin: '0 auto 40px', fontSize: '1.1rem', lineHeight: '1.6'}}>
                Thank you, {formData.name}. We've received your request for a {formData.designTitle} consultation. 
                Keep an eye on your email ({formData.email}) for confirmation!
            </p>
            <button onClick={() => navigate('/')} className="btn btn-primary" style={{padding: '12px 32px', fontSize: '1rem'}}>Return Home</button>
        </div>
    );

    if (step === 4) return renderSuccess();

    return (
        <div className="data-card" style={{border: 'none', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', borderRadius: '24px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #f1f5f9', paddingBottom: '32px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                    <h2 style={{margin: 0, fontSize: '1.4rem', fontWeight: '800', color: '#1e293b'}}>Request Consultation</h2>
                    <span style={{backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: '700', padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase'}}>Studio-Lead Flow</span>
                </div>
                <div style={{display: 'flex', gap: '12px'}}>
                    {[1, 2, 3].map(s => (
                        <div key={s} style={{
                            width: '40px', height: '4px', borderRadius: '2px', 
                            backgroundColor: step >= s ? '#C19A6B' : '#e2e8f0',
                            transition: 'all 0.4s ease'
                        }} />
                    ))}
                </div>
            </div>

            <div style={{minHeight: '400px'}}>
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
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
                
                {step < 3 ? (
                    <button 
                        onClick={() => { 
                            if (step === 1 && !formData.designTitle) return alert('Please tell us about your tattoo idea'); 
                            if (step === 2 && !formData.date) return alert('Please select a preferred date'); 
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
