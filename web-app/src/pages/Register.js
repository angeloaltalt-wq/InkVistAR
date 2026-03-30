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
    countryCode: '+63',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const navigate = useNavigate();

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
        phone: formData.countryCode + formData.phone.trim(),
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
            <div className="form-group" style={{ display: 'flex', gap: '10px' }}>
                <select 
                    name="countryCode" 
                    className="form-input" 
                    style={{ width: '110px' }}
                    value={formData.countryCode}
                    onChange={handleChange}
                >
                    <option value="+63">PH +63</option>
                    <option value="+1">US +1</option>
                    <option value="+65">SG +65</option>
                </select>
                <input type="tel" name="phone" className="form-input" style={{ flex: 1 }} value={formData.phone} onChange={handleChange} placeholder="Phone Number" />
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