import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Collection } from "./types";

interface CollectionsState {
  collections: Collection[];
  error: string | null;
  fetchCollections: () => Promise<void>;
  createCollection: (name: string) => Promise<void>;
  renameCollection: (id: number, name: string) => Promise<void>;
  deleteCollection: (id: number) => Promise<void>;
  addGameToCollection: (collectionId: number, gameId: number) => Promise<void>;
  removeGameFromCollection: (collectionId: number, gameId: number) => Promise<void>;
  clearError: () => void;
}

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  error: null,

  fetchCollections: async () => {
    try {
      const collections = await invoke<Collection[]>("list_collections");
      set({ collections });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  createCollection: async (name) => {
    try {
      await invoke("create_collection", { name });
      await get().fetchCollections();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  renameCollection: async (id, name) => {
    try {
      await invoke("rename_collection", { id, name });
      await get().fetchCollections();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteCollection: async (id) => {
    try {
      await invoke("delete_collection", { id });
      await get().fetchCollections();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addGameToCollection: async (collectionId, gameId) => {
    try {
      await invoke("add_game_to_collection", { collectionId, gameId });
      await get().fetchCollections();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  removeGameFromCollection: async (collectionId, gameId) => {
    try {
      await invoke("remove_game_from_collection", { collectionId, gameId });
      await get().fetchCollections();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  clearError: () => set({ error: null }),
}));
