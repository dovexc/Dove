import { create } from "zustand";
import type { CatalogGame } from "./types";

interface CartState {
  items: CatalogGame[];
  promptGame: CatalogGame | null;
  isOpen: boolean;
  isInCart: (gameId: number) => boolean;
  addToCart: (game: CatalogGame) => void;
  removeFromCart: (gameId: number) => void;
  clearCart: () => void;
  dismissPrompt: () => void;
  openCart: () => void;
  closeCart: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  promptGame: null,
  isOpen: false,

  isInCart: (gameId) => get().items.some((g) => g.id === gameId),

  addToCart: (game) => {
    set((s) => ({
      items: s.items.some((g) => g.id === game.id) ? s.items : [...s.items, game],
      promptGame: game,
    }));
  },

  removeFromCart: (gameId) => set((s) => ({ items: s.items.filter((g) => g.id !== gameId) })),
  clearCart: () => set({ items: [] }),
  dismissPrompt: () => set({ promptGame: null }),
  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),
}));
