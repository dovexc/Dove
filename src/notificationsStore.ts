import { create } from "zustand";
import { API_BASE, getAuthHeader } from "./authStore";
import type { Notification } from "./types";

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Fehler (${response.status})`;
}

interface NotificationsState {
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  fetchNotifications: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  deleteAllNotifications: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  loading: false,
  error: null,

  fetchNotifications: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/notifications`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const notifications: Notification[] = await response.json();
      set({ notifications, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  markRead: async (id) => {
    set({
      notifications: get().notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    });
    try {
      const response = await fetch(`${API_BASE}/api/me/notifications/${id}/read`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  markAllRead: async () => {
    set({ notifications: get().notifications.map((n) => ({ ...n, is_read: true })) });
    try {
      const response = await fetch(`${API_BASE}/api/me/notifications/read-all`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteNotification: async (id) => {
    set({ notifications: get().notifications.filter((n) => n.id !== id) });
    try {
      const response = await fetch(`${API_BASE}/api/me/notifications/${id}`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteAllNotifications: async () => {
    set({ notifications: [] });
    try {
      const response = await fetch(`${API_BASE}/api/me/notifications`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
