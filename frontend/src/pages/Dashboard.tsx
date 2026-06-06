import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { chatApi, presenceApi, resolveMediaUrl, userApi, WS_ENDPOINT, API_ORIGIN } from '../services/api';
import { useAuthStore, useChatStore } from '../stores';
import type { ChatRoom, Message, TypingIndicator, UploadResult, User } from '../types';
import NewChatModal from '../components/NewChatModal';
import GroupSettingsModal from '../components/GroupSettingsModal';
import Toast from '../components/Toast';
import './Dashboard.css';

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

type ThemeMode = 'dark' | 'light';

type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER' | null;

const THEME_STORAGE_KEY = 'chatflow-theme';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉'];

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

function renderMentionText(text: string, memberNames: string[]) {
  if (!text) return text;

  const sortedNames = [...memberNames]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (sortedNames.length === 0) return text;

  const parts: Array<string | JSX.Element> = [];
  let index = 0;

  while (index < text.length) {
    const atIndex = text.indexOf('@', index);
    if (atIndex === -1) {
      parts.push(text.slice(index));
      break;
    }

    if (atIndex > index) {
      parts.push(text.slice(index, atIndex));
    }

    const match = sortedNames.find((name) => text.startsWith(`@${name}`, atIndex));
    if (match) {
      parts.push(<span key={`${atIndex}-${match}`} className="mention-highlight">@{match}</span>);
      index = atIndex + match.length + 1;
      continue;
    }

    parts.push('@');
    index = atIndex + 1;
  }

  return parts;
}

function normalizeMessage(message: Message): Message {
  return {
    ...message,
    attachmentUrl: resolveMediaUrl(message.attachmentUrl),
    seenByNames: message.seenByNames || [],
    readByCount: message.readByCount || 0,
    deleted: !!message.deleted,
    reactions: message.reactions || [],
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
  const { user, logout, updateUser } = useAuthStore();
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
  const [showSidebarMobile, setShowSidebarMobile] = useState(false);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState(user?.displayName || '');
  const [profileBio, setProfileBio] = useState(user?.bio || '');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(user?.avatarUrl || '');
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [roomMembers, setRoomMembers] = useState<User[]>([]);
  const [currentGroupRole, setCurrentGroupRole] = useState<GroupRole>(null);
  const [mentionResults, setMentionResults] = useState<User[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [deletingChat, setDeletingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const stompClientRef = useRef<Client | null>(null);
  const roomSubscriptionsRef = useRef<Array<{ unsubscribe: () => void }>>([]);
  const globalSubscriptionsRef = useRef<Array<{ unsubscribe: () => void }>>([]);
  const typingResetTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const mentionSearchTimeoutRef = useRef<number | null>(null);
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

  const loadRoomMembers = useCallback(async (room: ChatRoom) => {
    try {
      const response = await chatApi.getParticipants(room.id);
      const members = response.data || [];
      setRoomMembers(members);

      if (room.roomType === 'GROUP') {
        const memberResponse = await chatApi.getGroupMembers(room.id);
        const me = (memberResponse.data || []).find((member: any) => member.userId === user?.id);
        setCurrentGroupRole((me?.role as GroupRole) || null);
      } else {
        setCurrentGroupRole(null);
      }
    } catch {
      setRoomMembers([]);
      setCurrentGroupRole(null);
    }
  }, [user?.id]);

  const closeMentionPicker = useCallback(() => {
    if (mentionSearchTimeoutRef.current) {
      window.clearTimeout(mentionSearchTimeoutRef.current);
      mentionSearchTimeoutRef.current = null;
    }
    setMentionOpen(false);
    setMentionResults([]);
    setMentionQuery('');
    setMentionStartIndex(null);
    setActiveMentionIndex(0);
  }, []);

  const subscribeGlobal = useCallback(() => {
    const client = stompClientRef.current;
    if (!client?.connected) return;

    globalSubscriptionsRef.current.forEach((sub) => sub.unsubscribe());
    globalSubscriptionsRef.current = [
      client.subscribe('/topic/groups/deleted', (frame) => {
        const payload = JSON.parse(frame.body) as { roomId: string };
        handleRoomDeleted(payload.roomId);
        showToast('A chat was deleted', 'success');
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
    applyTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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
      webSocketFactory: () => new SockJS(WS_ENDPOINT),
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
      if (mentionSearchTimeoutRef.current) window.clearTimeout(mentionSearchTimeoutRef.current);
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
    const id = setInterval(() => {
      fetch(API_ORIGIN, { method: 'HEAD', mode: 'no-cors' }).catch(() => {});
    }, 600000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!currentRoom) return;
    setShowSidebarMobile(false);
    void loadMessages(currentRoom.id);
    void loadRoomMembers(currentRoom);
    setTypingUsers([]);
    setReplyTarget(null);
    setEditingMessageId(null);
    setEditingText('');
    setSearchQuery('');
    setSearchResults([]);
    closeMentionPicker();
    if (currentRoom.roomType === 'DIRECT') {
      void loadDirectPeer(currentRoom.id);
    } else {
      setDirectPeer(null);
    }
    subscribeToCurrentRoom();
  }, [closeMentionPicker, currentRoom?.id, loadRoomMembers]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setProfileDisplayName(user?.displayName || '');
    setProfileBio(user?.bio || '');
    setProfileAvatarUrl(user?.avatarUrl || '');
  }, [user?.avatarUrl, user?.bio, user?.displayName]);

  if (!user) {
    return <div className="app-loading">Loading user...</div>;
  }

  const onPickImage = (file: File | null) => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file) {
      setSelectedImage(null);
      setImagePreview(null);
      if (!selectedFile || ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
        setSelectedFile(null);
      }
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
    setSelectedFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const onPickFile = (file: File | null) => {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      showToast('File must be 15 MB or smaller', 'error');
      return;
    }

    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      onPickImage(file);
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }

    setSelectedImage(null);
    setSelectedFile(file);
  };

  const handleMessageInputChange = (value: string, caretPosition?: number | null) => {
    setMessageInput(value);

    const safeCaret = caretPosition ?? value.length;
    const textBeforeCaret = value.slice(0, safeCaret);
    const mentionMatch = textBeforeCaret.match(/(^|\s)@([^\s@]*)$/);

    if (currentRoom && mentionMatch) {
      const nextQuery = mentionMatch[2] || '';
      const startIndex = safeCaret - nextQuery.length - 1;
      setMentionQuery(nextQuery);
      setMentionStartIndex(startIndex);
      setMentionOpen(true);
      setActiveMentionIndex(0);

      if (mentionSearchTimeoutRef.current) {
        window.clearTimeout(mentionSearchTimeoutRef.current);
      }

      mentionSearchTimeoutRef.current = window.setTimeout(async () => {
        const roomId = currentRoom.id;
        try {
          const response = await chatApi.searchRoomMembers(roomId, nextQuery);
          if (currentRoomIdRef.current !== roomId) return;
          const filtered = (response.data || []).filter((member) => member.id !== user.id);
          setMentionResults(filtered);
          setMentionOpen(true);
        } catch {
          if (currentRoomIdRef.current !== roomId) return;
          setMentionResults([]);
        }
      }, 140);
    } else {
      closeMentionPicker();
    }

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
    if (!currentRoom || sendingMessage) return;

    if (editingMessageId) {
      setSendingMessage(true);
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
      } finally {
        setSendingMessage(false);
      }
      return;
    }

    const hasText = !!messageInput.trim();
    const hasUpload = !!selectedFile;
    if (!hasText && !hasUpload) return;

    setSendingMessage(true);
    try {
      let attachmentUrl: string | undefined;
      let messageType: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT';
      let fileUpload: UploadResult | null = null;

      if (selectedImage) {
        attachmentUrl = await chatApi.uploadImage(selectedImage);
        messageType = 'IMAGE';
      } else if (selectedFile) {
        fileUpload = await chatApi.uploadFile(selectedFile);
        attachmentUrl = fileUpload.url;
        messageType = 'FILE';
      }

      const response = await chatApi.sendMessage(currentRoom.id, {
        content: messageType === 'TEXT'
          ? messageInput.trim()
          : (messageInput.trim() || fileUpload?.fileName || selectedFile?.name || ''),
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
      setSelectedFile(null);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
      stopTyping();
    } catch (error: any) {
      console.error('Failed to send message:', error);
      showToast(error?.response?.data?.message || 'Failed to send message', 'error');
    } finally {
      setSendingMessage(false);
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

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!currentRoom) return;
    try {
      const response = await chatApi.toggleReaction(currentRoom.id, messageId, emoji);
      const updated = normalizeMessage(response.data);
      updateMessage(updated.id, () => updated);
      setActiveReactionMessageId(null);
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to update reaction', 'error');
    }
  };

  const insertMention = (member: User) => {
    const input = messageInputRef.current;
    const selectionEnd = input?.selectionStart ?? messageInput.length;
    const startIndex = mentionStartIndex ?? Math.max(0, selectionEnd - mentionQuery.length - 1);
    const nextValue = `${messageInput.slice(0, startIndex)}@${member.displayName} ${messageInput.slice(selectionEnd)}`;
    setMessageInput(nextValue);
    closeMentionPicker();

    window.requestAnimationFrame(() => {
      input?.focus();
      const caret = startIndex + member.displayName.length + 2;
      input?.setSelectionRange(caret, caret);
    });
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!mentionOpen || mentionResults.length === 0) {
      if (event.key === 'Escape') {
        closeMentionPicker();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveMentionIndex((value) => (value + 1) % mentionResults.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveMentionIndex((value) => (value - 1 + mentionResults.length) % mentionResults.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      insertMention(mentionResults[activeMentionIndex]);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMentionPicker();
    }
  };

  const handleDeleteChat = async () => {
    if (!currentRoom) return;
    setDeletingChat(true);
    try {
      await chatApi.deleteChat(currentRoom.id);
      handleRoomDeleted(currentRoom.id);
      setShowDeleteModal(false);
      showToast(currentRoom.roomType === 'GROUP' ? 'Group deleted' : 'Chat deleted', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to delete chat', 'error');
    } finally {
      setDeletingChat(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const response = await userApi.updateMe({
        displayName: profileDisplayName,
        bio: profileBio,
        avatarUrl: profileAvatarUrl,
      });

      const nextUser = {
        ...response.data,
        avatarUrl: resolveMediaUrl(response.data.avatarUrl),
      };

      updateUser(nextUser);
      setMessages(messages.map((message) =>
        message.senderId === nextUser.id
          ? { ...message, senderName: nextUser.displayName, senderAvatarUrl: nextUser.avatarUrl }
          : message
      ));
      await loadChatRooms(currentRoom?.id);
      setShowProfileModal(false);
      showToast('Profile updated', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to update profile', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleUploadProfileAvatar = async (file: File | null) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast('Only image files are allowed for avatars', 'error');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast('Avatar image must be 5 MB or smaller', 'error');
      return;
    }
    try {
      const url = await chatApi.uploadImage(file);
      setProfileAvatarUrl(url);
      showToast('Avatar uploaded', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to upload avatar', 'error');
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

  const memberNames = useMemo(() => roomMembers.map((member) => member.displayName).filter(Boolean), [roomMembers]);
  const canDeleteCurrentChat = !!currentRoom && (currentRoom.roomType === 'DIRECT' || currentGroupRole === 'OWNER' || currentGroupRole === 'ADMIN');

  return (
    <div className="dashboard">
      <aside className={`sidebar ${showSidebarMobile ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">C</div>
            <div className="sidebar-brand-copy">
              <h2>ChatFlow</h2>
              <p>Realtime chat</p>
            </div>
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
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

        <div className="sidebar-section-label">
          <span>Conversations</span>
          <strong>{sortedRooms.length}</strong>
        </div>

        <div className="chat-room-list">
          {sortedRooms.map((room) => (
            <div
              key={room.id}
              className={`chat-room-item ${currentRoom?.id === room.id ? 'active' : ''}`}
              onClick={() => {
                setCurrentRoom(room);
                setShowSidebarMobile(false);
              }}
            >
              <div className="chat-room-avatar">
                {room.avatarUrl ? <img src={room.avatarUrl} alt={room.name} /> : <span>{room.name?.charAt(0).toUpperCase()}</span>}
              </div>
              <div className="chat-room-info">
                <div className="chat-room-name-row">
                  <div className="chat-room-name">{room.name}</div>
                  <div className="chat-room-flags">
                    <span className={`chat-room-kind chat-room-kind-${room.roomType.toLowerCase()}`}>
                      {room.roomType === 'GROUP' ? 'Group' : 'Direct'}
                    </span>
                    {room.muted && <span className="chat-room-muted">Muted</span>}
                  </div>
                </div>
                <div className="chat-room-bottom-row">
                  <div className="chat-room-preview">
                    {room.lastMessage?.messageType === 'IMAGE'
                      ? 'Image'
                      : room.lastMessage?.messageType === 'FILE'
                        ? 'File'
                        : room.lastMessage?.content || 'No messages yet'}
                  </div>
                  <div className="chat-room-meta">
                    {room.lastMessage?.createdAt && (
                      <div className="chat-room-time">
                        {new Date(room.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {room.unreadCount > 0 && <div className="unread-badge">{room.unreadCount}</div>}
                  </div>
                </div>
              </div>
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
          <div className="sidebar-footer-actions">
            <button className="logout-btn" type="button" onClick={() => setShowProfileModal(true)}>Profile</button>
            <button className="logout-btn" type="button" onClick={logout}>Logout</button>
          </div>
        </div>
      </aside>

      <main className="chat-main">
        {currentRoom ? (
          <>
            <header className="chat-header">
              <div className="chat-header-info">
                <button
                  type="button"
                  className="mobile-sidebar-toggle"
                  onClick={() => setShowSidebarMobile((value) => !value)}
                >
                  {showSidebarMobile ? 'Close chats' : 'Open chats'}
                </button>
                <div className="chat-header-pill">{currentRoom.roomType === 'GROUP' ? 'Shared space' : 'Direct chat'}</div>
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

                {canDeleteCurrentChat && (
                  <button type="button" className="group-settings-btn delete-chat-btn" onClick={() => setShowDeleteModal(true)}>
                    Delete Chat
                  </button>
                )}
              </div>
            </header>

            {currentRoom.pinnedMessage && (
              <div className="pinned-banner">
                <div>
                  <strong>Pinned message</strong>
                  <span>{renderMentionText(currentRoom.pinnedMessage.content, memberNames)}</span>
                </div>
                <button type="button" className="invite-copy" onClick={() => handlePinMessage(undefined)}>
                  Clear
                </button>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="search-results-panel">
                <div className="search-results-heading">Search results</div>
                {searchResults.map((message) => (
                    <div key={message.id} className="search-result-card">
                      <div className="search-result-title">{message.senderName}</div>
                      <div className="search-result-text">{renderMentionText(message.content, memberNames)}</div>
                    </div>
                ))}
              </div>
            )}

            <div className="messages-container">
              <div className="messages-stack">
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

                      <div className="message-body-shell">
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
                            {message.content && <div className="message-caption">{renderMentionText(message.content, memberNames)}</div>}
                          </div>
                        ) : message.messageType === 'FILE' && message.attachmentUrl ? (
                          <a className="message-text file-card" href={message.attachmentUrl} target="_blank" rel="noreferrer">
                            <span className="file-card-icon">📎</span>
                            <span className="file-card-copy">
                              <strong>{renderMentionText(message.content || 'Download file', memberNames)}</strong>
                              <span>Open or download attachment</span>
                            </span>
                          </a>
                        ) : (
                          <div className={`message-text ${message.deleted ? 'message-deleted' : ''}`}>{renderMentionText(message.content, memberNames)}</div>
                        )}
                      </div>

                      {message.reactions.length > 0 && (
                        <div className="message-reactions-row">
                          {message.reactions.map((reaction) => (
                            <button
                              key={`${message.id}-${reaction.emoji}`}
                              type="button"
                              className={`reaction-chip ${reaction.reactedByCurrentUser ? 'active' : ''}`}
                              title={reaction.userNames.join(', ')}
                              onClick={() => handleToggleReaction(message.id, reaction.emoji)}
                            >
                              <span>{reaction.emoji}</span>
                              <strong>{reaction.count}</strong>
                            </button>
                          ))}
                        </div>
                      )}

                      {message.messageType !== 'SYSTEM' && (
                        <div className="message-actions-row">
                          <button type="button" className="message-action-btn" onClick={() => startReply(message)}>Reply</button>
                          {canEdit && <button type="button" className="message-action-btn" onClick={() => startEdit(message)}>Edit</button>}
                          {canEdit && <button type="button" className="message-action-btn danger" onClick={() => handleDeleteOwnMessage(message)}>Delete</button>}
                          {currentRoom.roomType === 'GROUP' && !message.deleted && (
                            <button type="button" className="message-action-btn" onClick={() => handlePinMessage(message.id)}>Pin</button>
                          )}
                          {!message.deleted && (
                            <button type="button" className="message-action-btn" onClick={() => setActiveReactionMessageId((value) => value === message.id ? null : message.id)}>React</button>
                          )}
                        </div>
                      )}

                      {activeReactionMessageId === message.id && (
                        <div className="reaction-picker-inline">
                          {QUICK_REACTIONS.map((emoji) => (
                            <button key={emoji} type="button" className="reaction-choice" onClick={() => handleToggleReaction(message.id, emoji)}>
                              {emoji}
                            </button>
                          ))}
                          <div className="reaction-picker-popover">
                            <EmojiPicker onEmojiClick={(emojiData) => void handleToggleReaction(message.id, emojiData.emoji)} height={320} width={280} />
                          </div>
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
              <div className="composer-main">
                <label className="attach-btn" title="Attach image">
                  📷
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => onPickImage(e.target.files?.[0] || null)}
                  />
                </label>

                <label className="attach-btn" title="Attach file">
                  📎
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => onPickFile(e.target.files?.[0] || null)}
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
                  ref={messageInputRef}
                  type="text"
                  className="input message-input"
                  value={messageInput}
                  onChange={(e) => handleMessageInputChange(e.target.value, e.target.selectionStart)}
                  onKeyDown={handleComposerKeyDown}
                  onBlur={() => {
                    stopTyping();
                    window.setTimeout(() => closeMentionPicker(), 120);
                  }}
                  placeholder={editingMessageId ? 'Edit your message...' : 'Type a message...'}
                />

                {mentionOpen && mentionResults.length > 0 && (
                  <div className="mention-popover">
                    {mentionResults.map((member, index) => (
                      <button
                        key={member.id}
                        type="button"
                        className={`mention-option ${index === activeMentionIndex ? 'active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertMention(member);
                        }}
                      >
                        <span className="mention-option-name">{member.displayName}</span>
                        <span className="mention-option-meta">{member.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-primary send-btn" disabled={sendingMessage}>
                {sendingMessage ? 'Sending...' : editingMessageId ? 'Save' : 'Send'}
              </button>
            </form>

            {(imagePreview || selectedFile) && (
              <div className="image-preview">
                {imagePreview ? <img src={imagePreview} alt="preview" /> : <div className="file-preview-icon">📎</div>}
                <div className="file-preview-copy">
                  <strong>{selectedFile?.name || 'Attachment ready'}</strong>
                  <span>{imagePreview ? 'Image ready to send' : 'File ready to send'}</span>
                </div>
                <button type="button" onClick={() => onPickImage(null)}>Remove</button>
              </div>
            )}
          </>
        ) : (
          <div className="no-chat-selected">
            <button type="button" className="mobile-sidebar-toggle mobile-sidebar-toggle-empty" onClick={() => setShowSidebarMobile(true)}>
              Browse conversations
            </button>
            <div className="no-chat-illustration">C</div>
            <h3>Select a conversation</h3>
            <p>Choose a chat from the sidebar, start a DM, or create a fresh group space.</p>
          </div>
        )}
      </main>

      {showSidebarMobile && <button type="button" className="sidebar-backdrop" onClick={() => setShowSidebarMobile(false)} aria-label="Close conversation list" />}

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

      {showProfileModal && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Profile</h3>
            <p className="modal-subtitle">Update your display name, bio, and avatar.</p>
            <form onSubmit={handleSaveProfile}>
              <div className="form-group">
                <label>Display Name</label>
                <input className="input" value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} maxLength={100} required />
              </div>
              <div className="form-group">
                <label>Bio</label>
                <textarea className="input" rows={3} value={profileBio} onChange={(e) => setProfileBio(e.target.value)} maxLength={500} />
              </div>
              <div className="form-group">
                <label>Avatar URL</label>
                <input className="input" value={profileAvatarUrl} onChange={(e) => setProfileAvatarUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div className="form-group">
                <label className="attach-btn profile-upload-btn">
                  Upload Avatar
                  <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={(e) => void handleUploadProfileAvatar(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowProfileModal(false)} disabled={profileSaving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={profileSaving}>{profileSaving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && currentRoom && (
        <div className="modal-overlay" onClick={() => !deletingChat && setShowDeleteModal(false)}>
          <div className="modal delete-chat-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete chat?</h3>
            <p className="modal-subtitle">
              {currentRoom.roomType === 'GROUP'
                ? `This permanently deletes ${currentRoom.name} for every member.`
                : `This permanently deletes your chat with ${currentRoom.name}.`}
            </p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setShowDeleteModal(false)} disabled={deletingChat}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void handleDeleteChat()} disabled={deletingChat}>
                {deletingChat ? 'Deleting...' : 'Delete Chat'}
              </button>
            </div>
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
        currentUserId={user.id}
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
