import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Game, NewGame } from "./types";

interface LibraryState {
  games: Game[];
  selectedGameId: number | null;
  isAddDialogOpen: boolean;
  error: string | null;
  fetchGames: () => Promise<void>;
  addGame: (game: NewGame) => Promise<void>;
  launchGame: (id: number) => Promise<void>;
  deleteGame: (id: number) => Promise<void>;
  selectGame: (id: number | null) => void;
  openAddDialog: () => void;
  closeAddDialog: () => void;
  clearError: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  games: [],
  selectedGameId: null,
  isAddDialogOpen: false,
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

  deleteGame: async (id) => {
    try {
      await invoke("delete_game", { id });
      if (get().selectedGameId === id) {
        set({ selectedGameId: null });
      }
      await get().fetchGames();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  selectGame: (id) => set({ selectedGameId: id }),
  openAddDialog: () => set({ isAddDialogOpen: true }),
  closeAddDialog: () => set({ isAddDialogOpen: false }),
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
