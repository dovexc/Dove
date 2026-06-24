import { create } from "zustand";
import { API_BASE, getAuthHeader } from "./authStore";
import type { FriendRequests, PublicProfile, UserSummary } from "./types";

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Fehler (${response.status})`;
}

interface FriendsState {
  query: string;
  results: UserSummary[];
  searching: boolean;
  viewedProfile: PublicProfile | null;
  loadingProfile: boolean;
  friends: UserSummary[];
  requests: FriendRequests;
  loadingFriends: boolean;
  pendingActionId: number | null;
  error: string | null;
  setQuery: (query: string) => void;
  search: () => Promise<void>;
  clearResults: () => void;
  viewProfile: (id: number) => Promise<void>;
  closeProfile: () => void;
  clearError: () => void;
  fetchFriends: () => Promise<void>;
  fetchFriendRequests: () => Promise<void>;
  sendFriendRequest: (id: number) => Promise<void>;
  acceptFriendRequest: (id: number) => Promise<void>;
  removeFriend: (id: number) => Promise<void>;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  query: "",
  results: [],
  searching: false,
  viewedProfile: null,
  loadingProfile: false,
  friends: [],
  requests: { incoming: [], outgoing: [] },
  loadingFriends: false,
  pendingActionId: null,
  error: null,

  setQuery: (query) => set({ query }),

  search: async () => {
    set({ searching: true, error: null });
    try {
      const url = `${API_BASE}/api/users?q=${encodeURIComponent(get().query)}`;
      const response = await fetch(url, { headers: getAuthHeader() });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const results: UserSummary[] = await response.json();
      set({ results, searching: false });
    } catch (e) {
      set({ error: String(e), searching: false });
    }
  },

  viewProfile: async (id) => {
    set({ loadingProfile: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/users/${id}`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const profile: PublicProfile = await response.json();
      set({ viewedProfile: profile, loadingProfile: false });
    } catch (e) {
      set({ error: String(e), loadingProfile: false });
    }
  },

  closeProfile: () => set({ viewedProfile: null }),

  clearResults: () => set({ results: [] }),

  clearError: () => set({ error: null }),

  fetchFriends: async () => {
    set({ loadingFriends: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/friends`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const friends: UserSummary[] = await response.json();
      set({ friends, loadingFriends: false });
    } catch (e) {
      set({ error: String(e), loadingFriends: false });
    }
  },

  fetchFriendRequests: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/me/friend-requests`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      const requests: FriendRequests = await response.json();
      set({ requests });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  sendFriendRequest: async (id) => {
    set({ pendingActionId: id, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/users/${id}/friend-request`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      await Promise.all([get().fetchFriends(), get().fetchFriendRequests()]);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ pendingActionId: null });
    }
  },

  acceptFriendRequest: async (id) => {
    set({ pendingActionId: id, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/users/${id}/friend-accept`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      await Promise.all([get().fetchFriends(), get().fetchFriendRequests()]);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ pendingActionId: null });
    }
  },

  removeFriend: async (id) => {
    set({ pendingActionId: id, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/users/${id}/friend`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      await Promise.all([get().fetchFriends(), get().fetchFriendRequests()]);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ pendingActionId: null });
    }
  },
}));
