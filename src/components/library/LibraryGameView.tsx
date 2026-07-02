import { useEffect, useMemo, useState } from "react";
import { convertFileSrc, formatPlaytime, formatRelativeDate, formatSize } from "../../utils";
import { useLibraryStore } from "../../store";
import { useDownloadStore } from "../../downloadStore";
import { useCatalogStore } from "../../catalogStore";
import { useT } from "../../translations";
import { PlayIcon, SettingsIcon, TrophyIcon, LockIcon, ClockIcon } from "../icons";
import { coverGradient } from "./libraryUtils";
import { AchievementsDialog } from "./AchievementsDialog";
import type { Game } from "../../types";

type Tab = "overview" | "store" | "community" | "guides";

interface Props {
  game: Game;
  onBack: () => void;
  onOpenStorePage: () => void;
}

export function LibraryGameView({ game, onBack, onOpenStorePage }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("overview");
  const [showAchievements, setShowAchievements] = useState(false);

  const openContextMenu = useLibraryStore((s) => s.openContextMenu);
  const checkForUpdate = useLibraryStore((s) => s.checkForUpdate);
  const updateInfo = useLibraryStore((s) => s.updateAvailable[game.id]);
  const openEditDialog = useLibraryStore((s) => s.openEditDialog);
  const launchGame = useLibraryStore((s) => s.launchGame);
  const enqueue = useDownloadStore((s) => s.enqueue);
  const resumeDownload = useDownloadStore((s) => s.resumeDownload);
  const queueItem = useDownloadStore((s) => s.queue.find((i) => i.id === game.id));

  const catalogGames = useCatalogStore((s) => s.games);
  const fetchCatalog = useCatalogStore((s) => s.fetchCatalog);
  const openGameDetail = useCatalogStore((s) => s.openGameDetail);
  const detailAchievements = useCatalogStore((s) => s.detailAchievements);
  const refreshDetailAchievements = useCatalogStore((s) => s.refreshDetailAchievements);

  const pendingInstall = game.exe_path.startsWith("store://catalog/");
  const isActive = queueItem?.status === "downloading" || queueItem?.status === "extracting";
  const isQueued = queueItem?.status === "queued";
  const isPaused = queueItem?.status === "paused";
  const progressPercent =
    (queueItem?.status === "downloading" || queueItem?.status === "paused") && queueItem.total
      ? Math.min(100, Math.round((queueItem.downloaded / queueItem.total) * 100))
      : null;
  const hasUpdate = !!updateInfo && !queueItem;

  useEffect(() => {
    if (game.catalog_game_id != null && !pendingInstall && !queueItem) {
      checkForUpdate(game.id);
    }
  }, [game.id, game.catalog_game_id, pendingInstall, queueItem, checkForUpdate]);

  useEffect(() => {
    if (catalogGames.length === 0) fetchCatalog();
    // Only ever needs to run once — Library may be the first tab opened,
    // before StoreView has had a chance to populate the catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (game.catalog_game_id != null) {
      refreshDetailAchievements(game.catalog_game_id);
    }
    // `game.id` is a stable React `key` at the call site (see App.tsx), so
    // this component remounts fresh per selection — this only needs to run
    // once per mount, not on every catalog_game_id identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalogGame = useMemo(
    () => catalogGames.find((g) => g.id === game.catalog_game_id) ?? null,
    [catalogGames, game.catalog_game_id]
  );
  const genre = catalogGame?.tags?.split(",")[0]?.trim() || null;

  // The shared `detailAchievements` slice isn't keyed by game — guard
  // against a brief cross-game flash while a fresh fetch is in flight.
  const achievements =
    game.catalog_game_id != null &&
    detailAchievements.length > 0 &&
    detailAchievements[0].catalog_game_id === game.catalog_game_id
      ? detailAchievements
      : [];
  const achDone = achievements.filter((a) => a.unlocked).length;
  const achTotal = achievements.length;
  const achPct = achTotal ? Math.round((achDone / achTotal) * 100) : 0;

  function handlePlay() {
    if (pendingInstall) {
      if (isPaused) resumeDownload(game.id);
      else if (!queueItem) enqueue(game.id, game.name);
    }
  }

  function handleStoreTab() {
    setTab("store");
    if (catalogGame) {
      openGameDetail(catalogGame, "library");
      onOpenStorePage();
    }
  }

  const coverUrl = game.cover_path ? convertFileSrc(game.cover_path) : catalogGame?.cover_url;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("lib_tab_overview") },
    ...(catalogGame ? [{ key: "store" as Tab, label: t("lib_tab_store_page") }] : []),
    { key: "community", label: t("lib_tab_community") },
    { key: "guides", label: t("lib_tab_guides") },
  ];

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-y-auto bg-[radial-gradient(1200px_600px_at_50%_-150px,#1c2c3e_0%,#0d141c_55%,#0b1016_100%)]">
      <div className="flex min-w-0 flex-1">
        <div className="min-w-0 flex-1 pb-[60px]">
          <div className="px-10 pt-[18px]">
            <button
              onClick={onBack}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-[13px] font-bold text-[#c7d5e0] hover:bg-white/10 hover:text-white"
            >
              ← {t("lib_back_to_library")}
            </button>
          </div>
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              openContextMenu(game, e.clientX, e.clientY);
            }}
            className="relative mt-[18px] h-[280px] overflow-hidden"
            style={{
              background: coverUrl ? `url(${coverUrl}) center/cover` : coverGradient(game.name),
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-[#0b1016]/10 via-[#0b1016]/40 to-[#0d141c]" />
            <div className="absolute bottom-7 left-10 right-10">
              {genre && (
                <div className="mb-2 text-xs font-extrabold uppercase tracking-[3px] text-white/55">
                  {genre}
                </div>
              )}
              <div className="text-[44px] font-black leading-none tracking-tight text-white [text-shadow:0_4px_20px_rgba(0,0,0,.5)]">
                {game.name}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 border-b border-white/[0.06] px-10 py-5">
            {pendingInstall ? (
              <button
                onClick={handlePlay}
                disabled={isActive || isQueued}
                className="flex h-[50px] items-center gap-2 rounded-[10px] bg-sky-600 px-6 text-[16px] font-extrabold text-white shadow-[0_8px_22px_rgba(40,120,220,.3)] hover:bg-sky-500 disabled:opacity-50"
              >
                <PlayIcon size={15} />
                {isActive
                  ? queueItem?.status === "extracting"
                    ? t("dl_extracting_short")
                    : t("dl_downloading")
                  : isQueued
                    ? t("gd_in_queue")
                    : isPaused
                      ? t("dl_resume")
                      : t("gd_download_install")}
              </button>
            ) : (
              <button
                onClick={() => launchGame(game.id)}
                disabled={game.is_running}
                className="flex h-[50px] items-center gap-2 rounded-[10px] px-6 text-[16px] font-extrabold text-[#0b1016] shadow-[0_8px_22px_rgba(140,210,40,.3)] disabled:opacity-70"
                style={{ background: "linear-gradient(180deg,#b6f23c,#8fd11f)" }}
              >
                <PlayIcon size={15} />
                {game.is_running ? t("gd_running_ellipsis") : t("dl_play")}
              </button>
            )}

            {hasUpdate && (
              <button
                onClick={() => enqueue(game.id, game.name)}
                className="rounded-[10px] bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500"
              >
                {t("gd_update_available")}
                {updateInfo!.files_to_update > 0 && ` (${formatSize(updateInfo!.bytes_to_download)})`}
              </button>
            )}

            <div className="flex items-center gap-2.5">
              <ClockIcon size={17} className="text-[#7b8794]" />
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wide text-[#6b7884]">
                  {t("lib_last_played_label")}
                </div>
                <div className="text-[13px] font-bold text-[#dbe7f2]">
                  {formatRelativeDate(game.last_played_at, t)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <ClockIcon size={17} className="text-[#7b8794]" />
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wide text-[#6b7884]">
                  {t("gd_playtime")}
                </div>
                <div className="text-[13px] font-bold text-[#dbe7f2]">
                  {formatPlaytime(game.total_playtime_seconds)}
                </div>
              </div>
            </div>

            {achTotal > 0 && (
              <button
                onClick={() => setShowAchievements(true)}
                className="group flex min-w-[170px] items-center gap-2.5 rounded-lg px-2 py-1 -mx-2 -my-1 text-left transition-colors hover:bg-white/[0.06]"
              >
                <TrophyIcon size={17} className="text-[#d4f436]" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#6b7884] group-hover:text-[#9fb2c2]">
                      {t("lib_achievements_label")}
                    </span>
                    <span className="text-xs font-bold text-[#dbe7f2]">
                      {achDone}/{achTotal}
                    </span>
                  </div>
                  <div className="mt-1 h-[5px] w-full overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${achPct}%`, background: "linear-gradient(90deg,#d4f436,#8fd11f)" }}
                    />
                  </div>
                </div>
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => openEditDialog(game.id)}
                title={t("gd_edit")}
                className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-white/[0.08] bg-white/[0.04] text-[#9fb2c2] hover:bg-white/10"
              >
                <SettingsIcon size={16} />
              </button>
            </div>
          </div>

          {(isActive || isPaused) && (
            <div className="px-10 pt-3">
              <div className="h-2 max-w-md overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all ${isPaused ? "bg-zinc-500" : "bg-sky-500"}`}
                  style={{
                    width: queueItem?.status === "extracting" ? "100%" : `${progressPercent ?? 0}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {isPaused
                  ? `${t("gd_paused_percent")} (${progressPercent ?? 0}%)`
                  : queueItem?.status === "extracting"
                    ? t("gd_extracting_files")
                    : queueItem?.total
                      ? `${formatSize(queueItem.downloaded)} / ${formatSize(queueItem.total)} (${progressPercent ?? 0}%)`
                      : t("dl_downloading")}
              </p>
            </div>
          )}

          <div className="flex items-center gap-7 border-b border-white/[0.06] px-10">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={tb.key === "store" ? handleStoreTab : () => setTab(tb.key)}
                className={`flex h-[52px] items-center border-b-2 text-sm font-bold ${
                  tab === tb.key
                    ? "border-sky-400 text-white"
                    : "border-transparent text-[#8a97a5] hover:text-zinc-200"
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="px-10 py-6">
              <div className="mb-3.5 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                {t("lib_activity_label")}
              </div>
              <div className="mb-5 rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-4 py-3.5">
                <input
                  disabled
                  placeholder={t("lib_say_something_placeholder")}
                  className="w-full bg-transparent text-sm text-[#dbe7f2] outline-none placeholder:text-zinc-500"
                />
              </div>
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
                {t("lib_coming_soon")}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center px-10 py-16 text-sm text-zinc-500">
              {t("lib_coming_soon")}
            </div>
          )}
        </div>

        <div className="w-[280px] shrink-0 border-l border-white/[0.06] px-6 py-[26px]">
          <div className="mb-3.5 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
            {t("lib_friends_who_play")}
          </div>
          <div className="mb-6 rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-4 py-6 text-center text-sm text-zinc-500">
            {t("lib_coming_soon")}
          </div>

          <div className="mb-3.5 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
            {t("lib_achievements_label")}
          </div>
          <div
            className={`rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] p-4 ${
              achTotal > 0 ? "transition-colors hover:border-amber-400/25 hover:from-[#182230]" : ""
            }`}
          >
            {achTotal === 0 ? (
              <p className="text-sm text-zinc-500">{t("lib_no_achievements_hint")}</p>
            ) : (
              <button onClick={() => setShowAchievements(true)} className="group block w-full text-left">
                <div className="mb-1.5 flex items-center justify-between text-sm font-bold text-[#dbe7f2]">
                  <span>
                    {achDone} / {achTotal} {t("lib_achievements_unlocked_suffix")}
                  </span>
                  <span className="text-xs font-normal text-[#5b8db8] opacity-0 transition-opacity group-hover:opacity-100">
                    {t("lib_view_all")} →
                  </span>
                </div>
                <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${achPct}%`, background: "linear-gradient(90deg,#d4f436,#8fd11f)" }}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {achievements.map((a) => (
                    <div
                      key={a.id}
                      title={a.title ?? undefined}
                      className={`flex aspect-square items-center justify-center rounded-lg border transition-transform group-hover:scale-105 ${
                        a.unlocked
                          ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                          : "border-white/[0.06] bg-white/[0.04] text-[#4a5765]"
                      }`}
                    >
                      {a.unlocked ? <TrophyIcon size={14} /> : <LockIcon size={14} />}
                    </div>
                  ))}
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {showAchievements && (
        <AchievementsDialog
          gameName={game.name}
          achievements={achievements}
          onClose={() => setShowAchievements(false)}
        />
      )}
    </div>
  );
}
