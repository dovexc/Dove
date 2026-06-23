import { convertFileSrc, formatPlaytime, formatSize } from "../utils";
import { useLibraryStore } from "../store";
import { useDownloadStore } from "../downloadStore";
import type { Game } from "../types";

interface Props {
  game: Game;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function GameDetail({ game, onPlay, onEdit, onDelete }: Props) {
  const openContextMenu = useLibraryStore((s) => s.openContextMenu);
  const enqueue = useDownloadStore((s) => s.enqueue);
  const resumeDownload = useDownloadStore((s) => s.resumeDownload);
  const queueItem = useDownloadStore((s) => s.queue.find((i) => i.id === game.id));

  const pendingInstall = game.exe_path.startsWith("store://catalog/");
  const isActive = queueItem?.status === "downloading" || queueItem?.status === "extracting";
  const isQueued = queueItem?.status === "queued";
  const isPaused = queueItem?.status === "paused";
  const progressPercent =
    (queueItem?.status === "downloading" || queueItem?.status === "paused") && queueItem.total
      ? Math.min(100, Math.round((queueItem.downloaded / queueItem.total) * 100))
      : null;

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex gap-6">
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            openContextMenu(game, e.clientX, e.clientY);
          }}
          className="h-64 w-48 shrink-0 overflow-hidden rounded-lg bg-zinc-800"
        >
          {game.cover_path ? (
            <img
              src={convertFileSrc(game.cover_path)}
              alt={game.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-500 text-sm">
              Kein Cover
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col">
          <h1 className="text-2xl font-bold text-zinc-100">{game.name}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Spielzeit: {formatPlaytime(game.total_playtime_seconds)}
          </p>
          <p className="mt-4 flex-1 whitespace-pre-wrap text-sm text-zinc-300">
            {game.description || "Keine Beschreibung vorhanden."}
          </p>
          <div className="mt-4 flex gap-3">
            {pendingInstall ? (
              <button
                onClick={() =>
                  isPaused ? resumeDownload(game.id) : enqueue(game.id, game.name)
                }
                disabled={isActive || isQueued}
                className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {isActive
                  ? queueItem?.status === "extracting"
                    ? "Entpacke..."
                    : "Lädt herunter..."
                  : isQueued
                    ? "In Warteschlange..."
                    : isPaused
                      ? "Fortsetzen"
                      : "Herunterladen & installieren"}
              </button>
            ) : (
              <button
                onClick={onPlay}
                disabled={game.is_running}
                className={`rounded px-4 py-2 text-sm font-semibold ${
                  game.is_running
                    ? "bg-emerald-700 text-emerald-100"
                    : "bg-sky-600 text-white hover:bg-sky-500"
                }`}
              >
                {game.is_running ? "Läuft..." : "Spielen"}
              </button>
            )}
            <button
              onClick={onEdit}
              className="rounded px-4 py-2 text-sm font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-sky-400"
            >
              Bearbeiten
            </button>
            <button
              onClick={onDelete}
              className="rounded px-4 py-2 text-sm font-semibold text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
            >
              Entfernen
            </button>
          </div>

          {(isActive || isPaused) && (
            <div className="mt-3 max-w-md">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    isPaused ? "bg-zinc-500" : "bg-sky-500"
                  }`}
                  style={{
                    width:
                      queueItem?.status === "extracting"
                        ? "100%"
                        : `${progressPercent ?? 0}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {isPaused
                  ? `Pausiert (${progressPercent ?? 0}%)`
                  : queueItem?.status === "extracting"
                    ? "Entpacke Dateien..."
                    : queueItem?.total
                      ? `${formatSize(queueItem.downloaded)} / ${formatSize(queueItem.total)} (${progressPercent ?? 0}%)`
                      : "Lädt herunter..."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
