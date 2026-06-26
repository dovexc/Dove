import { convertFileSrc } from "../utils";
import { useLibraryStore } from "../store";
import { useDownloadStore } from "../downloadStore";
import { useT } from "../translations";
import type { Game } from "../types";

interface Props {
  game: Game;
  isSelected: boolean;
  onSelect: () => void;
  onPlay: () => void;
}

export function GameCard({ game, isSelected, onSelect, onPlay }: Props) {
  const t = useT();
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

  function handlePlay() {
    if (pendingInstall) {
      if (isPaused) {
        resumeDownload(game.id);
      } else if (!queueItem) {
        enqueue(game.id, game.name);
      }
    } else {
      onPlay();
    }
  }

  return (
    <button
      onClick={onSelect}
      onDoubleClick={handlePlay}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(game, e.clientX, e.clientY);
      }}
      className={`group relative flex flex-col overflow-hidden rounded-lg border text-left transition ${
        isSelected
          ? "border-sky-500 ring-2 ring-sky-500"
          : "border-zinc-800 hover:border-zinc-600"
      } bg-zinc-900`}
    >
      <div className="aspect-[3/4] w-full bg-zinc-800">
        {game.cover_path ? (
          <img
            src={convertFileSrc(game.cover_path)}
            alt={game.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-500 text-sm">
            {t("game_no_cover")}
          </div>
        )}
      </div>
      {(isActive || isPaused) && (
        <div className="h-1 w-full bg-zinc-800">
          <div
            className={`h-full transition-all ${isPaused ? "bg-zinc-500" : "bg-sky-500"}`}
            style={{
              width:
                queueItem?.status === "extracting"
                  ? "100%"
                  : `${progressPercent ?? 0}%`,
            }}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="truncate text-sm font-medium text-zinc-100">
          {game.name}
        </span>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePlay();
          }}
          className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
            game.is_running
              ? "bg-emerald-700 text-emerald-100"
              : "bg-sky-600 text-white hover:bg-sky-500"
          }`}
        >
          {game.is_running
            ? t("game_running")
            : isActive
              ? queueItem?.status === "extracting"
                ? t("dl_extracting_short")
                : progressPercent != null
                  ? `${progressPercent}%`
                  : "..."
              : isPaused
                ? t("dl_resume")
                : isQueued
                  ? t("game_waiting")
                  : pendingInstall
                    ? t("game_install")
                    : t("dl_play")}
        </span>
      </div>
    </button>
  );
}
