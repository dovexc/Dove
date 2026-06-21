import { convertFileSrc, formatPlaytime } from "../utils";
import { useLibraryStore } from "../store";
import type { Game } from "../types";

interface Props {
  game: Game;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function GameDetail({ game, onPlay, onEdit, onDelete }: Props) {
  const openContextMenu = useLibraryStore((s) => s.openContextMenu);

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
        </div>
      </div>
    </div>
  );
}
