import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, KeyboardAvoidingView, Platform, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { io } from 'socket.io-client';
import { API_URL } from '../src/utils/api';

export const AdminChat = ({ navigation }) => {
  const [liveSessions, setLiveSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  const socketRef = useRef(null);
  const flatListRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selectedSession;
  }, [selectedSession]);

  useEffect(() => {
    // Connect to tracking socket to get sessions
    const socket = io(API_URL);
    socketRef.current = socket;

    socket.emit('join_admin_tracking');

    socket.on('support_sessions_update', (sessions) => {
      const sorted = [...sessions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setLiveSessions(sorted);

      const sel = selectedRef.current;
      if (sel && !sessions.find(s => s.id === sel.id)) {
          setSelectedSession(null);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (selectedSession && socketRef.current) {
      setMessages([]);
      socketRef.current.emit('join_room', selectedSession.id);
      
      socketRef.current.on('receive_message', (data) => {
        if (data.room === selectedSession.id) {
            setMessages(prev => [...prev, { sender: data.sender, text: data.text }]);
        }
      });
      
      return () => {
          socketRef.current.off('receive_message');
      }
    }
  }, [selectedSession]);

  const handleSendMessage = () => {
    const userMessage = inputValue.trim();
    if (!userMessage || !selectedSession) return;

    socketRef.current.emit('send_message', {
        room: selectedSession.id,
        sender: 'Admin',
        text: userMessage,
    });

    setMessages(prev => [...prev, { sender: 'Admin', text: userMessage }]);
    setInputValue('');
  };

  const handleCloseSession = () => {
    if (!selectedSession || !socketRef.current) return;
    socketRef.current.emit('close_session', { room: selectedSession.id });
    setLiveSessions(prev => prev.filter(s => s.id !== selectedSession.id));
    setSelectedSession(null);
  };

  const renderSessionItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.sessionCard, selectedSession?.id === item.id && styles.sessionCardActive]}
      onPress={() => setSelectedSession(item)}
    >
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionName}>{item.name}</Text>
        <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>Live</Text></View>
      </View>
      <Text style={styles.sessionPreview} numberOfLines={1}>{item.lastMessage}</Text>
      <Text style={styles.sessionTime}>{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
    </TouchableOpacity>
  );

  const renderMessage = ({ item }) => {
    const isAdmin = item.sender === 'Admin';
    return (
      <View style={[styles.msgWrapper, isAdmin ? styles.msgRight : styles.msgLeft]}>
        <View style={[styles.msgBubble, isAdmin ? styles.msgBubbleAdmin : styles.msgBubbleCustomer]}>
          <Text style={[styles.msgText, isAdmin && {color: 'white'}]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => {
              if (selectedSession) setSelectedSession(null);
              else navigation.goBack();
            }} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedSession ? selectedSession.name : 'Support Chat'}</Text>
        </View>
        {selectedSession && (
          <TouchableOpacity 
            style={{backgroundColor: '#ef4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6}}
            onPress={handleCloseSession}
          >
            <Text style={{color: 'white', fontWeight: 'bold', fontSize: 12}}>Close Session</Text>
          </TouchableOpacity>
        )}
      </View>

      {!selectedSession ? (
        // SESSION LIST VIEW
        <View style={{flex: 1}}>
          {liveSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={48} color="#374151" />
              <Text style={styles.emptyText}>No active support sessions.</Text>
            </View>
          ) : (
            <FlatList
              data={liveSessions}
              renderItem={renderSessionItem}
              keyExtractor={item => item.id}
              contentContainerStyle={{padding: 15}}
            />
          )}
        </View>
      ) : (
        // CHAT WINDOW VIEW
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, idx) => idx.toString()}
            contentContainerStyle={{padding: 15}}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({animated: true})}
          />
          <View style={styles.inputArea}>
            <TextInput
              style={styles.textInput}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="Type a message..."
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
              <Ionicons name="send" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: '#1f2937', borderBottomWidth: 1, borderBottomColor: '#374151' },
  backButton: { marginRight: 15, padding: 5 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  
  // List Styles
  sessionCard: { backgroundColor: '#1f2937', padding: 15, borderRadius: 12, marginBottom: 12 },
  sessionCardActive: { borderColor: '#0ea5e9', borderWidth: 1 },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  sessionName: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  liveBadge: { backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  liveBadgeText: { color: '#10b981', fontSize: 10, fontWeight: 'bold' },
  sessionPreview: { color: '#9ca3af', fontSize: 14, marginBottom: 5 },
  sessionTime: { color: '#6b7280', fontSize: 12, textAlign: 'right' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#9ca3af', marginTop: 10 },

  // Chat Styles
  msgWrapper: { marginBottom: 10, flexDirection: 'row' },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  msgBubble: { maxWidth: '80%', padding: 12, borderRadius: 15 },
  msgBubbleCustomer: { backgroundColor: '#374151', borderBottomLeftRadius: 0 },
  msgBubbleAdmin: { backgroundColor: '#0ea5e9', borderBottomRightRadius: 0 },
  msgText: { color: '#f3f4f6', fontSize: 15 },
  inputArea: { flexDirection: 'row', padding: 15, backgroundColor: '#1f2937', alignItems: 'center' },
  textInput: { flex: 1, backgroundColor: '#374151', color: 'white', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, marginRight: 10 },
  sendButton: { backgroundColor: '#0ea5e9', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }
});
