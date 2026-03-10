import React, { useState } from 'react';
import Axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { API_URL } from '../config';
import './Login.css';

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [showResend, setShowResend] = useState(false);
    const [resendMessage, setResendMessage] = useState({ text: '', type: 'error' });
    const [loading, setLoading] = useState(false);
    
    // Forgot Password States
    const [view, setView] = useState('login'); // 'login', 'forgot-email', 'forgot-otp', 'reset-password'
    const [resetEmail, setResetEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setShowResend(false);
        setResendMessage({ text: '' });
        setLoading(true);
        try {
            const response = await Axios.post(`${API_URL}/api/login`, {
                email: email,
                password: password
            });

            if (response.data.success) {
                localStorage.setItem('user', JSON.stringify(response.data.user));
                const user = response.data.user;
                
                const role = user.type;
                if (role === 'admin') navigate('/admin/dashboard', { replace: true });
                else if (role === 'manager') navigate('/manager', { replace: true });
                else if (role === 'artist') navigate('/artist', { replace: true });
                else {
                    const pendingBooking = sessionStorage.getItem('pendingBooking');
                    if (pendingBooking) {
                        navigate('/customer/book', { replace: true });
                    } else {
                        navigate('/customer', { replace: true });
                    }
                }
            }
        } catch (error) {
            const errData = error.response?.data;
            setError(errData?.message || "Error logging in");
            if (errData?.requireVerification) {
                setShowResend(true);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResendVerification = async () => {
        setResendMessage({ text: 'Sending...', type: 'info' });
        try {
            const response = await Axios.post(`${API_URL}/api/resend-verification`, { email });
            if (response.data.success) {
                setResendMessage({ text: "Verification email sent! Please check your inbox.", type: 'success' });
            } else {
                setResendMessage({ text: response.data.message || "Failed to resend email.", type: 'error' });
            }
        } catch (err) {
            setResendMessage({ 
                text: err.response?.data?.message || "An error occurred.",
                type: 'error'
            });
        }
    };

    const sendResetOTP = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const response = await Axios.post(`${API_URL}/api/send-otp`, {
                email: resetEmail
            });
            if (response.data.success) {
                setView('forgot-otp');
            } else {
                setError(response.data.message);
            }
        } catch (error) {
            setError("Error sending OTP");
        } finally {
            setLoading(false);
        }
    };

    const verifyResetOTP = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const response = await Axios.post(`${API_URL}/api/verify-otp`, {
                email: resetEmail,
                otp: otp
            });
            if (response.data.success) {
                setView('reset-password');
            } else {
                setError(response.data.message);
            }
        } catch (error) {
            setError("Error verifying OTP");
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        setError("");
        
        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        if (newPassword.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }

        setLoading(true);
        try {
            const response = await Axios.post(`${API_URL}/api/reset-password`, {
                email: resetEmail,
                newPassword: newPassword
            });
            if (response.data.success) {
                alert("Password reset successful! Please login.");
                setView('login');
                setResetEmail("");
                setOtp("");
                setNewPassword("");
                setConfirmPassword("");
            } else {
                setError(response.data.message);
            }
        } catch (error) {
            setError(error.response?.data?.message || "Error resetting password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Navigation */}
            <nav className="home-nav">
                <a href="/" className="home-logo">INKVICTUS</a>
                <div className="home-nav-links">
                    <a href="/#about">About</a>
                    <Link to="/artists">Artists</Link>
                    <Link to="/gallery">Gallery</Link>
                    <a href="/#booking">Booking</a>
                    <Link to="/contact">Contact</Link>
                </div>
                <div className="home-auth-buttons">
                    <a href="/login" className="login-link">Log In</a>
                    <button onClick={() => navigate('/register')} className="signup-btn">Sign Up</button>
                </div>
            </nav>

            <div className="login-page-wrapper" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', padding: '80px 20px' }}>
            <div className="login-card">
                <div className="login-header">
                    <h1 className="login-logo">INKVICTUS TATTOO</h1>
                    <p className="login-tagline">BGC’s Premier Luxury Tattoo Studio</p>
                </div>
                
                {view === 'login' && (
                    <>
                    <h2 className="login-title">Login</h2>
                    {error && <p className="error-message">{error}</p>}
                    {showResend && (
                        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                            <button type="button" onClick={handleResendVerification} style={{background: 'none', border: 'none', color: '#C19A6B', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem', textDecoration: 'underline'}}>
                                Resend Verification Email
                            </button>
                            {resendMessage.text && (
                                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: resendMessage.type === 'success' ? '#10b981' : '#ef4444' }}>
                                    {resendMessage.text}
                                </p>
                            )}
                        </div>
                    )}
                    
                    <form onSubmit={handleLogin} className="login-form">
                        <div className="form-group">
                            <input 
                                type="email" 
                                className="form-input" 
                                placeholder="Username or Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)} 
                                required 
                            />
                        </div>
                        <div className="form-group">
                            <input 
                                type={showPassword ? 'text' : 'password'} 
                                className="form-input" 
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                            />
                            <div className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </div>
                        </div>
                        <button type="submit" className="login-btn" disabled={loading}>
                            {loading ? 'Logging in...' : 'Login'}
                        </button>
                    </form>

                    <div className="login-footer">
                        <p>Don't have an account? <Link to="/register">Register now</Link>.</p>
                        <p style={{ marginTop: '0.5rem' }}>
                            <button type="button" onClick={() => { setView('forgot-email'); setError(''); }} style={{background: 'none', border: 'none', color: '#C19A6B', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem'}}>
                                Forgot Password?
                            </button>
                        </p>
                    </div>
                    </>
                )}

                {view === 'forgot-email' && (
                    <>
                    <h2 className="login-title">Reset Password</h2>
                    {error && <p className="error-message">{error}</p>}
                    <form onSubmit={sendResetOTP} className="login-form">
                        <div className="form-group">
                            <input type="email" className="form-input" placeholder="Enter your email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
                        </div>
                        <button type="submit" className="login-btn" disabled={loading}>{loading ? 'Sending...' : 'Send OTP'}</button>
                        <div className="login-footer">
                            <button type="button" onClick={() => { setView('login'); setError(''); }} style={{background: 'none', border: 'none', color: '#999', cursor: 'pointer'}}>Back to Login</button>
                        </div>
                    </form>
                    </>
                )}

                {view === 'forgot-otp' && (
                    <>
                    <h2 className="login-title">Verify OTP</h2>
                    {error && <p className="error-message">{error}</p>}
                    <form onSubmit={verifyResetOTP} className="login-form">
                        <div className="form-group">
                            <input type="text" className="form-input" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Enter 6-digit code" required />
                        </div>
                        <button type="submit" className="login-btn" disabled={loading}>{loading ? 'Verifying...' : 'Verify OTP'}</button>
                        <div className="login-footer">
                            <button type="button" onClick={() => { setView('forgot-email'); setError(''); }} style={{background: 'none', border: 'none', color: '#999', cursor: 'pointer'}}>Back</button>
                        </div>
                    </form>
                    </>
                )}

                {view === 'reset-password' && (
                    <>
                    <h2 className="login-title">New Password</h2>
                    {error && <p className="error-message">{error}</p>}
                    <form onSubmit={handlePasswordReset} className="login-form">
                        <div className="form-group">
                            <input type="password" className="form-input" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <input type="password" className="form-input" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                        </div>
                        <button type="submit" className="login-btn" disabled={loading}>
                            {loading ? 'Resetting...' : 'Reset Password'}
                        </button>
                    </form>
                    </>
                )}
            </div>
        </div>
        </>
    );
}

export default Login;