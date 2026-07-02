import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCollectionsStore } from "./collectionsStore";
import type { Game, NewGame, UpdateGame, SteamGame, UpdateAvailable } from "./types";

interface LibraryState {
  games: Game[];
  selectedGameId: number | null;
  isAddDialogOpen: boolean;
  editingGameId: number | null;
  deletingGameId: number | null;
  isSteamImportOpen: boolean;
  steamGames: SteamGame[];
  steamScanError: string | null;
  steamScanLoading: boolean;
  contextMenu: { game: Game; x: number; y: number } | null;
  error: string | null;
  fetchGames: () => Promise<void>;
  addGame: (game: NewGame) => Promise<void>;
  launchGame: (id: number) => Promise<void>;
  editGame: (id: number, game: UpdateGame) => Promise<void>;
  deleteGame: (id: number, deleteFiles: boolean) => Promise<void>;
  uninstallGame: (id: number) => Promise<void>;
  removingAccountGameId: number | null;
  openRemoveAccountDialog: (id: number) => void;
  closeRemoveAccountDialog: () => void;
  selectGame: (id: number | null) => void;
  openAddDialog: () => void;
  closeAddDialog: () => void;
  openEditDialog: (id: number) => void;
  closeEditDialog: () => void;
  openDeleteDialog: (id: number) => void;
  closeDeleteDialog: () => void;
  openSteamImport: () => Promise<void>;
  closeSteamImport: () => void;
  importSteamGames: (games: SteamGame[]) => Promise<void>;
  openContextMenu: (game: Game, x: number, y: number) => void;
  closeContextMenu: () => void;
  updateAvailable: Record<number, UpdateAvailable | null>;
  checkForUpdate: (id: number) => Promise<void>;
  reportError: (message: string) => void;
  clearError: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  games: [],
  selectedGameId: null,
  isAddDialogOpen: false,
  editingGameId: null,
  deletingGameId: null,
  removingAccountGameId: null,
  isSteamImportOpen: false,
  steamGames: [],
  steamScanError: null,
  steamScanLoading: false,
  contextMenu: null,
  updateAvailable: {},
  error: null,

  fetchGames: async () => {
    try {
      const games = await invoke<Game[]>("list_games");
      set({ games });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addGame: async (game) => {
    try {
      await invoke<Game>("add_game", { newGame: game });
      await get().fetchGames();
      set({ isAddDialogOpen: false });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  launchGame: async (id) => {
    try {
      await invoke("launch_game", { id });
      await get().fetchGames();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  editGame: async (id, game) => {
    try {
      await invoke<Game>("update_game", { id, updatedGame: game });
      await get().fetchGames();
      set({ editingGameId: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteGame: async (id, deleteFiles) => {
    try {
      await invoke("delete_game", { id, deleteFiles });
      if (get().selectedGameId === id) {
        set({ selectedGameId: null });
      }
      set({ deletingGameId: null, removingAccountGameId: null });
      await get().fetchGames();
      await useCollectionsStore.getState().fetchCollections();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  uninstallGame: async (id) => {
    try {
      await invoke<Game>("uninstall_game", { id });
      set({ deletingGameId: null });
      await get().fetchGames();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  selectGame: (id) => set({ selectedGameId: id }),
  openAddDialog: () => set({ isAddDialogOpen: true }),
  closeAddDialog: () => set({ isAddDialogOpen: false }),
  openEditDialog: (id) => set({ editingGameId: id }),
  closeEditDialog: () => set({ editingGameId: null }),
  openDeleteDialog: (id) => set({ deletingGameId: id }),
  closeDeleteDialog: () => set({ deletingGameId: null }),
  openRemoveAccountDialog: (id) => set({ removingAccountGameId: id }),
  closeRemoveAccountDialog: () => set({ removingAccountGameId: null }),

  openSteamImport: async () => {
    set({
      isSteamImportOpen: true,
      steamScanLoading: true,
      steamScanError: null,
      steamGames: [],
    });
    try {
      const steamGames = await invoke<SteamGame[]>("find_steam_games");
      set({ steamGames, steamScanLoading: false });
    } catch (e) {
      set({ steamScanError: String(e), steamScanLoading: false });
    }
  },

  closeSteamImport: () => set({ isSteamImportOpen: false }),

  importSteamGames: async (games) => {
    try {
      for (const game of games) {
        await invoke<Game>("add_game", {
          newGame: {
            name: game.name,
            exe_path: `steam://rungameid/${game.appid}`,
            cover_path: game.cover_path,
            description: game.description,
            size_on_disk_bytes: game.size_on_disk_bytes,
            steam_install_dir: game.install_dir,
          },
        });
      }
      await get().fetchGames();
      set({ isSteamImportOpen: false });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openContextMenu: (game, x, y) => set({ contextMenu: { game, x, y } }),
  closeContextMenu: () => set({ contextMenu: null }),

  checkForUpdate: async (id) => {
    try {
      const update = await invoke<UpdateAvailable | null>("check_for_update", { id });
      set({ updateAvailable: { ...get().updateAvailable, [id]: update } });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  reportError: (message) => set({ error: message }),

  clearError: () => set({ error: null }),
}));

let listenersRegistered = false;

export function registerGameEventListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  listen("game-started", () => {
    useLibraryStore.getState().fetchGames();
  });
  listen("game-stopped", () => {
    useLibraryStore.getState().fetchGames();
  });
}
