import { create } from "zustand";
import { API_BASE, getAuthHeader } from "./authStore";
import { useLibraryStore } from "./store";
import type {
  CatalogGame,
  GameReview,
  GameScreenshot,
  GameVersionNote,
  NewCatalogGame,
  StorageUsage,
} from "./types";

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
  wishlist: CatalogGame[];
  wishlistOnly: boolean;
  loading: boolean;
  purchasingId: number | null;
  uploadingId: number | null;
  storageUsage: StorageUsage | null;
  pendingGames: CatalogGame[];
  loadingPendingGames: boolean;
  moderatingId: number | null;
  error: string | null;
  detailGame: CatalogGame | null;
  detailScreenshots: GameScreenshot[];
  detailReviews: GameReview[];
  detailChangelog: GameVersionNote[];
  detailLoading: boolean;
  fetchCatalog: () => Promise<void>;
  fetchLibrary: () => Promise<void>;
  fetchWishlist: () => Promise<void>;
  addToWishlist: (gameId: number) => Promise<void>;
  removeFromWishlist: (gameId: number) => Promise<void>;
  fetchStorageUsage: () => Promise<void>;
  publishGame: (game: NewCatalogGame) => Promise<void>;
  purchaseGame: (gameId: number) => Promise<void>;
  uploadGameFile: (gameId: number, file: File, version: string) => Promise<void>;
  revokeOwnership: (gameId: number) => Promise<void>;
  fetchPendingGames: () => Promise<void>;
  approveGame: (gameId: number) => Promise<void>;
  rejectGame: (gameId: number) => Promise<void>;
  clearError: () => void;
  setWishlistOnly: (value: boolean) => void;
  openGameDetail: (game: CatalogGame) => Promise<void>;
  closeGameDetail: () => void;
  refreshDetailReviews: (gameId: number) => Promise<void>;
  submitReview: (gameId: number, rating: number, body: string | null) => Promise<void>;
  deleteReview: (gameId: number) => Promise<void>;
  addGameScreenshot: (gameId: number, dataUrl: string) => Promise<void>;
  deleteGameScreenshot: (gameId: number, screenshotId: number) => Promise<void>;
  refreshDetailChangelog: (gameId: number) => Promise<void>;
  submitVersionNote: (gameId: number, version: string, notes: string | null) => Promise<void>;
  deleteVersionNote: (gameId: number, noteId: number) => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  games: [],
  library: [],
  wishlist: [],
  wishlistOnly: false,
  loading: false,
  purchasingId: null,
  uploadingId: null,
  storageUsage: null,
  pendingGames: [],
  loadingPendingGames: false,
  moderatingId: null,
  error: null,
  detailGame: null,
  detailScreenshots: [],
  detailReviews: [],
  detailChangelog: [],
  detailLoading: false,

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
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/library`, { headers });
      if (!response.ok) throw new Error(`Fehler (${response.status})`);
      const library: CatalogGame[] = await response.json();
      set({ library });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  fetchWishlist: async () => {
    const headers = getAuthHeader();
    if (!headers.Authorization) {
      set({ wishlist: [] });
      return;
    }
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/wishlist`, { headers });
      if (!response.ok) throw new Error(`Fehler (${response.status})`);
      const wishlist: CatalogGame[] = await response.json();
      set({ wishlist });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addToWishlist: async (gameId) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/wishlist`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await get().fetchWishlist();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  removeFromWishlist: async (gameId) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/wishlist`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      set({ wishlist: get().wishlist.filter((g) => g.id !== gameId) });
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
      await get().fetchWishlist();
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
    set({ error: null });
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

  fetchPendingGames: async () => {
    set({ loadingPendingGames: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/admin/games/pending`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const pendingGames: CatalogGame[] = await response.json();
      set({ pendingGames, loadingPendingGames: false });
    } catch (e) {
      set({ error: String(e), loadingPendingGames: false });
    }
  },

  approveGame: async (gameId) => {
    set({ moderatingId: gameId, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/approve`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await get().fetchPendingGames();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ moderatingId: null });
    }
  },

  rejectGame: async (gameId) => {
    set({ moderatingId: gameId, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/reject`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await get().fetchPendingGames();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ moderatingId: null });
    }
  },

  clearError: () => set({ error: null }),
  setWishlistOnly: (value) => set({ wishlistOnly: value }),

  openGameDetail: async (game) => {
    set({
      detailGame: game,
      detailScreenshots: [],
      detailReviews: [],
      detailChangelog: [],
      detailLoading: true,
    });
    try {
      const [screenshotsRes, reviewsRes, changelogRes] = await Promise.all([
        fetch(`${API_BASE}/api/games/${game.id}/screenshots`),
        fetch(`${API_BASE}/api/games/${game.id}/reviews`),
        fetch(`${API_BASE}/api/games/${game.id}/changelog`),
      ]);
      const detailScreenshots = screenshotsRes.ok ? await screenshotsRes.json() : [];
      const detailReviews = reviewsRes.ok ? await reviewsRes.json() : [];
      const detailChangelog = changelogRes.ok ? await changelogRes.json() : [];
      set({ detailScreenshots, detailReviews, detailChangelog, detailLoading: false });
    } catch (e) {
      set({ error: String(e), detailLoading: false });
    }
  },

  closeGameDetail: () =>
    set({ detailGame: null, detailScreenshots: [], detailReviews: [], detailChangelog: [] }),

  refreshDetailReviews: async (gameId) => {
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/reviews`);
      if (!response.ok) throw new Error(await errorMessage(response));
      const detailReviews: GameReview[] = await response.json();
      set({ detailReviews });
      await get().fetchCatalog();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  submitReview: async (gameId, rating, body) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ rating, body }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await get().refreshDetailReviews(gameId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteReview: async (gameId) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/reviews`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await get().refreshDetailReviews(gameId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addGameScreenshot: async (gameId, dataUrl) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/screenshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const shot: GameScreenshot = await response.json();
      set({ detailScreenshots: [...get().detailScreenshots, shot] });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteGameScreenshot: async (gameId, screenshotId) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/screenshots/${screenshotId}`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok && response.status !== 404) throw new Error(await errorMessage(response));
      set({ detailScreenshots: get().detailScreenshots.filter((s) => s.id !== screenshotId) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refreshDetailChangelog: async (gameId) => {
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/changelog`);
      if (!response.ok) throw new Error(await errorMessage(response));
      const detailChangelog: GameVersionNote[] = await response.json();
      set({ detailChangelog });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  submitVersionNote: async (gameId, version, notes) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/changelog`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ version, notes }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await get().refreshDetailChangelog(gameId);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteVersionNote: async (gameId, noteId) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/changelog/${noteId}`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok && response.status !== 404) throw new Error(await errorMessage(response));
      set({ detailChangelog: get().detailChangelog.filter((n) => n.id !== noteId) });
    } catch (e) {
      set({ error: String(e) });
    }
  },
}));
