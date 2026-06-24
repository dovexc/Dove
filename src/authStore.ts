import { create } from "zustand";
import type { ProfileScreenshot, StoreUser } from "./types";

const API_BASE = "http://127.0.0.1:4000";
const TOKEN_STORAGE_KEY = "dove_store_token";

interface AuthState {
  token: string | null;
  user: StoreUser | null;
  screenshots: ProfileScreenshot[];
  error: string | null;
  loading: boolean;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hydrateUser: () => Promise<void>;
  clearError: () => void;
  updateProfile: (fields: {
    display_name?: string;
    bio?: string;
    is_profile_hidden?: boolean;
  }) => Promise<void>;
  uploadAvatar: (dataUrl: string) => Promise<void>;
  uploadBackground: (dataUrl: string) => Promise<void>;
  fetchScreenshots: () => Promise<void>;
  addScreenshot: (dataUrl: string) => Promise<void>;
  deleteScreenshot: (id: number) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Fehler (${response.status})`;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  user: null,
  screenshots: [],
  error: null,
  loading: false,

  register: async (email, password, displayName) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, display_name: displayName }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const data = await response.json();
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      set({ token: data.token, user: data.user, loading: false });
      get().fetchScreenshots();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const data = await response.json();
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      set({ token: data.token, user: data.user, loading: false });
      get().fetchScreenshots();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({ token: null, user: null, screenshots: [] });
  },

  hydrateUser: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        // Token actually rejected (expired/invalid) — the session is gone.
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        set({ token: null, user: null });
        return;
      }
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const user = await response.json();
      set({ user });
      get().fetchScreenshots();
    } catch {
      // Network/server error (e.g. backend not up yet) — keep the token and
      // retry on the next hydrate rather than logging the user out for an
      // outage that has nothing to do with their session being valid.
    }
  },

  clearError: () => set({ error: null }),

  updateProfile: async (fields) => {
    const token = get().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fields),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const user = await response.json();
      set({ user, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  uploadAvatar: async (dataUrl) => {
    const token = get().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/avatar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const user = await response.json();
      set({ user, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  uploadBackground: async (dataUrl) => {
    const token = get().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/background`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const user = await response.json();
      set({ user, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchScreenshots: async () => {
    const user = get().user;
    if (!user) return;
    try {
      const response = await fetch(`${API_BASE}/api/users/${user.id}`);
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const profile = await response.json();
      set({ screenshots: profile.screenshots });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addScreenshot: async (dataUrl) => {
    const token = get().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/screenshots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      set({ loading: false });
      await get().fetchScreenshots();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  deleteScreenshot: async (id) => {
    const token = get().token;
    if (!token) return;
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/screenshots/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(await parseErrorMessage(response));
      }
      await get().fetchScreenshots();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    const token = get().token;
    if (!token) return false;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      set({ loading: false });
      return true;
    } catch (e) {
      set({ error: String(e), loading: false });
      return false;
    }
  },
}));

export function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export { API_BASE };
