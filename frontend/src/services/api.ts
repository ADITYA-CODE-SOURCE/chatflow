import axios from 'axios';
import type { AuthResponse, User, ChatRoom, Message } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const response = await axios.post('/api/auth/refresh', { refreshToken });
          localStorage.setItem('accessToken', response.data.accessToken);
          localStorage.setItem('refreshToken', response.data.refreshToken);
          error.config.headers.Authorization = `Bearer ${response.data.accessToken}`;
          return api.request(error.config);
        } catch {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
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
  
  createGroupChat: (data: { name: string; description?: string }) =>
    api.post<ChatRoom>('/chat-rooms', data),
  
  getChatRoom: (roomId: string) => api.get<ChatRoom>(`/chat-rooms/${roomId}`),
  
  getMessages: (roomId: string, page = 0, size = 50) =>
    api.get<{ content: Message[] }>(`/chat-rooms/${roomId}/messages`, {
      params: { page, size },
    }),
  
  getParticipants: (roomId: string) =>
    api.get<User[]>(`/chat-rooms/${roomId}/participants`),
};

export default api;
