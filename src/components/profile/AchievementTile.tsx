import { TrophyIcon } from "../icons";
import type { ShowcasedAchievement } from "../../types";

// Steam-style "rare achievement" cutoff — under 1% of a game's owners have it.
export function isRareAchievement(unlockPercentage: number | null): boolean {
  return unlockPercentage !== null && unlockPercentage < 1;
}

interface Props {
  achievement: ShowcasedAchievement;
  selected?: boolean;
  onClick?: () => void;
}

export function AchievementTile({ achievement, selected, onClick }: Props) {
  const rare = isRareAchievement(achievement.unlock_percentage);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={achievement.description ?? achievement.title}
      className={`flex flex-col items-center gap-2 rounded-[11px] border p-3 text-center transition-colors ${
        selected
          ? "border-sky-400/60 bg-sky-500/10"
          : "border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923]"
      } ${rare ? "shadow-[0_0_14px_1px_rgba(251,191,36,0.45)] ring-1 ring-amber-400/50" : ""} ${
        onClick ? "cursor-pointer hover:border-sky-400/40" : "cursor-default"
      }`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-800 text-zinc-300">
        {achievement.icon_url ? (
          <img src={achievement.icon_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <TrophyIcon size={22} />
        )}
      </div>
      <span className="line-clamp-1 w-full text-xs font-bold text-zinc-200">{achievement.title}</span>
      <span className="line-clamp-1 w-full text-[10px] text-zinc-500">{achievement.game_title}</span>
    </button>
  );
}
