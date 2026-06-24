import { useEffect } from "react";
import { useCatalogStore } from "../../catalogStore";

interface Props {
  onClose: () => void;
}

function formatPrice(priceCents: number): string {
  return priceCents === 0 ? "Kostenlos" : `${(priceCents / 100).toFixed(2)} €`;
}

export function AdminModerationView({ onClose }: Props) {
  const pendingGames = useCatalogStore((s) => s.pendingGames);
  const loadingPendingGames = useCatalogStore((s) => s.loadingPendingGames);
  const moderatingId = useCatalogStore((s) => s.moderatingId);
  const fetchPendingGames = useCatalogStore((s) => s.fetchPendingGames);
  const approveGame = useCatalogStore((s) => s.approveGame);
  const rejectGame = useCatalogStore((s) => s.rejectGame);
  const error = useCatalogStore((s) => s.error);

  useEffect(() => {
    fetchPendingGames();
  }, [fetchPendingGames]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Moderation</h1>
            <p className="text-sm text-zinc-500">
              Neu veröffentlichte Spiele werden erst nach Freigabe im Store gelistet.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            Schließen
          </button>
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {loadingPendingGames ? (
          <p className="text-sm text-zinc-500">Lädt...</p>
        ) : pendingGames.length === 0 ? (
          <p className="text-sm text-zinc-500">Keine Spiele warten auf Freigabe.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pendingGames.map((game) => (
              <div
                key={game.id}
                className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-zinc-100">{game.title}</div>
                    <div className="text-xs text-zinc-500">
                      Publisher #{game.publisher_user_id} · {formatPrice(game.price_cents)} ·{" "}
                      {new Date(game.created_at).toLocaleString("de-DE")}
                    </div>
                  </div>
                </div>
                {game.description && (
                  <p className="text-sm text-zinc-400">{game.description}</p>
                )}
                {game.tags && (
                  <div className="flex flex-wrap gap-1.5">
                    {game.tags.split(",").map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-zinc-800 px-2 py-1 text-[11px] font-semibold uppercase text-zinc-400"
                      >
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
                  <button
                    onClick={() => rejectGame(game.id)}
                    disabled={moderatingId === game.id}
                    className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-900/40 disabled:opacity-50"
                  >
                    Ablehnen
                  </button>
                  <button
                    onClick={() => approveGame(game.id)}
                    disabled={moderatingId === game.id}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Freigeben
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
