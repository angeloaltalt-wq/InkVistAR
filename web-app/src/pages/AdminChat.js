import React, { useState, useEffect, useRef } from 'react';
import Axios from 'axios';
import { MessageSquare, Calendar, Activity } from 'lucide-react';
import AdminSideNav from '../components/AdminSideNav';
import ChatWidget from '../components/ChatWidget';
import { API_URL } from '../config';
import { io } from 'socket.io-client';
import './AdminChat.css';

function AdminChat() {
    const [appointments, setAppointments] = useState([]);
    const [liveSessions, setLiveSessions] = useState([]);
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [loading, setLoading] = useState(true);
    const selectedRef = useRef(null);
    selectedRef.current = selectedAppointment;

    useEffect(() => {
        fetchAppointments();

        const socket = io(API_URL);
        socket.emit('join_admin_tracking');

        socket.on('support_sessions_update', (sessions) => {
            const sorted = [...sessions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setLiveSessions(sorted);

            // If the selected active session was closed, deselect it
            const sel = selectedRef.current;
            if (sel?.isLiveChat && !sessions.find(s => s.id === sel.id)) {
                setSelectedAppointment(null);
            }
        });

        return () => socket.disconnect();
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
        <div className="admin-page-with-sidenav">
            <AdminSideNav />
            <div className="admin-page page-container-enter chat-page-wrapper">
                <div className="admin-chat-layout glass-panel">
                    <div className="appointment-list-container">
                        <div className="chat-list-header">
                            <h2>Chats & Consultations</h2>
                        </div>

                        {/* Dynamic Live Sessions */}
                        {liveSessions.length > 0 && (
                            <div className="chat-section-divider">
                                <Activity size={14} /> Active Web Chats ({liveSessions.length})
                            </div>
                        )}
                        {liveSessions.map(session => (
                            <div
                                key={session.id}
                                className={`appointment-item live-chat-item ${selectedAppointment?.id === session.id ? 'selected' : ''}`}
                                onClick={() => setSelectedAppointment({ id: session.id, client_name: session.name, service_type: 'Live Web Chat', isLiveChat: true })}
                            >
                                <div className="appointment-item-name">
                                    <span>{session.name}</span>
                                    <span className="live-status-pill">Active</span>
                                </div>
                                <div className="appointment-item-service">{session.lastMessage}</div>
                                <div className="appointment-item-date">{new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        ))}

                        <div className="chat-section-divider">
                            <Calendar size={14} /> Scheduled Appointments
                        </div>

                        {loading ? (
                            <div className="chat-loader">
                                <div className="spinner"></div>
                                <span>Syncing records...</span>
                            </div>
                        ) : (
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
                                    isAdminMode={true}
                                />
                            </div>
                        ) : (
                            <div className="no-chat-selected">
                                <MessageSquare size={48} />
                                <h3>Select a conversation to begin.</h3>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AdminChat;
