import { useState } from "react";
import { useDownloadStore } from "../../downloadStore";
import type { DownloadItem } from "../../downloadStore";
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

export function DownloadsPage({ onOpenGame }: Props) {
  const queue = useDownloadStore((s) => s.queue);
  const history = useDownloadStore((s) => s.history);
  const removeFromQueue = useDownloadStore((s) => s.removeFromQueue);
  const reorderQueue = useDownloadStore((s) => s.reorderQueue);
  const setDraggingId = useDownloadStore((s) => s.setDraggingId);
  const pauseDownload = useDownloadStore((s) => s.pauseDownload);
  const resumeDownload = useDownloadStore((s) => s.resumeDownload);
  const startNow = useDownloadStore((s) => s.startNow);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const current = queue.find(
    (item) =>
      item.status === "downloading" || item.status === "extracting" || item.status === "paused"
  );
  const queued = queue.filter((item) => item.status === "queued");

  const percent =
    (current?.status === "downloading" || current?.status === "paused") && current.total
      ? Math.min(100, Math.round((current.downloaded / current.total) * 100))
      : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-bold text-zinc-100">Downloads</h1>

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Läuft gerade
          </h2>
          {current ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-zinc-100">{current.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-400">
                    {current.status === "extracting"
                      ? "Entpacke..."
                      : current.status === "paused"
                        ? `Pausiert · ${percent ?? 0}%`
                        : `${percent ?? 0}%`}
                  </span>
                  {current.status === "downloading" && (
                    <button
                      onClick={() => pauseDownload(current.id)}
                      title="Pausieren"
                      className="rounded bg-zinc-800 p-1.5 text-zinc-200 hover:bg-zinc-700"
                    >
                      <PauseIcon />
                    </button>
                  )}
                  {current.status === "paused" && (
                    <button
                      onClick={() => resumeDownload(current.id)}
                      title="Fortsetzen"
                      className="rounded bg-sky-600 p-1.5 text-white hover:bg-sky-500"
                    >
                      <PlayIcon />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    current.status === "paused" ? "bg-zinc-500" : "bg-sky-500"
                  }`}
                  style={{
                    width: current.status === "extracting" ? "100%" : `${percent ?? 0}%`,
                  }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-zinc-500">
                  {current.status === "extracting"
                    ? "Dateien werden entpackt..."
                    : current.total
                      ? <>
                          {formatSize(current.downloaded)} / {formatSize(current.total)}
                          {current.status === "downloading" && (
                            <> · {formatSpeed(current.speedBps)}</>
                          )}
                        </>
                      : "Lädt herunter..."}
                </div>
                {current.status === "downloading" && (
                  <Sparkline values={current.speedHistory} width={180} height={32} />
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Aktuell läuft kein Download.</p>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Warteschlange
          </h2>
          {queued.length === 0 ? (
            <p className="text-sm text-zinc-500">Keine wartenden Downloads.</p>
          ) : (
            <div className="flex flex-col gap-2">
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
                  className={`flex cursor-grab items-center justify-between rounded-lg border px-4 py-2.5 ${
                    dragOverId === item.id
                      ? "border-sky-400 ring-2 ring-sky-400"
                      : "border-zinc-800"
                  } bg-zinc-900`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">#{index + 1}</span>
                    <span className="text-sm text-zinc-200">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startNow(item.id)}
                      title="Jetzt starten"
                      className="rounded bg-zinc-800 p-1.5 text-zinc-200 hover:bg-sky-600 hover:text-white"
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
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Verlauf
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">Noch keine abgeschlossenen Downloads.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((item) => (
                <button
                  key={`${item.id}-${item.finishedAt}`}
                  onClick={() => onOpenGame(item.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-left hover:border-zinc-600"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-zinc-200">{item.name}</span>
                    {item.error && (
                      <span className="text-xs text-red-400">{item.error}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {item.status === "completed" && item.total > 0 && (
                      <span className="text-xs text-zinc-500">
                        {formatSize(item.total)}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        item.status === "completed"
                          ? "bg-emerald-900/60 text-emerald-300"
                          : "bg-red-900/60 text-red-300"
                      }`}
                    >
                      {statusLabel(item)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
