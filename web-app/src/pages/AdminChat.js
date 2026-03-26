import React, { useState, useEffect, useRef } from 'react';
import Axios from 'axios';
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
            // Or update it if messages changed in the background
            const sel = selectedRef.current;
            if (sel?.isLiveChat) {
                const updated = sessions.find(s => s.id === sel.id);
                if (!updated) {
                    setSelectedAppointment(null);
                } else {
                    // Keep the selected state in sync with the latest messages/data
                    setSelectedAppointment(prev =>
                        prev?.id === updated.id ? { ...updated, client_name: updated.name, service_type: 'Live Web Chat', isLiveChat: true } : prev
                    );
                }
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
            <div className="admin-page page-container-enter" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                <div className="admin-chat-layout" style={{ borderRadius: '15px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', flex: 1 }}>
                    <div className="appointment-list-container">
                        <h2 className="chat-list-header">Chats & Consultations</h2>

                        {/* Dynamic Live Sessions */}
                        {liveSessions.length > 0 && (
                            <div style={{ padding: '10px 20px', backgroundColor: '#f8fafc', fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Active Web Chats ({liveSessions.length})
                            </div>
                        )}
                        {liveSessions.map(session => (
                            <div
                                key={session.id}
                                className={`appointment-item ${selectedAppointment?.id === session.id ? 'selected' : ''}`}
                                onClick={() => setSelectedAppointment({ ...session, client_name: session.name, service_type: 'Live Web Chat', isLiveChat: true })}
                                style={{ borderLeft: '4px solid #10b981', background: selectedAppointment?.id === session.id ? '#f0fdf4' : 'white', cursor: 'pointer' }}
                            >
                                <div className="appointment-item-name" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{session.name}</span>
                                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>Active</span>
                                </div>
                                <div className="appointment-item-service" style={{ color: '#64748b', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {session.lastMessage}
                                </div>
                                <div className="appointment-item-date" style={{ marginTop: '4px' }}>{new Date(session.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        ))}

                        <div style={{ padding: '10px 20px', backgroundColor: '#f8fafc', fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: liveSessions.length ? '0' : '10px' }}>
                            Scheduled Appointments
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
                    <div className="chat-window-container" style={{ flex: 1, position: 'relative' }}>
                        {selectedAppointment ? (
                            <div className="chat-widget-wrapper" style={{ height: '100%', width: '100%' }}>
                                <ChatWidget
                                    key={selectedAppointment.id}
                                    room={selectedAppointment.id}
                                    currentUser={`Admin`}
                                    isAdminMode={true}
                                    initialMessages={selectedAppointment.messages || []}
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
        </div>
    );
}

export default AdminChat;
