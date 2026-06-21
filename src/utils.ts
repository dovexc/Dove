import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";

export function convertFileSrc(path: string): string {
  return tauriConvertFileSrc(path);
}

export function formatPlaytime(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 1) {
    return `${hours.toFixed(1)} Std.`;
  }
  const minutes = Math.round(seconds / 60);
  return `${minutes} Min.`;
}
