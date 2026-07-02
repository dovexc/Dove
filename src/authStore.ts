import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useI18nStore } from "./i18nStore";
import type {
  Badge,
  ProfileScreenshot,
  RecentlyPlayedGame,
  ShowcasedAchievement,
  StoreUser,
  WalletTopup,
} from "./types";

// Set VITE_API_BASE at build time (e.g. in a `.env.production`) to point a
// release build at the deployed backend instead of localhost.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:4000";
const TOKEN_STORAGE_KEY = "dove_store_token";

function syncLanguage(token: string) {
  const lang = useI18nStore.getState().language;
  fetch(`${API_BASE}/api/me/language`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ language: lang }),
  }).catch(() => {});
}

interface AuthState {
  token: string | null;
  user: StoreUser | null;
  screenshots: ProfileScreenshot[];
  badges: Badge[];
  myAchievements: ShowcasedAchievement[];
  achievementShowcase: ShowcasedAchievement[];
  recentGames: RecentlyPlayedGame[];
  walletTopups: WalletTopup[];
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
  fetchBadges: () => Promise<void>;
  setEquippedBadge: (badgeKey: string | null) => Promise<void>;
  fetchMyAchievements: () => Promise<void>;
  fetchMyProfile: () => Promise<void>;
  setAchievementShowcase: (achievementIds: number[]) => Promise<void>;
  exportMyData: () => Promise<void>;
  deleteAccount: (password: string) => Promise<boolean>;
  topUpWallet: (amountCents: number) => Promise<void>;
  fetchWalletTopups: () => Promise<void>;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Fehler (${response.status})`;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  user: null,
  screenshots: [],
  badges: [],
  myAchievements: [],
  achievementShowcase: [],
  recentGames: [],
  walletTopups: [],
  error: null,
  loading: false,

  register: async (email, password, displayName) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          display_name: displayName,
          language: useI18nStore.getState().language,
        }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const data = await response.json();
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      set({ token: data.token, user: data.user, loading: false });
      get().fetchScreenshots();
      get().fetchBadges();
      get().fetchMyProfile();
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
      get().fetchBadges();
      get().fetchMyProfile();
      syncLanguage(data.token);
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({
      token: null,
      user: null,
      screenshots: [],
      badges: [],
      myAchievements: [],
      achievementShowcase: [],
      recentGames: [],
      walletTopups: [],
    });
  },

  hydrateUser: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 || response.status === 404) {
        // Token rejected (expired/invalid) or the user it points to no
        // longer exists (e.g. a dev database reset) — the session is gone.
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        set({ token: null, user: null });
        return;
      }
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const user = await response.json();
      set({ user });
      get().fetchScreenshots();
      get().fetchBadges();
      get().fetchMyProfile();
      syncLanguage(token);
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
    const token = get().token;
    if (!user || !token) return;
    try {
      const response = await fetch(`${API_BASE}/api/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  fetchBadges: async () => {
    const user = get().user;
    if (!user) return;
    try {
      const response = await fetch(`${API_BASE}/api/users/${user.id}/badges`);
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const badges: Badge[] = await response.json();
      set({ badges });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setEquippedBadge: async (badgeKey) => {
    const token = get().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/badge`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ badge_key: badgeKey }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const user = await response.json();
      set({ user, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchMyAchievements: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/api/me/achievements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const myAchievements: ShowcasedAchievement[] = await response.json();
      set({ myAchievements });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  fetchMyProfile: async () => {
    const user = get().user;
    const token = get().token;
    if (!user || !token) return;
    try {
      const response = await fetch(`${API_BASE}/api/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const profile = await response.json();
      set({ achievementShowcase: profile.achievement_showcase, recentGames: profile.recent_games });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setAchievementShowcase: async (achievementIds) => {
    const token = get().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/achievement-showcase`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ achievement_ids: achievementIds }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      set({ loading: false });
      await get().fetchMyProfile();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  exportMyData: async () => {
    const token = get().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const data = await response.blob();
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dove-meine-daten.json";
      link.click();
      URL.revokeObjectURL(url);
      set({ loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  deleteAccount: async (password) => {
    const token = get().token;
    if (!token) return false;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      get().logout();
      set({ loading: false });
      return true;
    } catch (e) {
      set({ error: String(e), loading: false });
      return false;
    }
  },

  topUpWallet: async (amountCents) => {
    const token = get().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/wallet/topup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount_cents: amountCents }),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const user = await response.json();
      set({ user, loading: false });
      await get().fetchWalletTopups();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchWalletTopups: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/api/me/wallet/topups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const walletTopups: WalletTopup[] = await response.json();
      set({ walletTopups });
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));

export function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Mirrors the bearer token into Rust-side state (see commands::set_auth_session
// in src-tauri). The token only lives in this store/localStorage otherwise,
// but cloud-save sync runs from Rust around game launch/exit and needs it.
function syncAuthSessionToTauri(token: string | null) {
  invoke("set_auth_session", { token }).catch(() => {});
}
syncAuthSessionToTauri(useAuthStore.getState().token);
useAuthStore.subscribe((state, prevState) => {
  if (state.token !== prevState.token) {
    syncAuthSessionToTauri(state.token);
  }
});

export { API_BASE };
