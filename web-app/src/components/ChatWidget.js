import React, { useState, useEffect, useRef } from 'react';
import Axios from 'axios';
import { MessageSquare, X, Send, Bot } from 'lucide-react';
import { API_URL } from '../config';
import './ChatWidget.css';

const ChatWidget = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { sender: 'bot', text: "Hi there! I'm InkVistAR's AI assistant. How can I help you with your tattoo questions today?" }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const toggleChat = () => {
        setIsOpen(!isOpen);
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        const userMessage = inputValue.trim();
        if (!userMessage || isLoading) return;

        const newMessages = [...messages, { sender: 'user', text: userMessage }];
        setMessages(newMessages);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await Axios.post(`${API_URL}/api/chat`, {
                message: userMessage
            });
            
            if (response.data.success) {
                setMessages(prev => [...prev, { sender: 'bot', text: response.data.response }]);
            } else {
                setMessages(prev => [...prev, { sender: 'bot', text: "Sorry, I'm having trouble connecting. Please try again later." }]);
            }
        } catch (error) {
            console.error("Chatbot error:", error);
            setMessages(prev => [...prev, { sender: 'bot', text: "Sorry, an error occurred. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className={`chat-widget-container ${isOpen ? 'open' : ''}`}>
                <div className="chat-header">
                    <div className="chat-header-title">
                        <Bot size={24} />
                        <span>AI Assistant</span>
                    </div>
                    <button onClick={toggleChat} className="chat-close-btn">
                        <X size={20} />
                    </button>
                </div>
                <div className="chat-body">
                    {messages.map((msg, index) => (
                        <div key={index} className={`chat-message ${msg.sender}`}>
                            <div className="message-bubble">{msg.text}</div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="chat-message bot">
                            <div className="message-bubble typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="chat-footer">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Ask about styles, pricing..."
                        className="chat-input"
                        disabled={isLoading}
                    />
                    <button type="submit" className="chat-send-btn" disabled={isLoading}>
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