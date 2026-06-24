export const ACCENT_PRESETS = [
  { id: "blue", label: "Blau (Standard)", swatch: "#0ea5e9" },
  { id: "green", label: "Grün", swatch: "#10b981" },
  { id: "purple", label: "Violett", swatch: "#8b5cf6" },
  { id: "red", label: "Rot", swatch: "#ef4444" },
  { id: "orange", label: "Orange", swatch: "#f97316" },
] as const;

export type AccentId = (typeof ACCENT_PRESETS)[number]["id"];

const ACCENT_STORAGE_KEY = "dove_accent_color";

export function getStoredAccent(): AccentId {
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
  if (ACCENT_PRESETS.some((p) => p.id === stored)) {
    return stored as AccentId;
  }
  return "blue";
}

export function applyAccent(accent: AccentId): void {
  if (accent === "blue") {
    document.documentElement.removeAttribute("data-accent");
  } else {
    document.documentElement.setAttribute("data-accent", accent);
  }
  localStorage.setItem(ACCENT_STORAGE_KEY, accent);
}
