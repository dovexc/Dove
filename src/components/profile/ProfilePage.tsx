import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../../authStore";
import { API_BASE } from "../../authStore";
import { useFriendsStore } from "../../friendsStore";
import { useLibraryStore } from "../../store";
import { formatPlaytime } from "../../utils";
import { useT } from "../../translations";
import { BadgeIcon, badgeColor, PeopleIcon } from "../icons";
import { AchievementTile } from "./AchievementTile";
import { RecentlyPlayedList } from "./RecentlyPlayedList";
import { ProfileEditPage } from "./ProfileEditPage";

interface Props {
  onOpenFriends: () => void;
}

const FRIENDS_PREVIEW_COUNT = 5;

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

export function ProfilePage({ onOpenFriends }: Props) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const screenshots = useAuthStore((s) => s.screenshots);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const fetchBadges = useAuthStore((s) => s.fetchBadges);
  const achievementShowcase = useAuthStore((s) => s.achievementShowcase);
  const recentGames = useAuthStore((s) => s.recentGames);

  const friends = useFriendsStore((s) => s.friends);
  const loadingFriends = useFriendsStore((s) => s.loadingFriends);
  const fetchFriends = useFriendsStore((s) => s.fetchFriends);

  const games = useLibraryStore((s) => s.games);

  useEffect(() => {
    fetchFriends();
    fetchBadges();
  }, [fetchFriends, fetchBadges]);

  const [isEditPageOpen, setIsEditPageOpen] = useState(false);

  const totalPlaytimeSeconds = useMemo(
    () => games.reduce((sum, g) => sum + g.total_playtime_seconds, 0),
    [games]
  );

  if (!user) return null;

  const backgroundUrl = resolveUrl(user.background_url);
  const avatarUrl = resolveUrl(user.avatar_url);

  const stats: { value: string; label: string; color: string }[] = [
    { value: String(games.length), label: t("stat_games"), color: "#66c0f4" },
    { value: String(friends.length), label: t("stat_friends"), color: "#9fb2c2" },
    { value: formatPlaytime(totalPlaytimeSeconds), label: t("stat_playtime"), color: "#a4d007" },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#0b1016]">
      {isEditPageOpen && <ProfileEditPage onClose={() => setIsEditPageOpen(false)} />}

      <div
        className="relative h-[280px] w-full bg-cover bg-center"
        style={{
          background: backgroundUrl
            ? `url(${backgroundUrl}) center/cover`
            : "linear-gradient(125deg,#1c3a5e 0%,#2c1f4a 50%,#3a2151 100%)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1016]/15 via-[#0b1016]/55 to-[#0b1016]" />
      </div>

      <div className="mx-auto max-w-[1180px] px-10 pb-[90px]">
        <div className="relative z-[2] -mt-[72px] flex items-end gap-6">
          <div className="relative shrink-0">
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
          </div>

          <div className="flex-1 pb-2">
            <div className="flex flex-wrap items-center gap-3.5">
              <h1 className="text-[38px] font-black tracking-tight text-white">{user.display_name}</h1>
              {user.equipped_badge && (
                <span
                  title={user.equipped_badge.description}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-bold ${badgeColor(user.equipped_badge.key).border} ${badgeColor(user.equipped_badge.key).bg} ${badgeColor(user.equipped_badge.key).text}`}
                >
                  <BadgeIcon badgeKey={user.equipped_badge.key} size={14} />
                  {user.equipped_badge.label}
                </span>
              )}
              <button
                onClick={() => setIsEditPageOpen(true)}
                className="rounded-md border border-sky-400/30 bg-sky-500/10 px-3.5 py-1.5 text-[13px] font-bold text-sky-300 hover:bg-sky-500/20 hover:text-white"
              >
                {t("profile_edit")}
              </button>
            </div>
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
            <div>
              <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                {t("profile_achievement_showcase")}
              </div>
              {achievementShowcase.length === 0 ? (
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
              <p className="rounded-[11px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-[22px] py-[22px] text-[15px] text-[#c3ccd4]">
                {user.bio || <span className="text-[#7b8794]">{t("profile_about_placeholder_readonly")}</span>}
              </p>
            </div>

            <div>
              <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                {t("profile_screenshots")}
              </div>
              {screenshots.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("profile_no_screenshots_hint")}</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {screenshots.map((s) => (
                    <div
                      key={s.id}
                      className="relative aspect-[16/10] overflow-hidden rounded-[9px] bg-zinc-900"
                    >
                      <img
                        src={resolveUrl(s.image_url) ?? ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
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
                  <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/[0.04] text-[#3e4a57]">
                    <PeopleIcon size={22} />
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
                {t("profile_recently_played")}
              </div>
              {recentGames.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("profile_no_activity")}</p>
              ) : (
                <RecentlyPlayedList games={recentGames} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
