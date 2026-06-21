import { create } from "zustand";
import { API_BASE, getAuthHeader } from "./authStore";
import type { CatalogGame, NewCatalogGame } from "./types";

interface CatalogState {
  games: CatalogGame[];
  loading: boolean;
  error: string | null;
  fetchCatalog: () => Promise<void>;
  publishGame: (game: NewCatalogGame) => Promise<void>;
  clearError: () => void;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  games: [],
  loading: false,
  error: null,

  fetchCatalog: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games`);
      if (!response.ok) throw new Error(`Fehler (${response.status})`);
      const games = await response.json();
      set({ games, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  publishGame: async (game) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(game),
      });
      if (!response.ok) throw new Error(`Fehler (${response.status})`);
      await get().fetchCatalog();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearError: () => set({ error: null }),
}));
