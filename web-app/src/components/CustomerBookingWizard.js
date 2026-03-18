import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { CheckCircle, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../config';

export default function CustomerBookingWizard({ customerId, onBack, isPublic = false }) {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [artists, setArtists] = useState([]);
    
    const [formData, setFormData] = useState({
        artist: null,
        date: '',
        time: '',
        designTitle: '',
        notes: ''
    });

    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [bookedDates, setBookedDates] = useState({});

    useEffect(() => {
        fetchArtists();
    }, []);

    const fetchArtists = async () => {
        try {
            const response = await Axios.get(`${API_URL}/api/customer/artists`);
            if (response.data.success) {
                const fetchedArtists = response.data.artists;
                setArtists(fetchedArtists);
                
                // Check for pending booking after fetching artists
                const pending = sessionStorage.getItem('pendingBooking');
                if (pending && customerId) {
                    try {
                        const parsed = JSON.parse(pending);
                        const matchedArtist = fetchedArtists.find(a => a.id === parsed.artistId);
                        if (matchedArtist) {
                            setFormData({
                                artist: matchedArtist,
                                date: parsed.date,
                                time: parsed.startTime,
                                designTitle: parsed.designTitle,
                                notes: parsed.notes
                            });
                            setStep(3); // Jump to details confirmation
                        }
                        sessionStorage.removeItem('pendingBooking');
                    } catch (e) {
                        console.error('Error parsing pending booking', e);
                        sessionStorage.removeItem('pendingBooking');
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching artists:', error);
        }
    };

    useEffect(() => {
        if (formData.artist) {
            fetchAvailability(formData.artist.id);
        }
    }, [formData.artist]);

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
        if (!formData.artist || !formData.date || !formData.designTitle) {
            alert('Please fill in all required fields.');
            return;
        }

        // Handle unauthenticated booking attempt
        if (!customerId) {
            sessionStorage.setItem('pendingBooking', JSON.stringify({
                artistId: formData.artist.id,
                date: formData.date,
                startTime: formData.time || '13:00',
                endTime: formData.time || '13:00',
                designTitle: formData.designTitle,
                notes: formData.notes
            }));
            // Redirect to login
            navigate('/login?redirect=booking');
            return;
        }

        setLoading(true);
        try {
            const response = await Axios.post(`${API_URL}/api/customer/appointments`, {
                customerId: customerId,
                artistId: formData.artist.id,
                date: formData.date,
                startTime: formData.time || '13:00',
                endTime: formData.time || '13:00',
                designTitle: formData.designTitle,
                notes: formData.notes
            });

            if (response.data.success) {
                const { appointmentId } = response.data;
                navigate('/payment', { state: { appointmentId } });
            } else {
                alert('Booking Failed: ' + (response.data.message || 'An unknown error occurred.'));
            }
        } catch (error) {
            console.error('Booking error:', error.response || error);
            const errorMessage = error.response?.data?.message || 'Failed to connect to the server. Please check your connection and try again.';
            alert(`Booking Failed: ${errorMessage}`);
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
        
        // Empty slots
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} />);
        }

        // Days
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const checkDate = new Date(year, month, i);
            const isSelected = formData.date === dateStr;
            const isPast = checkDate <= today;
            
            const dateData = bookedDates[dateStr] || { count: 0 };
            const isFull = dateData.count >= 3; 
            const isBusy = dateData.count > 0;

            let statusColor = '#10b981'; // Green
            if (isFull) statusColor = '#ef4444'; // Red
            else if (isBusy) statusColor = '#f59e0b'; // Orange

            days.push(
                <button
                    key={i}
                    onClick={() => !isPast && !isFull && setFormData({ ...formData, date: dateStr })}
                    disabled={isPast || isFull}
                    style={{
                        padding: '10px',
                        border: isSelected ? '2px solid #daa520' : '1px solid #f3f4f6',
                        backgroundColor: isSelected ? '#fffdf5' : (isPast || isFull ? '#f9fafb' : 'white'),
                        color: isPast || isFull ? '#9ca3af' : '#374151',
                        borderRadius: '8px',
                        cursor: isPast || isFull ? 'default' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        minHeight: '50px'
                    }}
                >
                    <span style={{fontWeight: isSelected ? 'bold' : 'normal'}}>{i}</span>
                    {!isPast && (
                        <div style={{width: '6px', height: '6px', borderRadius: '3px', backgroundColor: statusColor}} />
                    )}
                </button>
            );
        }

        return (
            <div style={{backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                    <button onClick={() => changeMonth(-1)} style={{background:'none', border:'none', cursor:'pointer', padding:'5px'}}><ChevronLeft size={20}/></button>
                    <span style={{fontSize: '1.1rem', fontWeight: 'bold'}}>{monthNames[month]} {year}</span>
                    <button onClick={() => changeMonth(1)} style={{background:'none', border:'none', cursor:'pointer', padding:'5px'}}><ChevronRight size={20}/></button>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '10px', color: '#9ca3af', fontSize: '0.9rem', fontWeight: '600'}}>
                    <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
                </div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px'}}>
                    {days}
                </div>
                <div style={{display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '15px', fontSize: '0.8rem', color: '#6b7280'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}><div style={{width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#10b981'}}/> Available</div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}><div style={{width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#f59e0b'}}/> Busy</div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}><div style={{width: '8px', height: '8px', borderRadius: '4px', backgroundColor: '#ef4444'}}/> Full</div>
                </div>
            </div>
        );
    };

    const renderStep1 = () => (
        <div>
            <h3 style={{marginBottom: '20px'}}>1. Select an Artist</h3>
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px'}}>
                {artists.map((artist) => (
                    <div
                        key={artist.id}
                        onClick={() => setFormData({ ...formData, artist })}
                        style={{
                            padding: '20px',
                            border: formData.artist?.id === artist.id ? '2px solid #daa520' : '1px solid #e5e7eb',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            backgroundColor: formData.artist?.id === artist.id ? '#fffdf5' : 'white',
                            transition: 'all 0.2s'
                        }}
                    >
                        <div style={{width: '50px', height: '50px', borderRadius: '25px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', fontSize: '1.2rem', fontWeight: 'bold', color: '#6b7280'}}>
                            {artist.name.charAt(0)}
                        </div>
                        <h4 style={{margin: '0 0 5px 0'}}>{artist.name}</h4>
                        <p style={{margin: '0 0 5px 0', fontSize: '0.9rem', color: '#6b7280'}}>{artist.studio_name}</p>
                        <p style={{margin: 0, fontWeight: 'bold', color: '#daa520'}}>₱{artist.hourly_rate}/hr</p>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div>
            <h3 style={{marginBottom: '20px'}}>2. Select Date</h3>
            <div style={{display: 'block'}}>
                <div>
                    <label style={{display: 'block', marginBottom: '10px', fontWeight: '600'}}>Select Date</label>
                    {renderCalendar()}
                </div>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div>
            <h3 style={{marginBottom: '20px'}}>3. Design Details</h3>
            <div className="form-group">
                <label>Service Type *</label>
                <select
                    className="form-input"
                    value={formData.designTitle}
                    onChange={(e) => setFormData({ ...formData, designTitle: e.target.value })}
                >
                    <option value="">Select Service</option>
                    <option value="Tattoo Session">Tattoo Session</option>
                    <option value="Consultation">Consultation</option>
                    <option value="Piercing">Piercing</option>
                    <option value="Touch-up">Touch-up</option>
                    <option value="Aftercare Check">Aftercare Check</option>
                </select>
            </div>
            <div className="form-group">
                <label>Description & Notes</label>
                <textarea
                    rows="4"
                    className="form-input"
                    placeholder="Describe size, placement, style, etc..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
            </div>
        </div>
    );

    const renderSuccess = () => (
        <div style={{textAlign: 'center', padding: '40px 20px'}}>
            <div style={{width: '80px', height: '80px', backgroundColor: '#dcfce7', borderRadius: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'}}>
                <CheckCircle size={40} color="#16a34a" />
            </div>
            <h2 style={{marginBottom: '10px'}}>Booking Request Sent!</h2>
            <p style={{color: '#6b7280', marginBottom: '30px'}}>
                Your appointment request with {formData.artist?.name} has been submitted. 
                Wait for confirmation.
            </p>
            <button onClick={onBack} className="btn btn-primary">Return to Dashboard</button>
        </div>
    );

    if (step === 4) return renderSuccess();

    return (
        <div className="data-card">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e5e7eb', paddingBottom: '15px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    <button onClick={onBack} style={{background: 'none', border: 'none', cursor: 'pointer', padding: '5px'}}><ArrowLeft size={20} color="#4b5563" /></button>
                    <h2 style={{margin: 0, fontSize: '1.2rem'}}>New Appointment</h2>
                </div>
                <div style={{display: 'flex', gap: '10px', fontSize: '0.9rem', color: '#6b7280'}}>
                    <span style={{color: step >= 1 ? '#daa520' : 'inherit', fontWeight: step >= 1 ? 'bold' : 'normal'}}>Artist</span>/
                    <span style={{color: step >= 2 ? '#daa520' : 'inherit', fontWeight: step >= 2 ? 'bold' : 'normal'}}>Date</span>/
                    <span style={{color: step >= 3 ? '#daa520' : 'inherit', fontWeight: step >= 3 ? 'bold' : 'normal'}}>Details</span>
                </div>
            </div>
            <div style={{minHeight: '300px'}}>
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #e5e7eb'}}>
                <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="btn btn-secondary" style={{display: 'flex', alignItems: 'center', gap: '5px', opacity: step === 1 ? 0.5 : 1}}><ChevronLeft size={16} /> Back</button>
                {step < 3 ? (
                    <button onClick={() => { if (step === 1 && !formData.artist) return alert('Please select an artist'); if (step === 2 && !formData.date) return alert('Please select a date'); setStep(step + 1); }} className="btn btn-primary" style={{display: 'flex', alignItems: 'center', gap: '5px'}}>Next <ChevronRight size={16} /></button>
                ) : (
                    <button onClick={handleSubmit} disabled={loading} className="btn btn-primary" style={{display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#16a34a', borderColor: '#16a34a'}}>{loading ? 'Booking...' : 'Confirm Booking'} <CheckCircle size={16} /></button>
                )}
            </div>
        </div>
    );
}