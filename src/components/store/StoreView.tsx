import { useEffect, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";

export function StoreView() {
  const games = useCatalogStore((s) => s.games);
  const loading = useCatalogStore((s) => s.loading);
  const error = useCatalogStore((s) => s.error);
  const fetchCatalog = useCatalogStore((s) => s.fetchCatalog);
  const publishGame = useCatalogStore((s) => s.publishGame);
  const token = useAuthStore((s) => s.token);

  const [showPublishForm, setShowPublishForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await publishGame({
      title: title.trim(),
      description: description.trim() || null,
      cover_url: null,
    });
    setTitle("");
    setDescription("");
    setShowPublishForm(false);
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Store-Katalog
        </h2>
        {token && (
          <button
            onClick={() => setShowPublishForm((v) => !v)}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            {showPublishForm ? "Abbrechen" : "Spiel veröffentlichen"}
          </button>
        )}
      </div>

      {!token && (
        <p className="text-sm text-zinc-500">
          Melde dich an, um eigene Spiele im Katalog zu veröffentlichen.
        </p>
      )}

      {showPublishForm && (
        <form
          onSubmit={handlePublish}
          className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
        >
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Titel
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Beschreibung
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <button
            type="submit"
            className="self-end rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Veröffentlichen
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">Katalog wird geladen...</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Noch keine Spiele im Katalog veröffentlicht.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((game) => (
            <div
              key={game.id}
              className="flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
            >
              <div className="flex aspect-[3/4] w-full items-center justify-center bg-zinc-800 text-xs text-zinc-500">
                {game.cover_url ? (
                  <img
                    src={game.cover_url}
                    alt={game.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "Kein Cover"
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <span className="truncate text-sm font-medium text-zinc-100">
                  {game.title}
                </span>
                <p className="line-clamp-3 flex-1 text-xs text-zinc-400">
                  {game.description || "Keine Beschreibung vorhanden."}
                </p>
                <span className="text-xs font-semibold text-sky-400">
                  {game.price_cents === 0
                    ? "Bald verfügbar"
                    : `${(game.price_cents / 100).toFixed(2)} €`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
