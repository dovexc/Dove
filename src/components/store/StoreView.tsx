import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";
import { formatSize } from "../../utils";

export function StoreView() {
  const games = useCatalogStore((s) => s.games);
  const library = useCatalogStore((s) => s.library);
  const loading = useCatalogStore((s) => s.loading);
  const purchasingId = useCatalogStore((s) => s.purchasingId);
  const uploadingId = useCatalogStore((s) => s.uploadingId);
  const error = useCatalogStore((s) => s.error);
  const fetchCatalog = useCatalogStore((s) => s.fetchCatalog);
  const fetchLibrary = useCatalogStore((s) => s.fetchLibrary);
  const publishGame = useCatalogStore((s) => s.publishGame);
  const purchaseGame = useCatalogStore((s) => s.purchaseGame);
  const uploadGameFile = useCatalogStore((s) => s.uploadGameFile);
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);
  const [uploadVersion, setUploadVersion] = useState<string | null>(null);

  const [showPublishForm, setShowPublishForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const ownedIds = useMemo(() => new Set(library.map((g) => g.id)), [library]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary, token]);

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

  function startUpload(gameId: number, currentVersion: string) {
    const version = window.prompt(
      "Versionsnummer für diesen Upload:",
      currentVersion || "1.0.0"
    );
    if (!version || !version.trim()) return;
    setUploadTargetId(gameId);
    setUploadVersion(version.trim());
    uploadInputRef.current?.click();
  }

  async function handleUploadFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const gameId = uploadTargetId;
    const version = uploadVersion;
    e.target.value = "";
    if (!file || gameId === null || !version) return;
    await uploadGameFile(gameId, file, version);
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
          {games.map((game) => {
            const owned = ownedIds.has(game.id);
            const isPublisher = authUser?.id === game.publisher_user_id;
            return (
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
                  {game.file_size_bytes != null && (
                    <span className="text-xs text-zinc-500">
                      Download: {formatSize(game.file_size_bytes)} · v{game.version}
                    </span>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-sky-400">
                      {game.price_cents === 0
                        ? "Kostenlos"
                        : `${(game.price_cents / 100).toFixed(2)} €`}
                    </span>
                    {owned ? (
                      <span className="rounded bg-emerald-900/60 px-2 py-1 text-xs font-semibold text-emerald-300">
                        Im Besitz
                      </span>
                    ) : token ? (
                      <button
                        onClick={() => purchaseGame(game.id)}
                        disabled={purchasingId === game.id}
                        className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                      >
                        {purchasingId === game.id ? "..." : "Kaufen"}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500">Anmelden zum Kaufen</span>
                    )}
                  </div>
                  {isPublisher && (
                    <button
                      onClick={() => startUpload(game.id, game.version)}
                      disabled={uploadingId === game.id}
                      className="mt-1 rounded bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {uploadingId === game.id
                        ? "Lädt hoch..."
                        : game.file_url
                          ? "Neue Version hochladen"
                          : "Datei hochladen (.zip)"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={uploadInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleUploadFileChange}
      />
    </div>
  );
}
