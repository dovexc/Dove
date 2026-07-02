import { useMemo, useState } from "react";
import { convertFileSrc, formatPlaytime, formatRelativeDate, formatSize } from "../../utils";
import { useCollectionsStore } from "../../collectionsStore";
import { useLibraryStore } from "../../store";
import { useT } from "../../translations";
import { coverGradient } from "./libraryUtils";
import type { Game } from "../../types";

type SortKey = "name" | "recent" | "size";

interface Props {
  games: Game[];
  onSelect: (id: number) => void;
  onPlay: (id: number) => void;
}

function CoverTile({
  game,
  onSelect,
  onPlay,
  onContextMenu,
  size,
}: {
  game: Game;
  onSelect: () => void;
  onPlay: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  size: "sm" | "lg";
}) {
  const width = size === "lg" ? "w-[170px]" : "w-full";
  const fontSize = size === "lg" ? "text-base" : "text-[13px]";

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onPlay}
      onContextMenu={onContextMenu}
      className={`cursor-pointer ${width}`}
    >
      <div
        className="relative aspect-[3/4] w-full overflow-hidden rounded-[10px]"
        style={{ background: game.cover_path ? undefined : coverGradient(game.name) }}
      >
        {game.cover_path ? (
          <img src={convertFileSrc(game.cover_path)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-2.5 text-center">
            <span
              className={`${fontSize} font-black leading-tight text-white/90 [text-shadow:0_2px_8px_rgba(0,0,0,.4)]`}
            >
              {game.name}
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 truncate text-[13px] font-bold text-[#dbe7f2]">{game.name}</div>
    </div>
  );
}

export function LibraryOverview({ games, onSelect, onPlay }: Props) {
  const t = useT();
  const openContextMenu = useLibraryStore((s) => s.openContextMenu);
  const collections = useCollectionsStore((s) => s.collections);
  const renameCollection = useCollectionsStore((s) => s.renameCollection);
  const deleteCollection = useCollectionsStore((s) => s.deleteCollection);
  const createCollection = useCollectionsStore((s) => s.createCollection);
  const removeGameFromCollection = useCollectionsStore((s) => s.removeGameFromCollection);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
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
        .slice(0, 6),
    [games]
  );

  const filteredGames = useMemo(() => {
    const filtered = games.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()));
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "size") return b.size_on_disk_bytes - a.size_on_disk_bytes;
      if (sortKey === "recent") return (b.last_played_at ?? "").localeCompare(a.last_played_at ?? "");
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [games, search, sortKey]);

  return (
    <div className="px-10 py-[30px] pb-[70px]">
      {recentGames.length > 0 && (
        <section className="mb-9">
          <div className="mb-4 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
            {t("lib_recently_played")}
          </div>
          <div className="flex flex-wrap gap-[18px]">
            {recentGames.map((game) => (
              <div key={game.id}>
                <CoverTile
                  game={game}
                  size="lg"
                  onSelect={() => onSelect(game.id)}
                  onPlay={() => onPlay(game.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openContextMenu(game, e.clientX, e.clientY);
                  }}
                />
                <div className="mt-0.5 text-[11px] text-[#6b7884]">
                  {formatRelativeDate(game.last_played_at, t)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-9">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
            {t("lib_collections")}
          </span>
          {isCreatingCollection ? (
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
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[13px] text-zinc-100 outline-none focus:ring-1 focus:ring-sky-500"
            />
          ) : (
            <button
              onClick={() => setIsCreatingCollection(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 text-[13px] font-bold text-[#dbe7f2] hover:bg-white/10 hover:text-white"
            >
              <span className="text-[15px] leading-none">+</span> {t("lib_new_collection")}
            </button>
          )}
        </div>

        {collections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.12] bg-gradient-to-b from-[#141d27] to-[#111923] px-[22px] py-[22px] text-center text-[13px] text-[#6b7884]">
            {t("lib_no_collections")}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {collections.map((collection) => (
              <div key={collection.id}>
                <div className="mb-2.5 flex items-center gap-2">
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
                    <span className="text-sm font-bold text-[#dbe7f2]">{collection.name}</span>
                  )}
                  <span className="text-xs text-zinc-500">({collection.games.length})</span>
                  <div className="ml-auto flex items-center gap-3">
                    <button
                      onClick={() => {
                        setEditingCollectionId(collection.id);
                        setEditingCollectionName(collection.name);
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      {t("lib_collection_rename")}
                    </button>
                    <button
                      onClick={() => deleteCollection(collection.id)}
                      className="text-xs text-zinc-500 hover:text-red-400"
                    >
                      {t("lib_collection_delete")}
                    </button>
                  </div>
                </div>
                {collection.games.length === 0 ? (
                  <p className="text-xs text-zinc-500">{t("lib_collection_empty")}</p>
                ) : (
                  <div className="flex flex-wrap gap-[18px]">
                    {collection.games.map((game) => (
                      <div key={game.id} className="group relative">
                        <CoverTile
                          game={game}
                          size="lg"
                          onSelect={() => onSelect(game.id)}
                          onPlay={() => onPlay(game.id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            openContextMenu(game, e.clientX, e.clientY);
                          }}
                        />
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

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
            {t("lib_all_games")} ({games.length})
          </span>
          <div className="flex items-center gap-2.5">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("lib_search_placeholder")}
              className="h-[38px] w-[170px] rounded-lg border border-white/[0.08] bg-[#0d141c] px-3.5 text-[13px] text-[#dbe7f2] outline-none placeholder:text-[#5b6b7a]"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-[38px] rounded-lg border border-white/[0.08] bg-[#0d141c] px-3.5 text-[13px] font-semibold text-[#dbe7f2] outline-none"
            >
              <option value="name">{t("lib_sort_title")}</option>
              <option value="recent">{t("lib_sort_recent")}</option>
              <option value="size">{t("lib_sort_size")}</option>
            </select>
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("lib_no_games_found")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923]">
            {filteredGames.map((game) => (
              <div
                key={game.id}
                onClick={() => onSelect(game.id)}
                onDoubleClick={() => onPlay(game.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openContextMenu(game, e.clientX, e.clientY);
                }}
                className="flex cursor-pointer items-center gap-3.5 border-b border-white/5 px-[18px] py-3 last:border-b-0 hover:bg-white/[0.03]"
              >
                <div
                  className="h-9 w-9 shrink-0 overflow-hidden rounded-md"
                  style={{ background: game.cover_path ? undefined : coverGradient(game.name) }}
                >
                  {game.cover_path ? (
                    <img
                      src={convertFileSrc(game.cover_path)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-black text-white/85">
                      {game.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="flex-1 truncate text-sm font-bold text-[#dbe7f2]">{game.name}</span>
                <span className="w-[90px] text-right text-xs text-[#7b8794]">
                  {formatSize(game.size_on_disk_bytes)}
                </span>
                <span className="w-[90px] text-right text-xs text-[#7b8794]">
                  {formatPlaytime(game.total_playtime_seconds)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
