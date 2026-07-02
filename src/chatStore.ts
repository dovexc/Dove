import { create } from "zustand";
import { API_BASE, getAuthHeader } from "./authStore";
import type { DirectMessage, EventMessage } from "./types";

// Mirrors the server's hard cap in `send_direct_message`/`send_event_message`.
export const CHAT_MESSAGE_MAX_LENGTH = 2000;

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Fehler (${response.status})`;
}

interface ChatState {
  activeFriendId: number | null;
  directMessages: DirectMessage[];
  sendingDirect: boolean;
  activeEventId: number | null;
  eventMessages: EventMessage[];
  sendingEvent: boolean;
  error: string | null;
  openDirectChat: (friendId: number) => Promise<void>;
  closeDirectChat: () => void;
  refreshDirectMessages: () => Promise<void>;
  sendDirectMessage: (body: string) => Promise<void>;
  openEventChat: (eventId: number) => Promise<void>;
  closeEventChat: () => void;
  refreshEventMessages: () => Promise<void>;
  sendEventMessage: (body: string) => Promise<void>;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeFriendId: null,
  directMessages: [],
  sendingDirect: false,
  activeEventId: null,
  eventMessages: [],
  sendingEvent: false,
  error: null,

  openDirectChat: async (friendId) => {
    set({ activeFriendId: friendId, directMessages: [] });
    await get().refreshDirectMessages();
  },

  closeDirectChat: () => set({ activeFriendId: null, directMessages: [] }),

  refreshDirectMessages: async () => {
    const friendId = get().activeFriendId;
    if (!friendId) return;
    try {
      const response = await fetch(`${API_BASE}/api/me/messages/${friendId}`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const directMessages: DirectMessage[] = await response.json();
      set({ directMessages });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  sendDirectMessage: async (body) => {
    const friendId = get().activeFriendId;
    if (!friendId || !body.trim()) return;
    set({ sendingDirect: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/messages/${friendId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const message: DirectMessage = await response.json();
      set({ directMessages: [...get().directMessages, message], sendingDirect: false });
    } catch (e) {
      set({ error: String(e), sendingDirect: false });
    }
  },

  openEventChat: async (eventId) => {
    set({ activeEventId: eventId, eventMessages: [] });
    await get().refreshEventMessages();
  },

  closeEventChat: () => set({ activeEventId: null, eventMessages: [] }),

  refreshEventMessages: async () => {
    const eventId = get().activeEventId;
    if (!eventId) return;
    try {
      const response = await fetch(`${API_BASE}/api/events/${eventId}/messages`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const eventMessages: EventMessage[] = await response.json();
      set({ eventMessages });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  sendEventMessage: async (body) => {
    const eventId = get().activeEventId;
    if (!eventId || !body.trim()) return;
    set({ sendingEvent: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/events/${eventId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const message: EventMessage = await response.json();
      set({ eventMessages: [...get().eventMessages, message], sendingEvent: false });
    } catch (e) {
      set({ error: String(e), sendingEvent: false });
    }
  },

  clearError: () => set({ error: null }),
}));
