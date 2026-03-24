import React, { useState, useEffect } from 'react';
import Axios from 'axios';
import AdminSideNav from '../components/AdminSideNav';
import ChatWidget from '../components/ChatWidget';
import { API_URL } from '../config';
import './AdminChat.css';

function AdminChat() {
    const [appointments, setAppointments] = useState([]);
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [loading, setLoading] = useState(true);
    const user = JSON.parse(localStorage.getItem('user'));

    useEffect(() => {
        fetchAppointments();
    }, []);

    const fetchAppointments = async () => {
        try {
            setLoading(true);
            const response = await Axios.get(`${API_URL}/api/admin/appointments`);
            if (response.data.success) {
                // Sort by creation date, newest first
                const sortedAppointments = response.data.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                setAppointments(sortedAppointments);
            }
            setLoading(false);
        } catch (error) {
            console.error("Error fetching appointments:", error);
            setLoading(false);
        }
    };

    return (
        <div className="portal-layout">
            <AdminSideNav />
            <div className="admin-chat-layout">
                <div className="appointment-list-container">
                    <h2 className="chat-list-header">Live Chats & Consultations</h2>
                    
                    {/* General Inquiries (Landing Page Chat) */}
                    <div 
                        className={`appointment-item ${selectedAppointment?.id === 'public_room' ? 'selected' : ''}`}
                        onClick={() => setSelectedAppointment({ id: 'public_room', client_name: 'General Inquiries (Landing Page)', service_type: 'Public Chat', created_at: new Date() })}
                        style={{ borderBottom: '2px solid #e1e7ef', background: selectedAppointment?.id === 'public_room' ? '#f8fafc' : 'white' }}
                    >
                        <div className="appointment-item-name">General Inquiries</div>
                        <div className="appointment-item-service" style={{ color: '#10b981' }}>Landing Page Chat</div>
                    </div>

                    {loading ? <div className="loader" style={{ marginTop: '1rem' }}>Loading...</div> : (
                        <ul className="appointment-list">
                            {appointments.map(apt => (
                                <li 
                                    key={apt.id} 
                                    className={`appointment-item ${selectedAppointment?.id === apt.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedAppointment(apt)}
                                >
                                    <div className="appointment-item-name">{apt.client_name}</div>
                                    <div className="appointment-item-date">{new Date(apt.created_at).toLocaleString()}</div>
                                    <div className="appointment-item-service">{apt.service_type}</div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="chat-window-container">
                    {selectedAppointment ? (
                        <div className="chat-widget-wrapper">
                            <ChatWidget 
                                room={selectedAppointment.id} 
                                currentUser={`Admin`} 
                            />
                        </div>
                    ) : (
                        <div className="no-chat-selected">
                            <h3>Select a chat or consultation to start messaging.</h3>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AdminChat;
