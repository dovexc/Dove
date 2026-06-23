import { useState } from "react";
import { useDownloadStore } from "../../downloadStore";
import type { DownloadItem } from "../../downloadStore";
import { useLibraryStore } from "../../store";
import { formatSize, formatSpeed } from "../../utils";
import { Sparkline } from "./Sparkline";
import { PauseIcon, PlayIcon } from "./icons";

interface Props {
  onOpenGame: (id: number) => void;
}

function statusLabel(item: DownloadItem): string {
  switch (item.status) {
    case "completed":
      return "Abgeschlossen";
    case "error":
      return "Fehlgeschlagen";
    default:
      return item.status;
  }
}

function Thumbnail({ name, coverPath }: { name: string; coverPath?: string | null }) {
  return (
    <div className="flex h-[54px] w-[96px] flex-none items-center justify-center overflow-hidden rounded bg-[#0e151c] text-[10px] text-zinc-500">
      {coverPath ? (
        <img src={coverPath} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="px-1 text-center leading-tight">{name}</span>
      )}
    </div>
  );
}

export function DownloadsPage({ onOpenGame }: Props) {
  const queue = useDownloadStore((s) => s.queue);
  const history = useDownloadStore((s) => s.history);
  const removeFromQueue = useDownloadStore((s) => s.removeFromQueue);
  const reorderQueue = useDownloadStore((s) => s.reorderQueue);
  const setDraggingId = useDownloadStore((s) => s.setDraggingId);
  const pauseDownload = useDownloadStore((s) => s.pauseDownload);
  const resumeDownload = useDownloadStore((s) => s.resumeDownload);
  const startNow = useDownloadStore((s) => s.startNow);
  const clearHistory = useDownloadStore((s) => s.clearHistory);
  const games = useLibraryStore((s) => s.games);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  function coverFor(id: number): string | null {
    return games.find((g) => g.id === id)?.cover_path ?? null;
  }

  const current = queue.find(
    (item) =>
      item.status === "downloading" || item.status === "extracting" || item.status === "paused"
  );
  const queued = queue.filter((item) => item.status === "queued");

  const percent =
    (current?.status === "downloading" || current?.status === "paused") && current.total
      ? Math.min(100, Math.round((current.downloaded / current.total) * 100))
      : null;

  const upNext = current ? [current, ...queued] : queued;

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: "linear-gradient(180deg,#1b2838,#16202b)" }}
    >
      <div
        className="flex h-[180px] flex-none items-end justify-end px-10 pb-6"
        style={{
          background:
            "radial-gradient(900px 300px at 70% 0%, rgba(40,90,150,.45) 0%, rgba(15,25,35,0) 70%), linear-gradient(180deg,#0e1822,#16202b)",
        }}
      >
        <div className="flex gap-10 text-right text-xs text-zinc-400">
          <div>
            <div className="font-semibold uppercase tracking-wide text-zinc-500">Netzwerk</div>
            <div className="text-base font-bold text-zinc-100">
              {current ? formatSpeed(current.speedBps) : "0 B/s"}
            </div>
          </div>
          <div>
            <div className="font-semibold uppercase tracking-wide text-zinc-500">Warteschlange</div>
            <div className="text-base font-bold text-zinc-100">{upNext.length}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <section className="mb-10">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-base font-bold text-zinc-100">
              Als Nächstes <span className="text-zinc-500">({upNext.length})</span>
            </h2>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {upNext.length === 0 ? (
            <p className="text-sm text-zinc-500">Keine Downloads in der Warteschlange.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {current && (
                <div className="flex items-center gap-4 rounded px-2 py-2.5 hover:bg-white/5">
                  <Thumbnail name={current.name} coverPath={coverFor(current.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {current.name}
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          current.status === "paused" ? "bg-zinc-500" : "bg-sky-500"
                        }`}
                        style={{
                          width: current.status === "extracting" ? "100%" : `${percent ?? 0}%`,
                        }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {current.status === "extracting"
                        ? "Dateien werden entpackt..."
                        : current.total
                          ? `${formatSize(current.downloaded)} / ${formatSize(current.total)}${
                              current.status === "downloading"
                                ? ` · ${formatSpeed(current.speedBps)}`
                                : ""
                            }`
                          : current.status === "paused"
                            ? `Pausiert · ${percent ?? 0}%`
                            : "Lädt herunter..."}
                    </div>
                  </div>
                  {current.status === "downloading" && (
                    <Sparkline values={current.speedHistory} width={140} height={28} />
                  )}
                  <div className="flex items-center gap-2">
                    {current.status === "downloading" && (
                      <button
                        onClick={() => pauseDownload(current.id)}
                        title="Pausieren"
                        className="rounded bg-zinc-800 p-2 text-zinc-200 hover:bg-zinc-700"
                      >
                        <PauseIcon />
                      </button>
                    )}
                    {current.status === "paused" && (
                      <button
                        onClick={() => resumeDownload(current.id)}
                        title="Fortsetzen"
                        className="rounded bg-sky-600 p-2 text-white hover:bg-sky-500"
                      >
                        <PlayIcon />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {queued.map((item, index) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggingId(item.id)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDragOverId(null);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnter={() => setDragOverId(item.id)}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverId(null);
                    const draggingId = useDownloadStore.getState().draggingId;
                    if (draggingId != null) reorderQueue(draggingId, item.id);
                    setDraggingId(null);
                  }}
                  className={`flex cursor-grab items-center gap-4 rounded px-2 py-2.5 ${
                    dragOverId === item.id ? "bg-sky-500/10 ring-1 ring-sky-400" : "hover:bg-white/5"
                  }`}
                >
                  <Thumbnail name={item.name} coverPath={coverFor(item.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-100">{item.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">In Warteschlange · #{index + 1}</div>
                  </div>
                  <button
                    onClick={() => startNow(item.id)}
                    title="Jetzt starten"
                    className="rounded bg-zinc-800 p-2 text-zinc-200 hover:bg-sky-600 hover:text-white"
                  >
                    <PlayIcon />
                  </button>
                  <button
                    onClick={() => removeFromQueue(item.id)}
                    className="text-xs text-zinc-500 hover:text-red-400"
                  >
                    Entfernen
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-base font-bold text-zinc-100">
              Abgeschlossen <span className="text-zinc-500">({history.length})</span>
            </h2>
            <div className="h-px flex-1 bg-white/10" />
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                Alle löschen
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">Noch keine abgeschlossenen Downloads.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {history.map((item) => (
                <div
                  key={`${item.id}-${item.finishedAt}`}
                  className="flex items-center gap-4 rounded px-2 py-2.5 hover:bg-white/5"
                >
                  <Thumbnail name={item.name} coverPath={coverFor(item.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-100">{item.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {item.status === "completed" && item.total > 0
                        ? `${formatSize(item.total)} / ${formatSize(item.total)} heruntergeladen`
                        : item.error ?? "Fehlgeschlagen"}
                    </div>
                  </div>
                  {item.status === "completed" ? (
                    <button
                      onClick={() => onOpenGame(item.id)}
                      className="flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
                    >
                      <PlayIcon /> Spielen
                    </button>
                  ) : (
                    <span className="rounded-full bg-red-900/60 px-3 py-1 text-xs font-semibold text-red-300">
                      {statusLabel(item)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
