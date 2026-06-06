import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, ChatRoom, Message } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  updateUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => {
        set({ user, accessToken, refreshToken });
      },
      updateUser: (user) => {
        set((state) => ({ ...state, user }));
      },
      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
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
  updateChatRoom: (roomId: string, updater: (room: ChatRoom) => ChatRoom) => void;
  removeChatRoom: (roomId: string) => void;
  upsertChatRoom: (room: ChatRoom) => void;
  updateMessage: (messageId: string, updater: (message: Message) => Message) => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  chatRooms: [],
  currentRoom: null,
  messages: [],
  setChatRooms: (chatRooms) => set({ chatRooms }),
  setCurrentRoom: (currentRoom) => set({ currentRoom }),
  addMessage: (message) =>
    set((state) => {
      const existingIndex = state.messages.findIndex((item) => item.id === message.id);
      if (existingIndex >= 0) {
        const messages = [...state.messages];
        messages[existingIndex] = message;
        return { messages };
      }
      return { messages: [...state.messages, message] };
    }),
  setMessages: (messages) => set({ messages }),
  updateChatRoom: (roomId, updater) =>
    set((state) => {
      const chatRooms = state.chatRooms.map((room) =>
        room.id === roomId ? updater(room) : room
      );
      const currentRoom = state.currentRoom?.id === roomId
        ? updater(state.currentRoom)
        : state.currentRoom;

      return { chatRooms, currentRoom };
    }),
  removeChatRoom: (roomId) =>
    set((state) => ({
      chatRooms: state.chatRooms.filter((room) => room.id !== roomId),
      currentRoom: state.currentRoom?.id === roomId ? null : state.currentRoom,
      messages: state.currentRoom?.id === roomId ? [] : state.messages,
    })),
  upsertChatRoom: (nextRoom) =>
    set((state) => {
      const existing = state.chatRooms.some((room) => room.id === nextRoom.id);
      const chatRooms = existing
        ? state.chatRooms.map((room) => (room.id === nextRoom.id ? nextRoom : room))
        : [nextRoom, ...state.chatRooms];
      const currentRoom = state.currentRoom?.id === nextRoom.id ? nextRoom : state.currentRoom;
      return { chatRooms, currentRoom };
    }),
  updateMessage: (messageId, updater) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId ? updater(message) : message
      ),
    })),
}));
