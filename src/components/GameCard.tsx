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

  return (
    <button
      onClick={onSelect}
      onDoubleClick={onPlay}
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
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="truncate text-sm font-medium text-zinc-100">
          {game.name}
        </span>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
            game.is_running
              ? "bg-emerald-700 text-emerald-100"
              : "bg-sky-600 text-white hover:bg-sky-500"
          }`}
        >
          {game.is_running ? "Läuft" : "Spielen"}
        </span>
      </div>
    </button>
  );
}
