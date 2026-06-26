import { useDownloadStore } from "../../downloadStore";
import { formatSpeed } from "../../utils";
import { useT } from "../../translations";

interface Props {
  onOpen: () => void;
}

export function DownloadBar({ onOpen }: Props) {
  const t = useT();
  const queue = useDownloadStore((s) => s.queue);

  const current = queue.find(
    (item) => item.status === "downloading" || item.status === "extracting"
  );
  const queuedCount = queue.filter((item) => item.status === "queued").length;
  const percent =
    current?.status === "downloading" && current.total
      ? Math.min(100, Math.round((current.downloaded / current.total) * 100))
      : null;

  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-4 border-t border-zinc-800 bg-zinc-900 px-6 py-2 text-left hover:bg-zinc-800"
    >
      <span className="text-sm font-semibold text-zinc-200">{t("nav_downloads")}</span>

      {current ? (
        <>
          <span className="max-w-[12rem] truncate text-sm text-zinc-400">
            {current.name}
          </span>
          <div className="h-1.5 flex-1 max-w-xs overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-sky-500 transition-all"
              style={{
                width: current.status === "extracting" ? "100%" : `${percent ?? 0}%`,
              }}
            />
          </div>
          <span className="shrink-0 text-xs text-zinc-500">
            {current.status === "extracting"
              ? t("dl_extracting_short")
              : `${percent ?? 0}% · ${formatSpeed(current.speedBps)}`}
          </span>
        </>
      ) : (
        <span className="text-sm text-zinc-500">{t("dl_ready")}</span>
      )}

      {queuedCount > 0 && (
        <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          +{queuedCount} {t("dl_in_queue_suffix")}
        </span>
      )}
    </button>
  );
}
