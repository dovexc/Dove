import { useMemo, useState } from "react";
import { useLibraryStore } from "../store";
import { convertFileSrc } from "../utils";

export function SteamImportDialog() {
  const closeSteamImport = useLibraryStore((s) => s.closeSteamImport);
  const importSteamGames = useLibraryStore((s) => s.importSteamGames);
  const steamGames = useLibraryStore((s) => s.steamGames);
  const steamScanError = useLibraryStore((s) => s.steamScanError);
  const steamScanLoading = useLibraryStore((s) => s.steamScanLoading);
  const games = useLibraryStore((s) => s.games);

  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const alreadyImported = useMemo(
    () =>
      new Set(
        games
          .map((g) => g.exe_path.match(/^steam:\/\/rungameid\/(.+)$/)?.[1])
          .filter((appid): appid is string => Boolean(appid))
      ),
    [games]
  );

  const selectableGames = useMemo(
    () => steamGames.filter((g) => !alreadyImported.has(g.appid)),
    [steamGames, alreadyImported]
  );
  const allSelected =
    selectableGames.length > 0 &&
    selectableGames.every((g) => selectedAppIds.has(g.appid));

  function toggle(appid: string) {
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(appid)) {
        next.delete(appid);
      } else {
        next.add(appid);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelectedAppIds(
      allSelected ? new Set() : new Set(selectableGames.map((g) => g.appid))
    );
  }

  async function handleImport() {
    const selected = steamGames.filter((g) => selectedAppIds.has(g.appid));
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      await importSteamGames(selected);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[80vh] w-[32rem] flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-100">
          Steam-Bibliothek importieren
        </h2>

        {steamScanLoading && (
          <p className="text-sm text-zinc-400">Steam-Spiele werden gesucht...</p>
        )}

        {steamScanError && (
          <p className="text-sm text-red-400">{steamScanError}</p>
        )}

        {!steamScanLoading && !steamScanError && steamGames.length === 0 && (
          <p className="text-sm text-zinc-400">
            Es wurden keine installierten Steam-Spiele gefunden.
          </p>
        )}

        {selectableGames.length > 0 && (
          <label className="flex items-center gap-3 rounded p-2 text-sm text-zinc-300 hover:bg-zinc-800">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
            />
            <span>Alle auswählen</span>
          </label>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2">
            {steamGames.map((game) => {
              const imported = alreadyImported.has(game.appid);
              return (
                <label
                  key={game.appid}
                  className={`flex items-center gap-3 rounded p-2 text-sm ${
                    imported
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer hover:bg-zinc-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={imported}
                    checked={selectedAppIds.has(game.appid)}
                    onChange={() => toggle(game.appid)}
                  />
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
                    {game.cover_path && (
                      <img
                        src={convertFileSrc(game.cover_path)}
                        alt={game.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <span className="flex-1 text-zinc-200">{game.name}</span>
                  {imported && (
                    <span className="text-xs text-zinc-500">bereits importiert</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeSteamImport}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            Schließen
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={submitting || selectedAppIds.size === 0}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {selectedAppIds.size > 0
              ? `${selectedAppIds.size} Spiel(e) importieren`
              : "Importieren"}
          </button>
        </div>
      </div>
    </div>
  );
}
