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

export interface ReactionSummary {
  emoji: string;
  count: number;
  reactedByCurrentUser: boolean;
  userNames: string[];
}

export interface ChatRoom {
  id: string;
  name?: string;
  description?: string;
  avatarUrl?: string;
  inviteCode?: string;
  inviteCodeExpiresAt?: string;
  roomType: 'DIRECT' | 'GROUP';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  unreadCount: number;
  memberCount: number;
  muted: boolean;
  lastMessage?: Message;
  pinnedMessage?: Message;
}

export interface Message {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  attachmentUrl?: string;
  createdAt: string;
  isRead: boolean;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToContent?: string;
  editedAt?: string;
  deleted: boolean;
  readByCount: number;
  seenByNames: string[];
  reactions: ReactionSummary[];
}

export interface TypingIndicator {
  chatRoomId: string;
  userId: string;
  userName: string;
  typing: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface GroupInvite {
  groupId: string;
  inviteCode: string;
  inviteLink: string;
  expiresAt?: string;
}

export interface UploadResult {
  url: string;
  fileName: string;
  contentType?: string;
  size: number;
}
