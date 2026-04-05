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
    let sanitizedValue = value;

    // Hard sanitization for names (letters, spaces, hyphens only)
    if (name === 'firstName' || name === 'lastName') {
      sanitizedValue = value.replace(/[^a-zA-Z\s-]/g, '').replace(/^\s+/, '');
    } else if (name === 'email') {
      sanitizedValue = value.replace(/\s/g, ''); // No spaces in email
    } else if (name === 'phone') {
      sanitizedValue = value.replace(/[^0-9]/g, ''); // Only numbers
    } else {
      sanitizedValue = value.replace(/^\s+/, '');
    }

    setFormData({ ...formData, [name]: sanitizedValue });
    setApiError(''); // Clear API error on change
    
    // Auto-clear specific error as user types
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const validateField = (name, value) => {
    let errorMsg = "";
    if (name === 'firstName' && !value.trim()) errorMsg = "First name is required";
    if (name === 'lastName' && !value.trim()) errorMsg = "Last name is required";
    
    if (name === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!value) errorMsg = "Email is required";
      else if (!emailRegex.test(value)) errorMsg = "Invalid email format";
    }

    if (name === 'password') {
      const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
      if (!value) errorMsg = "Password is required";
      else if (value.length < 8) errorMsg = "Password must be at least 8 characters";
      else if (!strongRegex.test(value)) errorMsg = "Password needs uppercase, lowercase, number, and symbol";
    }

    if (name === 'confirmPassword') {
      if (value !== formData.password) errorMsg = "Passwords do not match";
    }

    setErrors(prev => ({ ...prev, [name]: errorMsg }));
    return errorMsg === "";
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    validateField(name, value);
  };

  const validate = () => {
    const isFirstNameValid = validateField('firstName', formData.firstName);
    const isLastNameValid = validateField('lastName', formData.lastName);
    const isEmailValid = validateField('email', formData.email);
    const isPasswordValid = validateField('password', formData.password);
    const isConfirmValid = validateField('confirmPassword', formData.confirmPassword);
    
    return isFirstNameValid && isLastNameValid && isEmailValid && isPasswordValid && isConfirmValid;
  };

  const registerUser = async (e) => {
    e.preventDefault();
    
    setApiError('');
    if (!validate()) return;

    try {
      const orphanAppointmentId = sessionStorage.getItem('orphanAppointmentId');
      const response = await Axios.post(`${API_URL}/api/register`, {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.countryCode + formData.phone.trim(),
        password: formData.password,
        type: 'customer', // Defaulting to customer for public registration
        orphanAppointmentId: orphanAppointmentId
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
                <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                    <input type="text" name="firstName" className={`form-input ${errors.firstName ? 'error' : ''}`} placeholder="First Name" value={formData.firstName} onChange={handleChange} onBlur={handleBlur} />
                    {errors.firstName && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem'}}>{errors.firstName}</small>}
                </div>
                <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                    <input type="text" name="lastName" className={`form-input ${errors.lastName ? 'error' : ''}`} placeholder="Last Name" value={formData.lastName} onChange={handleChange} onBlur={handleBlur} />
                    {errors.lastName && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem'}}>{errors.lastName}</small>}
                </div>
            </div>
            <div className="form-group" style={{ position: 'relative' }}>
                <input type="email" name="email" className={`form-input ${errors.email ? 'error' : ''}`} placeholder="Email Address" value={formData.email} onChange={handleChange} onBlur={handleBlur} />
                {errors.email && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem'}}>{errors.email}</small>}
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '10px' }}>
                <select 
                    name="countryCode" 
                    className="form-input" 
                    style={{ width: '110px' }}
                    value={formData.countryCode}
                    onChange={handleChange}
                >
                    <option value="+63">PH (+63)</option>
                    <option value="+1">US/CA (+1)</option>
                    <option value="+44">UK (+44)</option>
                    <option value="+61">AU (+61)</option>
                    <option value="+81">JP (+81)</option>
                    <option value="+82">KR (+82)</option>
                    <option value="+65">SG (+65)</option>
                    <option value="+64">NZ (+64)</option>
                </select>
                <input type="tel" name="phone" className="form-input" style={{ flex: 1 }} value={formData.phone} onChange={handleChange} placeholder="Phone Number" />
            </div>
            <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                    <input type="password" name="password" className={`form-input ${errors.password ? 'error' : ''}`} placeholder="Password" value={formData.password} onChange={handleChange} onBlur={handleBlur} />
                    {errors.password && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem'}}>{errors.password}</small>}
                </div>
                <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                    <input type="password" name="confirmPassword" className={`form-input ${errors.confirmPassword ? 'error' : ''}`} placeholder="Confirm Password" value={formData.confirmPassword} onChange={handleChange} onBlur={handleBlur} />
                    {errors.confirmPassword && <small style={{color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem'}}>{errors.confirmPassword}</small>}
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