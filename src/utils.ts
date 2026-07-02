import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import type { TranslationKey } from "./translations";

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

export function formatRelativeDate(
  iso: string | null,
  t: (key: TranslationKey) => string
): string {
  if (!iso) return t("lib_last_played_never");
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return t("lib_last_played_today");
  if (days === 1) return t("lib_last_played_yesterday");
  return `${t("lib_days_ago_prefix")}${days}${t("lib_days_ago_suffix")}`;
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
