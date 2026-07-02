import { API_BASE } from "../../authStore";
import { useT } from "../../translations";
import { formatPlaytime } from "../../utils";
import type { RecentlyPlayedGame } from "../../types";

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

interface Props {
  games: RecentlyPlayedGame[];
}

// Steam-style "recently played" list — top 3 games with playtime in the
// last 14 days, each showing how long they were played in that window.
export function RecentlyPlayedList({ games }: Props) {
  const t = useT();

  return (
    <div className="flex flex-col gap-2">
      {games.map((g) => {
        const coverUrl = resolveUrl(g.cover_url);
        return (
          <div
            key={g.catalog_game_id}
            className="flex items-center gap-3.5 rounded-[11px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-5 py-[14px]"
          >
            <div className="h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[11px] bg-zinc-800">
              {coverUrl ? (
                <img src={coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="h-full w-full"
                  style={{ background: "linear-gradient(135deg,#2b5876,#4e4376)" }}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-[#f0f6fb]">{g.title}</div>
              <div className="mt-0.5 text-[13px] text-[#7b8794]">
                {formatPlaytime(g.playtime_last_two_weeks_seconds)} {t("profile_past_two_weeks")}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
