import { create } from "zustand";
import { API_BASE, getAuthHeader } from "./authStore";
import type { PublicProfile, UserSummary } from "./types";

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
  error: string | null;
  setQuery: (query: string) => void;
  search: () => Promise<void>;
  viewProfile: (id: number) => Promise<void>;
  closeProfile: () => void;
  clearError: () => void;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
  query: "",
  results: [],
  searching: false,
  viewedProfile: null,
  loadingProfile: false,
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

  clearError: () => set({ error: null }),
}));
