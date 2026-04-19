import { useState, useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { chatApi } from '../services/api';
import { useAuthStore, useChatStore } from '../stores';
import type { Message, TypingIndicator } from '../types';
import './Dashboard.css';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const { chatRooms, setChatRooms, currentRoom, setCurrentRoom, messages, setMessages, addMessage } = useChatStore();
  const [messageInput, setMessageInput] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stompClientRef = useRef<Client | null>(null);
  const roomMessageSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const roomTypingSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const typingResetTimeoutRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    loadChatRooms();
  }, []);

  useEffect(() => {
    if (currentRoom) {
      loadMessages(currentRoom.id);
    }
  }, [currentRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      reconnectDelay: 3000,
      onConnect: () => {
        subscribeToCurrentRoom();
      },
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      roomMessageSubRef.current?.unsubscribe();
      roomTypingSubRef.current?.unsubscribe();
      if (typingResetTimeoutRef.current) {
        window.clearTimeout(typingResetTimeoutRef.current);
      }
      client.deactivate();
    };
  }, []);

  useEffect(() => {
    subscribeToCurrentRoom();
    setTypingUsers([]);
  }, [currentRoom?.id]);

  const subscribeToCurrentRoom = () => {
    const client = stompClientRef.current;
    if (!client?.connected || !currentRoom) {
      roomMessageSubRef.current?.unsubscribe();
      roomTypingSubRef.current?.unsubscribe();
      roomMessageSubRef.current = null;
      roomTypingSubRef.current = null;
      return;
    }

    roomMessageSubRef.current?.unsubscribe();
    roomTypingSubRef.current?.unsubscribe();

    roomMessageSubRef.current = client.subscribe(`/topic/chat/${currentRoom.id}`, (frame) => {
      const incomingMessage = JSON.parse(frame.body) as Message;
      addMessage(incomingMessage);
    });

    roomTypingSubRef.current = client.subscribe(`/topic/chat/${currentRoom.id}/typing`, (frame) => {
      const indicator = JSON.parse(frame.body) as TypingIndicator;
      if (indicator.userId === user?.id) {
        return;
      }

      setTypingUsers((prev) => {
        if (indicator.typing) {
          return prev.includes(indicator.userName) ? prev : [...prev, indicator.userName];
        }
        return prev.filter((name) => name !== indicator.userName);
      });
    });
  };

  const loadChatRooms = async () => {
    try {
      const response = await chatApi.getChatRooms();
      setChatRooms(response.data);
    } catch (error) {
      console.error('Failed to load chat rooms:', error);
    }
  };

  const loadMessages = async (roomId: string) => {
    try {
      const response = await chatApi.getMessages(roomId);
      setMessages(response.data.content.reverse());
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !currentRoom) return;

    try {
      const response = await chatApi.sendMessage(currentRoom.id, {
        content: messageInput,
        messageType: 'TEXT',
      });

      if (!stompClientRef.current?.connected) {
        addMessage(response.data);
      }

      setMessageInput('');
      stopTyping();
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const sendTyping = async (typing: boolean) => {
    if (!currentRoom) return;
    try {
      await chatApi.sendTyping(currentRoom.id, typing);
    } catch (error) {
      console.error('Failed to send typing indicator:', error);
    }
  };

  const stopTyping = () => {
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    sendTyping(false);
    if (typingResetTimeoutRef.current) {
      window.clearTimeout(typingResetTimeoutRef.current);
      typingResetTimeoutRef.current = null;
    }
  };

  const handleMessageInputChange = (value: string) => {
    setMessageInput(value);

    if (!currentRoom) return;

    if (!value.trim()) {
      stopTyping();
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(true);
    }

    if (typingResetTimeoutRef.current) {
      window.clearTimeout(typingResetTimeoutRef.current);
    }

    typingResetTimeoutRef.current = window.setTimeout(() => {
      stopTyping();
    }, 1200);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    try {
      const response = await chatApi.createGroupChat({
        name: newRoomName,
        description: newRoomDescription,
      });
      setChatRooms([...chatRooms, response.data]);
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomDescription('');
    } catch (error) {
      console.error('Failed to create room:', error);
    }
  };

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>ChatFlow</h2>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + New
          </button>
        </div>

        <div className="chat-room-list">
          {chatRooms.map((room) => (
            <div
              key={room.id}
              className={`chat-room-item ${currentRoom?.id === room.id ? 'active' : ''}`}
              onClick={() => setCurrentRoom(room)}
            >
              <div className="chat-room-avatar">
                {room.avatarUrl ? (
                  <img src={room.avatarUrl} alt={room.name} />
                ) : (
                  <span>{room.name?.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="chat-room-info">
                <div className="chat-room-name">{room.name}</div>
                <div className="chat-room-preview">
                  {room.lastMessage?.content || 'No messages yet'}
                </div>
              </div>
              {room.unreadCount > 0 && (
                <div className="unread-badge">{room.unreadCount}</div>
              )}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName} />
              ) : (
                <span>{user?.displayName?.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="user-details">
              <div className="user-name">{user?.displayName}</div>
              <div className="user-email">{user?.email}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="chat-main">
        {currentRoom ? (
          <>
            <header className="chat-header">
              <div className="chat-header-info">
                <div className="chat-header-name">{currentRoom.name}</div>
                <div className="chat-header-status">
                  {typingUsers.length > 0
                    ? `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing...`
                    : currentRoom.roomType === 'GROUP'
                      ? 'Group Chat'
                      : 'Direct Message'}
                </div>
              </div>
            </header>

            <div className="messages-container">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.senderId === user?.id ? 'own' : ''}`}
                >
                  <div className="message-avatar">
                    {message.senderAvatarUrl ? (
                      <img src={message.senderAvatarUrl} alt={message.senderName} />
                    ) : (
                      <span>{message.senderName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-sender">{message.senderName}</span>
                      <span className="message-time">
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="message-text">{message.content}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="message-input-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                className="input message-input"
                value={messageInput}
                onChange={(e) => handleMessageInputChange(e.target.value)}
                onBlur={stopTyping}
                placeholder="Type a message..."
              />
              <button type="submit" className="btn btn-primary send-btn">
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="no-chat-selected">
            <h3>Select a conversation</h3>
            <p>Choose a chat from the sidebar or create a new one</p>
          </div>
        )}
      </main>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Chat</h3>
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label>Chat Name</label>
                <input
                  type="text"
                  className="input"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Enter chat name"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  className="input"
                  value={newRoomDescription}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  placeholder="Enter description"
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
