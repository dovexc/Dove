import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../../authStore";
import { API_BASE } from "../../authStore";
import { useT } from "../../translations";
import { BadgeIcon, badgeColor } from "../icons";
import { AchievementTile } from "./AchievementTile";

const MAX_SHOWCASE_ACHIEVEMENTS = 4;

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

interface Props {
  onClose: () => void;
}

/// Full-page profile editor — everything that can be changed about your
/// profile lives here, in one place, instead of scattered edit affordances
/// on the profile view itself (some gated behind a "Bearbeiten" toggle,
/// some always live) that made it unclear what was even clickable.
export function ProfileEditPage({ onClose }: Props) {
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
  const setEquippedBadge = useAuthStore((s) => s.setEquippedBadge);
  const myAchievements = useAuthStore((s) => s.myAchievements);
  const achievementShowcase = useAuthStore((s) => s.achievementShowcase);
  const fetchMyAchievements = useAuthStore((s) => s.fetchMyAchievements);
  const setAchievementShowcase = useAuthStore((s) => s.setAchievementShowcase);

  const [name, setName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [selectedShowcaseIds, setSelectedShowcaseIds] = useState<number[]>([]);
  const [pickerGameId, setPickerGameId] = useState<number | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchMyAchievements();
    setSelectedShowcaseIds(achievementShowcase.map((a) => a.id));
    // Seed once on mount only — re-running on every `achievementShowcase`
    // change would blow away in-progress toggles as soon as a save
    // round-trips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Grouped by game and, within each game, sorted rarest-first (lowest
  // unlock percentage) so the picker mirrors Steam's per-game achievement
  // list instead of one giant flat grid that gets unreadable once a player
  // has games with dozens of achievements each.
  const achievementsByGame = useMemo(() => {
    const byGame = new Map<number, { gameId: number; gameTitle: string; achievements: typeof myAchievements }>();
    for (const achievement of myAchievements) {
      let entry = byGame.get(achievement.catalog_game_id);
      if (!entry) {
        entry = { gameId: achievement.catalog_game_id, gameTitle: achievement.game_title, achievements: [] };
        byGame.set(achievement.catalog_game_id, entry);
      }
      entry.achievements.push(achievement);
    }
    for (const entry of byGame.values()) {
      entry.achievements.sort(
        (a, b) => (a.unlock_percentage ?? Infinity) - (b.unlock_percentage ?? Infinity),
      );
    }
    return Array.from(byGame.values()).sort((a, b) => a.gameTitle.localeCompare(b.gameTitle));
  }, [myAchievements]);

  if (!user) return null;

  async function saveName() {
    if (name.trim() && name.trim() !== user!.display_name) {
      await updateProfile({ display_name: name.trim() });
    }
  }

  async function saveBio() {
    await updateProfile({ bio: bio.trim() });
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

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#0b1016]">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0b1016]/95 px-6 py-3 backdrop-blur">
        <button
          onClick={onClose}
          className="rounded bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/10"
        >
          {t("pub_back")}
        </button>
        <button
          onClick={onClose}
          className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
        >
          {t("profile_done")}
        </button>
      </div>

      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 pb-16">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">{t("profile_edit_title")}</h1>
        </div>

        {error && (
          <div className="flex items-center justify-between rounded bg-red-900/60 px-3 py-2 text-sm text-red-100">
            <span>{error}</span>
            <button onClick={clearError} className="font-bold">
              ✕
            </button>
          </div>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            {t("profile_edit_section_images")}
          </h2>
          <div
            className="relative h-40 w-full overflow-hidden rounded-lg bg-cover bg-center ring-1 ring-zinc-700"
            style={{
              background: backgroundUrl
                ? `url(${backgroundUrl}) center/cover`
                : "linear-gradient(125deg,#1c3a5e 0%,#2c1f4a 50%,#3a2151 100%)",
            }}
          >
            <button
              type="button"
              onClick={() => backgroundInputRef.current?.click()}
              className="absolute bottom-3 right-3 rounded-md bg-black/50 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-black/70"
            >
              {t("profile_change_background")}
            </button>
            <input
              ref={backgroundInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBackgroundChange}
            />
          </div>
          <div className="flex items-center gap-4">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-2xl font-black text-white"
              style={{ background: "linear-gradient(135deg,#3aa0ff,#7b4397)" }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                user.display_name.slice(0, 1).toUpperCase()
              )}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              {t("profile_change_avatar")}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            {t("profile_edit_section_name")}
          </h2>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
            <button
              onClick={saveName}
              disabled={loading}
              className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {t("dialog_save")}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">{t("profile_about")}</h2>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            placeholder={t("profile_bio_placeholder")}
            className="rounded-[11px] bg-[#141d27] px-4 py-3 text-[15px] text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
          <button
            onClick={saveBio}
            disabled={loading}
            className="self-start rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {t("dialog_save")}
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            {t("profile_badge_picker")}
          </h2>
          {badges.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("profile_no_badges_hint")}</p>
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
              {badges.map((b) => {
                const colors = badgeColor(b.key);
                const isEquipped = user.equipped_badge?.key === b.key;
                return (
                  <button
                    key={b.key}
                    onClick={() => setEquippedBadge(b.key)}
                    disabled={loading}
                    title={b.description}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-bold disabled:opacity-50 ${
                      isEquipped
                        ? `${colors.selectedBorder} ${colors.selectedBg} ${colors.text}`
                        : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                    }`}
                  >
                    <BadgeIcon badgeKey={b.key} size={14} />
                    {b.label}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              {t("profile_achievement_showcase")}
            </h2>
            <span className="text-xs text-zinc-500">
              {selectedShowcaseIds.length}/{MAX_SHOWCASE_ACHIEVEMENTS}
            </span>
          </div>

          {myAchievements.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("profile_no_achievements_hint")}</p>
          ) : pickerGameId === null ? (
            <>
              <p className="text-xs text-zinc-500">{t("profile_achievement_picker_hint")}</p>
              <div className="flex flex-col gap-2">
                {achievementsByGame.map((g) => {
                  const selectedInGame = g.achievements.filter((a) =>
                    selectedShowcaseIds.includes(a.id),
                  ).length;
                  return (
                    <button
                      key={g.gameId}
                      type="button"
                      onClick={() => setPickerGameId(g.gameId)}
                      className="flex items-center justify-between rounded-[11px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-4 py-3 text-left transition-colors hover:border-sky-400/40"
                    >
                      <span className="text-sm font-semibold text-zinc-200">{g.gameTitle}</span>
                      <span className="text-xs text-zinc-500">
                        {selectedInGame > 0 && (
                          <span className="mr-1 text-sky-400">
                            {selectedInGame} {t("profile_achievement_picker_selected_suffix")} ·
                          </span>
                        )}
                        {g.achievements.length} {t("profile_achievement_picker_count_suffix")}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={saveShowcase}
                disabled={loading}
                className="self-start rounded bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {t("profile_save_showcase")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPickerGameId(null)}
                className="self-start text-xs font-semibold text-sky-400 hover:underline"
              >
                ← {t("profile_achievement_picker_back")}
              </button>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {achievementsByGame
                  .find((g) => g.gameId === pickerGameId)
                  ?.achievements.map((a) => (
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
                className="self-start rounded bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {t("profile_save_showcase")}
              </button>
            </>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
              {t("profile_screenshots")}
            </h2>
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

          {screenshots.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("profile_no_screenshots_hint")}</p>
          ) : (
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
            </div>
          )}
        </section>

        <div className="flex justify-end border-t border-zinc-800 pt-6">
          <button
            onClick={onClose}
            className="rounded bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
          >
            {t("profile_done")}
          </button>
        </div>
      </div>
    </div>
  );
}
