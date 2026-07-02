import { useMemo, useState } from "react";
import { convertFileSrc } from "../../utils";
import { useLibraryStore } from "../../store";
import { useDownloadStore } from "../../downloadStore";
import { useT } from "../../translations";
import { SearchIcon } from "../icons";
import { coverGradient } from "./libraryUtils";
import type { Game } from "../../types";

interface Props {
  games: Game[];
  selectedGameId: number | null;
  onSelect: (id: number) => void;
  onPlay: (id: number) => void;
}

export function LibrarySidebar({ games, selectedGameId, onSelect, onPlay }: Props) {
  const t = useT();
  const openContextMenu = useLibraryStore((s) => s.openContextMenu);
  const queue = useDownloadStore((s) => s.queue);
  const [search, setSearch] = useState("");

  const visibleGames = useMemo(
    () => games.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase())),
    [games, search]
  );

  return (
    <div className="flex h-full flex-col bg-[#0d131a]">
      <div className="p-4 pb-3">
        <div className="flex h-[38px] items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#0d141c] px-3">
          <SearchIcon size={13} className="text-[#5b6b7a]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("lib_search_placeholder")}
            className="flex-1 bg-transparent text-[13px] text-[#dbe7f2] outline-none placeholder:text-[#5b6b7a]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4">
        {games.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("lib_no_games_yet")}</p>
        ) : visibleGames.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("lib_no_games_found")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {visibleGames.map((game) => {
              const isSelected = game.id === selectedGameId;
              const queueItem = queue.find((i) => i.id === game.id);
              const installing =
                queueItem?.status === "downloading" || queueItem?.status === "extracting";
              const progressPercent =
                queueItem?.status === "downloading" && queueItem.total
                  ? Math.min(100, Math.round((queueItem.downloaded / queueItem.total) * 100))
                  : null;

              return (
                <div
                  key={game.id}
                  onClick={() => onSelect(game.id)}
                  onDoubleClick={() => onPlay(game.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openContextMenu(game, e.clientX, e.clientY);
                  }}
                  className="flex min-w-0 cursor-pointer flex-col gap-1.5"
                >
                  <div
                    className="relative aspect-[3/4] w-full overflow-hidden rounded-lg"
                    style={{
                      background: game.cover_path ? undefined : coverGradient(game.name),
                      boxShadow: isSelected ? "0 0 0 1px rgba(58,160,255,.4)" : "none",
                      border: `2px solid ${isSelected ? "#3aa0ff" : "transparent"}`,
                    }}
                  >
                    {game.cover_path ? (
                      <img
                        src={convertFileSrc(game.cover_path)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-1.5 text-center">
                        <span className="text-[13px] font-black leading-tight text-white/90 [text-shadow:0_2px_8px_rgba(0,0,0,.4)]">
                          {game.name}
                        </span>
                      </div>
                    )}
                    {installing && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                        <div
                          className="h-full bg-sky-500"
                          style={{
                            width:
                              queueItem?.status === "extracting" ? "100%" : `${progressPercent ?? 0}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="truncate text-[11px] font-bold text-[#9fb2c2]">{game.name}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
