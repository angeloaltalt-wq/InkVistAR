import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import io from 'socket.io-client';
import { API_URL } from '../src/config'; // Assuming config is in src

const socket = io(API_URL);

const ChatScreen = ({ route }) => {
    // Get room and user from navigation parameters, with defaults
    const { room = 'test_room', currentUser = 'user2' } = route.params || {};

    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const flatListRef = useRef(null);

    useEffect(() => {
        // Join room on mount
        socket.emit('join_room', room);

        // System message for connection
        setMessages([{ sender: 'system', text: `Joined room: ${room}` }]);

        // Listener for incoming messages
        socket.on('receive_message', (data) => {
            if (data.room === room) {
                setMessages(prev => [...prev, { sender: data.sender, text: data.text }]);
            }
        });

        // Cleanup on unmount
        return () => {
            socket.off('receive_message');
        };
    }, [room]);


    const handleSendMessage = () => {
        const userMessage = inputValue.trim();
        if (!userMessage) return;

        const messageData = {
            room: room,
            sender: currentUser,
            text: userMessage,
        };

        socket.emit('send_message', messageData);

        setMessages(prev => [...prev, { sender: currentUser, text: userMessage }]);
        setInputValue('');
    };

    const renderItem = ({ item }) => {
        const isCurrentUser = item.sender === currentUser;
        return (
            <View style={[
                styles.messageContainer,
                isCurrentUser ? styles.currentUserMessageContainer : styles.otherUserMessageContainer
            ]}>
                <View style={[
                    styles.messageBubble,
                    isCurrentUser ? styles.currentUserMessageBubble : styles.otherUserMessageBubble
                ]}>
                    <Text style={isCurrentUser ? styles.currentUserMessageText : styles.otherUserMessageText}>
                        {item.text}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={90}
        >
            <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderItem}
                keyExtractor={(item, index) => index.toString()}
                contentContainerStyle={styles.messageList}
                onContentSizeChange={() => flatListRef.current.scrollToEnd({ animated: true })}
            />
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    value={inputValue}
                    onChangeText={setInputValue}
                    placeholder="Type a message..."
                />
                <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
                    <Text style={styles.sendButtonText}>Send</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    messageList: {
        paddingHorizontal: 10,
        paddingVertical: 20,
    },
    messageContainer: {
        marginVertical: 5,
    },
    currentUserMessageContainer: {
        alignItems: 'flex-end',
    },
    otherUserMessageContainer: {
        alignItems: 'flex-start',
    },
    messageBubble: {
        padding: 15,
        borderRadius: 20,
        maxWidth: '80%',
    },
    currentUserMessageBubble: {
        backgroundColor: '#007AFF',
    },
    otherUserMessageBubble: {
        backgroundColor: '#E5E5EA',
    },
    currentUserMessageText: {
        color: 'white',
    },
    otherUserMessageText: {
        color: 'black',
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: '#ddd',
        backgroundColor: 'white',
    },
    input: {
        flex: 1,
        height: 40,
        borderColor: '#ddd',
        borderWidth: 1,
        borderRadius: 20,
        paddingHorizontal: 15,
    },
    sendButton: {
        marginLeft: 10,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    sendButtonText: {
        color: '#007AFF',
        fontWeight: '600',
    },
});

export default ChatScreen;
