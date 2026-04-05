import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Star, ArrowLeft } from 'lucide-react';
import CustomerSideNav from '../components/CustomerSideNav';
import './PortalStyles.css';
import { API_URL } from '../config';

function CustomerReview() {
    const [searchParams] = useSearchParams();
    const appointmentId = searchParams.get('appointment');
    const navigate = useNavigate();

    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [appointment, setAppointment] = useState(null);

    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });

    useEffect(() => {
        if (appointmentId && user) {
            fetchAppointmentDetails();
        }
    }, [appointmentId, user]);

    const fetchAppointmentDetails = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/appointments/customer/${user.id}`);
            if (res.data.success) {
                const appt = res.data.appointments.find(a => a.id === parseInt(appointmentId));
                if (appt) {
                    setAppointment(appt);
                } else {
                    setErrorMsg("Appointment not found or you don't have permission.");
                }
            }
        } catch(e) {
            console.error(e);
            setErrorMsg("Failed to verify appointment.");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!appointment) return;
        setLoading(true);
        setErrorMsg('');
        
        try {
            const res = await Axios.post(`${API_URL}/api/reviews`, {
                customer_id: user.id,
                artist_id: appointment.artist_id,
                appointment_id: appointment.id,
                rating,
                comment
            });
            
            if (res.data.success) {
                setSuccess(true);
            } else {
                setErrorMsg(res.data.message);
            }
        } catch (error) {
            setErrorMsg(error.response?.data?.message || 'Error submitting review.');
        }
        setLoading(false);
    };

    if (!user) return <div className="portal-layout"><CustomerSideNav /><div className="portal-container">Please login.</div></div>;

    return (
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
                <header className="portal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <button className="action-btn" onClick={() => navigate(-1)} style={{ background: 'none', border: '1px solid #e2e8f0', color: '#64748b', display: 'flex', alignItems: 'center' }}>
                            <ArrowLeft size={16} style={{ marginRight: '5px' }} /> Back
                        </button>
                        <h1 style={{ margin: 0 }}>Review Your Session</h1>
                    </div>
                </header>

                <div className="portal-content">
                    {success ? (
                        <div className="data-card" style={{ textAlign: 'center', padding: '50px' }}>
                            <Star size={48} color="#f59e0b" fill="#f59e0b" style={{ marginBottom: '20px' }} />
                            <h2>Thank You!</h2>
                            <p>Your review has been submitted and is pending moderation.</p>
                            <button className="premium-btn primary" onClick={() => navigate('/customer')} style={{ marginTop: '20px' }}>Return to Portal</button>
                        </div>
                    ) : (
                        <div className="data-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                            {errorMsg && <div className="alert alert-error" style={{ marginBottom: '20px', padding: '15px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px' }}>{errorMsg}</div>}
                            
                            {!appointment ? (
                                <p>Loading session details...</p>
                            ) : (
                                <form onSubmit={handleSubmit}>
                                    <div style={{ marginBottom: '25px', textAlign: 'center' }}>
                                        <h3 style={{ marginBottom: '5px' }}>Session: {appointment.design_title}</h3>
                                        <p style={{ color: '#64748b' }}>Rate your experience with your artist</p>
                                    </div>
                                    
                                    <div style={{ marginBottom: '25px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <Star 
                                                key={star} 
                                                size={40} 
                                                color={rating >= star ? '#f59e0b' : '#cbd5e1'} 
                                                fill={rating >= star ? '#f59e0b' : 'transparent'} 
                                                onClick={() => setRating(star)} 
                                                style={{ cursor: 'pointer', transition: 'all 0.2s' }} 
                                            />
                                        ))}
                                    </div>
                                    
                                    <div className="form-group" style={{ marginBottom: '25px' }}>
                                        <label>Comment (Optional)</label>
                                        <textarea 
                                            value={comment} 
                                            onChange={(e) => setComment(e.target.value)} 
                                            placeholder="Tell us about your tattoo and the artist's service..."
                                            rows={5}
                                            style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', resize: 'vertical' }}
                                        ></textarea>
                                    </div>
                                    
                                    <button type="submit" className="premium-btn primary" disabled={loading} style={{ width: '100%' }}>
                                        {loading ? 'Submitting...' : 'Submit Review'}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default CustomerReview;
