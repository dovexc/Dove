import { useMemo, useState } from "react";
import { convertFileSrc, formatPlaytime, formatSize } from "../utils";
import { useLibraryStore } from "../store";
import type { Game } from "../types";

type SortKey = "name" | "size" | "playtime";

interface Props {
  games: Game[];
  onSelect: (id: number) => void;
  onPlay: (id: number) => void;
}

export function LibraryHome({ games, onSelect, onPlay }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const openContextMenu = useLibraryStore((s) => s.openContextMenu);

  const recentGames = useMemo(
    () =>
      games
        .filter((g): g is Game & { last_played_at: string } => Boolean(g.last_played_at))
        .sort((a, b) => (a.last_played_at < b.last_played_at ? 1 : -1))
        .slice(0, 10),
    [games]
  );

  const filteredGames = useMemo(() => {
    const filtered = games.filter((g) =>
      g.name.toLowerCase().includes(search.trim().toLowerCase())
    );
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "size") return b.size_on_disk_bytes - a.size_on_disk_bytes;
      if (sortKey === "playtime") {
        return b.total_playtime_seconds - a.total_playtime_seconds;
      }
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [games, search, sortKey]);

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto p-6">
      {recentGames.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Zuletzt gespielt
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recentGames.map((game) => (
              <button
                key={game.id}
                onClick={() => onSelect(game.id)}
                onDoubleClick={() => onPlay(game.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openContextMenu(game, e.clientX, e.clientY);
                }}
                className="w-32 shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-left hover:border-zinc-600"
              >
                <div className="aspect-[3/4] w-full bg-zinc-800">
                  {game.cover_path ? (
                    <img
                      src={convertFileSrc(game.cover_path)}
                      alt={game.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500">
                      Kein Cover
                    </div>
                  )}
                </div>
                <span className="block truncate p-2 text-xs font-medium text-zinc-100">
                  {game.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Alle Spiele
          </h2>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Titel durchsuchen..."
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            >
              <option value="name">Titel</option>
              <option value="size">Größe auf der Festplatte</option>
              <option value="playtime">Spielzeit</option>
            </select>
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <p className="text-sm text-zinc-500">Keine Spiele gefunden.</p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-800 overflow-y-auto">
            {filteredGames.map((game) => (
              <button
                key={game.id}
                onClick={() => onSelect(game.id)}
                onDoubleClick={() => onPlay(game.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openContextMenu(game, e.clientX, e.clientY);
                }}
                className="flex items-center gap-3 px-2 py-2 text-left hover:bg-zinc-900"
              >
                <div className="h-10 w-8 shrink-0 overflow-hidden rounded bg-zinc-800">
                  {game.cover_path && (
                    <img
                      src={convertFileSrc(game.cover_path)}
                      alt={game.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <span className="flex-1 truncate text-sm text-zinc-100">
                  {game.name}
                </span>
                <span className="w-28 shrink-0 text-right text-xs text-zinc-400">
                  {formatSize(game.size_on_disk_bytes)}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-zinc-400">
                  {formatPlaytime(game.total_playtime_seconds)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
