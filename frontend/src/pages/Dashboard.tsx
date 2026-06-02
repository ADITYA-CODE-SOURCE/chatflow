import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { chatApi, presenceApi, resolveMediaUrl } from '../services/api';
import { useAuthStore, useChatStore } from '../stores';
import type { ChatRoom, Message, TypingIndicator, User } from '../types';
import NewChatModal from '../components/NewChatModal';
import GroupSettingsModal from '../components/GroupSettingsModal';
import Toast from '../components/Toast';
import './Dashboard.css';

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function normalizeMessage(message: Message): Message {
  return {
    ...message,
    attachmentUrl: resolveMediaUrl(message.attachmentUrl),
    seenByNames: message.seenByNames || [],
    readByCount: message.readByCount || 0,
    deleted: !!message.deleted,
  };
}

function normalizeRoom(room: ChatRoom): ChatRoom {
  return {
    ...room,
    avatarUrl: resolveMediaUrl(room.avatarUrl),
    lastMessage: room.lastMessage ? normalizeMessage(room.lastMessage) : undefined,
    pinnedMessage: room.pinnedMessage ? normalizeMessage(room.pinnedMessage) : undefined,
    unreadCount: room.unreadCount || 0,
    memberCount: room.memberCount || 0,
    muted: !!room.muted,
  };
}

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const {
    chatRooms,
    setChatRooms,
    currentRoom,
    setCurrentRoom,
    messages,
    setMessages,
    addMessage,
    updateChatRoom,
    removeChatRoom,
    upsertChatRoom,
    updateMessage,
  } = useChatStore();

  const [messageInput, setMessageInput] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const [directPeer, setDirectPeer] = useState<User | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [createGroupLoading, setCreateGroupLoading] = useState(false);
  const [createGroupError, setCreateGroupError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stompClientRef = useRef<Client | null>(null);
  const roomSubscriptionsRef = useRef<Array<{ unsubscribe: () => void }>>([]);
  const globalSubscriptionsRef = useRef<Array<{ unsubscribe: () => void }>>([]);
  const typingResetTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const isTypingRef = useRef(false);
  const presenceMapRef = useRef<Record<string, User>>({});
  const currentRoomIdRef = useRef<string | null>(null);
  const directPeerRef = useRef<User | null>(null);

  const sortedRooms = useMemo(() => {
    return [...chatRooms].sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [chatRooms]);

  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const stopTyping = useCallback(() => {
    if (!isTypingRef.current || !currentRoomIdRef.current) return;
    isTypingRef.current = false;
    void chatApi.sendTyping(currentRoomIdRef.current, false);
    if (typingResetTimeoutRef.current) {
      window.clearTimeout(typingResetTimeoutRef.current);
      typingResetTimeoutRef.current = null;
    }
  }, []);

  const chooseFallbackRoom = useCallback((deletedRoomId?: string) => {
    const remaining = sortedRooms.filter((room) => room.id !== deletedRoomId);
    setCurrentRoom(remaining[0] || null);
  }, [setCurrentRoom, sortedRooms]);

  const handleRoomDeleted = useCallback((roomId: string) => {
    const wasCurrent = currentRoom?.id === roomId;
    removeChatRoom(roomId);
    if (wasCurrent) {
      chooseFallbackRoom(roomId);
    }
  }, [chooseFallbackRoom, currentRoom?.id, removeChatRoom]);

  const loadChatRooms = useCallback(async (preferredRoomId?: string) => {
    try {
      const response = await chatApi.getChatRooms();
      const rooms = response.data.map(normalizeRoom);
      setChatRooms(rooms);

      const keepId = preferredRoomId || currentRoomIdRef.current;
      if (!keepId) {
        if (!currentRoomIdRef.current && rooms[0]) setCurrentRoom(rooms[0]);
        return;
      }

      const nextRoom = rooms.find((room) => room.id === keepId) || rooms[0] || null;
      setCurrentRoom(nextRoom);
    } catch (error) {
      console.error('Failed to load chat rooms:', error);
      showToast('Failed to load chat rooms', 'error');
    }
  }, [setChatRooms, setCurrentRoom, showToast]);

  const loadMessages = useCallback(async (roomId: string) => {
    try {
      const response = await chatApi.getMessages(roomId);
      setMessages(response.data.content.reverse().map(normalizeMessage));
      await chatApi.markRoomAsRead(roomId);
      updateChatRoom(roomId, (room) => ({ ...room, unreadCount: 0 }));
    } catch (error) {
      console.error('Failed to load messages:', error);
      showToast('Failed to load messages', 'error');
    }
  }, [setMessages, showToast, updateChatRoom]);

  const loadDirectPeer = useCallback(async (roomId: string) => {
    try {
      const response = await chatApi.getParticipants(roomId);
      const peer = (response.data || []).find((participant) => participant.id !== user?.id) || null;
      setDirectPeer(peer || null);
      if (peer) {
        presenceMapRef.current[peer.id] = peer;
      }
    } catch {
      setDirectPeer(null);
    }
  }, [user?.id]);

  const subscribeGlobal = useCallback(() => {
    const client = stompClientRef.current;
    if (!client?.connected) return;

    globalSubscriptionsRef.current.forEach((sub) => sub.unsubscribe());
    globalSubscriptionsRef.current = [
      client.subscribe('/topic/groups/deleted', (frame) => {
        const payload = JSON.parse(frame.body) as { roomId: string };
        handleRoomDeleted(payload.roomId);
        showToast('A group was deleted', 'success');
      }),
      client.subscribe('/topic/presence', (frame) => {
        const payload = JSON.parse(frame.body) as { userId: string; displayName: string; online: boolean; lastSeen?: string };
        presenceMapRef.current[payload.userId] = {
          ...(presenceMapRef.current[payload.userId] || {}),
          ...payload,
          id: payload.userId,
          isOnline: payload.online,
        } as User;

        const peer = directPeerRef.current;
        if (peer && peer.id === payload.userId) {
          setDirectPeer((prev) => prev ? {
            ...prev,
            isOnline: payload.online,
            lastSeen: payload.lastSeen,
          } : prev);
        }
      }),
    ];
  }, [handleRoomDeleted, showToast]);

  const subscribeToCurrentRoom = useCallback(() => {
    const client = stompClientRef.current;
    roomSubscriptionsRef.current.forEach((sub) => sub.unsubscribe());
    roomSubscriptionsRef.current = [];

    const roomId = currentRoomIdRef.current;
    if (!client?.connected || !roomId) return;

    roomSubscriptionsRef.current = [
      client.subscribe(`/topic/chat/${roomId}`, (frame) => {
        const incomingMessage = normalizeMessage(JSON.parse(frame.body) as Message);
        addMessage(incomingMessage);
        updateChatRoom(roomId, (room) => ({
          ...room,
          lastMessage: incomingMessage,
          unreadCount: 0,
        }));
      }),
      client.subscribe(`/topic/chat/${roomId}/typing`, (frame) => {
        const indicator = JSON.parse(frame.body) as TypingIndicator;
        if (indicator.userId === user?.id) return;
        setTypingUsers((prev) => {
          if (indicator.typing) {
            return prev.includes(indicator.userName) ? prev : [...prev, indicator.userName];
          }
          return prev.filter((name) => name !== indicator.userName);
        });
      }),
      client.subscribe(`/topic/chat/${roomId}/room-updated`, (frame) => {
        const room = normalizeRoom(JSON.parse(frame.body) as ChatRoom);
        upsertChatRoom(room);
      }),
      client.subscribe(`/topic/chat/${roomId}/message-updated`, (frame) => {
        const updated = normalizeMessage(JSON.parse(frame.body) as Message);
        updateMessage(updated.id, () => updated);
        updateChatRoom(roomId, (room) => ({ ...room, lastMessage: updated }));
      }),
      client.subscribe(`/topic/chat/${roomId}/message-deleted`, (frame) => {
        const updated = normalizeMessage(JSON.parse(frame.body) as Message);
        updateMessage(updated.id, () => updated);
        updateChatRoom(roomId, (room) => ({ ...room, lastMessage: updated }));
      }),
      client.subscribe(`/topic/chat/${roomId}/read-receipts`, () => {}),
    ];
  }, [addMessage, updateChatRoom, updateMessage, upsertChatRoom, user?.id]);

  useEffect(() => {
    void loadChatRooms();
  }, []);

  useEffect(() => {
    if (!user) return;

    void presenceApi.online();
    const onBeforeUnload = () => {
      void presenceApi.offline();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      void presenceApi.offline();
    };
  }, [user]);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      reconnectDelay: 3000,
      onConnect: () => {
        subscribeGlobal();
        subscribeToCurrentRoom();
      },
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      roomSubscriptionsRef.current.forEach((sub) => sub.unsubscribe());
      globalSubscriptionsRef.current.forEach((sub) => sub.unsubscribe());
      if (typingResetTimeoutRef.current) window.clearTimeout(typingResetTimeoutRef.current);
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      client.deactivate();
    };
  }, [subscribeGlobal, subscribeToCurrentRoom]);

  useEffect(() => {
    currentRoomIdRef.current = currentRoom?.id || null;
  }, [currentRoom?.id]);

  useEffect(() => {
    directPeerRef.current = directPeer;
  }, [directPeer]);

  useEffect(() => {
    if (!currentRoom) return;
    void loadMessages(currentRoom.id);
    setTypingUsers([]);
    setReplyTarget(null);
    setEditingMessageId(null);
    setEditingText('');
    setSearchQuery('');
    setSearchResults([]);
    if (currentRoom.roomType === 'DIRECT') {
      void loadDirectPeer(currentRoom.id);
    } else {
      setDirectPeer(null);
    }
    subscribeToCurrentRoom();
  }, [currentRoom?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!user) {
    return <div className="app-loading">Loading user...</div>;
  }

  const onPickImage = (file: File | null) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file) {
      setSelectedImage(null);
      setImagePreview(null);
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast('Only jpg, jpeg, png, gif, and webp images are allowed', 'error');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Image must be 5 MB or smaller', 'error');
      return;
    }
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
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
      void chatApi.sendTyping(currentRoom.id, true);
    }

    if (typingResetTimeoutRef.current) {
      window.clearTimeout(typingResetTimeoutRef.current);
    }

    typingResetTimeoutRef.current = window.setTimeout(() => stopTyping(), 1200);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRoom) return;

    if (editingMessageId) {
      try {
        const response = await chatApi.updateMessage(currentRoom.id, editingMessageId, messageInput.trim() || editingText);
        const updated = normalizeMessage(response.data);
        updateMessage(updated.id, () => updated);
        setEditingMessageId(null);
        setEditingText('');
        setMessageInput('');
        showToast('Message updated', 'success');
      } catch (error: any) {
        showToast(error?.response?.data?.message || 'Failed to update message', 'error');
      }
      return;
    }

    const hasText = !!messageInput.trim();
    const hasImage = !!selectedImage;
    if (!hasText && !hasImage) return;

    try {
      let attachmentUrl: string | undefined;
      let messageType: 'TEXT' | 'IMAGE' = 'TEXT';

      if (selectedImage) {
        attachmentUrl = await chatApi.uploadImage(selectedImage);
        messageType = 'IMAGE';
      }

      const response = await chatApi.sendMessage(currentRoom.id, {
        content: messageType === 'TEXT' ? messageInput.trim() : (messageInput.trim() || ''),
        messageType,
        attachmentUrl,
        replyToMessageId: replyTarget?.id,
      });

      const sent = normalizeMessage(response.data);
      if (!stompClientRef.current?.connected) {
        addMessage(sent);
      }

      updateChatRoom(currentRoom.id, (room) => ({
        ...room,
        lastMessage: sent,
        unreadCount: 0,
      }));

      setMessageInput('');
      setReplyTarget(null);
      setSelectedImage(null);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
      stopTyping();
    } catch (error: any) {
      console.error('Failed to send message:', error);
      showToast(error?.response?.data?.message || 'Failed to send message', 'error');
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newRoomName.trim();
    if (!trimmedName) {
      setCreateGroupError('Please enter a group name.');
      showToast('Please enter a group name.', 'error');
      return;
    }

    setCreateGroupLoading(true);
    setCreateGroupError('');

    try {
      const response = await chatApi.createGroupChat({
        name: trimmedName,
        description: newRoomDescription.trim() || undefined,
      });
      const room = normalizeRoom(response.data);
      upsertChatRoom(room);
      setCurrentRoom(room);
      setShowCreateModal(false);
      setNewRoomName('');
      setNewRoomDescription('');
      showToast('Group created', 'success');
    } catch (error: any) {
      console.error('Failed to create room:', error);
      const message = error?.response?.data?.message || 'Failed to create room';
      setCreateGroupError(message);
      showToast(message, 'error');
    } finally {
      setCreateGroupLoading(false);
    }
  };

  const copyInviteCode = async () => {
    if (!currentRoom?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(currentRoom.inviteCode);
      setCopiedInvite(true);
      showToast('Invite code copied', 'success');
      window.setTimeout(() => setCopiedInvite(false), 1200);
    } catch {
      showToast('Could not copy invite code', 'error');
    }
  };

  const handleSearchMessages = async () => {
    if (!currentRoom || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await chatApi.searchMessages(currentRoom.id, searchQuery.trim());
      setSearchResults(response.data.map(normalizeMessage));
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Search failed', 'error');
    } finally {
      setSearching(false);
    }
  };

  const startReply = (message: Message) => {
    setReplyTarget(message);
    setEditingMessageId(null);
    setEditingText('');
  };

  const startEdit = (message: Message) => {
    setReplyTarget(null);
    setEditingMessageId(message.id);
    setEditingText(message.content);
    setMessageInput(message.content);
  };

  const handleDeleteOwnMessage = async (message: Message) => {
    if (!currentRoom || !window.confirm('Delete this message?')) return;
    try {
      const response = await chatApi.deleteMessage(currentRoom.id, message.id);
      const deleted = normalizeMessage(response.data);
      updateMessage(deleted.id, () => deleted);
      showToast('Message deleted', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to delete message', 'error');
    }
  };

  const handlePinMessage = async (messageId?: string) => {
    if (!currentRoom) return;
    try {
      const response = await chatApi.pinMessage(currentRoom.id, messageId);
      const updatedRoom = normalizeRoom(response.data);
      upsertChatRoom(updatedRoom);
      showToast(messageId ? 'Message pinned' : 'Pinned message cleared', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to pin message', 'error');
    }
  };

  const toggleMute = async () => {
    if (!currentRoom) return;
    try {
      const response = await chatApi.setMuted(currentRoom.id, !currentRoom.muted);
      const updatedRoom = normalizeRoom(response.data);
      upsertChatRoom(updatedRoom);
      showToast(updatedRoom.muted ? 'Notifications muted' : 'Notifications unmuted', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to update notifications', 'error');
    }
  };

  const onEmojiClick = (emojiData: EmojiClickData) => {
    handleMessageInputChange(`${messageInput}${emojiData.emoji}`);
    setShowEmoji(false);
  };

  const currentStatus = (() => {
    if (typingUsers.length > 0) {
      return `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing...`;
    }
    if (currentRoom?.roomType === 'DIRECT' && directPeer) {
      if (directPeer.isOnline) return 'Online';
      if (directPeer.lastSeen) return `Last seen ${new Date(directPeer.lastSeen).toLocaleString()}`;
    }
    return currentRoom?.roomType === 'GROUP' ? `${currentRoom.memberCount} members` : 'Direct Message';
  })();

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">C</div>
            <div className="sidebar-brand-copy">
              <h2>ChatFlow</h2>
              <p>Realtime chat</p>
            </div>
          </div>
          <div className="sidebar-actions">
            <button className="btn sidebar-btn btn-primary" onClick={() => setShowNewChatModal(true)}>
              + New
            </button>
            <button className="btn sidebar-btn sidebar-btn-secondary" onClick={() => setShowCreateModal(true)}>
              Group
            </button>
          </div>
        </div>

        <div className="chat-room-list">
          {sortedRooms.map((room) => (
            <div
              key={room.id}
              className={`chat-room-item ${currentRoom?.id === room.id ? 'active' : ''}`}
              onClick={() => setCurrentRoom(room)}
            >
              <div className="chat-room-avatar">
                {room.avatarUrl ? <img src={room.avatarUrl} alt={room.name} /> : <span>{room.name?.charAt(0).toUpperCase()}</span>}
              </div>
              <div className="chat-room-info">
                <div className="chat-room-name-row">
                  <div className="chat-room-name">{room.name}</div>
                  {room.lastMessage?.createdAt && (
                    <div className="chat-room-time">
                      {new Date(room.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <div className="chat-room-preview">
                  {room.muted ? 'Muted · ' : ''}
                  {room.lastMessage?.messageType === 'IMAGE' ? 'Image' : room.lastMessage?.content || 'No messages yet'}
                </div>
              </div>
              {room.unreadCount > 0 && <div className="unread-badge">{room.unreadCount}</div>}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user.avatarUrl ? <img src={user.avatarUrl} alt={user.displayName} /> : <span>{user.displayName?.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="user-details">
              <div className="user-name">{user.displayName}</div>
              <div className="user-email">{user.email}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </aside>

      <main className="chat-main">
        {currentRoom ? (
          <>
            <header className="chat-header">
              <div className="chat-header-info">
                <div className="chat-header-name">{currentRoom.name}</div>
                <div className="chat-header-status">{currentStatus}</div>
              </div>

              <div className="chat-header-tools">
                <div className="chat-search">
                  <input
                    type="text"
                    className="input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search messages"
                  />
                  <button type="button" className="invite-copy" onClick={handleSearchMessages}>
                    {searching ? '...' : 'Search'}
                  </button>
                </div>

                {currentRoom.roomType === 'GROUP' && currentRoom.inviteCode && (
                  <div className="chat-header-invite">
                    <div className="invite-code" title="Invite code">
                      Code: <span>{currentRoom.inviteCode}</span>
                    </div>
                    <button type="button" className="invite-copy" onClick={copyInviteCode}>
                      {copiedInvite ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                <button type="button" className="group-settings-btn" onClick={toggleMute}>
                  {currentRoom.muted ? 'Unmute' : 'Mute'}
                </button>

                {currentRoom.roomType === 'GROUP' && (
                  <button type="button" className="group-settings-btn" onClick={() => setShowGroupSettings(true)}>
                    Settings
                  </button>
                )}
              </div>
            </header>

            {currentRoom.pinnedMessage && (
              <div className="pinned-banner">
                <div>
                  <strong>Pinned</strong> {currentRoom.pinnedMessage.content}
                </div>
                <button type="button" className="invite-copy" onClick={() => handlePinMessage(undefined)}>
                  Clear
                </button>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="search-results-panel">
                {searchResults.map((message) => (
                  <div key={message.id} className="search-result-card">
                    <div className="search-result-title">{message.senderName}</div>
                    <div className="search-result-text">{message.content}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="messages-container">
              {messages.map((message) => {
                const isOwn = message.senderId === user.id;
                const canEdit = isOwn && message.messageType !== 'SYSTEM' && !message.deleted;
                return (
                  <div key={message.id} className={`message ${isOwn ? 'own' : ''} ${message.messageType === 'SYSTEM' ? 'system' : ''}`}>
                    {message.messageType !== 'SYSTEM' && (
                      <div className="message-avatar">
                        {message.senderAvatarUrl ? <img src={resolveMediaUrl(message.senderAvatarUrl)} alt={message.senderName} /> : <span>{message.senderName.charAt(0).toUpperCase()}</span>}
                      </div>
                    )}
                    <div className="message-content">
                      {message.messageType !== 'SYSTEM' && (
                        <div className="message-header">
                          <span className="message-sender">{message.senderName}</span>
                          <span className="message-time">
                            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}

                      {message.replyToContent && (
                        <div className="message-reply-quote">
                          <strong>{message.replyToSenderName}</strong>
                          <span>{message.replyToContent}</span>
                        </div>
                      )}

                      {message.messageType === 'SYSTEM' ? (
                        <div className="system-message-pill">{message.content}</div>
                      ) : message.messageType === 'IMAGE' && message.attachmentUrl ? (
                        <div className="message-text message-media">
                          <img className="message-image" src={message.attachmentUrl} alt="shared" onClick={() => setLightboxImage(message.attachmentUrl || null)} />
                          {message.content && <div className="message-caption">{message.content}</div>}
                        </div>
                      ) : (
                        <div className={`message-text ${message.deleted ? 'message-deleted' : ''}`}>{message.content}</div>
                      )}

                      {message.messageType !== 'SYSTEM' && (
                        <div className="message-actions-row">
                          <button type="button" className="message-action-btn" onClick={() => startReply(message)}>Reply</button>
                          {canEdit && <button type="button" className="message-action-btn" onClick={() => startEdit(message)}>Edit</button>}
                          {canEdit && <button type="button" className="message-action-btn danger" onClick={() => handleDeleteOwnMessage(message)}>Delete</button>}
                          {currentRoom.roomType === 'GROUP' && !message.deleted && (
                            <button type="button" className="message-action-btn" onClick={() => handlePinMessage(message.id)}>Pin</button>
                          )}
                        </div>
                      )}

                      {isOwn && message.messageType !== 'SYSTEM' && (
                        <div className="message-read-state">
                          {message.editedAt && <span>Edited</span>}
                          {message.readByCount > 0 ? <span>Seen by {message.seenByNames.join(', ')}</span> : <span>Sent</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {replyTarget && (
              <div className="composer-banner">
                <div>
                  Replying to <strong>{replyTarget.senderName}</strong>
                  <span>{replyTarget.content}</span>
                </div>
                <button type="button" className="invite-copy" onClick={() => setReplyTarget(null)}>Cancel</button>
              </div>
            )}

            {editingMessageId && (
              <div className="composer-banner">
                <div>
                  Editing message
                  <span>{editingText}</span>
                </div>
                <button
                  type="button"
                  className="invite-copy"
                  onClick={() => {
                    setEditingMessageId(null);
                    setEditingText('');
                    setMessageInput('');
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            <form className="message-input-form" onSubmit={handleSendMessage}>
              <label className="attach-btn" title="Attach image">
                📷
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => onPickImage(e.target.files?.[0] || null)}
                />
              </label>

              <div className="emoji-wrap">
                <button type="button" className="emoji-btn" onClick={() => setShowEmoji((v) => !v)} aria-label="Emoji">
                  🙂
                </button>
                {showEmoji && (
                  <div className="emoji-popover">
                    <EmojiPicker onEmojiClick={onEmojiClick} height={360} width={300} />
                  </div>
                )}
              </div>

              <input
                type="text"
                className="input message-input"
                value={messageInput}
                onChange={(e) => handleMessageInputChange(e.target.value)}
                onBlur={stopTyping}
                placeholder={editingMessageId ? 'Edit your message...' : 'Type a message...'}
              />
              <button type="submit" className="btn btn-primary send-btn">
                {editingMessageId ? 'Save' : 'Send'}
              </button>
            </form>

            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="preview" />
                <button type="button" onClick={() => onPickImage(null)}>Remove</button>
              </div>
            )}
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
            <h3>Create New Group</h3>
            <p className="modal-subtitle">Start a shared room with an invite code and owner permissions.</p>
            <form onSubmit={handleCreateRoom}>
              {createGroupError && <div className="error-message">{createGroupError}</div>}
              <div className="form-group">
                <label>Group Name</label>
                <input
                  type="text"
                  className="input"
                  value={newRoomName}
                  maxLength={100}
                  onChange={(e) => {
                    setNewRoomName(e.target.value);
                    if (createGroupError) setCreateGroupError('');
                  }}
                  placeholder="Enter group name"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  className="input"
                  value={newRoomDescription}
                  maxLength={1000}
                  onChange={(e) => setNewRoomDescription(e.target.value)}
                  placeholder="Enter description"
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowCreateModal(false)} disabled={createGroupLoading}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={createGroupLoading}>
                  {createGroupLoading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <NewChatModal
        open={showNewChatModal}
        onClose={() => setShowNewChatModal(false)}
        onRoomCreatedOrJoined={async (room) => {
          await loadChatRooms(room?.id);
          if (room) setCurrentRoom(normalizeRoom(room));
        }}
      />

      {currentRoom && currentRoom.roomType === 'GROUP' && (
        <GroupSettingsModal
          open={showGroupSettings}
          room={currentRoom}
          currentUser={user}
          onClose={() => setShowGroupSettings(false)}
          onUpdated={async (room) => {
            if (room) {
              upsertChatRoom(normalizeRoom(room));
            }
            await loadChatRooms(currentRoom.id);
          }}
          onDeleted={(roomId) => handleRoomDeleted(roomId)}
          onToast={showToast}
        />
      )}

      {lightboxImage && (
        <div className="modal-overlay lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="lightbox-card" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxImage} alt="Full preview" />
            <button type="button" className="newchat-close lightbox-close" onClick={() => setLightboxImage(null)}>
              ×
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
