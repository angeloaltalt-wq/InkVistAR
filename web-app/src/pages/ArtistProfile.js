import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import {
    User, Mail, Palette, Save, Lock, DollarSign, Clock, Camera,
    Phone, Building, Percent, Eye, EyeOff, CheckCircle, AlertCircle
} from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import './PortalStyles.css';
import { API_URL } from '../config';

function ArtistProfile() {
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        phone: '',
        studio_name: '',
        specialization: '',
        hourly_rate: 0,
        experience_years: 0,
        commission_rate: 0,
        profile_image: ''
    });

    const [passwords, setPasswords] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    const [showPassword, setShowPassword] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // Get the real logged-in user ID
    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    useEffect(() => {
        const fetch = async () => {
            try {
                setLoading(true);
                const res = await Axios.get(`${API_URL}/api/artist/dashboard/${artistId}`);
                if (res.data.success) {
                    const data = res.data.artist;
                    setProfile({
                        name: data.name || '',
                        email: data.email || '',
                        phone: data.phone || '',
                        studio_name: data.studio_name || '',
                        specialization: data.specialization || '',
                        hourly_rate: data.hourly_rate || 0,
                        experience_years: data.experience_years || 0,
                        commission_rate: (data.commission_rate || 0) * 100,
                        profile_image: data.profile_image || ''
                    });
                }
                setLoading(false);
            } catch (e) {
                console.error(e);
                setLoading(false);
            }
        };
        fetch();
    }, [artistId]);

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (file.size > maxSize) {
                setMessage({ type: 'error', text: 'Image size must be less than 5MB' });
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfile({ ...profile, profile_image: reader.result });
                setMessage({ type: '', text: '' });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });
        setSaving(true);

        // Validation
        if (!profile.name.trim()) {
            setMessage({ type: 'error', text: 'Artist name is required' });
            setSaving(false);
            return;
        }

        if (profile.experience_years < 0 || profile.experience_years > 50) {
            setMessage({ type: 'error', text: 'Experience years must be between 0 and 50' });
            setSaving(false);
            return;
        }



        // Password validation
        if (showChangePassword) {
            if (passwords.newPassword) {
                if (passwords.newPassword !== passwords.confirmPassword) {
                    setMessage({ type: 'error', text: 'New passwords do not match' });
                    setSaving(false);
                    return;
                }
                if (passwords.newPassword.length < 6) {
                    setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
                    setSaving(false);
                    return;
                }
            }
        }

        try {
            // Update profile
            await Axios.put(`${API_URL}/api/artist/profile/${artistId}`, {
                name: profile.name,
                phone: profile.phone,
                studio_name: profile.studio_name,
                specialization: profile.specialization,
                experience_years: profile.experience_years,
                commission_rate: 0.30,
                profileImage: profile.profile_image
            });

            // Change password if requested
            if (showChangePassword && passwords.newPassword) {
                await Axios.post(`${API_URL}/api/artist/change-password`, {
                    artistId,
                    currentPassword: passwords.currentPassword,
                    newPassword: passwords.newPassword
                });
            }

            setMessage({ type: 'success', text: 'Profile updated successfully!' });
            setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setShowChangePassword(false);

            // Re-fetch profile
            const res = await Axios.get(`${API_URL}/api/artist/dashboard/${artistId}`);
            if (res.data.success) {
                const data = res.data.artist;
                setProfile({
                    name: data.name || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    studio_name: data.studio_name || '',
                    specialization: data.specialization || '',
                    hourly_rate: data.hourly_rate || 0,
                    experience_years: data.experience_years || 0,
                    commission_rate: (data.commission_rate || 0) * 100,
                    profile_image: data.profile_image || ''
                });
            }
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Failed to update profile';
            setMessage({ type: 'error', text: errorMessage });
            console.error('Profile update error:', error);
        }
        setSaving(false);
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(value);
    };

    return (
        <div className="portal-layout">
            <ArtistSideNav />
            <div className="portal-container artist-portal">
                <header className="portal-header">
                    <h1>Profile Settings</h1>
                </header>
                <div className="portal-content">
                    {loading ? (
                        <div className="no-data">Loading profile...</div>
                    ) : (
                        <div className="data-card" style={{ maxWidth: '700px', margin: '0 auto' }}>
                            <form onSubmit={handleSave}>
                                {/* Profile Picture Section */}
                                <div className="profile-picture-section" style={{
                                    textAlign: 'center',
                                    marginBottom: '30px',
                                    padding: '20px',
                                    backgroundColor: '#f8fafc',
                                    borderRadius: '12px'
                                }}>
                                    <div style={{ position: 'relative', display: 'inline-block' }}>
                                        <div style={{
                                            width: '140px',
                                            height: '140px',
                                            borderRadius: '50%',
                                            backgroundColor: '#e2e8f0',
                                            overflow: 'hidden',
                                            border: '4px solid white',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                        }}>
                                            {profile.profile_image ? (
                                                <img
                                                    src={profile.profile_image}
                                                    alt="Profile"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            ) : (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    height: '100%',
                                                    color: '#94a3b8',
                                                    backgroundColor: '#cbd5e1'
                                                }}>
                                                    <User size={56} strokeWidth={1.5} />
                                                </div>
                                            )}
                                        </div>
                                        <label style={{
                                            position: 'absolute',
                                            bottom: '4px',
                                            right: '4px',
                                            backgroundColor: '#daa520',
                                            color: 'white',
                                            padding: '10px',
                                            borderRadius: '50%',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: '3px solid white',
                                            transition: 'transform 0.2s',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                        }}
                                        onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                                        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                                        >
                                            <Camera size={20} />
                                            <input
                                                type="file"
                                                accept="image/*"
                                                hidden
                                                onChange={handleImageUpload}
                                            />
                                        </label>
                                    </div>
                                    <p style={{ marginTop: '12px', fontSize: '0.9rem', color: '#64748b' }}>
                                        Click the camera icon to upload a new photo
                                    </p>
                                    <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                        Max size: 5MB. Recommended: 400x400px
                                    </p>
                                </div>

                                {/* Message Alert */}
                                {message.text && (
                                    <div style={{
                                        padding: '12px 16px',
                                        borderRadius: '8px',
                                        marginBottom: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        backgroundColor: message.type === 'success' ? '#dcfce7' : '#fee2e2',
                                        color: message.type === 'success' ? '#166534' : '#991b1b',
                                        border: `1px solid ${message.type === 'success' ? '#86efac' : '#fca5a5'}`
                                    }}>
                                        {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                                        <span>{message.text}</span>
                                    </div>
                                )}

                                {/* Section 1: Personal Information */}
                                <div style={{
                                    borderBottom: '2px solid #f1f5f9',
                                    paddingBottom: '16px',
                                    marginBottom: '24px'
                                }}>
                                    <h3 style={{
                                        color: '#1e293b',
                                        fontSize: '1.1rem',
                                        fontWeight: '600',
                                        marginBottom: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <User size={20} color="#daa520" />
                                        Personal Information
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div className="form-group">
                                            <label style={formLabel}><User size={16} /> Artist Name <span style={{ color: '#ef4444' }}>*</span></label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={profile.name}
                                                onChange={e => setProfile({ ...profile, name: e.target.value })}
                                                placeholder="Your full name"
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label style={formLabel}><Mail size={16} /> Email</label>
                                            <input
                                                type="email"
                                                className="form-input"
                                                value={profile.email}
                                                disabled
                                                style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b' }}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Contact support to change</span>
                                        </div>
                                        <div className="form-group">
                                            <label style={formLabel}><Phone size={16} /> Phone Number</label>
                                            <input
                                                type="tel"
                                                className="form-input"
                                                value={profile.phone || ''}
                                                onChange={e => setProfile({ ...profile, phone: e.target.value.replace(/[^0-9+\s()-]/g, '') })}
                                                placeholder="+1 (555) 123-4567"
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label style={formLabel}><Building size={16} /> Studio Name</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={profile.studio_name || ''}
                                                onChange={e => setProfile({ ...profile, studio_name: e.target.value })}
                                                placeholder="Your studio or shop name"
                                                style={{...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b'}}
                                                disabled
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Professional Details */}
                                <div style={{
                                    borderBottom: '2px solid #f1f5f9',
                                    paddingBottom: '16px',
                                    marginBottom: '24px'
                                }}>
                                    <h3 style={{
                                        color: '#1e293b',
                                        fontSize: '1.1rem',
                                        fontWeight: '600',
                                        marginBottom: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <Palette size={20} color="#daa520" />
                                        Professional Details
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label style={formLabel}><Palette size={16} /> Specialization / Styles</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={profile.specialization || ''}
                                                onChange={e => setProfile({ ...profile, specialization: e.target.value })}
                                                placeholder="e.g. Realism, Traditional, Japanese, Watercolor, Neo-traditional"
                                                style={inputStyle}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Separate multiple styles with commas</span>
                                        </div>
                                        <div className="form-group">
                                            <label style={formLabel}><Clock size={16} /> Years of Experience</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={profile.experience_years}
                                                onChange={e => setProfile({ ...profile, experience_years: Math.max(0, parseInt(e.target.value) || 0) })}
                                                min="0"
                                                max="50"
                                                style={inputStyle}
                                            />
                                        </div>
                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label style={formLabel}><Percent size={16} /> Platform Commission Rate</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value="30%"
                                                disabled
                                                style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b' }}
                                            />
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                Platform takes a fixed 30% commission. You keep 70%.
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Password & Security */}
                                <div style={{ marginBottom: '24px' }}>
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: '16px',
                                        borderBottom: '2px solid #f1f5f9',
                                        paddingBottom: '16px'
                                    }}>
                                        <h3 style={{
                                            color: '#1e293b',
                                            fontSize: '1.1rem',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <Lock size={20} color="#daa520" />
                                            Password & Security
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => setShowChangePassword(!showChangePassword)}
                                            style={{
                                                padding: '8px 16px',
                                                backgroundColor: showChangePassword ? '#f1f5f9' : '#daa520',
                                                color: showChangePassword ? '#475569' : 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                                fontWeight: '500',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {showChangePassword ? 'Cancel' : 'Change Password'}
                                        </button>
                                    </div>

                                    {showChangePassword && (
                                        <div style={{
                                            padding: '20px',
                                            backgroundColor: '#f8fafc',
                                            borderRadius: '8px',
                                            animation: 'slideDown 0.3s ease-out'
                                        }}>
                                            <div style={{ marginBottom: '16px' }}>
                                                <div className="form-group">
                                                    <label style={formLabel}>
                                                        <Lock size={16} /> Current Password
                                                    </label>
                                                    <div style={{ position: 'relative' }}>
                                                        <input
                                                            type={showPassword ? 'text' : 'password'}
                                                            className="form-input"
                                                            value={passwords.currentPassword}
                                                            onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })}
                                                            placeholder="Enter current password"
                                                            style={{ ...inputStyle, paddingRight: '40px' }}
                                                        />
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
                                                                color: '#64748b'
                                                            }}
                                                        >
                                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                <div className="form-group">
                                                    <label style={formLabel}>
                                                        <Lock size={16} /> New Password
                                                    </label>
                                                    <input
                                                        type="password"
                                                        className="form-input"
                                                        value={passwords.newPassword}
                                                        onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })}
                                                        placeholder="Min. 6 characters"
                                                        style={inputStyle}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label style={formLabel}>
                                                        <Lock size={16} /> Confirm New Password
                                                    </label>
                                                    <input
                                                        type="password"
                                                        className="form-input"
                                                        value={passwords.confirmPassword}
                                                        onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                                                        placeholder="Re-enter new password"
                                                        style={inputStyle}
                                                    />
                                                </div>
                                            </div>
                                            {passwords.newPassword && passwords.newPassword !== passwords.confirmPassword && (
                                                <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '8px' }}>
                                                    Passwords do not match
                                                </p>
                                            )}
                                            {passwords.newPassword && passwords.newPassword === passwords.confirmPassword && (
                                                <p style={{ color: '#16a34a', fontSize: '0.875rem', marginTop: '8px' }}>
                                                    Passwords match
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Save Button */}
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={saving}
                                    style={{
                                        width: '100%',
                                        padding: '14px',
                                        fontSize: '1rem',
                                        fontWeight: '600',
                                        backgroundColor: saving ? '#94a3b8' : '#daa520',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: saving ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    {saving ? (
                                        <>
                                            <div style={{
                                                width: '18px',
                                                height: '18px',
                                                border: '2px solid rgba(255,255,255,0.3)',
                                                borderTopColor: 'white',
                                                borderRadius: '50%',
                                                animation: 'spin 1s linear infinite'
                                            }} />
                                            Saving Changes...
                                        </>
                                    ) : (
                                        <>
                                            <Save size={18} />
                                            Save All Changes
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
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

export default ArtistProfile;
