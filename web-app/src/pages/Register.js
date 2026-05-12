import React, { useState } from 'react';
import Axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { API_URL } from '../config';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import Navbar from '../components/Navbar';
import TermsOfServiceModal from '../components/TermsOfServiceModal';
import './Login.css'; // Using Login styles for consistency
import CountryCodeSelect from '../components/CountryCodeSelect';
import { filterName, filterDigits } from '../utils/validation';
import './Register.css';

const PasswordStrengthMeter = ({ feedback }) => {
  // Ordered steps: each must be met before the next hint appears
  const steps = [
    { met: feedback.hasMinLength, hint: 'At least 8 characters' },
    { met: feedback.hasNumber, hint: 'Add a number' },
    { met: feedback.hasUppercase && feedback.hasLowercase, hint: 'Add upper & lowercase letters' },
    { met: feedback.hasSymbol, hint: 'Add a special characters: !@#$%^&*()_+' }
  ];

  const score = steps.filter(s => s.met).length;
  // Find the first unmet step to display as the next hint
  const nextHint = steps.find(s => !s.met);

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} style={{
            flex: 1,
            height: '4px',
            borderRadius: '2px',
            backgroundColor: index < score ? '#be9055' : '#e2e8f0',
            transition: 'background-color 0.3s ease'
          }} />
        ))}
      </div>
      {nextHint && (
        <div style={{ fontSize: '0.7rem', color: '#ef4444', transition: 'color 0.2s' }}>
          {nextHint.hint}
        </div>
      )}
    </div>
  );
};

function Register() {
  // Read wizard prefill data from sessionStorage (set by CustomerBookingWizard)
  const wizardPrefill = (() => {
    try {
      const raw = sessionStorage.getItem('wizardPrefill');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();

  const [formData, setFormData] = useState({
    firstName: wizardPrefill.firstName || '',
    lastName: wizardPrefill.lastName || '',
    suffix: wizardPrefill.suffix || '',
    email: wizardPrefill.email || '',
    phone: wizardPrefill.phone || '',
    countryCode: '+63',
    password: '',
    confirmPassword: ''
  });

  const [passwordFeedback, setPasswordFeedback] = useState({
    hasMinLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSymbol: false
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Consent state
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [emailPromoConsent, setEmailPromoConsent] = useState(false);
  const [photoMarketingConsent, setPhotoMarketingConsent] = useState(true);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const { executeRecaptcha } = useGoogleReCaptcha();

  // Health & Safety (optional, non-blocking)
  const PRESET_CONDITIONS = ['Diabetes', 'Hypertension', 'Heart Condition', 'Blood Disorder', 'Epilepsy', 'Pregnancy', 'Skin Condition', 'Immunocompromised'];
  const PRESET_ALLERGENS = ['Latex', 'Nickel', 'Ink / Dye', 'Adhesive / Tape', 'Lidocaine', 'Iodine', 'Antibiotics'];
  const [showHealthSection, setShowHealthSection] = useState(false);
  const [selectedConditions, setSelectedConditions] = useState([]);
  const [customCondition, setCustomCondition] = useState('');
  const [selectedAllergens, setSelectedAllergens] = useState([]);
  const [customAllergen, setCustomAllergen] = useState('');

  const toggleTag = (list, setList, tag) => {
    setList(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const addCustomTag = (list, setList, value, setValue) => {
    const trimmed = value.trim().slice(0, 60);
    if (trimmed && !list.includes(trimmed)) setList(prev => [...prev, trimmed]);
    setValue('');
  };

  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    let sanitizedValue = value;

    if (name === 'firstName' || name === 'lastName') {
      sanitizedValue = filterName(value).replace(/^\s+/, '').slice(0, 50);
    } else if (name === 'suffix') {
      // Allow letters, periods, and spaces
      sanitizedValue = value.replace(/[^a-zA-Z.\s]/g, '').replace(/^\s+/, '').slice(0, 5);
    } else if (name === 'email') {
      sanitizedValue = value.replace(/\s/g, '').slice(0, 254); // No spaces in email
    } else if (name === 'phone') {
      sanitizedValue = filterDigits(value).replace(/^0+/, '').slice(0, 10); // Only numbers, no leading 0, max 10
    } else if (name === 'password' || name === 'confirmPassword') {
      sanitizedValue = value.slice(0, 128);
    } else {
      sanitizedValue = value.replace(/^\s+/, '');
    }

    setFormData({ ...formData, [name]: sanitizedValue });
    setApiError(''); // Clear API error on change

    // Live password feedback
    if (name === 'password') {
      setPasswordFeedback({
        hasMinLength: value.length >= 8,
        hasUppercase: /[A-Z]/.test(value),
        hasLowercase: /[a-z]/.test(value),
        hasNumber: /[0-9]/.test(value),
        hasSymbol: /[@$!%*?&#]/.test(value)
      });
    }

    // Real-time validation as user types
    validateField(name, sanitizedValue);
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

    if (name === 'phone') {
      if (!value) errorMsg = "Phone number is required";
      else if (formData.countryCode === '+63' && !value.startsWith('9')) errorMsg = "PH numbers must start with 9 (e.g. 9171234567)";
      else if (formData.countryCode === '+63' && value.length !== 10) errorMsg = "Phone number must be exactly 10 digits (e.g. 9171234567)";
      else if (formData.countryCode !== '+63' && value.length < 7) errorMsg = "Phone number is too short";
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
    const isPhoneValid = validateField('phone', formData.phone);
    const isPasswordValid = validateField('password', formData.password);
    const isConfirmValid = validateField('confirmPassword', formData.confirmPassword);

    return isFirstNameValid && isLastNameValid && isEmailValid && isPhoneValid && isPasswordValid && isConfirmValid;
  };

  const isPasswordValid = () => {
    return (
      passwordFeedback.hasMinLength &&
      passwordFeedback.hasUppercase &&
      passwordFeedback.hasLowercase &&
      passwordFeedback.hasNumber &&
      passwordFeedback.hasSymbol
    );
  };

  const registerUser = async (e) => {
    e.preventDefault();

    setApiError('');
    if (!validate()) return;
    
    if (!executeRecaptcha) {
      setApiError('reCAPTCHA not loaded. Please try again.');
      return;
    }

    try {
      const token = await executeRecaptcha('register');
      if (!token) {
        setApiError('CAPTCHA verification failed to execute.');
        return;
      }
      
      const orphanAppointmentId = sessionStorage.getItem('orphanAppointmentId');
      let rawPhone = formData.phone.trim().replace(/^0+/, '');

      // Compile final health arrays (presets + custom items)
      const finalConditions = [...selectedConditions];
      const finalAllergens = [...selectedAllergens];

      const response = await Axios.post(`${API_URL}/api/register`, {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.countryCode + rawPhone,
        password: formData.password,
        type: 'customer',
        orphanAppointmentId: orphanAppointmentId,
        photo_marketing_consent: photoMarketingConsent,
        email_promo_consent: emailPromoConsent,
        captchaToken: token,
        health_conditions: finalConditions,
        allergens: finalAllergens
      });

      if (response.data.success) {
        sessionStorage.removeItem('wizardPrefill');
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
            <p className="login-tagline">BGC's Premier Luxury Tattoo Studio</p>
          </div>

          <h2 className="login-title" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>Create Account</h2>
          {apiError && <p className="error-message" style={{ textAlign: 'center' }}>{apiError}</p>}

          <form onSubmit={registerUser} className="login-form">
            <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                <input type="text" name="firstName" className={`form-input ${errors.firstName ? 'error' : ''}`} placeholder="First Name" value={formData.firstName} onChange={handleChange} onBlur={handleBlur} maxLength={50} />
                <span style={{ position: 'absolute', right: '12px', top: '14px', color: '#ef4444', fontSize: '1.1rem', lineHeight: '1', pointerEvents: 'none' }}>*</span>
                {errors.firstName && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.firstName}</small>}
              </div>
              <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                <input type="text" name="lastName" className={`form-input ${errors.lastName ? 'error' : ''}`} placeholder="Last Name" value={formData.lastName} onChange={handleChange} onBlur={handleBlur} maxLength={50} />
                <span style={{ position: 'absolute', right: '12px', top: '14px', color: '#ef4444', fontSize: '1.1rem', lineHeight: '1', pointerEvents: 'none' }}>*</span>
                {errors.lastName && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.lastName}</small>}
              </div>
              <div className="form-group" style={{ width: '90px', position: 'relative', flexShrink: 0 }}>
                <input type="text" name="suffix" className="form-input" placeholder="Suffix" value={formData.suffix} onChange={handleChange} maxLength={5} />
              </div>
            </div>
            <div className="form-group" style={{ position: 'relative' }}>
              <input type="email" name="email" className={`form-input ${errors.email ? 'error' : ''}`} placeholder="Email Address" value={formData.email} onChange={handleChange} onBlur={handleBlur} maxLength={254} />
              <span style={{ position: 'absolute', right: '12px', top: '14px', color: '#ef4444', fontSize: '1.1rem', lineHeight: '1', pointerEvents: 'none' }}>*</span>
              {errors.email && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.email}</small>}
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
              <CountryCodeSelect
                value={formData.countryCode}
                onChange={(code) => setFormData(prev => ({ ...prev, countryCode: code }))}
                style={{ borderRadius: '10px' }}
              />
              <div style={{ flex: 1, position: 'relative' }}>
                <input type="tel" name="phone" className={`form-input ${errors.phone ? 'error' : ''}`} style={{ width: '100%' }} value={formData.phone} onChange={handleChange} placeholder="9XXXXXXXXX" maxLength={10} />
                <span style={{ position: 'absolute', right: '12px', top: '14px', color: '#ef4444', fontSize: '1.1rem', lineHeight: '1', pointerEvents: 'none' }}>*</span>
              </div>
            </div>
            {errors.phone && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.phone}</small>}
            <div className="form-row" style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? "text" : "password"} name="password" className={`form-input ${errors.password ? 'error' : ''}`} placeholder="Create Password" value={formData.password} onChange={handleChange} onFocus={() => setPasswordFocused(true)} onBlur={(e) => { handleBlur(e); if (!formData.password) setPasswordFocused(false); }} onPaste={(e) => e.preventDefault()} maxLength={128} />
                  <span style={{ position: 'absolute', right: '40px', top: '14px', color: '#ef4444', fontSize: '1.1rem', lineHeight: '1', pointerEvents: 'none' }}>*</span>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      color: '#64748b'
                    }}
                  >
                    {showPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <div style={{ position: 'relative' }}>
                  <input type={showConfirmPassword ? "text" : "password"} name="confirmPassword" className={`form-input ${errors.confirmPassword ? 'error' : ''}`} placeholder="Confirm Password" value={formData.confirmPassword} onChange={handleChange} onBlur={handleBlur} onPaste={(e) => e.preventDefault()} maxLength={128} />
                  <span style={{ position: 'absolute', right: '40px', top: '14px', color: '#ef4444', fontSize: '1.1rem', lineHeight: '1', pointerEvents: 'none' }}>*</span>
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      color: '#64748b'
                    }}
                  >
                    {showConfirmPassword ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
                {errors.confirmPassword && <small style={{ color: '#ef4444', display: 'block', marginTop: '4px', fontSize: '0.8rem' }}>{errors.confirmPassword}</small>}
              </div>
            </div>
            {/* Full-width Password Strength Meter */}
            <div style={{ minHeight: '44px', opacity: passwordFocused ? 1 : 0, transition: 'opacity 0.3s ease', marginTop: passwordFocused ? '4px' : '0', visibility: passwordFocused ? 'visible' : 'hidden' }}>
              <PasswordStrengthMeter feedback={passwordFeedback} />
            </div>


            {/* Health & Safety — Optional Collapsible Section */}
            <div style={{ margin: '4px 0 16px', border: '1px solid #ddd', borderRadius: '10px', overflow: 'hidden', transition: 'all 0.3s ease', backgroundColor: 'white' }}>
              <button
                type="button"
                id="health-section-toggle"
                aria-expanded={showHealthSection}
                aria-controls="health-section-body"
                onClick={() => setShowHealthSection(p => !p)}
                title="Optionally disclose health conditions or allergens relevant to your tattoo session"
                style={{
                  width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 16px', background: '#fafafa', border: 'none', borderBottom: showHealthSection ? '1px solid #eee' : 'none',
                  cursor: 'pointer', color: '#333', fontWeight: 600, fontSize: '0.95rem', textAlign: 'left'
                }}
              >
                <span>Health &amp; Safety Information <span style={{ fontWeight: 400, color: '#666', fontSize: '0.8rem' }}>(Optional)</span></span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5"
                  style={{ transform: showHealthSection ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease', flexShrink: 0 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showHealthSection && (
                <div id="health-section-body" style={{ padding: '16px', background: '#ffffff' }}>
                  <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#666', lineHeight: 1.5 }}>
                    This information is private, shared only with your assigned artist to ensure a safe session.
                  </p>

                  {/* Health Conditions */}
                  <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 600, color: '#333' }}>Known Health Conditions</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {PRESET_CONDITIONS.map(tag => (
                      <button
                        key={tag} type="button"
                        title={`Toggle: ${tag}`}
                        onClick={() => toggleTag(selectedConditions, setSelectedConditions, tag)}
                        style={{
                          padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer',
                          border: selectedConditions.includes(tag) ? '1px solid #be9055' : '1px solid #ddd',
                          background: selectedConditions.includes(tag) ? 'rgba(190,144,85,0.1)' : '#fff',
                          color: selectedConditions.includes(tag) ? '#be9055' : '#555',
                          transition: 'all 0.2s ease', fontWeight: selectedConditions.includes(tag) ? 600 : 400
                        }}
                      >{tag}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <input
                      type="text" id="custom-condition-input"
                      placeholder="Other condition..."
                      value={customCondition}
                      onChange={e => setCustomCondition(e.target.value.replace(/[<>]/g, '').slice(0, 60))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(selectedConditions, setSelectedConditions, customCondition, setCustomCondition); } }}
                      aria-label="Add a custom health condition"
                      style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', color: '#333', fontSize: '0.9rem' }}
                    />
                    <button type="button" onClick={() => addCustomTag(selectedConditions, setSelectedConditions, customCondition, setCustomCondition)}
                      title="Add custom condition"
                      style={{ padding: '0 16px', borderRadius: '8px', border: 'none', background: '#be9055', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>Add</button>
                  </div>
                  {selectedConditions.filter(c => !PRESET_CONDITIONS.includes(c)).map(c => (
                    <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '0 6px 8px 0', padding: '5px 12px', borderRadius: '20px', fontSize: '0.8rem', background: 'rgba(190,144,85,0.1)', border: '1px solid #be9055', color: '#be9055' }}>
                      {c}
                      <button type="button" onClick={() => setSelectedConditions(p => p.filter(x => x !== c))} aria-label={`Remove ${c}`}
                        style={{ background: 'none', border: 'none', color: '#be9055', cursor: 'pointer', padding: 0, fontSize: '1.2rem', lineHeight: 1 }}>×</button>
                    </span>
                  ))}

                  {/* Allergens */}
                  <p style={{ margin: '8px 0 8px', fontSize: '0.85rem', fontWeight: 600, color: '#333' }}>Known Allergens</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {PRESET_ALLERGENS.map(tag => (
                      <button
                        key={tag} type="button"
                        title={`Toggle: ${tag}`}
                        onClick={() => toggleTag(selectedAllergens, setSelectedAllergens, tag)}
                        style={{
                          padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer',
                          border: selectedAllergens.includes(tag) ? '1px solid #f97316' : '1px solid #ddd',
                          background: selectedAllergens.includes(tag) ? 'rgba(249,115,22,0.1)' : '#fff',
                          color: selectedAllergens.includes(tag) ? '#f97316' : '#555',
                          transition: 'all 0.2s ease', fontWeight: selectedAllergens.includes(tag) ? 600 : 400
                        }}
                      >{tag}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <input
                      type="text" id="custom-allergen-input"
                      placeholder="Other allergen..."
                      value={customAllergen}
                      onChange={e => setCustomAllergen(e.target.value.replace(/[<>]/g, '').slice(0, 60))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(selectedAllergens, setSelectedAllergens, customAllergen, setCustomAllergen); } }}
                      aria-label="Add a custom allergen"
                      style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', color: '#333', fontSize: '0.9rem' }}
                    />
                    <button type="button" onClick={() => addCustomTag(selectedAllergens, setSelectedAllergens, customAllergen, setCustomAllergen)}
                      title="Add custom allergen"
                      style={{ padding: '0 16px', borderRadius: '8px', border: 'none', background: '#f97316', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>Add</button>
                  </div>
                  {selectedAllergens.filter(a => !PRESET_ALLERGENS.includes(a)).map(a => (
                    <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '0 6px 8px 0', padding: '5px 12px', borderRadius: '20px', fontSize: '0.8rem', background: 'rgba(249,115,22,0.1)', border: '1px solid #f97316', color: '#f97316' }}>
                      {a}
                      <button type="button" onClick={() => setSelectedAllergens(p => p.filter(x => x !== a))} aria-label={`Remove ${a}`}
                        style={{ background: 'none', border: 'none', color: '#f97316', cursor: 'pointer', padding: 0, fontSize: '1.2rem', lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Consent Checkboxes */}
            <div style={{ margin: '16px 0 20px', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.85rem', color: '#ffffff', lineHeight: 1.5, textAlign: 'left' }}>
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAgreedToTerms(checked);
                    if (checked) {
                      setPhotoMarketingConsent(true);
                      setShowTermsModal(true);
                    }
                  }}
                  style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#be9055', flexShrink: 0 }}
                />
                <span>
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    style={{ background: 'none', border: 'none', color: '#be9055', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit' }}
                  >
                    Acknowledgement and Waiver
                  </button>
                  <span style={{ color: '#ef4444' }}> *</span>
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '0.85rem', color: '#ffffff', lineHeight: 1.5, textAlign: 'left' }}>
                <input
                  type="checkbox"
                  checked={emailPromoConsent}
                  onChange={(e) => setEmailPromoConsent(e.target.checked)}
                  style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#be9055', flexShrink: 0 }}
                />
                <span>I would like to receive marketing promotions and discounts in my inbox.</span>
              </label>
            </div>

            <button type="submit" className="login-btn" disabled={!isPasswordValid() || !agreedToTerms}>Register</button>
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
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <div style={{ backgroundColor: '#dcfce7', padding: '1rem', borderRadius: '50%' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                </div>
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>Account Created!</h2>
              <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                Registration successful. Please check your email to verify your account before logging in.
              </p>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', textAlign: 'center' }}
              >
                Continue to Login
              </button>
            </div>
          </div>
        )}

        {/* Terms of Service Modal */}
        <TermsOfServiceModal
          isOpen={showTermsModal}
          onClose={() => setShowTermsModal(false)}
          onAccept={() => {
            setAgreedToTerms(true);
            setShowTermsModal(false);
          }}
          photoConsent={photoMarketingConsent}
          onPhotoConsentChange={setPhotoMarketingConsent}
        />
      </div>
    </>
  );
}

export default Register;