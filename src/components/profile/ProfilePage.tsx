import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../../authStore";
import { API_BASE } from "../../authStore";
import { useFriendsStore } from "../../friendsStore";
import { useLibraryStore } from "../../store";
import { convertFileSrc, formatPlaytime } from "../../utils";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import { AchievementTile } from "./AchievementTile";

const MAX_SHOWCASE_ACHIEVEMENTS = 4;

interface Props {
  onOpenFriends: () => void;
}

const FRIENDS_PREVIEW_COUNT = 5;

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatRelativeTime(value: string, t: (key: TranslationKey) => string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return t("prof_today");
  if (days === 1) return t("prof_one_day_ago");
  if (days < 30) return t("prof_days_ago").replace("{n}", String(days));
  const months = Math.floor(days / 30);
  if (months < 12)
    return months === 1 ? t("prof_one_month_ago") : t("prof_months_ago").replace("{n}", String(months));
  const years = Math.floor(months / 12);
  return years === 1 ? t("prof_one_year_ago") : t("prof_years_ago").replace("{n}", String(years));
}

export function ProfilePage({ onOpenFriends }: Props) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const screenshots = useAuthStore((s) => s.screenshots);
  const badges = useAuthStore((s) => s.badges);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);
  const uploadBackground = useAuthStore((s) => s.uploadBackground);
  const addScreenshot = useAuthStore((s) => s.addScreenshot);
  const deleteScreenshot = useAuthStore((s) => s.deleteScreenshot);
  const clearError = useAuthStore((s) => s.clearError);
  const fetchBadges = useAuthStore((s) => s.fetchBadges);
  const setEquippedBadge = useAuthStore((s) => s.setEquippedBadge);
  const myAchievements = useAuthStore((s) => s.myAchievements);
  const achievementShowcase = useAuthStore((s) => s.achievementShowcase);
  const fetchMyAchievements = useAuthStore((s) => s.fetchMyAchievements);
  const setAchievementShowcase = useAuthStore((s) => s.setAchievementShowcase);

  const friends = useFriendsStore((s) => s.friends);
  const loadingFriends = useFriendsStore((s) => s.loadingFriends);
  const fetchFriends = useFriendsStore((s) => s.fetchFriends);

  const games = useLibraryStore((s) => s.games);

  useEffect(() => {
    fetchFriends();
    fetchBadges();
  }, [fetchFriends, fetchBadges]);

  const [editMode, setEditMode] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user?.display_name ?? "");
  const [editingBio, setEditingBio] = useState(false);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [selectedShowcaseIds, setSelectedShowcaseIds] = useState<number[]>([]);

  useEffect(() => {
    if (!editMode) return;
    fetchMyAchievements();
    setSelectedShowcaseIds(achievementShowcase.map((a) => a.id));
    // Only re-seed the selection when edit mode is freshly entered, not on
    // every `achievementShowcase` change — that would blow away in-progress
    // toggles as soon as a save round-trips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  function toggleShowcaseAchievement(id: number) {
    setSelectedShowcaseIds((prev) => {
      if (prev.includes(id)) return prev.filter((existing) => existing !== id);
      if (prev.length >= MAX_SHOWCASE_ACHIEVEMENTS) return prev;
      return [...prev, id];
    });
  }

  function saveShowcase() {
    setAchievementShowcase(selectedShowcaseIds);
  }

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const totalPlaytimeSeconds = useMemo(
    () => games.reduce((sum, g) => sum + g.total_playtime_seconds, 0),
    [games]
  );

  const lastPlayedGame = useMemo(
    () =>
      games
        .filter((g): g is typeof g & { last_played_at: string } => Boolean(g.last_played_at))
        .sort((a, b) => (a.last_played_at < b.last_played_at ? 1 : -1))[0] ?? null,
    [games]
  );

  if (!user) return null;

  async function saveName() {
    if (name.trim() && name.trim() !== user!.display_name) {
      await updateProfile({ display_name: name.trim() });
    }
    setEditingName(false);
  }

  async function saveBio() {
    await updateProfile({ bio: bio.trim() });
    setEditingBio(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAvatar(await fileToDataUrl(file));
    e.target.value = "";
  }

  async function handleBackgroundChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadBackground(await fileToDataUrl(file));
    e.target.value = "";
  }

  async function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await addScreenshot(await fileToDataUrl(file));
    e.target.value = "";
  }

  const backgroundUrl = resolveUrl(user.background_url);
  const avatarUrl = resolveUrl(user.avatar_url);

  const stats: { value: string; label: string; color: string }[] = [
    { value: String(games.length), label: t("stat_games"), color: "#66c0f4" },
    { value: String(friends.length), label: t("stat_friends"), color: "#9fb2c2" },
    { value: formatPlaytime(totalPlaytimeSeconds), label: t("stat_playtime"), color: "#a4d007" },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#0b1016]">
      <div
        className="relative h-[280px] w-full bg-cover bg-center"
        style={{
          background: backgroundUrl
            ? `url(${backgroundUrl}) center/cover`
            : "linear-gradient(125deg,#1c3a5e 0%,#2c1f4a 50%,#3a2151 100%)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1016]/15 via-[#0b1016]/55 to-[#0b1016]" />
        {editMode && (
          <button
            onClick={() => backgroundInputRef.current?.click()}
            className="absolute bottom-4 right-8 rounded-md bg-black/40 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-black/60"
          >
            {t("profile_change_background")}
          </button>
        )}
        <input
          ref={backgroundInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleBackgroundChange}
        />
      </div>

      <div className="mx-auto max-w-[1180px] px-10 pb-[90px]">
        <div className="relative z-[2] -mt-[72px] flex items-end gap-6">
          <div className="group relative shrink-0">
            <div
              className="flex h-[148px] w-[148px] items-center justify-center rounded-3xl border-4 border-[#0b1016] text-5xl font-black text-white shadow-2xl"
              style={{ background: "linear-gradient(135deg,#3aa0ff,#7b4397)" }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full rounded-3xl object-cover" />
              ) : (
                user.display_name.slice(0, 1).toUpperCase()
              )}
            </div>
            <span
              className="absolute bottom-2 right-2 h-[22px] w-[22px] rounded-full border-4 border-[#0b1016] bg-[#5fd17a]"
              style={{ boxShadow: "0 0 10px #5fd17a" }}
            />
            {editMode && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/60 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                {t("profile_change_avatar")}
              </button>
            )}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div className="flex-1 pb-2">
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="rounded bg-zinc-800 px-3 py-1.5 text-2xl font-bold text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
                <button
                  onClick={saveName}
                  className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                >
                  {t("dialog_save")}
                </button>
                <button
                  onClick={() => {
                    setName(user.display_name);
                    setEditingName(false);
                  }}
                  className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
                >
                  {t("dialog_cancel")}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3.5">
                <h1
                  onClick={() => editMode && setEditingName(true)}
                  className={`text-[38px] font-black tracking-tight text-white ${editMode ? "cursor-pointer hover:underline" : ""}`}
                  title={editMode ? t("profile_click_to_edit_name") : undefined}
                >
                  {user.display_name}
                </h1>
                {user.equipped_badge && (
                  <span
                    title={user.equipped_badge.description}
                    className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[13px] font-bold text-amber-300"
                  >
                    <span>{user.equipped_badge.icon}</span>
                    {user.equipped_badge.label}
                  </span>
                )}
                <button
                  onClick={() => setEditMode((v) => !v)}
                  className={`rounded-md px-3.5 py-1.5 text-[13px] font-bold ${
                    editMode
                      ? "bg-sky-600 text-white hover:bg-sky-500"
                      : "border border-sky-400/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:text-white"
                  }`}
                >
                  {editMode ? t("profile_done") : t("profile_edit")}
                </button>
              </div>
            )}
            <p className="mt-1.5 text-[15px] text-zinc-500">{user.email}</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center justify-between rounded bg-red-900/60 px-3 py-2 text-sm text-red-100">
            <span>{error}</span>
            <button onClick={clearError} className="font-bold">
              ✕
            </button>
          </div>
        )}

        <div className="mt-7 flex overflow-hidden rounded-[13px] border border-white/[0.06] bg-gradient-to-b from-[#161f2a] to-[#121a23]">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`flex-1 px-6 py-5 ${i < stats.length - 1 ? "border-r border-white/[0.05]" : ""}`}
            >
              <div className="text-[28px] font-black tracking-tight" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="mt-1 text-xs font-bold uppercase tracking-[1.5px] text-[#6b7884]">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-[30px] grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-[30px]">
            {editMode && (
              <div>
                <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                  {t("profile_badge_picker")}
                </div>
                {badges.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    {t("profile_no_badges_hint")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setEquippedBadge(null)}
                      disabled={loading}
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold disabled:opacity-50 ${
                        !user.equipped_badge
                          ? "border-sky-400/50 bg-sky-500/15 text-sky-300"
                          : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                      }`}
                    >
                      {t("profile_no_badge")}
                    </button>
                    {badges.map((b) => (
                      <button
                        key={b.key}
                        onClick={() => setEquippedBadge(b.key)}
                        disabled={loading}
                        title={b.description}
                        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-bold disabled:opacity-50 ${
                          user.equipped_badge?.key === b.key
                            ? "border-amber-400/50 bg-amber-500/15 text-amber-300"
                            : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                        }`}
                      >
                        <span>{b.icon}</span>
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                  {t("profile_achievement_showcase")}
                </div>
                {editMode && (
                  <span className="text-xs text-zinc-500">
                    {selectedShowcaseIds.length}/{MAX_SHOWCASE_ACHIEVEMENTS}
                  </span>
                )}
              </div>

              {editMode ? (
                myAchievements.length === 0 ? (
                  <p className="text-sm text-zinc-500">{t("profile_no_achievements_hint")}</p>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-zinc-500">{t("profile_achievement_picker_hint")}</p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                      {myAchievements.map((a) => (
                        <AchievementTile
                          key={a.id}
                          achievement={a}
                          selected={selectedShowcaseIds.includes(a.id)}
                          onClick={() => toggleShowcaseAchievement(a.id)}
                        />
                      ))}
                    </div>
                    <button
                      onClick={saveShowcase}
                      disabled={loading}
                      className="mt-3 rounded bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      {t("profile_save_showcase")}
                    </button>
                  </>
                )
              ) : achievementShowcase.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("profile_no_showcase_hint")}</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {achievementShowcase.map((a) => (
                    <AchievementTile key={a.id} achievement={a} />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                {t("profile_about")}
              </div>
              {editingBio ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder={t("profile_bio_placeholder")}
                    className="rounded-[11px] bg-[#141d27] px-4 py-3 text-[15px] text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveBio}
                      className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                    >
                      {t("dialog_save")}
                    </button>
                    <button
                      onClick={() => {
                        setBio(user.bio ?? "");
                        setEditingBio(false);
                      }}
                      className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800"
                    >
                      {t("dialog_cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditingBio(true)}
                  className="block w-full rounded-[11px] border border-dashed border-white/10 bg-gradient-to-b from-[#141d27] to-[#111923] px-[22px] py-[22px] text-left text-[15px] text-[#7b8794] transition-colors hover:border-sky-400/40 hover:bg-[#16212d]"
                >
                  {user.bio || t("profile_about_placeholder")}
                </button>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                  {t("profile_screenshots")}
                </div>
                <button
                  onClick={() => screenshotInputRef.current?.click()}
                  disabled={loading}
                  className="rounded-md border border-sky-400/30 bg-sky-500/10 px-3.5 py-1.5 text-[13px] font-bold text-sky-300 hover:bg-sky-500/20 hover:text-white disabled:opacity-50"
                >
                  {t("profile_add_screenshot")}
                </button>
                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleScreenshotChange}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {screenshots.map((s) => (
                  <div
                    key={s.id}
                    className="group relative aspect-[16/10] overflow-hidden rounded-[9px] bg-zinc-900"
                  >
                    <img
                      src={resolveUrl(s.image_url) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() => deleteScreenshot(s.id)}
                      className="absolute right-1.5 top-1.5 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white opacity-0 transition-opacity hover:bg-red-900/80 group-hover:opacity-100"
                    >
                      {t("del_remove")}
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => screenshotInputRef.current?.click()}
                  className="flex aspect-[16/10] items-center justify-center rounded-[9px] border border-dashed border-white/10 bg-white/[0.02] text-3xl font-light text-[#3e4a57] transition-colors hover:border-sky-400/40 hover:text-[#5b8db8]"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[30px]">
            <div>
              <button
                onClick={onOpenFriends}
                className="mb-3 flex w-full items-center justify-between text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8] hover:text-sky-300"
              >
                {t("profile_friends")} ({friends.length})
                <span aria-hidden className="text-base">
                  ›
                </span>
              </button>
              {loadingFriends ? (
                <p className="text-sm text-zinc-500">{t("fr_loading")}</p>
              ) : friends.length === 0 ? (
                <div className="rounded-[11px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-[22px] py-[34px] text-center">
                  <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/[0.04] text-2xl text-[#3e4a57]">
                    👥
                  </div>
                  <div className="mb-4 text-sm text-[#7b8794]">{t("profile_no_friends")}</div>
                  <button
                    onClick={onOpenFriends}
                    className="rounded-lg px-[22px] py-2.5 text-sm font-bold text-white shadow-lg"
                    style={{ background: "linear-gradient(180deg,#3aa0ff,#2475c7)" }}
                  >
                    {t("profile_find_friends")}
                  </button>
                </div>
              ) : (
                <div className="rounded-[11px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] p-4">
                  <div className="grid grid-cols-5 gap-2">
                    {friends.slice(0, FRIENDS_PREVIEW_COUNT).map((f) => {
                      const fAvatarUrl = resolveUrl(f.avatar_url);
                      return (
                        <button
                          key={f.id}
                          onClick={onOpenFriends}
                          className="flex flex-col items-center gap-1.5 rounded p-1 text-center hover:bg-white/5"
                        >
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-700">
                            {fAvatarUrl ? (
                              <img src={fAvatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-base font-bold text-zinc-300">
                                {f.display_name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <span
                              className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#141d27]"
                              style={{ background: f.online ? "#5fd17a" : "#5b6671" }}
                            />
                          </div>
                          <span className="w-full truncate text-[11px] text-zinc-300">
                            {f.display_name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                {t("profile_last_activity")}
              </div>
              {lastPlayedGame ? (
                <div className="flex items-center gap-3.5 rounded-[11px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-5 py-[18px]">
                  <div className="h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[11px] bg-zinc-800">
                    {lastPlayedGame.cover_path ? (
                      <img
                        src={convertFileSrc(lastPlayedGame.cover_path)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{ background: "linear-gradient(135deg,#2b5876,#4e4376)" }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#f0f6fb]">
                      {lastPlayedGame.name}
                    </div>
                    <div className="mt-0.5 text-[13px] text-[#7b8794]">
                      {t("lib_recently_played")} · {formatRelativeTime(lastPlayedGame.last_played_at, t)}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">{t("profile_no_activity")}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
