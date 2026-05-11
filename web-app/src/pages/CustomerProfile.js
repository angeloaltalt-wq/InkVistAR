import './CustomerStyles.css';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Axios from 'axios';
import { User, Mail, Phone, MapPin, Save, Edit2, X, FileText, Lock, Eye, EyeOff, CheckCircle, AlertCircle, Camera } from 'lucide-react';
import './PortalStyles.css';
import { API_URL } from '../config';
import CustomerSideNav from '../components/CustomerSideNav';
import ImageCropper from '../components/ImageCropper';
import { getPhoneParts } from '../constants/countryCodes';
import CountryCodeSelect from '../components/CountryCodeSelect';
import { filterName } from '../utils/validation';

const PasswordStrengthMeter = ({ feedback }) => {
    const steps = [
        { met: feedback.hasMinLength, hint: 'New Password' },
        { met: feedback.hasNumber, hint: 'Add a number' },
        { met: feedback.hasUppercase && feedback.hasLowercase, hint: 'Add upper & lowercase letters' },
        { met: feedback.hasSymbol, hint: 'Add a special characters: !@#$%^&*()_+' }
    ];

    const score = steps.filter(s => s.met).length;
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

function CustomerProfile() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const customerId = user ? user.id : null;

    const [profile, setProfile] = useState({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        location: user.location || '',
        preferences: user.notes || '',
        profile_image: user.profile_image || ''
    });
    const [isEditing, setIsEditing] = useState(false);
    const [originalProfile, setOriginalProfile] = useState(null);
    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);
    const [passwordFeedback, setPasswordFeedback] = useState({
        hasMinLength: false, hasUppercase: false, hasLowercase: false,
        hasNumber: false, hasSymbol: false
    });
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [errors, setErrors] = useState({});
    const navigate = useNavigate();
    const [cropperImage, setCropperImage] = useState(null);

    const validateProfileField = (name, value) => {
        let errorMsg = '';
        if (name === 'name') {
            if (!value.trim()) errorMsg = 'Name is required.';
            else if (value.trim().length < 2) errorMsg = 'Name must be at least 2 characters.';
        }
        if (name === 'location' && value.trim().length > 200) errorMsg = 'Location cannot exceed 200 characters.';
        if (name === 'preferences' && value.trim().length > 500) errorMsg = 'Preferences cannot exceed 500 characters.';
        setErrors(prev => ({ ...prev, [name]: errorMsg }));
        return !errorMsg;
    };

    // Email change state
    const [emailModal, setEmailModal] = useState({ open: false, step: 'enterEmail', newEmail: '', emailError: '', otp: Array(6).fill(''), otpError: '', sending: false, confirming: false, resendTimer: 300, resendAttempts: 0, resending: false });
    const otpRefs = useRef([]);

    // Success modal state (replaces alert)
    const [successModal, setSuccessModal] = useState({ mounted: false, visible: false, message: '' });

    useEffect(() => {
        const fetch = async () => {
            try {
                if (!customerId) return;
                setLoading(true);
                const res = await Axios.get(`${API_URL}/api/customer/profile/${customerId}`);
                if (res.data.success) {
                    setProfile({
                        name: res.data.profile.name || '',
                        email: res.data.profile.email || '',
                        phone: res.data.profile.phone || '',
                        location: res.data.profile.location || '',
                        preferences: res.data.profile.notes || '',
                        profile_image: res.data.profile.profile_image || ''
                    });
                }
                setLoading(false);
            } catch (e) {
                console.error(e);
                setLoading(false);
            }
        };
        fetch();
    }, [customerId]);

    useEffect(() => {
        let interval;
        if (emailModal.open && emailModal.step === 'enterOtp' && emailModal.resendTimer > 0) {
            interval = setInterval(() => {
                setEmailModal(prev => ({ ...prev, resendTimer: prev.resendTimer - 1 }));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [emailModal.open, emailModal.step, emailModal.resendTimer]);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                setMessage({ type: 'error', text: 'Only image files are allowed.' });
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                setMessage({ type: 'error', text: 'Image size must be less than 5MB.' });
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setCropperImage(reader.result);
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        }
    };

    const handleCropDone = (croppedBase64) => {
        setProfile(prev => ({ ...prev, profile_image: croppedBase64 }));
        setCropperImage(null);
        setMessage({ type: '', text: '' });
    };

    const handleCropCancel = () => {
        setCropperImage(null);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });
        
        // Run all field validations
        const nameValid = validateProfileField('name', profile.name);
        if (!nameValid) {
            setMessage({ type: 'error', text: errors.name || 'Please fix validation errors.' });
            setSaving(false);
            return;
        }
        setSaving(true);

        // Password validation
        if (showChangePassword) {
            if (passwords.newPassword) {
                if (passwords.newPassword !== passwords.confirmPassword) {
                    setMessage({ type: 'error', text: 'New passwords do not match' });
                    setSaving(false);
                    return;
                }
                const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
                if (passwords.newPassword.length < 8) {
                    setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
                    setSaving(false);
                    return;
                } else if (!strongRegex.test(passwords.newPassword)) {
                    setMessage({ type: 'error', text: 'Password needs uppercase, lowercase, number, and symbol' });
                    setSaving(false);
                    return;
                }
            }
        }

        try {
            // Update profile details
            await Axios.put(`${API_URL}/api/customer/profile/${customerId}`, {
                ...profile,
                notes: profile.preferences,
                profileImage: profile.profile_image
            });

            // Change password if requested and new password is provided
            if (showChangePassword && passwords.newPassword) {
                const pwRes = await Axios.post(`${API_URL}/api/customer/change-password`, {
                    customerId,
                    currentPassword: passwords.currentPassword,
                    newPassword: passwords.newPassword
                });

                // If backend requires re-verification, show success modal
                if (pwRes.data.requireReverification) {
                    localStorage.removeItem('user');
                    localStorage.removeItem('token');
                    setSuccessModal({ mounted: true, visible: false, message: 'Password changed successfully! A verification email has been sent. Please verify your email to log in again.' });
                    setTimeout(() => setSuccessModal(prev => ({ ...prev, visible: true })), 10);
                    return;
                }
            }

            // Update localStorage with new profile image
            const updatedUser = { ...user, profile_image: profile.profile_image };
            localStorage.setItem('user', JSON.stringify(updatedUser));

            setMessage({ type: 'success', text: 'Profile updated successfully!' });
            setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setShowChangePassword(false);
            setIsEditing(false);
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Failed to update profile';
            setMessage({ type: 'error', text: errorMessage });
            console.error('Profile update error:', error);
        }
        setSaving(false);
    };

    return (
        <>
            <div className="portal-layout">
                <CustomerSideNav />
                <div className="portal-container customer-portal">
                    <header className="portal-header"><h1>My Profile</h1></header>
                    <div className="portal-content">
                        {loading ? <div className="no-data">Loading...</div> : (
                            <div className="data-card" style={{ maxWidth: '960px', margin: '0 auto', width: '100%' }}>
                                {!isEditing ? (
                                    /* VIEW MODE */
                                    <div>
                                        <div className="artist-profile-picture-section">
                                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                                <div style={{ width: '100px', height: '100px', borderRadius: '50%', backgroundColor: '#e2e8f0', overflow: 'hidden', border: '4px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {profile.profile_image
                                                        ? <img src={profile.profile_image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', backgroundColor: '#cbd5e1', width: '100%' }}><User size={56} strokeWidth={1.5} /></div>
                                                    }
                                                </div>
                                            </div>
                                            <h2 style={{ margin: '12px 0 4px', fontSize: '1.5rem', fontWeight: '700', color: '#1e293b' }}>{profile.name}</h2>
                                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /> {profile.email}</p>
                                        </div>
                                        <div style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '16px', marginBottom: '16px' }}>
                                            <h3 style={{ color: '#1e293b', fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <User size={20} color="#be9055" /> Personal Information
                                            </h3>
                                            <div className="grid-2col" style={{ gap: '12px' }}>
                                                {[
                                                    { icon: <Phone size={16} />, label: 'Phone Number', value: profile.phone || 'Not provided' },
                                                    { icon: <MapPin size={16} />, label: 'Location', value: profile.location || 'Not provided' },
                                                ].map((item, i) => (
                                                    <div key={i} style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>{item.icon} {item.label}</span>
                                                        <p style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{item.value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '14px', border: '1px solid #e2e8f0', marginTop: '12px' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}><FileText size={16} /> Tattoo Preferences</span>
                                                <p style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{profile.preferences || 'No preferences listed'}</p>
                                            </div>
                                        </div>
                                        {message.text && (
                                            <div style={{ padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: message.type === 'success' ? '#dcfce7' : '#fee2e2', color: message.type === 'success' ? '#166534' : '#991b1b', border: `1px solid ${message.type === 'success' ? '#86efac' : '#fca5a5'}` }}>
                                                {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                                                <span>{message.text}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#be9055', border: 'none', color: 'white' }} onClick={() => { setOriginalProfile({ ...profile }); setIsEditing(true); }}>
                                                <Edit2 size={16} /> Edit Profile
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <form onSubmit={handleSave}>
                                        {/* Profile Picture Upload */}
                                        <div className="artist-profile-picture-section">
                                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                                <div style={{
                                                    width: '100px', height: '100px', borderRadius: '50%',
                                                    backgroundColor: '#e2e8f0', overflow: 'hidden',
                                                    border: '4px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    {profile.profile_image ? (
                                                        <img className="customer-st-81466193" src={profile.profile_image} alt="Profile" />
                                                    ) : (
                                                        <User size={48} color="#94a3b8" />
                                                    )}
                                                </div>
                                                <label style={{ position: 'absolute', bottom: '4px', right: '4px', backgroundColor: '#be9055', color: 'white', padding: '10px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid white', transition: 'transform 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                                                    <Camera size={20} />
                                                    <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
                                                </label>
                                            </div>
                                            <p style={{ marginTop: '12px', fontSize: '0.9rem', color: '#64748b' }}>Click the camera icon to upload a new photo</p>
                                            <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Max size: 5MB. Recommended: 400x400px</p>
                                        </div>

                                        {/* Section 1: Personal Information */}
                                        <div style={{ borderBottom: '2px solid #f1f5f9', paddingBottom: '16px', marginBottom: '16px' }}>
                                            <h3 style={{ color: '#1e293b', fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <User size={20} color="#be9055" /> Personal Information
                                            </h3>
                                            <div className="grid-2col">
                                                <div className="form-group">
                                                    <label className="artist-profile-form-label"><User size={16} /> Name <span style={{ color: '#ef4444' }}>*</span></label>
                                                    <input type="text" className="form-input artist-profile-input" value={profile.name}
                                                        onChange={e => { const val = filterName(e.target.value).slice(0, 50); setProfile({ ...profile, name: val }); validateProfileField('name', val); }}
                                                        placeholder="Your full name" maxLength={50} style={{ border: errors.name ? '1px solid #ef4444' : undefined }} />
                                                    {errors.name && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.name}</span>}
                                                </div>
                                                <div className="form-group">
                                                    <label className="artist-profile-form-label"><Mail size={16} /> Email</label>
                                                    <div style={{ position: 'relative' }}>
                                                        <input type="email" className="form-input artist-profile-input" value={profile.email} disabled style={{ backgroundColor: '#f1f5f9', color: '#64748b', paddingRight: '44px' }} />
                                                        <button type="button" title="Change email address"
                                                            onClick={() => setEmailModal({ open: true, step: 'enterEmail', newEmail: '', emailError: '', otp: Array(6).fill(''), otpError: '', sending: false, confirming: false, resendTimer: 300, resendAttempts: 0, resending: false })}
                                                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#be9055', display: 'flex', alignItems: 'center' }}>
                                                            <Edit2 size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="form-group">
                                                    <label className="artist-profile-form-label"><Phone size={16} /> Phone Number</label>
                                                    {(() => {
                                                        const { code, currentNo } = getPhoneParts(profile.phone);
                                                        return (
                                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                                <CountryCodeSelect value={code} onChange={newCode => { const { currentNo: num } = getPhoneParts(profile.phone); setProfile({ ...profile, phone: newCode + num.replace(/^0+/, '') }); }} />
                                                                <input type="tel" className="form-input artist-profile-input" style={{ flex: 1 }} value={currentNo}
                                                                    onChange={e => { const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 11); const { code: currentCode } = getPhoneParts(profile.phone); setProfile({ ...profile, phone: currentCode + digits.replace(/^0+/, '') }); }}
                                                                    placeholder="9123456789" maxLength={11} />
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                                <div className="form-group">
                                                    <label className="artist-profile-form-label"><MapPin size={16} /> Location</label>
                                                    <input type="text" className="form-input artist-profile-input" value={profile.location}
                                                        onChange={e => { const val = e.target.value; setProfile({ ...profile, location: val }); validateProfileField('location', val); }}
                                                        placeholder="City, Country" style={{ border: errors.location ? '1px solid #ef4444' : undefined }} maxLength={200} />
                                                    {errors.location && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.location}</span>}
                                                </div>
                                            </div>
                                            <div className="form-group" style={{ marginTop: '16px' }}>
                                                <label className="artist-profile-form-label"><FileText size={16} /> Tattoo Preferences</label>
                                                <textarea className="form-input artist-profile-input" value={profile.preferences}
                                                    onChange={e => { const val = e.target.value; setProfile({ ...profile, preferences: val }); validateProfileField('preferences', val); }}
                                                    placeholder="E.g. Realism, Blackwork, Sleeve ideas..." rows="3"
                                                    style={{ border: errors.preferences ? '1px solid #ef4444' : undefined, resize: 'vertical' }} maxLength={500} />
                                                {errors.preferences && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.preferences}</span>}
                                            </div>
                                        </div>

                                        {/* Section 2: Password & Security */}
                                        <div style={{ marginBottom: '24px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                <h3 style={{ color: '#1e293b', fontSize: '1.1rem', fontWeight: '600', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Lock size={20} color="#be9055" /> Password &amp; Security
                                                </h3>
                                                <button type="button" onClick={() => setShowChangePassword(!showChangePassword)}
                                                    style={{ padding: '8px 16px', backgroundColor: showChangePassword ? '#f1f5f9' : '#be9055', color: showChangePassword ? '#475569' : 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500', transition: 'all 0.2s' }}>
                                                    {showChangePassword ? 'Cancel' : 'Change Password'}
                                                </button>
                                            </div>
                                            {showChangePassword && (
                                                <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                                    <div className="form-group" style={{ marginBottom: '16px' }}>
                                                        <label className="artist-profile-form-label"><Lock size={16} /> Current Password</label>
                                                        <div style={{ position: 'relative' }}>
                                                            <input className="form-input artist-profile-input" type={showPassword ? 'text' : 'password'} value={passwords.currentPassword}
                                                                onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })}
                                                                placeholder="Enter current password" style={{ paddingRight: '40px' }} maxLength={128} />
                                                            <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="grid-2col">
                                                        <div className="form-group">
                                                            <label className="artist-profile-form-label"><Lock size={16} /> New Password</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <input type={showNewPassword ? 'text' : 'password'} className="form-input artist-profile-input" value={passwords.newPassword}
                                                                    onChange={e => { const val = e.target.value.slice(0, 50); setPasswords({ ...passwords, newPassword: val }); setPasswordFeedback({ hasMinLength: val.length >= 8, hasUppercase: /[A-Z]/.test(val), hasLowercase: /[a-z]/.test(val), hasNumber: /[0-9]/.test(val), hasSymbol: /[@$!%*?&#]/.test(val) }); }}
                                                                    onFocus={() => setPasswordFocused(true)} onBlur={() => { if (!passwords.newPassword) setPasswordFocused(false); }}
                                                                    placeholder="Min. 8 characters" style={{ paddingRight: '40px' }} maxLength={128} />
                                                                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                                                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="form-group">
                                                            <label className="artist-profile-form-label"><Lock size={16} /> Confirm New Password</label>
                                                            <div style={{ position: 'relative' }}>
                                                                <input type={showConfirmPassword ? 'text' : 'password'} className="form-input artist-profile-input" value={passwords.confirmPassword}
                                                                    onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                                                                    placeholder="Re-enter new password" style={{ paddingRight: '40px' }} maxLength={128} />
                                                                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                                                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ overflow: 'hidden', maxHeight: passwordFocused ? '200px' : '0', opacity: passwordFocused ? 1 : 0, transition: 'max-height 0.3s ease, opacity 0.3s ease', marginTop: passwordFocused ? '4px' : '0' }}>
                                                        <PasswordStrengthMeter feedback={passwordFeedback} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Save Bar */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '2px solid #f1f5f9' }}>
                                            <button type="button" className="btn btn-secondary" onClick={() => { if (originalProfile) setProfile(originalProfile); setIsEditing(false); }}>Cancel</button>
                                            <button type="submit" className="btn btn-primary" disabled={saving} style={{ backgroundColor: '#be9055', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', color: 'white' }}>
                                                {saving ? 'Saving...' : <><Save size={18} /> Save All Changes</>}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Email Change Modal */}
            {emailModal.open && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
                    }}
                    onClick={() => setEmailModal(prev => ({ ...prev, open: false }))}
                >
                    <div
                        style={{
                            background: '#fff', borderRadius: '20px', padding: '36px 32px 28px',
                            maxWidth: '440px', width: '92%', boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
                            fontFamily: "'Inter', sans-serif"
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>
                                    {emailModal.step === 'enterEmail' ? 'Change Email Address' : 'Enter Verification Code'}
                                </h2>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                                    {emailModal.step === 'enterEmail'
                                        ? 'Enter your new email address below'
                                        : `Code sent to ${profile.email}`}
                                </p>
                            </div>
                            <button onClick={() => setEmailModal(prev => ({ ...prev, open: false }))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Step indicator */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '24px' }}>
                            {['enterEmail', 'enterOtp'].map((s, i) => (
                                <div key={s} style={{
                                    flex: 1, height: '3px', borderRadius: '2px',
                                    background: (emailModal.step === 'enterOtp' ? true : i === 0) ? '#be9055' : '#e2e8f0'
                                }} />
                            ))}
                        </div>

                        {emailModal.step === 'enterEmail' ? (
                            <>
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                                        New Email Address
                                    </label>
                                    <input
                                        type="email"
                                        autoFocus
                                        value={emailModal.newEmail}
                                        onChange={e => setEmailModal(prev => ({ ...prev, newEmail: e.target.value, emailError: '' }))}
                                        placeholder="you@example.com"
                                        style={{
                                            width: '100%', padding: '10px 14px', borderRadius: '8px', fontSize: '0.9rem',
                                            border: emailModal.emailError ? '1.5px solid #ef4444' : '1.5px solid #e2e8f0',
                                            outline: 'none', boxSizing: 'border-box', color: '#1e293b',
                                            transition: 'border-color 0.2s'
                                        }}
                                        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                                    />
                                    {emailModal.emailError && (
                                        <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <AlertCircle size={13} /> {emailModal.emailError}
                                        </p>
                                    )}
                                    <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                                        A 6-digit authorization code will be sent to your <strong>current</strong> email to confirm this change.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    disabled={emailModal.sending}
                                    onClick={async () => {
                                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                                        if (!emailModal.newEmail.trim()) {
                                            return setEmailModal(prev => ({ ...prev, emailError: 'Please enter an email address.' }));
                                        }
                                        if (!emailRegex.test(emailModal.newEmail)) {
                                            return setEmailModal(prev => ({ ...prev, emailError: 'Please enter a valid email address.' }));
                                        }
                                        if (emailModal.newEmail.toLowerCase() === profile.email.toLowerCase()) {
                                            return setEmailModal(prev => ({ ...prev, emailError: 'New email must be different from your current email.' }));
                                        }
                                        setEmailModal(prev => ({ ...prev, sending: true, emailError: '' }));
                                        try {
                                            const res = await Axios.post(`${API_URL}/api/request-email-change`, { userId: customerId, newEmail: emailModal.newEmail });
                                            if (res.data.success) {
                                                setEmailModal(prev => ({ ...prev, sending: false, step: 'enterOtp' }));
                                            }
                                        } catch (err) {
                                            const msg = err.response?.data?.message || 'Failed to request email change.';
                                            setEmailModal(prev => ({ ...prev, sending: false, emailError: msg }));
                                        }
                                    }}
                                    style={{
                                        width: '100%', padding: '11px', borderRadius: '8px',
                                        backgroundColor: emailModal.sending ? '#f1c44a' : '#be9055',
                                        color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.9rem',
                                        cursor: emailModal.sending ? 'not-allowed' : 'pointer', transition: 'background 0.2s'
                                    }}
                                >
                                    {emailModal.sending ? 'Sending Code...' : 'Send Authorization Code'}
                                </button>
                            </>
                        ) : (
                            <>
                                <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '24px', lineHeight: 1.6 }}>
                                    Enter the 6-digit code sent to <strong style={{ color: '#1e293b' }}>{profile.email}</strong> to confirm changing your address to <strong style={{ color: '#be9055' }}>{emailModal.newEmail}</strong>.
                                </p>
                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '16px' }}>
                                    {emailModal.otp.map((digit, idx) => (
                                        <input
                                            key={idx}
                                            ref={el => otpRefs.current[idx] = el}
                                            type="tel"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 1);
                                                const newOtp = [...emailModal.otp];
                                                newOtp[idx] = val;
                                                setEmailModal(prev => ({ ...prev, otp: newOtp, otpError: '' }));
                                                if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Backspace' && !emailModal.otp[idx] && idx > 0) {
                                                    otpRefs.current[idx - 1]?.focus();
                                                }
                                            }}
                                            onPaste={(e) => {
                                                e.preventDefault();
                                                const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
                                                if (pasted) {
                                                    const newOtp = [...emailModal.otp];
                                                    for (let i = 0; i < 6; i++) newOtp[i] = pasted[i] || '';
                                                    setEmailModal(prev => ({ ...prev, otp: newOtp, otpError: '' }));
                                                    const focusIdx = Math.min(pasted.length, 5);
                                                    otpRefs.current[focusIdx]?.focus();
                                                }
                                            }}
                                            style={{
                                                width: '46px',
                                                height: '56px',
                                                textAlign: 'center',
                                                fontSize: '1.4rem',
                                                fontWeight: '700',
                                                borderRadius: '10px',
                                                border: digit ? '2px solid #be9055' : (emailModal.otpError ? '1.5px solid #ef4444' : '1.5px solid #e2e8f0'),
                                                backgroundColor: 'white',
                                                color: '#1e293b',
                                                outline: 'none',
                                                transition: 'border-color 0.2s',
                                                boxSizing: 'border-box'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = '#be9055'}
                                            onBlur={(e) => { if (!digit) e.target.style.borderColor = emailModal.otpError ? '#ef4444' : '#e2e8f0'; }}
                                        />
                                    ))}
                                </div>
                                {emailModal.otpError && (
                                    <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <AlertCircle size={13} /> {emailModal.otpError}
                                    </p>
                                )}
                                <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                                    {emailModal.resendTimer > 0 ? (
                                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                                            Resend code in {Math.floor(emailModal.resendTimer / 60)}:{(emailModal.resendTimer % 60).toString().padStart(2, '0')}
                                        </p>
                                    ) : emailModal.resendAttempts >= 3 ? (
                                        <p style={{ fontSize: '0.8rem', color: '#ef4444', margin: 0, fontWeight: 500 }}>
                                            Maximum resend attempts reached. Please try again later.
                                        </p>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={emailModal.resending}
                                            onClick={async () => {
                                                setEmailModal(prev => ({ ...prev, resending: true, otpError: '' }));
                                                try {
                                                    const res = await Axios.post(`${API_URL}/api/request-email-change`, { userId: customerId, newEmail: emailModal.newEmail });
                                                    if (res.data.success) {
                                                        setEmailModal(prev => ({ ...prev, resending: false, resendTimer: 300, resendAttempts: prev.resendAttempts + 1 }));
                                                    }
                                                } catch (err) {
                                                    const msg = err.response?.data?.message || 'Failed to resend code.';
                                                    setEmailModal(prev => ({ ...prev, resending: false, otpError: msg }));
                                                }
                                            }}
                                            style={{
                                                background: 'none', border: 'none', color: '#be9055', fontSize: '0.8rem',
                                                fontWeight: 600, cursor: emailModal.resending ? 'not-allowed' : 'pointer',
                                                padding: 0, textDecoration: 'underline'
                                            }}
                                        >
                                            {emailModal.resending ? 'Resending...' : 'Didn\'t receive it? Resend Code'}
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setEmailModal(prev => ({ ...prev, step: 'enterEmail', otp: Array(6).fill(''), otpError: '', resendTimer: 300, resendAttempts: 0 }))}
                                        style={{
                                            flex: 1, padding: '10px', borderRadius: '8px', border: '1.5px solid #e2e8f0',
                                            background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer'
                                        }}
                                    >
                                        ← Back
                                    </button>
                                    <button
                                        type="button"
                                        disabled={emailModal.confirming || emailModal.otp.join('').length !== 6}
                                        onClick={async () => {
                                            setEmailModal(prev => ({ ...prev, confirming: true, otpError: '' }));
                                            try {
                                                const res = await Axios.post(`${API_URL}/api/confirm-email-change`, { userId: customerId, otp: emailModal.otp.join(''), newEmail: emailModal.newEmail });
                                                if (res.data.requireReverification) {
                                                    localStorage.removeItem('user');
                                                    localStorage.removeItem('token');
                                                    setEmailModal(prev => ({ ...prev, open: false }));
                                                    setSuccessModal({ mounted: true, visible: false, message: 'Email changed successfully! A verification link has been sent to your new address. Please verify to log in again.' });
                                                    setTimeout(() => setSuccessModal(prev => ({ ...prev, visible: true })), 10);
                                                }
                                            } catch (err) {
                                                const msg = err.response?.data?.message || 'Invalid or expired code.';
                                                setEmailModal(prev => ({ ...prev, confirming: false, otpError: msg }));
                                            }
                                        }}
                                        style={{
                                            flex: 2, padding: '10px', borderRadius: '8px',
                                            backgroundColor: (emailModal.confirming || emailModal.otp.join('').length !== 6) ? '#6ee7b7' : '#059669',
                                            color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem',
                                            cursor: (emailModal.confirming || emailModal.otp.join('').length !== 6) ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {emailModal.confirming ? 'Confirming...' : 'Confirm Email Change'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Security Change Success Modal */}

            {successModal.mounted && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(15,23,42,0.55)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 9999,
                        opacity: successModal.visible ? 1 : 0,
                        transition: 'opacity 0.35s ease'
                    }}
                >
                    <div
                        style={{
                            background: 'rgba(255,255,255,0.95)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255,255,255,0.5)',
                            borderRadius: '24px',
                            padding: '40px 36px 32px',
                            maxWidth: '420px',
                            width: '90%',
                            textAlign: 'center',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                            transform: successModal.visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(20px)',
                            transition: 'transform 0.35s ease, opacity 0.35s ease',
                            fontFamily: "'Inter', sans-serif"
                        }}
                    >
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: 'rgba(193,154,107,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 20px'
                        }}>
                            <CheckCircle size={32} style={{ color: '#be9055' }} />
                        </div>
                        <h2 style={{ color: '#1e293b', fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>Security Update Complete</h2>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 28px' }}>
                            {successModal.message}
                        </p>
                        <button
                            onClick={() => {
                                setSuccessModal(prev => ({ ...prev, visible: false }));
                                setTimeout(() => {
                                    window.location.href = '/login';
                                }, 350);
                            }}
                            style={{
                                width: '100%',
                                padding: '12px 24px',
                                backgroundColor: '#be9055',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '10px',
                                fontSize: '0.95rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'background-color 0.2s, transform 0.15s',
                                fontFamily: "'Inter', sans-serif"
                            }}
                            onMouseEnter={e => e.target.style.backgroundColor = '#b08a5c'}
                            onMouseLeave={e => e.target.style.backgroundColor = '#be9055'}
                        >
                            Go to Login
                        </button>
                    </div>
                </div>
            )}

        {/* 1:1 Image Cropper Modal */}
        {cropperImage && (
            <ImageCropper
                imageSrc={cropperImage}
                aspect={1}
                onCropDone={handleCropDone}
                onCancel={handleCropCancel}
            />
        )}
        </>
    );
}

// Inline styles
const formLabel = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#334155',
    marginBottom: '6px'
};

const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '0.95rem',
    color: '#1e293b',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box'
};

export default CustomerProfile;
