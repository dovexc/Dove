import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./authStore";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ token: null, user: null, error: null, loading: false });
  vi.restoreAllMocks();
});

describe("authStore.login", () => {
  it("stores the token and user on success", async () => {
    const user = { id: 1, display_name: "Alice" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ token: "abc123", user })),
    );

    await useAuthStore.getState().login("alice@test.de", "secret");

    const state = useAuthStore.getState();
    expect(state.token).toBe("abc123");
    expect(state.user).toEqual(user);
    expect(state.error).toBeNull();
    expect(localStorage.getItem("dove_store_token")).toBe("abc123");
  });

  it("sets an error and keeps the session empty on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse("Ungültige Anmeldedaten", false, 401)),
    );

    await useAuthStore.getState().login("alice@test.de", "wrong-password");

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.error).not.toBeNull();
    expect(localStorage.getItem("dove_store_token")).toBeNull();
  });
});

describe("authStore.logout", () => {
  it("clears the session and local storage", () => {
    localStorage.setItem("dove_store_token", "abc123");
    useAuthStore.setState({ token: "abc123", user: { id: 1 } as never });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem("dove_store_token")).toBeNull();
  });
});
