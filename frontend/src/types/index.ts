export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface ChatRoom {
  id: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  roomType: 'DIRECT' | 'GROUP';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  unreadCount: number;
  lastMessage?: Message;
}

export interface Message {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'FILE';
  attachmentUrl?: string;
  createdAt: string;
  isRead: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
