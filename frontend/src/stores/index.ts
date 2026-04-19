import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, ChatRoom, Message } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken });
      },
      logout: () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    { name: 'auth-storage' }
  )
);

interface ChatState {
  chatRooms: ChatRoom[];
  currentRoom: ChatRoom | null;
  messages: Message[];
  setChatRooms: (rooms: ChatRoom[]) => void;
  setCurrentRoom: (room: ChatRoom | null) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  chatRooms: [],
  currentRoom: null,
  messages: [],
  setChatRooms: (chatRooms) => set({ chatRooms }),
  setCurrentRoom: (currentRoom) => set({ currentRoom }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
}));
