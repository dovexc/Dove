import { useMemo, useState } from "react";
import { convertFileSrc, formatPlaytime, formatSize } from "../utils";
import { useCollectionsStore } from "../collectionsStore";
import { useLibraryStore } from "../store";
import { useT } from "../translations";
import type { Game } from "../types";

type SortKey = "name" | "size" | "playtime";

interface Props {
  games: Game[];
  onSelect: (id: number) => void;
  onPlay: (id: number) => void;
}

export function LibraryHome({ games, onSelect, onPlay }: Props) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const openContextMenu = useLibraryStore((s) => s.openContextMenu);
  const collections = useCollectionsStore((s) => s.collections);
  const createCollection = useCollectionsStore((s) => s.createCollection);
  const renameCollection = useCollectionsStore((s) => s.renameCollection);
  const deleteCollection = useCollectionsStore((s) => s.deleteCollection);
  const removeGameFromCollection = useCollectionsStore((s) => s.removeGameFromCollection);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [editingCollectionId, setEditingCollectionId] = useState<number | null>(null);
  const [editingCollectionName, setEditingCollectionName] = useState("");

  async function handleCreateCollection() {
    const name = newCollectionName.trim();
    if (!name) {
      setIsCreatingCollection(false);
      return;
    }
    await createCollection(name);
    setNewCollectionName("");
    setIsCreatingCollection(false);
  }

  function startRenameCollection(id: number, name: string) {
    setEditingCollectionId(id);
    setEditingCollectionName(name);
  }

  async function handleRenameCollection() {
    const name = editingCollectionName.trim();
    if (editingCollectionId !== null && name) {
      await renameCollection(editingCollectionId, name);
    }
    setEditingCollectionId(null);
  }

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
            {t("lib_recently_played")}
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
                      {t("game_no_cover")}
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

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {t("lib_collections")}
          </h2>
          {isCreatingCollection ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCollection();
                  if (e.key === "Escape") setIsCreatingCollection(false);
                }}
                onBlur={handleCreateCollection}
                placeholder={t("lib_collection_name_placeholder")}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </div>
          ) : (
            <button
              onClick={() => setIsCreatingCollection(true)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              {t("lib_new_collection")}
            </button>
          )}
        </div>

        {collections.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("lib_no_collections")}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {collections.map((collection) => (
              <div key={collection.id}>
                <div className="mb-2 flex items-center gap-2">
                  {editingCollectionId === collection.id ? (
                    <input
                      autoFocus
                      value={editingCollectionName}
                      onChange={(e) => setEditingCollectionName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameCollection();
                        if (e.key === "Escape") setEditingCollectionId(null);
                      }}
                      onBlur={handleRenameCollection}
                      className="rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-zinc-200">
                      {collection.name}
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">({collection.games.length})</span>
                  <div className="ml-auto flex items-center gap-3">
                    <button
                      onClick={() => startRenameCollection(collection.id, collection.name)}
                      title={t("lib_collection_rename")}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      {t("lib_collection_rename")}
                    </button>
                    <button
                      onClick={() => deleteCollection(collection.id)}
                      title={t("lib_collection_delete")}
                      className="text-xs text-zinc-500 hover:text-red-400"
                    >
                      {t("lib_collection_delete")}
                    </button>
                  </div>
                </div>

                {collection.games.length === 0 ? (
                  <p className="text-xs text-zinc-500">{t("lib_collection_empty")}</p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {collection.games.map((game) => (
                      <div key={game.id} className="group relative w-32 shrink-0">
                        <button
                          onClick={() => onSelect(game.id)}
                          onDoubleClick={() => onPlay(game.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            openContextMenu(game, e.clientX, e.clientY);
                          }}
                          className="block w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-left hover:border-zinc-600"
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
                                {t("game_no_cover")}
                              </div>
                            )}
                          </div>
                          <span className="block truncate p-2 text-xs font-medium text-zinc-100">
                            {game.name}
                          </span>
                        </button>
                        <button
                          onClick={() => removeGameFromCollection(collection.id, game.id)}
                          title={t("lib_collection_remove_game")}
                          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 hover:bg-black/80 group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {t("lib_all_games")}
          </h2>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("lib_search_placeholder")}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            >
              <option value="name">{t("lib_sort_title")}</option>
              <option value="size">{t("lib_sort_size")}</option>
              <option value="playtime">{t("lib_sort_playtime")}</option>
            </select>
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("lib_no_games_found")}</p>
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
