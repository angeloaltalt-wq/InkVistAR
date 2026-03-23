import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { User, Mail, Palette, Save, Lock, DollarSign, Clock } from 'lucide-react';
import ArtistSideNav from '../components/ArtistSideNav';
import './PortalStyles.css';
import { API_URL } from '../config';

function ArtistProfile(){
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        specialization: '',
        hourly_rate: 0,
        experience_years: 0
    });
    const [passwords, setPasswords] = useState({
        newPassword: '',
        confirmPassword: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Get the real logged-in user ID
    const [user] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const artistId = user ? user.id : 1;

    useEffect(() => {
        const fetch = async () => {
            try{
                setLoading(true);
                const res = await Axios.get(`${API_URL}/api/artist/dashboard/${artistId}`);
                if (res.data.success) {
                    const data = res.data.artist;
                    setProfile({
                        name: data.name,
                        email: data.email,
                        specialization: data.specialization,
                        hourly_rate: data.hourly_rate || 0,
                        experience_years: data.experience_years || 0
                    });
                }
                setLoading(false);
            } catch(e){ console.error(e); setLoading(false); }
        };
        fetch();
    }, [artistId]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);

        // Password validation block
        if (passwords.newPassword) {
            if (passwords.newPassword !== passwords.confirmPassword) {
                alert("New passwords do not match.");
                setSaving(false);
                return;
            }
            if (passwords.newPassword.length < 6) {
                alert("Password must be at least 6 characters long.");
                setSaving(false);
                return;
            }
        }

        try {
            // Update profile details (Name & Specialization)
            await Axios.put(`${API_URL}/api/artist/profile/${artistId}`, {
                name: profile.name,
                specialization: profile.specialization,
                hourly_rate: profile.hourly_rate,
                experience_years: profile.experience_years
            });

            // If password provided, call reset-password endpoint
            if (passwords.newPassword) {
                 await Axios.post(`${API_URL}/api/reset-password`, {
                    email: profile.email,
                    newPassword: passwords.newPassword
                });
            }
            
            alert("Profile settings updated successfully!");
            setPasswords({ newPassword: '', confirmPassword: '' });
        } catch (error) {
            const errorMessage = error.response?.data?.message || "Failed to update settings. Please try again.";
            console.error("Profile update error:", error.response || error);
            // Display specific error from backend if available
            alert(errorMessage);
        }
        setSaving(false);
    };

    return (
        <div className="portal-layout">
            <ArtistSideNav />
            <div className="portal-container artist-portal">
                <header className="portal-header"><h1>Settings</h1></header>
                <div className="portal-content">
                    {loading ? <div className="no-data">Loading...</div> : (
                        <div className="data-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                            <form onSubmit={handleSave}>
                                {/* 1. Personal Details */}
                                <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>Personal Details</h3>
                                <div className="form-group">
                                    <label><User size={16}/> Artist Name</label>
                                    <input 
                                        type="text" 
                                        className="form-input"
                                        value={profile.name}
                                        onChange={e => setProfile({...profile, name: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label><Mail size={16}/> Email</label>
                                    <input 
                                        type="email" 
                                        className="form-input"
                                        value={profile.email}
                                        disabled
                                        style={{ backgroundColor: '#f3f4f6' }}
                                    />
                                </div>

                                {/* 2. Preferred Styles */}
                                <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px', marginTop: '30px' }}>Preferred Styles</h3>
                                <div className="form-group">
                                    <label><Palette size={16}/> Preferred Styles / Specialization</label>
                                    <input 
                                        type="text" 
                                        className="form-input"
                                        value={profile.specialization}
                                        onChange={e => setProfile({...profile, specialization: e.target.value})}
                                        placeholder="e.g. Realism, Traditional, Japanese"
                                    />
                                </div>
                                <div className="form-group">
                                    <label><Clock size={16}/> Experience (Years)</label>
                                    <input 
                                        type="number" 
                                        className="form-input" 
                                        value={profile.experience_years}
                                        onChange={e => setProfile({...profile, experience_years: e.target.value})}
                                    />
                                </div>


                                {/* 3. Password Management */}
                                <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '20px', marginTop: '30px' }}>Password Management</h3>
                                <div className="form-group">
                                    <label><Lock size={16}/> New Password</label>
                                    <input 
                                        type="password" 
                                        className="form-input"
                                        value={passwords.newPassword}
                                        onChange={e => setPasswords({...passwords, newPassword: e.target.value})}
                                        placeholder="Leave blank to keep current"
                                    />
                                </div>
                                <div className="form-group">
                                    <label><Lock size={16}/> Confirm Password</label>
                                    <input 
                                        type="password" 
                                        className="form-input"
                                        value={passwords.confirmPassword}
                                        onChange={e => setPasswords({...passwords, confirmPassword: e.target.value})}
                                        placeholder="Confirm new password"
                                    />
                                </div>
                                
                                <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', marginTop: '20px' }}>
                                    {saving ? 'Saving...' : <><Save size={18} style={{ marginRight: '8px' }}/> Save Changes</>}
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ArtistProfile;
