import { create } from "zustand";
import type { StoreUser } from "./types";

const API_BASE = "http://127.0.0.1:4000";
const TOKEN_STORAGE_KEY = "dove_store_token";

interface AuthState {
  token: string | null;
  user: StoreUser | null;
  error: string | null;
  loading: boolean;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hydrateUser: () => Promise<void>;
  clearError: () => void;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Fehler (${response.status})`;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  user: null,
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
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({ token: null, user: null });
  },

  hydrateUser: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Sitzung abgelaufen");
      const user = await response.json();
      set({ user });
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ token: null, user: null });
    }
  },

  clearError: () => set({ error: null }),
}));

export function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export { API_BASE };
