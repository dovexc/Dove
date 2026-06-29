import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEventsStore } from "./eventsStore";
import { useAuthStore } from "./authStore";
import type { GameEvent } from "./types";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const event: GameEvent = {
  id: 1,
  host_user_id: 2,
  host_display_name: "Bob",
  title: "Frühlings-Turnier",
  description: null,
  catalog_game_id: null,
  catalog_game_title: null,
  custom_game_title: "Pixel Knights",
  registration_deadline: null,
  starts_at: null,
  ends_at: null,
  prize_cents: 0,
  prize_mode: "winner_takes_all",
  prize_second_cents: 0,
  prize_third_cents: 0,
  team_size: 1,
  max_entries: null,
  format: "knockout",
  is_private: false,
  join_code: null,
  created_at: "2026-01-01T00:00:00Z",
  participant_count: 3,
  joined: false,
};

beforeEach(() => {
  useAuthStore.setState({ token: "test-token", user: { id: 42, display_name: "Carla" } as never });
  useEventsStore.setState({ events: [event], error: null, joiningId: null });
  vi.restoreAllMocks();
});

describe("eventsStore.joinEvent", () => {
  it("marks the event as joined and bumps the participant count on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    await useEventsStore.getState().joinEvent(event.id);

    const updated = useEventsStore.getState().events.find((e) => e.id === event.id);
    expect(updated?.joined).toBe(true);
    expect(updated?.participant_count).toBe(4);
    expect(useEventsStore.getState().joiningId).toBeNull();
    expect(useEventsStore.getState().error).toBeNull();
  });

  it("leaves the event unjoined and records an error on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse("Anmeldeschluss verpasst", false, 400)),
    );

    await useEventsStore.getState().joinEvent(event.id);

    const updated = useEventsStore.getState().events.find((e) => e.id === event.id);
    expect(updated?.joined).toBe(false);
    expect(updated?.participant_count).toBe(3);
    expect(useEventsStore.getState().error).not.toBeNull();
  });
});
