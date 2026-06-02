import axios from 'axios';
import type { AuthResponse, User, ChatRoom, Message, GroupInvite } from '../types';

export const API_ORIGIN = 'http://localhost:8080';

export function resolveMediaUrl(url?: string | null) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${API_ORIGIN}${url}`;
  return `${API_ORIGIN}/${url}`;
}

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  // Never attach Authorization to auth endpoints.
  const url = config.url || '';
  const isAuthEndpoint = url.startsWith('/auth/') || url.startsWith('/api/auth/');

  if (!isAuthEndpoint) {
    const token = (() => {
      try {
        const raw = localStorage.getItem('auth-storage');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.state?.accessToken ?? null;
      } catch {
        return null;
      }
    })();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 403) {
      // Common case: stale/invalid token in localStorage. Clear and force login.
      localStorage.removeItem('auth-storage');
      // Avoid hard reload loops; let the router handle it.
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      const refreshToken = (() => {
        try {
          const raw = localStorage.getItem('auth-storage');
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          return parsed?.state?.refreshToken ?? null;
        } catch {
          return null;
        }
      })();
      if (refreshToken) {
        try {
          const response = await axios.post('/api/auth/refresh', { refreshToken });
          // Update zustand persisted auth state.
          try {
            const raw = localStorage.getItem('auth-storage');
            const parsed = raw ? JSON.parse(raw) : { state: {} };
            const next = {
              ...parsed,
              state: {
                ...(parsed.state || {}),
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken,
              },
            };
            localStorage.setItem('auth-storage', JSON.stringify(next));
          } catch {
            // If storage is corrupted, fall back to forcing login.
            localStorage.removeItem('auth-storage');
            window.location.href = '/login';
            return Promise.reject(error);
          }

          error.config.headers.Authorization = `Bearer ${response.data.accessToken}`;
          return api.request(error.config);
        } catch {
          localStorage.removeItem('auth-storage');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  register: (data: { email: string; password: string; displayName: string }) =>
    api.post<AuthResponse>('/auth/register', data),
  
  login: (data: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', data),
  
  refresh: (refreshToken: string) =>
    api.post<AuthResponse>('/auth/refresh', { refreshToken }),
};

export const chatApi = {
  getChatRooms: () => api.get<ChatRoom[]>('/chat-rooms'),

  createDirectChat: (userId: string) => api.post<ChatRoom>('/chat-rooms/direct', { userId }),

  joinGroupByInvite: (inviteCode: string) => api.post<ChatRoom>(`/groups/join/${encodeURIComponent(inviteCode)}`),
  
  createGroupChat: (data: { name: string; description?: string }) =>
    api.post<ChatRoom>('/chat-rooms', data),
  
  getChatRoom: (roomId: string) => api.get<ChatRoom>(`/chat-rooms/${roomId}`),
  
  getMessages: (roomId: string, page = 0, size = 50) =>
    api.get<{ content: Message[] }>(`/chat-rooms/${roomId}/messages`, {
      params: { page, size },
    }),

  markRoomAsRead: (roomId: string) => api.post(`/chat-rooms/${roomId}/read`),

  sendMessage: (roomId: string, data: { content: string; messageType?: 'TEXT' | 'IMAGE' | 'FILE'; attachmentUrl?: string; replyToMessageId?: string }) =>
    api.post<Message>(`/chat-rooms/${roomId}/messages`, data),

  updateMessage: (roomId: string, messageId: string, content: string) =>
    api.put<Message>(`/chat-rooms/${roomId}/messages/${messageId}`, { content }),

  deleteMessage: (roomId: string, messageId: string) =>
    api.delete<Message>(`/chat-rooms/${roomId}/messages/${messageId}`),

  uploadImage: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<{ url: string }>('/uploads/image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.url;
  },

  sendTyping: (roomId: string, typing: boolean) =>
    api.post(`/chat-rooms/${roomId}/typing`, { typing }),

  searchMessages: (roomId: string, q: string) =>
    api.get<Message[]>(`/chat-rooms/${roomId}/messages/search`, { params: { q } }),
  
  getParticipants: (roomId: string) =>
    api.get<User[]>(`/chat-rooms/${roomId}/participants`),

  getGroupMembers: (roomId: string) =>
    api.get<any[]>(`/chat-rooms/${roomId}/members`),

  updateGroup: (roomId: string, data: { name?: string; description?: string; avatarUrl?: string }) =>
    api.put(`/chat-rooms/${roomId}`, data),

  leaveGroup: (roomId: string) => api.post(`/chat-rooms/${roomId}/leave`),

  addMember: (roomId: string, userId: string) => api.post(`/chat-rooms/${roomId}/members`, { userId }),

  removeMember: (roomId: string, userId: string) => api.delete(`/chat-rooms/${roomId}/members/${userId}`),

  promoteAdmin: (roomId: string, userId: string) => api.post(`/chat-rooms/${roomId}/admins/${userId}`),

  demoteAdmin: (roomId: string, userId: string) => api.delete(`/chat-rooms/${roomId}/admins/${userId}`),

  deleteGroup: (roomId: string) => api.delete(`/chat-rooms/${roomId}`),

  getGroupInvite: (roomId: string) => api.get<GroupInvite>(`/groups/${roomId}/invite`),

  regenerateInvite: (roomId: string) => api.post<GroupInvite>(`/groups/${roomId}/regenerate-invite`),

  setMuted: (roomId: string, muted: boolean) => api.put<ChatRoom>(`/chat-rooms/${roomId}/mute`, { muted }),

  pinMessage: (roomId: string, messageId?: string) => api.put<ChatRoom>(`/chat-rooms/${roomId}/pin`, { messageId }),
};

export const userApi = {
  me: () => api.get<User>('/users/me'),
  search: (q: string, page = 0, size = 20) =>
    api.get<{ content: User[] }>('/users/search', { params: { q, page, size } }),
};

export const presenceApi = {
  online: () => api.post('/presence/online'),
  offline: () => api.post('/presence/offline'),
};

export default api;
