import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { MessageSquare, X, Send, User } from 'lucide-react';
import { API_URL } from '../config';
import './ChatWidget.css';

// Establish socket connection outside the component to avoid re-connections on re-renders
const socket = io(API_URL);

const ChatWidget = ({ room = 'test_room', currentUser = 'user1' }) => { // room and user are now props
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { sender: 'system', text: "Connected to chat." }
    ]);
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        // Join the chat room
        socket.emit('join_room', room);

        // Listen for incoming messages
        socket.on('receive_message', (data) => {
            // Make sure the message is for this room
            if (data.room === room) {
                 setMessages(prev => [...prev, { sender: data.sender, text: data.text }]);
            }
        });

        // Clean up on component unmount
        return () => {
            socket.off('receive_message');
        };
    }, [room]);


    const toggleChat = () => {
        setIsOpen(!isOpen);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        const userMessage = inputValue.trim();
        if (!userMessage) return;

        const messageData = {
            room: room,
            sender: currentUser,
            text: userMessage,
        };

        // Send message to server
        socket.emit('send_message', messageData);

        // Add message to our own UI
        setMessages(prev => [...prev, { sender: currentUser, text: userMessage }]);
        setInputValue('');
    };

    return (
        <>
            <div className={`chat-widget-container ${isOpen ? 'open' : ''}`}>
                <div className="chat-header">
                    <div className="chat-header-title">
                        <User size={24} />
                        <span>Live Chat</span>
                    </div>
                    <button onClick={toggleChat} className="chat-close-btn">
                        <X size={20} />
                    </button>
                </div>
                <div className="chat-body">
                    {messages.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.sender === currentUser ? 'user' : 'other'}`}>
                            <div className="message-bubble">{msg.text}</div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="chat-footer">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Type a message..."
                        className="chat-input"
                    />
                    <button type="submit" className="chat-send-btn">
                        <Send size={18} />
                    </button>
                </form>
            </div>

            <button onClick={toggleChat} className="chat-fab">
                {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
            </button>
        </>
    );
};

export default ChatWidget;