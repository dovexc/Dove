import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import { TrophyIcon, LockIcon } from "../icons";
import type { GameAchievement } from "../../types";

interface Props {
  gameName: string;
  achievements: GameAchievement[];
  onClose: () => void;
}

function formatUnlockedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function Row({ achievement, t }: { achievement: GameAchievement; t: (key: TranslationKey) => string }) {
  return (
    <li
      className={`flex items-center gap-3.5 rounded-[11px] border px-4 py-3 ${
        achievement.unlocked
          ? "border-amber-400/30 bg-amber-500/[0.06]"
          : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
          achievement.unlocked
            ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
            : "border-white/[0.06] bg-white/[0.04] text-[#4a5765]"
        }`}
      >
        {achievement.unlocked && achievement.icon_url ? (
          <img src={achievement.icon_url} alt="" className="h-full w-full object-cover" />
        ) : achievement.unlocked ? (
          <TrophyIcon size={18} />
        ) : (
          <LockIcon size={18} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-bold ${achievement.unlocked ? "text-[#f0f6fb]" : "text-[#8a97a5]"}`}>
          {achievement.title ?? t("lib_achievement_hidden_title")}
        </div>
        {achievement.description && (
          <div className="mt-0.5 truncate text-xs text-[#6b7884]">{achievement.description}</div>
        )}
      </div>
      {achievement.unlocked && achievement.unlocked_at && (
        <div className="shrink-0 text-xs text-[#6b7884]">{formatUnlockedDate(achievement.unlocked_at)}</div>
      )}
    </li>
  );
}

export function AchievementsDialog({ gameName, achievements, onClose }: Props) {
  const t = useT();
  const unlocked = achievements.filter((a) => a.unlocked);
  const locked = achievements.filter((a) => !a.unlocked);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">{t("lib_achievements_label")}</h2>
            <p className="text-xs text-zinc-500">{gameName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label={t("dialog_cancel")}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {achievements.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("lib_no_achievements_hint")}</p>
          ) : (
            <div className="flex flex-col gap-5">
              {unlocked.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-extrabold uppercase tracking-[1.5px] text-[#5b8db8]">
                    {t("lib_achievements_unlocked_section")} ({unlocked.length})
                  </div>
                  <ul className="flex flex-col gap-2">
                    {unlocked.map((a) => (
                      <Row key={a.id} achievement={a} t={t} />
                    ))}
                  </ul>
                </div>
              )}
              {locked.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-extrabold uppercase tracking-[1.5px] text-[#6b7884]">
                    {t("lib_achievements_locked_section")} ({locked.length})
                  </div>
                  <ul className="flex flex-col gap-2">
                    {locked.map((a) => (
                      <Row key={a.id} achievement={a} t={t} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
