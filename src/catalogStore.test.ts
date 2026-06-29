import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCatalogStore } from "./catalogStore";
import { useAuthStore } from "./authStore";
import type { CatalogGame } from "./types";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const game: CatalogGame = {
  id: 1,
  publisher_user_id: 2,
  title: "Pixel Knights",
  description: null,
  cover_url: null,
  price_cents: 0,
  created_at: "2026-01-01T00:00:00Z",
  file_url: null,
  file_size_bytes: null,
  version: "0.9.4",
  tags: null,
  status: "approved",
  min_specs: null,
  recommended_specs: null,
  save_path_hint: null,
  avg_rating: null,
  review_count: 0,
};

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null });
  useCatalogStore.setState({ checkoutGame: null, error: null, purchasingId: null });
  vi.restoreAllMocks();
});

describe("catalogStore checkout flow", () => {
  it("opens and closes the checkout dialog for a given game", () => {
    useCatalogStore.getState().openCheckout(game);
    expect(useCatalogStore.getState().checkoutGame).toEqual(game);

    useCatalogStore.getState().closeCheckout();
    expect(useCatalogStore.getState().checkoutGame).toBeNull();
  });

  it("purchaseGame closes the checkout dialog and clears purchasingId on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(game)));
    useCatalogStore.getState().openCheckout(game);

    await useCatalogStore.getState().purchaseGame(game.id);

    const state = useCatalogStore.getState();
    expect(state.checkoutGame).toBeNull();
    expect(state.purchasingId).toBeNull();
    expect(state.error).toBeNull();
  });

  it("purchaseGame keeps the checkout dialog open and records an error on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse("Fehler", false, 500)));
    useCatalogStore.getState().openCheckout(game);

    await useCatalogStore.getState().purchaseGame(game.id);

    const state = useCatalogStore.getState();
    expect(state.checkoutGame).toEqual(game);
    expect(state.purchasingId).toBeNull();
    expect(state.error).not.toBeNull();
  });
});
