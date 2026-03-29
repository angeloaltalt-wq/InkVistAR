import { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { sendChatMessage, API_URL } from '../src/utils/api';
import io from 'socket.io-client';

// Initialize socket connection (stripping /api from the URL for socket.io)
const socket = io(API_URL.replace('/api', ''));

export function CustomerChatbotPage({ onBack, userId, userName }) {
  const [isHumanMode, setIsHumanMode] = useState(false);
  const [botMessages, setBotMessages] = useState([
    {
      id: 1,
      text: "Hi! I'm your tattoo design assistant. I can help you with design ideas, placement suggestions, aftercare tips, and more. How can I help you today?",
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  
  const [humanMessages, setHumanMessages] = useState([
    { id: 'sys-1', sender: 'system', text: "Welcome to Live Support.", timestamp: new Date() }
  ]);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef(null);

  // Unique room ID for live chat
  const room = useMemo(() => userId ? `customer_${userId}` : `guest_${Math.random().toString(36).substr(2, 9)}`, [userId]);
  const currentUserName = userName || 'Guest User';

  // Determine if studio is open (1 PM - 8 PM)
  const isShopOpen = useMemo(() => {
    // const currentHour = new Date().getHours();
    // return currentHour >= 13 && currentHour < 20;
    return true; // Testing mode: Always open
  }, []);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [botMessages, humanMessages, isHumanMode]);

  // Socket.IO Listeners
  useEffect(() => {
    socket.emit('join_room', room);

    const receiveMessageHandler = (data) => {
      if (data.room !== room) return;
      setHumanMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        sender: data.sender,
        text: data.text,
        timestamp: new Date()
      }]);
    };

    const sessionClosedHandler = () => {
      setIsHumanMode(false);
      setHumanMessages(prev => [...prev, { 
        id: 'sys-reset', 
        sender: 'system', 
        text: "Live chat ended by the agent. Returning to AI assistant.", 
        timestamp: new Date() 
      }]);
    };

    socket.on('receive_message', receiveMessageHandler);
    socket.on('session_closed', sessionClosedHandler);

    return () => {
      socket.off('receive_message', receiveMessageHandler);
      socket.off('session_closed', sessionClosedHandler);
    };
  }, [room]);

  const handleSend = () => {
    sendMessage(inputValue);
  };

  const sendMessage = async (messageText) => {
    if (messageText.trim().length === 0 || isLoading) return;

    if (inputValue === messageText) {
      setInputValue('');
    }

    if (isHumanMode) {
      // Mode: Live Agent (Human)
      const messageData = {
        room: room,
        sender: currentUserName,
        text: messageText.trim(),
      };
      
      // If this is the first human message, alert the admin tracking
      if (humanMessages.length <= 1) {
        socket.emit('start_support_session', { room: room, name: currentUserName });
      }

      socket.emit('send_message', messageData);
      setHumanMessages(prev => [...prev, {
        id: Date.now(),
        sender: currentUserName,
        text: messageText.trim(),
        timestamp: new Date()
      }]);
    } else {
      // Mode: AI Bot
      const userMessage = {
        id: Date.now().toString(),
        text: messageText.trim(),
        sender: 'user',
        timestamp: new Date(),
      };

      setBotMessages(prev => [...prev, userMessage]);
      setIsLoading(true);

      const response = await sendChatMessage(messageText.trim());
      setIsLoading(false);

      const botMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        timestamp: new Date(),
        text: response.success ? response.response : (response.message || 'Sorry, something went wrong.'),
        isError: !response.success,
      };

      setBotMessages(prev => [...prev, botMessage]);
    }
  };

  const toggleMode = () => {
    if (!isHumanMode && !isShopOpen) {
      Alert.alert('Agents offline', 'Our live support is available from 1:00 PM to 8:00 PM. Please use our AI Assistant in the meantime!');
      return;
    }
    setIsHumanMode(!isHumanMode);
  };

  const quickQuestions = [
    "What style suits me?",
    "Where should I place it?",
    "How to care for new tattoos?",
    "Does it hurt?",
  ];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <LinearGradient
          colors={['#000000', '#b8860b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.headerIconContainer}>
              <Ionicons name="sparkles" size={20} color="#ffffff" />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>{isHumanMode ? 'Live Artist Support' : 'Tattoo AI Assistant'}</Text>
              <Text style={styles.headerSubtitle}>{isHumanMode ? 'Chatting with a person' : 'Always here to help'}</Text>
            </View>
            <TouchableOpacity onPress={toggleMode} style={styles.modeToggle}>
              <Ionicons name={isHumanMode ? "hardware-chip-outline" : "person-outline"} size={20} color="#ffffff" />
              <Text style={styles.modeToggleText}>{isHumanMode ? "AI" : "Live"}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {(isHumanMode ? humanMessages : botMessages).map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageWrapper,
                (message.sender === 'user' || message.sender === currentUserName) ? styles.messageWrapperUser : 
                message.sender === 'system' ? styles.messageWrapperSystem : styles.messageWrapperBot
              ]}
            >
              {message.sender === 'system' ? (
                <Text style={styles.systemText}>{message.text}</Text>
              ) : (
              <View style={[
                styles.messageBubble,
                (message.sender === 'user' || message.sender === currentUserName) ? styles.messageBubbleUser : styles.messageBubbleBot,
                message.isError && styles.messageBubbleError,
              ]}>
                <Text style={[
                  styles.messageText,
                  (message.sender === 'user' || message.sender === currentUserName) ? styles.messageTextUser : styles.messageTextBot
                ]}>
                  {message.text}
                </Text>
                <Text style={[
                  styles.messageTime,
                  (message.sender === 'user' || message.sender === currentUserName) ? styles.messageTimeUser : styles.messageTimeBot
                ]}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              )}
            </View>
          ))}

          {isLoading && (
            <View style={styles.typingIndicator}>
              <ActivityIndicator size="small" color="#6b7280" />
              <Text style={styles.typingText}>Assistant is typing...</Text>
            </View>
          )}

          {!isLoading && !isHumanMode && botMessages.length === 1 && (
            <View style={styles.quickQuestionsContainer}>
              <Text style={styles.quickQuestionsLabel}>Quick questions:</Text>
              <View style={styles.quickQuestionsButtons}>
                {quickQuestions.map((question, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => sendMessage(question)}
                    style={styles.quickQuestionButton}
                  >
                    <Text style={styles.quickQuestionText}>{question}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={isHumanMode ? "Type a message to an artist..." : "Ask me anything about tattoos..."}
            placeholderTextColor="#9ca3af"
            value={inputValue}
            onChangeText={setInputValue}
            editable={!isLoading || isHumanMode}
            multiline
          />
          <TouchableOpacity onPress={handleSend} disabled={isLoading && !isHumanMode}>
            <LinearGradient
              colors={['#000000', '#daa520']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sendButton}
            >
              <Ionicons name="send" size={20} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    padding: 24,
    paddingTop: 60,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.9,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6
  },
  modeToggleText: {
    color: '#ffffff', fontSize: 12, fontWeight: '700'
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  messageWrapperUser: {
    alignItems: 'flex-end',
  },
  messageWrapperBot: {
    alignItems: 'flex-start',
  },
  messageWrapperSystem: {
    alignItems: 'center',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
  },
  messageBubbleUser: {
    backgroundColor: '#000000',
  },
  messageBubbleBot: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  messageBubbleError: {
    backgroundColor: '#FFDDDD',
    borderColor: '#D9534F',
    borderWidth: 1,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  messageTextUser: {
    color: '#ffffff',
  },
  messageTextBot: {
    color: '#111827',
  },
  messageTime: {
    fontSize: 12,
  },
  messageTimeUser: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  messageTimeBot: {
    color: '#9ca3af',
  },
  systemText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    fontStyle: 'italic'
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  typingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  quickQuestionsContainer: {
    marginTop: 16,
  },
  quickQuestionsLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  quickQuestionsButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickQuestionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  quickQuestionText: {
    fontSize: 14,
    color: '#374151',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
