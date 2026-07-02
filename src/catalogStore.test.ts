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
  useCatalogStore.setState({ error: null, purchasingId: null });
  vi.restoreAllMocks();
});

describe("catalogStore purchaseGame", () => {
  it("clears purchasingId and error on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(game)));

    await useCatalogStore.getState().purchaseGame(game.id);

    const state = useCatalogStore.getState();
    expect(state.purchasingId).toBeNull();
    expect(state.error).toBeNull();
  });

  it("records an error and clears purchasingId on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse("Fehler", false, 500)));

    await useCatalogStore.getState().purchaseGame(game.id);

    const state = useCatalogStore.getState();
    expect(state.purchasingId).toBeNull();
    expect(state.error).not.toBeNull();
  });
});
