import { create } from "zustand";
import { API_BASE, getAuthHeader } from "./authStore";
import { useLibraryStore } from "./store";
import type { CatalogGame, NewCatalogGame, StorageUsage } from "./types";

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Fehler (${response.status})`;
}

function placeholderExePath(catalogGameId: number): string {
  return `store://catalog/${catalogGameId}`;
}

async function ensureInLocalLibrary(game: CatalogGame): Promise<void> {
  const libraryStore = useLibraryStore.getState();
  const alreadyLinked = libraryStore.games.some((g) => g.catalog_game_id === game.id);
  if (alreadyLinked) return;

  await libraryStore.addGame({
    name: game.title,
    exe_path: placeholderExePath(game.id),
    cover_path: game.cover_url,
    description: game.description,
    size_on_disk_bytes: 0,
    catalog_game_id: game.id,
  });
}

interface CatalogState {
  games: CatalogGame[];
  library: CatalogGame[];
  loading: boolean;
  purchasingId: number | null;
  uploadingId: number | null;
  storageUsage: StorageUsage | null;
  error: string | null;
  fetchCatalog: () => Promise<void>;
  fetchLibrary: () => Promise<void>;
  fetchStorageUsage: () => Promise<void>;
  publishGame: (game: NewCatalogGame) => Promise<void>;
  purchaseGame: (gameId: number) => Promise<void>;
  uploadGameFile: (gameId: number, file: File, version: string) => Promise<void>;
  revokeOwnership: (gameId: number) => Promise<void>;
  clearError: () => void;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  games: [],
  library: [],
  loading: false,
  purchasingId: null,
  uploadingId: null,
  storageUsage: null,
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

  fetchLibrary: async () => {
    const headers = getAuthHeader();
    if (!headers.Authorization) {
      set({ library: [] });
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/me/library`, { headers });
      if (!response.ok) throw new Error(`Fehler (${response.status})`);
      const library: CatalogGame[] = await response.json();
      set({ library });
    } catch (e) {
      set({ error: String(e) });
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

  purchaseGame: async (gameId) => {
    set({ error: null, purchasingId: gameId });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/purchase`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(`Fehler (${response.status})`);
      const game: CatalogGame = await response.json();
      await get().fetchLibrary();
      await ensureInLocalLibrary(game);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ purchasingId: null });
    }
  },

  fetchStorageUsage: async () => {
    const headers = getAuthHeader();
    if (!headers.Authorization) {
      set({ storageUsage: null });
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/api/me/storage`, { headers });
      if (!response.ok) throw new Error(await errorMessage(response));
      const storageUsage: StorageUsage = await response.json();
      set({ storageUsage });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  uploadGameFile: async (gameId, file, version) => {
    set({ error: null, uploadingId: gameId });
    try {
      const url = `${API_BASE}/api/games/${gameId}/upload?version=${encodeURIComponent(version)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", ...getAuthHeader() },
        body: file,
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await get().fetchCatalog();
      await get().fetchStorageUsage();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ uploadingId: null });
    }
  },

  revokeOwnership: async (gameId) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/purchase`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(`Fehler (${response.status})`);
      await get().fetchLibrary();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearError: () => set({ error: null }),
}));
