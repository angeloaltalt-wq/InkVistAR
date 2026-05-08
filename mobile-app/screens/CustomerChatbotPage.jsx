/**
 * CustomerChatbotPage.jsx -- AI + Live Support Chat
 * Themed with lucide icons. Preserves dual-mode: AI bot + Socket.IO live agent.
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Animated,
} from 'react-native';
import { ArrowLeft, Sparkles, User, Cpu, SendHorizontal, Wifi, WifiOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/context/ThemeContext';
import { AnimatedTouchable } from '../src/components/shared/AnimatedTouchable';
import { typography, borderRadius, shadows } from '../src/theme';
import { sendChatMessage, API_BASE_URL } from '../src/utils/api';
import io from 'socket.io-client';

// Connect socket directly to the backend origin (matches web-app SOCKET_URL pattern)
const socket = io(API_BASE_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
});

const AnimatedMessageBubble = ({ msg, currentUserName, theme, styles }) => {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(animValue, {
      toValue: 1,
      tension: 60,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, []);

  const translateY = animValue.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  
  return (
    <Animated.View style={[styles.msgWrap, (msg.sender === 'user' || msg.sender === currentUserName) ? styles.msgRight : msg.sender === 'system' ? styles.msgCenter : styles.msgLeft, { opacity: animValue, transform: [{ translateY }] }]}>
      {msg.sender === 'system' ? (
        <Text style={styles.systemText}>{msg.text}</Text>
      ) : (
        <View style={[styles.bubble, (msg.sender === 'user' || msg.sender === currentUserName) ? styles.bubbleUser : styles.bubbleBot, msg.isError && styles.bubbleError]}>
          <Text style={[styles.bubbleText, (msg.sender === 'user' || msg.sender === currentUserName) ? { color: theme.backgroundDeep } : { color: theme.textPrimary }]}>{msg.text}</Text>
          <Text style={[styles.bubbleTime, (msg.sender === 'user' || msg.sender === currentUserName) ? { color: 'rgba(255,255,255,0.6)' } : { color: theme.textTertiary }]}>
            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

export function CustomerChatbotPage({ onBack, userId, userName }) {
  const { theme } = useTheme();
  const styles = getStyles(theme);
  const [isHumanMode, setIsHumanMode] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [botMessages, setBotMessages] = useState([
    { id: 1, text: "Hi! I'm your tattoo design assistant. I can help with design ideas, placement, aftercare tips, and more. How can I help?", sender: 'bot', timestamp: new Date() },
  ]);
  const [humanMessages, setHumanMessages] = useState([
    { id: 'sys-1', sender: 'system', text: 'Welcome to Live Support.', timestamp: new Date() },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const scrollRef = useRef(null);

  const room = useMemo(() => userId ? `customer_${userId}` : `guest_${Math.random().toString(36).substr(2, 9)}`, [userId]);
  const currentUserName = userName || 'Guest User';
  const isShopOpen = useMemo(() => true, []); // Testing: always open

  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [botMessages, humanMessages, isHumanMode]);

  // Track socket connection status
  useEffect(() => {
    const onConnect = () => { console.log('[CHAT] Socket connected'); setIsConnected(true); };
    const onDisconnect = () => { console.log('[CHAT] Socket disconnected'); setIsConnected(false); };
    
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    
    // If already connected, set state
    if (socket.connected) setIsConnected(true);
    
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // Socket.IO room join + event handlers (mirrors web-app ChatWidget pattern)
  useEffect(() => {
    socket.emit('join_room', room);

    // When switching to human mode, immediately announce the session to the admin dashboard
    if (isHumanMode) {
      socket.emit('start_support_session', { room, name: currentUserName });
    }

    const onMsg = (data) => {
      if (data.room !== room) return;
      setHumanMessages(prev => [...prev, { id: Date.now() + Math.random(), sender: data.sender, text: data.text, timestamp: new Date() }]);
    };

    const onClose = () => {
      setIsHumanMode(false);
      setHumanMessages(prev => [...prev, { id: 'sys-reset', sender: 'system', text: 'Live chat ended by the agent. Returning to AI assistant.', timestamp: new Date() }]);
    };

    socket.on('receive_message', onMsg);
    socket.on('session_closed', onClose);

    return () => { socket.off('receive_message', onMsg); socket.off('session_closed', onClose); };
  }, [room, isHumanMode]);

  const handleSend = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessageHandler(inputValue);
  };

  const sendMessageHandler = async (text) => {
    if (text.trim().length === 0 || isLoading) return;
    if (inputValue === text) setInputValue('');

    if (isHumanMode) {
      const data = { room, sender: currentUserName, text: text.trim() };
      socket.emit('send_message', data);
      setHumanMessages(prev => [...prev, { id: Date.now(), sender: currentUserName, text: text.trim(), timestamp: new Date() }]);
    } else {
      const userMsg = { id: Date.now().toString(), text: text.trim(), sender: 'user', timestamp: new Date() };
      setBotMessages(prev => [...prev, userMsg]);
      setIsLoading(true);
      const response = await sendChatMessage(text.trim());
      setIsLoading(false);
      setBotMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), sender: 'bot', timestamp: new Date(),
        text: response.success ? response.response : (response.message || 'Sorry, something went wrong.'),
        isError: !response.success,
      }]);
    }
  };

  const toggleMode = () => {
    if (!isHumanMode && !isShopOpen) { Alert.alert('Agents Offline', 'Live support: 1 PM - 8 PM. Use AI Assistant for now.'); return; }
    if (!isHumanMode && !isConnected) { Alert.alert('Connection Issue', 'Unable to reach live support. Please check your internet connection and try again.'); return; }
    setIsHumanMode(!isHumanMode);
  };

  const quickQ = ['What style suits me?', 'Where should I place it?', 'How to care for new tattoos?', 'Does it hurt?'];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
              <ArrowLeft size={20} color={theme.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerIcon}>
              <Sparkles size={18} color={theme.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{isHumanMode ? 'Live Artist Support' : 'Tattoo AI Assistant'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {isHumanMode && (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isConnected ? theme.success : theme.error }} />
                )}
                <Text style={styles.headerSub}>
                  {isHumanMode ? (isConnected ? 'Connected to live support' : 'Reconnecting...') : 'Always here to help'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={toggleMode} style={styles.modeToggle}>
              {isHumanMode ? <Cpu size={16} color={theme.textSecondary} /> : <User size={16} color={theme.textSecondary} />}
              <Text style={styles.modeText}>{isHumanMode ? 'AI' : 'Live'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages */}
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.msgContent} showsVerticalScrollIndicator={false}>
          {(isHumanMode ? humanMessages : botMessages).map(msg => (
            <AnimatedMessageBubble key={msg.id} msg={msg} currentUserName={currentUserName} theme={theme} styles={styles} />
          ))}

          {isLoading && (
            <View style={styles.typingRow}><ActivityIndicator size="small" color={theme.textTertiary} /><Text style={styles.typingText}>Assistant is typing...</Text></View>
          )}

          {!isLoading && !isHumanMode && botMessages.length === 1 && (
            <View style={styles.quickWrap}>
              <Text style={styles.quickLabel}>Quick questions:</Text>
              <View style={styles.quickRow}>
                {quickQ.map((q, i) => (
                  <AnimatedTouchable key={i} onPress={() => sendMessageHandler(q)} style={styles.quickChip}>
                    <Text style={styles.quickChipText}>{q}</Text>
                  </AnimatedTouchable>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={[styles.input, isFocused && { borderColor: theme.gold, backgroundColor: theme.surface }]}
            placeholder={isHumanMode ? 'Type a message to an artist...' : 'Ask me anything about tattoos...'}
            placeholderTextColor={theme.textTertiary}
            value={inputValue}
            onChangeText={setInputValue}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            editable={!isLoading || isHumanMode}
            multiline
          />
          <AnimatedTouchable onPress={handleSend} disabled={isLoading && !isHumanMode} style={styles.sendBtn}>
            <SendHorizontal size={18} color={theme.backgroundDeep} />
          </AnimatedTouchable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { padding: 16, paddingTop: Platform.OS === 'ios' ? 16 : 52, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: theme.surface, ...shadows.subtle },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.surfaceLight, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.surfaceLight, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  headerTitle: { ...typography.body, fontWeight: '700', color: theme.textPrimary },
  headerSub: { ...typography.bodyXSmall, color: theme.textTertiary },
  modeToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: borderRadius.round, gap: 5 },
  modeText: { ...typography.bodyXSmall, color: theme.textSecondary, fontWeight: '700' },
  msgContent: { padding: 16, paddingBottom: 20 },
  msgWrap: { marginBottom: 14 },
  msgRight: { alignItems: 'flex-end' },
  msgLeft: { alignItems: 'flex-start' },
  msgCenter: { alignItems: 'center' },
  bubble: { maxWidth: '80%', borderRadius: borderRadius.xl, padding: 12, ...shadows.subtle },
  bubbleUser: { backgroundColor: theme.gold },
  bubbleBot: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  bubbleError: { backgroundColor: '#fee2e2', borderColor: theme.error, borderWidth: 1 },
  bubbleText: { ...typography.body, lineHeight: 21, marginBottom: 4 },
  bubbleTime: { ...typography.bodyXSmall },
  systemText: { ...typography.bodyXSmall, color: theme.textTertiary, textAlign: 'center', fontStyle: 'italic' },
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  typingText: { marginLeft: 8, ...typography.body, color: theme.textTertiary },
  quickWrap: { marginTop: 12 },
  quickLabel: { ...typography.bodySmall, color: theme.textSecondary, marginBottom: 10 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.surface, borderRadius: borderRadius.round, borderWidth: 1, borderColor: theme.border },
  quickChipText: { ...typography.bodySmall, color: theme.textPrimary },
  inputBar: { flexDirection: 'row', padding: 12, paddingBottom: Platform.OS === 'ios' ? 95 : 72, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border, gap: 10, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 42, maxHeight: 100, borderWidth: 1, borderColor: theme.border, borderRadius: 21, paddingHorizontal: 16, paddingVertical: 10, ...typography.body, color: theme.textPrimary, backgroundColor: theme.surfaceLight },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.gold, justifyContent: 'center', alignItems: 'center', ...shadows.subtle },
});
