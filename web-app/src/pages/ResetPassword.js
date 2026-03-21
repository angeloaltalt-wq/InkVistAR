import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import Axios from 'axios';
import { API_URL } from '../config';
import Navbar from '../components/Navbar';
import './ResetPassword.css';

function ResetPassword() {
    const navigate = useNavigate();
    const location = useLocation();
    // Email is passed from the Login page after OTP verification
    const email = location.state?.email || ''; 
    
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }

        if (!email) {
            setError("No email provided. Please restart the process.");
            return;
        }

        setLoading(true);
        try {
            const res = await Axios.post(`${API_URL}/api/reset-password`, {
                email,
                newPassword
            });

            if (res.data.success) {
                alert('Password reset successfully! Please login.');
                navigate('/login');
            } else {
                setError(res.data.message || 'Failed to reset password');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Network error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="reset-page-wrapper" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', padding: '80px 20px' }}>
            <Navbar />

            <div className="reset-card" style={{ width: '90%', maxWidth: '450px' }}>
                <div className="reset-header">
                    <h1 className="reset-logo">INKVICTUS TATTOO</h1>
                    <p className="reset-tagline">BGC’s Premier Luxury Tattoo Studio</p>
                </div>

                <h2 className="reset-title">Reset Password</h2>

                {error && <p className="error-message" style={{ color: '#ef4444', textAlign: 'center', marginBottom: '1rem' }}>{error}</p>}

                <form onSubmit={handleSubmit} className="reset-form">
                    <div className="form-group">
                        <input
                            type="password"
                            placeholder="New Password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            className="form-input"
                        />
                    </div>
                    <div className="form-group">
                        <input
                            type="password"
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="form-input"
                        />
                    </div>
                    <button type="submit" className="reset-btn" disabled={loading}>
                        {loading ? 'Resetting...' : 'Reset Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default ResetPassword;