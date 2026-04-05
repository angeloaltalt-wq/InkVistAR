import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import { Save, Download, Upload, RefreshCw, FileText, Bell, Database, Info, Shield } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';
import './AdminSettings.css';
import { API_URL } from '../config';

function AdminSettings() {
    const [settings, setSettings] = useState({
        studio: {
            name: 'InkVistAR Studio',
            email: 'contact@inkvistrar.com',
            phone: '+1-555-0100',
            address: '123 Art Street, City, State 12345',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'USA',
            openingTime: '09:00',
            closingTime: '18:00',
            description: 'Premium tattoo and piercing studio'
        },
        policies: {
            terms: 'By booking an appointment, you agree to our terms of service regarding hygiene, conduct, and payment.',
            deposit: 'A non-refundable deposit of 20% is required to secure your booking. This amount will be deducted from the final price.',
            cancellation: 'Cancellations must be made at least 48 hours in advance. Late cancellations may result in forfeiture of the deposit.'
        },
        care: {
            instructions: `1. Leave the bandage on for 2-4 hours.
2. Wash your hands before touching the tattoo.
3. Gently wash the tattoo with warm water and antibacterial soap.
4. Pat dry with a clean paper towel.
5. Apply a thin layer of recommended ointment.
6. Do not pick, scratch, or peel scabs.
7. Avoid swimming or soaking for 2 weeks.`
        },
        templates: {
            confirmation: 'Hi {client_name}, your appointment for {service} with {artist} on {date} at {time} has been confirmed.',
            reminder: 'Reminder: You have an appointment tomorrow at {time} for {service}. Please arrive 10 minutes early.',
            cancellation: 'Your appointment on {date} has been cancelled. Please contact us to reschedule.'
        },
        backup: {
            lastBackup: '2024-02-24 03:00 AM',
            autoBackup: true,
            frequency: 'daily'
        }
    });

    const [activeTab, setActiveTab] = useState('studio');
    const [isSaved, setIsSaved] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, type: 'info', isAlert: false });

    const showAlert = (title, message, type = 'info') => {
        setConfirmDialog({ isOpen: true, title, message, type, isAlert: true, onConfirm: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })) });
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await Axios.get(`${API_URL}/api/admin/settings`);
            if (res.data.success && res.data.data) {
                // Merge fetched settings with defaults
                setSettings(prev => ({ ...prev, ...res.data.data }));
            }
        } catch (error) {
            console.error("Error fetching settings:", error);
        }
    };

    const handleChange = (section, field, value) => {
        setSettings(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [field]: value
            }
        }));
    };

    const handleSave = async () => {
        try {
            // Save all sections
            await Promise.all(Object.keys(settings).map(section => 
                Axios.post(`${API_URL}/api/admin/settings`, {
                    section: section,
                    data: settings[section]
                })
            ));
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 3000);
        } catch (error) {
            console.error("Error saving settings:", error);
            showAlert("Error", "Failed to save settings", "danger");
        }
    };

    const handleBackup = () => {
        showAlert("Backup Initiated", "Backup started... System will notify when complete.", "info");
    };

    const handleRestore = () => {
        document.getElementById('restore-input').click();
    };

    return (
        <div>
            <div style={{ padding: '0 2rem', display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                <button className="btn btn-primary" onClick={handleSave}>
                    <Save size={18} style={{marginRight:'8px'}}/> Save Changes
                </button>
            </div>

            {isSaved && (
                <div className="success-message">
                    ✓ Settings saved successfully
                </div>
            )}

            <div className="settings-container">
                <div className="settings-tabs">
                    <button 
                        className={`tab-button ${activeTab === 'studio' ? 'active' : ''}`}
                        onClick={() => setActiveTab('studio')}
                    >
                        <Info size={16} style={{marginRight:'8px'}}/> Studio Info
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'policies' ? 'active' : ''}`}
                        onClick={() => setActiveTab('policies')}
                    >
                        <Shield size={16} style={{marginRight:'8px'}}/> Terms & Policies
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'care' ? 'active' : ''}`}
                        onClick={() => setActiveTab('care')}
                    >
                        <FileText size={16} style={{marginRight:'8px'}}/> Care Instructions
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'templates' ? 'active' : ''}`}
                        onClick={() => setActiveTab('templates')}
                    >
                        <Bell size={16} style={{marginRight:'8px'}}/> Templates
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'backup' ? 'active' : ''}`}
                        onClick={() => setActiveTab('backup')}
                    >
                        <Database size={16} style={{marginRight:'8px'}}/> Backup & Restore
                    </button>
                </div>

                <div className="settings-content">
                    {/* Studio Information */}
                    {activeTab === 'studio' && (
                        <div className="settings-panel">
                            <h2>Studio Information</h2>
                            <div className="settings-section">
                                <div className="form-group">
                                    <label>Studio Name *</label>
                                    <input
                                        type="text"
                                        value={settings.studio.name}
                                        onChange={(e) => handleChange('studio', 'name', e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Email *</label>
                                        <input
                                            type="email"
                                            value={settings.studio.email}
                                            onChange={(e) => handleChange('studio', 'email', e.target.value)}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Phone *</label>
                                        <input
                                            type="tel"
                                            value={settings.studio.phone}
                                            onChange={(e) => handleChange('studio', 'phone', e.target.value)}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Description</label>
                                    <textarea
                                        value={settings.studio.description}
                                        onChange={(e) => handleChange('studio', 'description', e.target.value)}
                                        className="form-input"
                                        rows="3"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Address *</label>
                                    <input
                                        type="text"
                                        value={settings.studio.address}
                                        onChange={(e) => handleChange('studio', 'address', e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>City</label>
                                        <input
                                            type="text"
                                            value={settings.studio.city}
                                            onChange={(e) => handleChange('studio', 'city', e.target.value)}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>State</label>
                                        <input
                                            type="text"
                                            value={settings.studio.state}
                                            onChange={(e) => handleChange('studio', 'state', e.target.value)}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Zip Code</label>
                                        <input
                                            type="text"
                                            value={settings.studio.zipCode}
                                            onChange={(e) => handleChange('studio', 'zipCode', e.target.value)}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>Opening Time</label>
                                        <input
                                            type="time"
                                            value={settings.studio.openingTime}
                                            onChange={(e) => handleChange('studio', 'openingTime', e.target.value)}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Closing Time</label>
                                        <input
                                            type="time"
                                            value={settings.studio.closingTime}
                                            onChange={(e) => handleChange('studio', 'closingTime', e.target.value)}
                                            className="form-input"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Terms & Policies */}
                    {activeTab === 'policies' && (
                        <div className="settings-panel">
                            <h2>Terms & Policies</h2>
                            <div className="settings-section">
                                <div className="form-group">
                                    <label>Terms of Service</label>
                                    <textarea
                                        value={settings.policies.terms}
                                        onChange={(e) => handleChange('policies', 'terms', e.target.value)}
                                        className="form-input"
                                        rows="5"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Deposit Policy</label>
                                    <textarea
                                        value={settings.policies.deposit}
                                        onChange={(e) => handleChange('policies', 'deposit', e.target.value)}
                                        className="form-input"
                                        rows="3"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Cancellation Policy</label>
                                    <textarea
                                        value={settings.policies.cancellation}
                                        onChange={(e) => handleChange('policies', 'cancellation', e.target.value)}
                                        className="form-input"
                                        rows="3"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tattoo Care Instructions */}
                    {activeTab === 'care' && (
                        <div className="settings-panel">
                            <h2>Tattoo Care Instructions</h2>
                            <p style={{marginBottom: '1rem', color: '#666'}}>These instructions will be available to clients in their portal.</p>
                            <div className="settings-section">
                                <div className="form-group">
                                    <label>Aftercare Guide</label>
                                    <textarea
                                        value={settings.care.instructions}
                                        onChange={(e) => handleChange('care', 'instructions', e.target.value)}
                                        className="form-input"
                                        rows="10"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notification Templates */}
                    {activeTab === 'templates' && (
                        <div className="settings-panel">
                            <h2>Notification Templates</h2>
                            <p style={{marginBottom: '1rem', color: '#666'}}>Use placeholders like {'{client_name}'}, {'{date}'}, {'{time}'}.</p>
                            <div className="settings-section">
                                <div className="form-group">
                                    <label>Appointment Confirmation</label>
                                    <textarea
                                        value={settings.templates.confirmation}
                                        onChange={(e) => handleChange('templates', 'confirmation', e.target.value)}
                                        className="form-input"
                                        rows="3"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Appointment Reminder</label>
                                    <textarea
                                        value={settings.templates.reminder}
                                        onChange={(e) => handleChange('templates', 'reminder', e.target.value)}
                                        className="form-input"
                                        rows="3"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Cancellation Notice</label>
                                    <textarea
                                        value={settings.templates.cancellation}
                                        onChange={(e) => handleChange('templates', 'cancellation', e.target.value)}
                                        className="form-input"
                                        rows="3"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Backup & Restore */}
                    {activeTab === 'backup' && (
                        <div className="settings-panel">
                            <h2>Backup & Restore</h2>
                            <div className="settings-section">
                                <div className="form-group" style={{background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0'}}>
                                    <label>Last Successful Backup</label>
                                    <p style={{fontSize: '1.1rem', fontWeight: 'bold', color: '#10b981', margin: '5px 0'}}>{settings.backup.lastBackup}</p>
                                </div>

                                <div className="toggle-group">
                                    <label className="toggle-item">
                                        <input
                                            type="checkbox"
                                            checked={settings.backup.autoBackup}
                                            onChange={() => handleChange('backup', 'autoBackup', !settings.backup.autoBackup)}
                                            className="toggle-checkbox"
                                        />
                                        <span className="toggle-label">Automatic Daily Backup</span>
                                    </label>
                                </div>

                                <div className="form-group">
                                    <label>Backup Frequency</label>
                                    <select
                                        value={settings.backup.frequency}
                                        onChange={(e) => handleChange('backup', 'frequency', e.target.value)}
                                        className="form-input"
                                    >
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                        <option value="monthly">Monthly</option>
                                    </select>
                                </div>

                                <div style={{display: 'flex', gap: '15px', marginTop: '20px'}}>
                                    <button className="btn btn-primary" onClick={handleBackup} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                        <Download size={18}/> Download Backup
                                    </button>
                                    <button className="btn btn-secondary" onClick={handleRestore} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                                        <Upload size={18}/> Restore from File
                                    </button>
                                    <input type="file" id="restore-input" style={{display: 'none'}} onChange={(e) => {
                                        e.target.value = null; // reset
                                        showAlert("Feature In Development", "System point-in-time restoration is currently being built and is not yet available.", "warning");
                                    }} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <ConfirmModal {...confirmDialog} onClose={() => setConfirmDialog(prev => ({...prev, isOpen: false}))} />
        </div>
    );
}

export default AdminSettings;
