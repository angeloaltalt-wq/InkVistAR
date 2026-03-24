import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import { MessageSquare, X, Send, User, Bot, UserSquare } from 'lucide-react';
import { API_URL } from '../config';
import './ChatWidget.css';

// Establish socket connection outside the component
const socket = io(API_URL);

export default function ChatWidget({ room = 'public_room', currentUser = 'Guest' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHumanMode, setIsHumanMode] = useState(false);
  
  // AI Bot Messages State
  const [botMessages, setBotMessages] = useState([
    {
      id: 1,
      text: "Hi! I'm your tattoo design assistant. I can help you with design ideas, placement suggestions, aftercare tips, and more. How can I help you today?",
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  
  // Live Chat (Human) Messages State
  const [humanMessages, setHumanMessages] = useState([
    { id: 'system-1', sender: 'system', text: "Connected to live chat.", timestamp: new Date() }
  ]);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [botMessages, humanMessages, isOpen, isHumanMode]);

  // Socket.io Setup for Live Chat
  useEffect(() => {
    socket.emit('join_room', room);

    socket.on('receive_message', (data) => {
      if (data.room === room) {
        setHumanMessages(prev => [...prev, { 
            id: Date.now() + Math.random(), 
            sender: data.sender, 
            text: data.text,
            timestamp: new Date()
        }]);
      }
    });

    return () => {
      socket.off('receive_message');
    };
  }, [room]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const messageText = inputValue.trim();
    setInputValue('');

    if (isHumanMode) {
      // Send to Live Chat
      const messageData = {
        room: room,
        sender: currentUser,
        text: messageText,
      };
      socket.emit('send_message', messageData);
      setHumanMessages(prev => [...prev, { 
          id: Date.now(), 
          sender: currentUser, 
          text: messageText,
          timestamp: new Date()
      }]);
    } else {
      // Send to AI Bot
      const userMessage = {
        id: Date.now(),
        text: messageText,
        sender: 'user',
        timestamp: new Date(),
      };
      setBotMessages(prev => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const response = await fetch(`${API_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText })
        });
        const data = await response.json();

        const botReply = {
          id: Date.now() + 1,
          text: data.success ? data.response : 'Sorry, I encountered an error.',
          sender: 'bot',
          timestamp: new Date(),
        };
        setBotMessages(prev => [...prev, botReply]);
      } catch (error) {
        setBotMessages(prev => [...prev, {
          id: Date.now() + 1,
          text: 'I seem to be offline. Please try again later.',
          sender: 'bot',
          timestamp: new Date(),
        }]);
      }
      setIsLoading(false);
    }
  };

  const quickQuestions = [
    "What style suits me?",
    "Where should I place it?",
    "How to care for new tattoos?",
    "Does it hurt?",
  ];

  const activeMessages = isHumanMode ? humanMessages : botMessages;

  return (
    <>
      <div className={`chat-widget-container ${isOpen ? 'open' : ''}`}>
          <div className="chat-header">
            <div className="chat-header-info">
              <span className="chat-title">{isHumanMode ? 'Live Chat support' : 'Tattoo AI Assistant'}</span>
              <span className="chat-subtitle">{isHumanMode ? 'Talking to an artist' : 'Always here to help'}</span>
            </div>
            <div className="chat-header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button 
                    className={`human-toggle-btn ${isHumanMode ? 'active' : ''}`}
                    onClick={() => setIsHumanMode(!isHumanMode)}
                    title={isHumanMode ? "Switch to AI" : "Talk to a person"}
                    style={{ 
                        background: isHumanMode ? 'rgba(255,255,255,0.2)' : 'transparent',
                        border: 'none', borderRadius: '50%', width: '32px', height: '32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'white'
                    }}
                >
                    {isHumanMode ? <UserSquare size={18} /> : <Bot size={18} />}
                </button>
                <button className="close-btn" onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}>
                    <X size={20} />
                </button>
            </div>
          </div>

          <div className="chat-messages" style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
            {activeMessages.map((msg) => {
                // system messages in live chat
                if (msg.sender === 'system') {
                    return <div key={msg.id} style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8', margin: '10px 0' }}>{msg.text}</div>;
                }
                const isUser = msg.sender === 'user' || msg.sender === currentUser;
                return (
                    <div
                        key={msg.id}
                        className={`chat-message ${isUser ? 'user' : 'bot'}`}
                    >
                        <div className={`message-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
                            <p style={{ margin: 0, padding: 0 }}>{msg.text}</p>
                            <span className="message-time" style={{ fontSize: '0.7rem', opacity: 0.7, alignSelf: isUser ? 'flex-end' : 'flex-start', marginTop: '4px', display: 'block' }}>
                                {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                        </div>
                    </div>
                );
            })}
            
            {isLoading && !isHumanMode && (
              <div className="chat-message bot">
                <div className="message-bubble typing-indicator">
                    <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
            
            {botMessages.length === 1 && !isHumanMode && (
                <div className="quick-questions" style={{ marginTop: '15px' }}>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>Quick questions:</p>
                    <div className="quick-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {quickQuestions.map((q, i) => (
                            <button key={i} onClick={() => { setInputValue(q); }} 
                                style={{ background: '#f1f5f9', border: 'none', padding: '6px 12px', borderRadius: '15px', fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
                                {q}
                            </button>
                        ))}
                    </div>
                </div>
            )}
          </div>

          <form className="chat-input-area" onSubmit={handleSend} style={{ display: 'flex', padding: '15px', borderTop: '1px solid #e2e8f0', gap: '10px', background: 'white' }}>
            <input
              type="text"
              placeholder={isHumanMode ? "Type a message to an artist..." : "Ask me anything..."}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading && !isHumanMode}
              style={{ flex: 1, padding: '10px 15px', border: '1px solid #e2e8f0', borderRadius: '20px', outline: 'none' }}
            />
            <button type="submit" className="send-btn" disabled={isLoading && !isHumanMode} style={{ background: '#6366f1', border: 'none', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Send size={18} color="white" />
            </button>
          </form>
      </div>

      <button className="chat-fab" onClick={() => setIsOpen(!isOpen)}>
        {isOpen ? <X size={24} color="white" /> : <MessageSquare size={24} color="white" />}
      </button>
    </>
  );
}