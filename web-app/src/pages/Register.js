import React, { useState, useEffect, useRef } from 'react';
import Axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { API_URL } from '../config';
import Navbar from '../components/Navbar';
import './Login.css'; // Using Login styles for consistency

function Register() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    preferences: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const navigate = useNavigate();
  const preferencesRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Inline sanitization: prevent starting with space
    const sanitizedValue = value.replace(/^\s+/, '');
    setFormData({ ...formData, [name]: sanitizedValue });
    setApiError(''); // Clear API error on change
    
    // Clear error when user types
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
        if (preferencesRef.current && !preferencesRef.current.contains(event.target)) {
            setIsPreferencesOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const togglePreference = (style) => {
    const current = formData.preferences ? formData.preferences.split(', ').filter(s => s.trim() !== '') : [];
    let updated;
    if (current.includes(style)) {
        updated = current.filter(s => s !== style);
    } else {
        updated = [...current, style];
    }
    setFormData({ ...formData, preferences: updated.join(', ') });
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) newErrors.email = "Invalid email format";
    
    if (formData.password.length < 6) newErrors.password = "Password must be at least 6 characters";
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = "Passwords do not match";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const registerUser = async (e) => {
    e.preventDefault();
    
    setApiError('');
    if (!validate()) return;

    try {
      const response = await Axios.post(`${API_URL}/api/register`, {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        preferences: formData.preferences.trim(),
        password: formData.password,
        type: 'customer' // Defaulting to customer for public registration
      });

      if (response.data.success) {
          setShowSuccessModal(true);
      }
    } catch (error) {
      console.error(error);
      const message = error.response?.data?.message || "An error occurred during registration.";
      if (message.toLowerCase().includes('email')) {
        setErrors(prev => ({ ...prev, email: message }));
      } else {
        setApiError(message);
      }
    }
  };

  return (
    <>
      <Navbar />

    <div className="login-page-wrapper" style={{ minHeight: '100vh', boxSizing: 'border-box', padding: '80px 20px 40px' }}>
      <div className="login-card" style={{ width: '90%', maxWidth: '520px', margin: '0 auto' }}>
        <div className="login-header">
            <h1 className="login-logo" style={{ fontSize: '1.2rem' }}>INKVICTUS TATTOO</h1>
            <p className="login-tagline">BGC’s Premier Luxury Tattoo Studio</p>
        </div>

        <h2 className="login-title" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>Create Account</h2>
        {apiError && <p className="error-message" style={{textAlign: 'center'}}>{apiError}</p>}

        <form onSubmit={registerUser} className="login-form">
            <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                    <input type="text" name="firstName" className={`form-input ${errors.firstName ? 'error' : ''}`} placeholder="First Name" value={formData.firstName} onChange={handleChange} />
                    {errors.firstName && <small style={{color: 'red'}}>{errors.firstName}</small>}
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                    <input type="text" name="lastName" className={`form-input ${errors.lastName ? 'error' : ''}`} placeholder="Last Name" value={formData.lastName} onChange={handleChange} />
                    {errors.lastName && <small style={{color: 'red'}}>{errors.lastName}</small>}
                </div>
            </div>
            <div className="form-group">
                <input type="email" name="email" className={`form-input ${errors.email ? 'error' : ''}`} placeholder="Email Address" value={formData.email} onChange={handleChange} />
                {errors.email && <small style={{color: 'red'}}>{errors.email}</small>}
            </div>
            <div className="form-group">
                <input type="tel" name="phone" className="form-input" value={formData.phone} onChange={handleChange} placeholder="Phone Number" />
            </div>
            <div className="form-group" ref={preferencesRef} style={{ position: 'relative' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#666', fontSize: '0.9rem' }}>Tattoo Preferences</label>
                <div 
                    className="form-input" 
                    onClick={() => setIsPreferencesOpen(!isPreferencesOpen)} 
                    style={{ cursor: 'pointer', minHeight: '48px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '5px', padding: '5px 10px' }}
                >
                    {formData.preferences.split(', ').filter(p => p).length > 0 ? (
                        formData.preferences.split(', ').filter(p => p).map(pref => (
                            <span key={pref} style={{ backgroundColor: '#C19A6B', color: 'white', padding: '3px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>
                                {pref}
                            </span>
                        ))
                    ) : (
                        <span style={{ color: '#9ca3af' }}>Select preferred styles...</span>
                    )}
                </div>
                {isPreferencesOpen && (
                    <div style={{
                        position: 'absolute',
                        width: '100%',
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        marginTop: '5px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        zIndex: 10,
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                    }}>
                        {["Realism", "Traditional", "Neo-Traditional", "Japanese", "Blackwork", "Dotwork", "Watercolor", "Minimalist", "Script", "Tribal"].map(style => {
                            const isSelected = formData.preferences.split(', ').includes(style);
                            return (
                                <label key={style} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '12px 15px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f3f4f6'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => togglePreference(style)}
                                        style={{ marginRight: '10px', height: '16px', width: '16px' }}
                                    />
                                    {style}
                                </label>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                    <input type="password" name="password" className={`form-input ${errors.password ? 'error' : ''}`} placeholder="Password" value={formData.password} onChange={handleChange} />
                    {errors.password && <small style={{color: 'red'}}>{errors.password}</small>}
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                    <input type="password" name="confirmPassword" className={`form-input ${errors.confirmPassword ? 'error' : ''}`} placeholder="Confirm Password" value={formData.confirmPassword} onChange={handleChange} />
                    {errors.confirmPassword && <small style={{color: 'red'}}>{errors.confirmPassword}</small>}
                </div>
            </div>
            <button type="submit" className="login-btn">Register</button>
        </form>
        
        <div className="login-footer">
            <p>Already have an account? <Link to="/login">Login here</Link>.</p>
        </div>
      </div>

      {/* Custom Success Modal */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{display: 'flex', justifyContent: 'center', marginBottom: '1rem'}}>
              <div style={{backgroundColor: '#dcfce7', padding: '1rem', borderRadius: '50%'}}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
            </div>
            <h2 style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem'}}>Account Created!</h2>
            <p style={{color: '#64748b', marginBottom: '1.5rem'}}>
              Registration successful. Please check your email to verify your account before logging in.
            </p>
            <button 
              onClick={() => navigate('/login', { replace: true })}
              className="btn btn-primary"
              style={{width: '100%'}}
            >
              Continue to Login
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export default Register;