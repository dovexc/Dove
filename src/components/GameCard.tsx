import { convertFileSrc } from "../utils";
import { useLibraryStore } from "../store";
import type { Game } from "../types";

interface Props {
  game: Game;
  isSelected: boolean;
  onSelect: () => void;
  onPlay: () => void;
}

export function GameCard({ game, isSelected, onSelect, onPlay }: Props) {
  const openContextMenu = useLibraryStore((s) => s.openContextMenu);
  const installingId = useLibraryStore((s) => s.installingId);
  const installProgress = useLibraryStore((s) => s.installProgress);
  const installCatalogGame = useLibraryStore((s) => s.installCatalogGame);

  const pendingInstall = game.exe_path.startsWith("store://catalog/");
  const installing = installingId === game.id;
  const progress = installing ? installProgress : null;
  const progressPercent =
    progress?.phase === "downloading" && progress.total
      ? Math.min(100, Math.round((progress.downloaded! / progress.total) * 100))
      : null;

  function handlePlay() {
    if (pendingInstall) {
      installCatalogGame(game.id);
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
            Kein Cover
          </div>
        )}
      </div>
      {installing && (
        <div className="h-1 w-full bg-zinc-800">
          <div
            className="h-full bg-sky-500 transition-all"
            style={{
              width:
                progress?.phase === "extracting"
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
            ? "Läuft"
            : installing
              ? progress?.phase === "extracting"
                ? "Entpacke..."
                : progressPercent != null
                  ? `${progressPercent}%`
                  : "..."
              : pendingInstall
                ? "Installieren"
                : "Spielen"}
        </span>
      </div>
    </button>
  );
}
