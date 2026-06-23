import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";

export function convertFileSrc(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
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

export function formatSize(bytes: number): string {
  if (!bytes) return "–";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond) return "– MB/s";
  const mbps = bytesPerSecond / 1024 ** 2;
  if (mbps >= 1) {
    return `${mbps.toFixed(1)} MB/s`;
  }
  const kbps = bytesPerSecond / 1024;
  return `${kbps.toFixed(0)} KB/s`;
}
