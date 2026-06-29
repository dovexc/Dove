import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
});

// authStore mirrors the bearer token into the Tauri runtime on every change
// (see src/authStore.ts) — outside of a real Tauri webview this throws, so
// every test that imports authStore/catalogStore needs this mocked.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
