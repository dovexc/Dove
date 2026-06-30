import { create } from "zustand";
import { API_BASE, getAuthHeader, useAuthStore } from "./authStore";
import { useLibraryStore } from "./store";
import type {
  CatalogGame,
  GameReview,
  GameScreenshot,
  GameVersionNote,
  NewCatalogGame,
  Order,
  PublisherGameStats,
  PublisherGameStatsDetail,
  StorageUsage,
  UpdateCatalogGame,
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
  checkoutGame: CatalogGame | null;
  orders: Order[];
  ordersLoading: boolean;
  recommendations: CatalogGame[];
  recommendationsLoading: boolean;
  fetchRecommendations: () => Promise<void>;
  publisherStats: PublisherGameStats[];
  publisherStatsLoading: boolean;
  fetchPublisherStats: (range?: { from?: string; to?: string }) => Promise<void>;
  publisherGameDetail: PublisherGameStatsDetail | null;
  publisherGameDetailLoading: boolean;
  fetchPublisherGameDetail: (gameId: number) => Promise<void>;
  closePublisherGameDetail: () => void;
  fetchOrders: () => Promise<void>;
  fetchCatalog: () => Promise<void>;
  fetchLibrary: () => Promise<void>;
  fetchWishlist: () => Promise<void>;
  addToWishlist: (gameId: number) => Promise<void>;
  removeFromWishlist: (gameId: number) => Promise<void>;
  fetchStorageUsage: () => Promise<void>;
  publishGame: (game: NewCatalogGame) => Promise<void>;
  updateGame: (gameId: number, fields: UpdateCatalogGame) => Promise<void>;
  purchaseGame: (gameId: number) => Promise<void>;
  openCheckout: (game: CatalogGame) => void;
  closeCheckout: () => void;
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
  checkoutGame: null,
  orders: [],
  ordersLoading: false,
  recommendations: [],
  recommendationsLoading: false,
  publisherStats: [],
  publisherStatsLoading: false,
  publisherGameDetail: null,
  publisherGameDetailLoading: false,

  fetchRecommendations: async () => {
    const headers = getAuthHeader();
    if (!headers.Authorization) {
      set({ recommendations: [] });
      return;
    }
    set({ recommendationsLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/recommendations`, { headers });
      if (!response.ok) throw new Error(await errorMessage(response));
      const recommendations: CatalogGame[] = await response.json();
      set({ recommendations, recommendationsLoading: false });
    } catch (e) {
      set({ error: String(e), recommendationsLoading: false });
    }
  },

  fetchPublisherStats: async (range) => {
    const headers = getAuthHeader();
    if (!headers.Authorization) {
      set({ publisherStats: [] });
      return;
    }
    set({ publisherStatsLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (range?.from) params.set("from", range.from);
      if (range?.to) params.set("to", range.to);
      const query = params.toString();
      const response = await fetch(
        `${API_BASE}/api/me/publisher/stats${query ? `?${query}` : ""}`,
        { headers }
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      const publisherStats: PublisherGameStats[] = await response.json();
      set({ publisherStats, publisherStatsLoading: false });
    } catch (e) {
      set({ error: String(e), publisherStatsLoading: false });
    }
  },

  fetchPublisherGameDetail: async (gameId) => {
    const headers = getAuthHeader();
    if (!headers.Authorization) return;
    set({ publisherGameDetailLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/publisher-stats`, { headers });
      if (!response.ok) throw new Error(await errorMessage(response));
      const publisherGameDetail: PublisherGameStatsDetail = await response.json();
      set({ publisherGameDetail, publisherGameDetailLoading: false });
    } catch (e) {
      set({ error: String(e), publisherGameDetailLoading: false });
    }
  },

  closePublisherGameDetail: () => set({ publisherGameDetail: null }),

  fetchOrders: async () => {
    const headers = getAuthHeader();
    if (!headers.Authorization) {
      set({ orders: [] });
      return;
    }
    set({ ordersLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/orders`, { headers });
      if (!response.ok) throw new Error(await errorMessage(response));
      const orders: Order[] = await response.json();
      set({ orders, ordersLoading: false });
    } catch (e) {
      set({ error: String(e), ordersLoading: false });
    }
  },

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

  updateGame: async (gameId, fields) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(fields),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const updated: CatalogGame = await response.json();
      if (get().detailGame?.id === gameId) set({ detailGame: updated });
      await get().fetchCatalog();
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  purchaseGame: async (gameId) => {
    set({ error: null, purchasingId: gameId });
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}/purchase`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const game: CatalogGame = await response.json();
      await get().fetchLibrary();
      await get().fetchWishlist();
      await ensureInLocalLibrary(game);
      await useAuthStore.getState().hydrateUser();
      set({ checkoutGame: null });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ purchasingId: null });
    }
  },

  openCheckout: (game) => set({ checkoutGame: game, error: null }),
  closeCheckout: () => set({ checkoutGame: null }),

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

      const headers = getAuthHeader();
      if (headers.Authorization) {
        fetch(`${API_BASE}/api/games/${game.id}/view`, { method: "POST", headers }).catch(() => {});
      }
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
