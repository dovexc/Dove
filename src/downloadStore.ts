import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLibraryStore } from "./store";
import type { Game } from "./types";

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "extracting"
  | "paused"
  | "completed"
  | "error";

const PAUSED_SENTINEL = "__paused__";

export interface DownloadItem {
  id: number;
  name: string;
  status: DownloadStatus;
  downloaded: number;
  total: number;
  speedBps: number;
  speedHistory: number[];
  error?: string;
  queuedAt: number;
  finishedAt?: number;
}

interface InstallProgressPayload {
  id: number;
  phase: "downloading" | "extracting" | "paused";
  downloaded?: number;
  total?: number;
}

const SPEED_HISTORY_LENGTH = 30;
const HISTORY_LIMIT = 20;

interface SpeedSample {
  at: number;
  bytes: number;
}

const lastSamples = new Map<number, SpeedSample>();

interface DownloadState {
  queue: DownloadItem[];
  history: DownloadItem[];
  enqueue: (id: number, name: string) => void;
  removeFromQueue: (id: number) => void;
  reorderQueue: (draggedId: number, targetId: number) => void;
  draggingId: number | null;
  setDraggingId: (id: number | null) => void;
  handleProgress: (payload: InstallProgressPayload) => void;
  processQueue: () => void;
  pauseDownload: (id: number) => Promise<void>;
  resumeDownload: (id: number) => void;
  startNow: (id: number) => void;
  clearHistory: () => void;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  queue: [],
  history: [],
  draggingId: null,

  enqueue: (id, name) => {
    const alreadyActive = get().queue.some((item) => item.id === id);
    if (alreadyActive) return;

    const item: DownloadItem = {
      id,
      name,
      status: "queued",
      downloaded: 0,
      total: 0,
      speedBps: 0,
      speedHistory: [],
      queuedAt: Date.now(),
    };
    set({ queue: [...get().queue, item] });
    get().processQueue();
  },

  removeFromQueue: (id) => {
    set({ queue: get().queue.filter((item) => item.id !== id || item.status !== "queued") });
  },

  reorderQueue: (draggedId, targetId) => {
    if (draggedId === targetId) return;
    const current = get().queue;
    const draggedIndex = current.findIndex((g) => g.id === draggedId);
    const targetIndex = current.findIndex((g) => g.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    if (current[draggedIndex].status !== "queued") return;

    const reordered = [...current];
    const [dragged] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, dragged);
    set({ queue: reordered });
  },

  setDraggingId: (id) => set({ draggingId: id }),

  clearHistory: () => set({ history: [] }),

  handleProgress: (payload) => {
    const queue = get().queue;
    const item = queue.find((i) => i.id === payload.id);
    if (!item) return;

    if (payload.phase === "paused") {
      set({
        queue: queue.map((i) =>
          i.id === payload.id ? { ...i, status: "paused" as DownloadStatus } : i
        ),
      });
      return;
    }

    const now = Date.now();
    const downloaded = payload.downloaded ?? item.downloaded;
    const total = payload.total ?? item.total;

    let speedBps = item.speedBps;
    const lastSample = lastSamples.get(payload.id);
    if (payload.phase === "downloading") {
      if (lastSample) {
        const deltaBytes = downloaded - lastSample.bytes;
        const deltaSeconds = (now - lastSample.at) / 1000;
        if (deltaSeconds > 0) {
          speedBps = Math.max(0, deltaBytes / deltaSeconds);
        }
      }
      lastSamples.set(payload.id, { at: now, bytes: downloaded });
    }

    const speedHistory =
      payload.phase === "downloading"
        ? [...item.speedHistory, speedBps].slice(-SPEED_HISTORY_LENGTH)
        : item.speedHistory;

    set({
      queue: queue.map((i) =>
        i.id === payload.id
          ? {
              ...i,
              status: payload.phase,
              downloaded,
              total,
              speedBps: payload.phase === "downloading" ? speedBps : i.speedBps,
              speedHistory,
            }
          : i
      ),
    });
  },

  processQueue: () => {
    const queue = get().queue;
    // A "paused" item still occupies the active slot — it must not be
    // silently replaced by the next queued item. Only an explicit resume or
    // startNow() call may free the slot.
    const slotTaken = queue.some(
      (item) =>
        item.status === "downloading" ||
        item.status === "extracting" ||
        item.status === "paused"
    );
    if (slotTaken) return;

    const next = queue.find((item) => item.status === "queued");
    if (!next) return;

    set({
      queue: get().queue.map((i) =>
        i.id === next.id ? { ...i, status: "downloading" as DownloadStatus } : i
      ),
    });
    beginDownload(next.id);
  },

  pauseDownload: async (id) => {
    await invoke("pause_download", { id });
  },

  resumeDownload: (id) => {
    set({
      queue: get().queue.map((i) =>
        i.id === id ? { ...i, status: "downloading" as DownloadStatus } : i
      ),
    });
    beginDownload(id);
  },

  startNow: (id) => {
    const queue = get().queue;
    const target = queue.find((i) => i.id === id);
    if (!target || target.status !== "queued") return;

    const active = queue.find(
      (i) =>
        i.id !== id &&
        (i.status === "downloading" || i.status === "extracting" || i.status === "paused")
    );

    if (active && (active.status === "downloading" || active.status === "extracting")) {
      invoke("pause_download", { id: active.id }).catch(() => {});
    }

    set({
      queue: get().queue.map((i) => {
        if (i.id === id) return { ...i, status: "downloading" as DownloadStatus };
        if (active && i.id === active.id) return { ...i, status: "queued" as DownloadStatus };
        return i;
      }),
    });
    beginDownload(id);
  },
}));

function beginDownload(id: number) {
  lastSamples.set(id, { at: Date.now(), bytes: 0 });

  invoke<Game>("install_catalog_game", { id })
    .then(() => {
      finishDownload(id, "completed");
    })
    .catch((e) => {
      const message = String(e);
      if (message.includes(PAUSED_SENTINEL)) {
        // Already marked "paused" via the install-progress event; nothing
        // further to do here, the item stays in the active slot for resuming.
        return;
      }
      finishDownload(id, "error", message);
    })
    .finally(() => {
      useLibraryStore.getState().fetchGames();
      useDownloadStore.getState().processQueue();
    });
}

function finishDownload(id: number, status: "completed" | "error", error?: string) {
  lastSamples.delete(id);
  const state = useDownloadStore.getState();
  const item = state.queue.find((i) => i.id === id);
  if (!item) return;

  const finished: DownloadItem = {
    ...item,
    status,
    error,
    finishedAt: Date.now(),
  };

  useDownloadStore.setState({
    queue: state.queue.filter((i) => i.id !== id),
    history: [finished, ...state.history].slice(0, HISTORY_LIMIT),
  });
}

let listenersRegistered = false;

export function registerDownloadEventListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  listen<InstallProgressPayload>("install-progress", (event) => {
    useDownloadStore.getState().handleProgress(event.payload);
  });
}
