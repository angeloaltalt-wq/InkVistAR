import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { User, Mail, Phone, MapPin, Save, Edit2, X, FileText, Lock, Eye, EyeOff, CheckCircle, AlertCircle, Camera } from 'lucide-react';
import './PortalStyles.css';
import { API_URL } from '../config';
import CustomerSideNav from '../components/CustomerSideNav';

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

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfile({ ...profile, profile_image: reader.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });
        setSaving(true);

        // Profile validation
        if (!profile.name.trim()) {
            setMessage({ type: 'error', text: 'Name is required' });
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
            // Update profile details
            await Axios.put(`${API_URL}/api/customer/profile/${customerId}`, {
                ...profile,
                notes: profile.preferences,
                profileImage: profile.profile_image
            });

            // Change password if requested and new password is provided
            if (showChangePassword && passwords.newPassword) {
                await Axios.post(`${API_URL}/api/customer/change-password`, {
                    customerId,
                    currentPassword: passwords.currentPassword,
                    newPassword: passwords.newPassword
                });
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
        <div className="portal-layout">
            <CustomerSideNav />
            <div className="portal-container customer-portal">
                <header className="portal-header"><h1>My Profile</h1></header>
                <div className="portal-content" style={{ maxWidth: '800px', margin: '0 auto' }}>
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
                    {loading ? <div className="no-data">Loading...</div> : (
                        <div className="data-card">
                            {!isEditing ? (
                                <div className="profile-view">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                            <div style={{
                                                width: '100px', height: '100px', borderRadius: '50%',
                                                backgroundColor: '#f1f5f9', overflow: 'hidden',
                                                border: '3px solid white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {profile.profile_image ? (
                                                    <img src={profile.profile_image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <span style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#64748b' }}>{profile.name.charAt(0)}</span>
                                                )}
                                            </div>
                                            <div>
                                                <h2 style={{ margin: '0 0 5px 0', fontSize: '1.8rem' }}>{profile.name}</h2>
                                                <p style={{ margin: 0, color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Mail size={16} /> {profile.email}
                                                </p>
                                            </div>
                                        </div>
                                        <button className="btn btn-secondary" onClick={() => setIsEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Edit2 size={16} /> Edit Profile
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                                        <div className="info-group">
                                            <label><Phone size={16} /> Phone Number</label>
                                            <p>{profile.phone || 'Not provided'}</p>
                                        </div>
                                        <div className="info-group">
                                            <label><MapPin size={16} /> Location</label>
                                            <p>{profile.location || 'Not provided'}</p>
                                        </div>
                                        <div className="info-group" style={{ gridColumn: '1 / -1' }}>
                                            <label><FileText size={16} /> Tattoo Preferences</label>
                                            <p>{profile.preferences || 'No preferences listed'}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <form onSubmit={handleSave}>
                                    {/* Profile Picture Upload Section */}
                                    <div style={{ textAlign: 'center', marginBottom: '30px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
                                        <div style={{ position: 'relative', display: 'inline-block' }}>
                                            <div style={{
                                                width: '120px', height: '120px', borderRadius: '50%',
                                                backgroundColor: '#e2e8f0', overflow: 'hidden',
                                                border: '4px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {profile.profile_image ? (
                                                    <img src={profile.profile_image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <User size={48} color="#94a3b8" />
                                                )}
                                            </div>
                                            <label style={{
                                                position: 'absolute', bottom: '0', right: '0',
                                                backgroundColor: '#daa520', color: 'white',
                                                padding: '8px', borderRadius: '50%', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                            }}>
                                                <Camera size={18} />
                                                <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
                                            </label>
                                        </div>
                                        <p style={{ marginTop: '10px', fontSize: '0.85rem', color: '#64748b' }}>Update profile picture</p>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                        <h2 style={{ margin: 0 }}>Edit Profile</h2>
                                        <button type="button" className="close-btn" onClick={() => setIsEditing(false)}><X size={24} /></button>
                                    </div>

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
                                                <label style={formLabel}><User size={16} /> Name</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={profile.name}
                                                    onChange={e => setProfile({ ...profile, name: e.target.value })}
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
                                                    style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label style={formLabel}><Phone size={16} /> Phone</label>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <select 
                                                        className="form-input" 
                                                        style={{ width: '90px' }}
                                                        value={profile.phone.startsWith('+') ? profile.phone.substring(0, 3) : '+63'}
                                                        onChange={e => {
                                                            const code = e.target.value;
                                                            const currentNo = profile.phone.replace(/^\+\d+/, '');
                                                            setProfile({ ...profile, phone: code + currentNo });
                                                        }}
                                                    >
                                                        <option value="+63">+63</option>
                                                        <option value="+1">+1</option>
                                                        <option value="+65">+65</option>
                                                    </select>
                                                    <input
                                                        type="tel" className="form-input" style={{ flex: 1 }}
                                                        value={profile.phone.replace(/^\+\d+/, '')}
                                                        onChange={e => {
                                                            const prefix = profile.phone.match(/^\+\d+/) ? profile.phone.match(/^\+\d+/)[0] : '+63';
                                                            setProfile({ ...profile, phone: prefix + e.target.value.replace(/[^\d]/g, '') });
                                                        }}
                                                        placeholder="9123456789"
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label style={formLabel}><MapPin size={16} /> Location</label>
                                                <input
                                                    type="text"
                                                    className="form-input"
                                                    value={profile.location}
                                                    onChange={e => setProfile({ ...profile, location: e.target.value })}
                                                    placeholder="City, State"
                                                    style={inputStyle}
                                                />
                                            </div>
                                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                                <label style={formLabel}><FileText size={16} /> Tattoo Preferences</label>
                                                <textarea
                                                    className="form-input"
                                                    value={profile.preferences}
                                                    onChange={e => setProfile({ ...profile, preferences: e.target.value })}
                                                    placeholder="E.g. Realism, Blackwork, Sleeve ideas..."
                                                    rows="3"
                                                    style={inputStyle}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 2: Password & Security */}
                                    <div style={{ marginBottom: '24px' }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '16px',
                                            borderBottom: '2px solid #f1f5f9',
                                            paddingBottom: '16px'
                                        }}>
                                            <h3 style={{ color: '#1e293b', fontSize: '1.1rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                                            <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                                <div className="form-group" style={{ marginBottom: '16px' }}>
                                                    <label style={formLabel}><Lock size={16} /> Current Password</label>
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
                                                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                                                        >
                                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                    <div className="form-group">
                                                        <label style={formLabel}><Lock size={16} /> New Password</label>
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
                                                        <label style={formLabel}><Lock size={16} /> Confirm New Password</label>
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
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', marginTop: '32px' }}>
                                        <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)} style={{ flex: 1 }}>
                                            Cancel
                                        </button>
                                        <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, backgroundColor: '#daa520', color: 'white', border: 'none' }}>
                                            {saving ? 'Saving...' : <><Save size={18} style={{ marginRight: '8px' }} /> Save All Changes</>}
                                        </button>
                                    </div>
                                </form>
                            )}
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

export default CustomerProfile;
