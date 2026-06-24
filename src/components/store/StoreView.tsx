import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";
import { formatSize } from "../../utils";
import type { CatalogGame } from "../../types";

const COVER_GRADIENTS = [
  "linear-gradient(135deg,#2b5876,#4e4376)",
  "linear-gradient(135deg,#f7008e,#330867)",
  "linear-gradient(135deg,#0f2027,#2c5364)",
  "linear-gradient(135deg,#56ab2f,#a8e063)",
  "linear-gradient(135deg,#360033,#0b8793)",
  "linear-gradient(135deg,#c31432,#240b36)",
  "linear-gradient(135deg,#ee9ca7,#7b4397)",
  "linear-gradient(135deg,#0052d4,#65c7f7)",
];

function coverGradient(id: number): string {
  return COVER_GRADIENTS[id % COVER_GRADIENTS.length];
}

function formatPrice(priceCents: number): string {
  return priceCents === 0 ? "Kostenlos" : `${(priceCents / 100).toFixed(2)} €`;
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function TagInput({
  tags,
  onChange,
  suggestions,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  function addTag(value: string) {
    const trimmed = value.trim();
    if (!trimmed || tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...tags, trimmed]);
    setDraft("");
  }

  function removeTag(value: string) {
    onChange(tags.filter((t) => t !== value));
  }

  const filteredSuggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
      .filter((s) => !query || s.toLowerCase().includes(query));
  }, [suggestions, tags, draft]);

  return (
    <div className="relative flex flex-col gap-1 text-sm text-zinc-300">
      Tags
      <div className="flex flex-wrap items-center gap-2 rounded bg-zinc-800 px-2 py-2 ring-1 ring-zinc-700 focus-within:ring-sky-500">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 rounded bg-sky-900/60 px-2 py-1 text-xs font-semibold text-sky-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="text-sky-300 hover:text-white"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setShowSuggestions(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(draft);
            } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          placeholder={tags.length === 0 ? "Beliebige Tags eingeben, Enter zum Hinzufügen" : ""}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-zinc-100 outline-none placeholder:text-zinc-500"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded border border-zinc-700 bg-zinc-800 shadow-lg">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(s);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const storageUsage = useCatalogStore((s) => s.storageUsage);
  const fetchStorageUsage = useCatalogStore((s) => s.fetchStorageUsage);
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);
  const [uploadVersion, setUploadVersion] = useState<string | null>(null);
  const [versionDialogGame, setVersionDialogGame] = useState<CatalogGame | null>(null);
  const [versionDraft, setVersionDraft] = useState("1.0.0");

  const [showPublishForm, setShowPublishForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Alle");
  const [tagSearch, setTagSearch] = useState("");
  const [featuredIndex, setFeaturedIndex] = useState(0);

  const ownedIds = useMemo(() => new Set(library.map((g) => g.id)), [library]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const game of games) {
      for (const tag of parseTags(game.tags)) set.add(tag);
    }
    return ["Alle", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [games]);

  const visibleCategories = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter(
      (c) => c === "Alle" || c === category || c.toLowerCase().includes(query)
    );
  }, [categories, tagSearch, category]);

  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    return games.filter((game) => {
      const matchesQuery =
        !query ||
        game.title.toLowerCase().includes(query) ||
        parseTags(game.tags).some((tag) => tag.toLowerCase().includes(query));
      const matchesCategory = category === "Alle" || parseTags(game.tags).includes(category);
      return matchesQuery && matchesCategory;
    });
  }, [games, search, category]);

  const featuredGames = useMemo(
    () => games.filter((g) => g.status === "approved").slice(0, 3),
    [games]
  );
  const hero: CatalogGame | null = featuredGames[featuredIndex] ?? null;

  useEffect(() => {
    if (featuredIndex >= featuredGames.length) setFeaturedIndex(0);
  }, [featuredGames.length, featuredIndex]);

  useEffect(() => {
    if (featuredGames.length <= 1) return;
    const interval = setInterval(() => {
      setFeaturedIndex((i) => (i + 1) % featuredGames.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [featuredGames.length]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary, token]);

  useEffect(() => {
    fetchStorageUsage();
  }, [fetchStorageUsage, token]);

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await publishGame({
      title: title.trim(),
      description: description.trim() || null,
      cover_url: null,
      tags: newTags.length > 0 ? newTags.join(",") : null,
    });
    setTitle("");
    setDescription("");
    setNewTags([]);
    setShowPublishForm(false);
  }

  function startUpload(game: CatalogGame) {
    setVersionDraft(game.version || "1.0.0");
    setVersionDialogGame(game);
  }

  function confirmVersionAndPickFile() {
    if (!versionDialogGame || !versionDraft.trim()) return;
    setUploadTargetId(versionDialogGame.id);
    setUploadVersion(versionDraft.trim());
    setVersionDialogGame(null);
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

  function renderPurchaseControl(game: CatalogGame, owned: boolean, size: "sm" | "lg") {
    if (owned) {
      return (
        <span
          className={`rounded font-semibold text-emerald-300 bg-emerald-900/60 ${
            size === "lg" ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs"
          }`}
        >
          Im Besitz
        </span>
      );
    }
    if (!token) {
      return <span className="text-xs text-zinc-500">Anmelden zum Kaufen</span>;
    }
    return (
      <button
        onClick={() => purchaseGame(game.id)}
        disabled={purchasingId === game.id}
        className={`rounded font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 ${
          size === "lg" ? "px-5 py-2.5 text-sm" : "px-3 py-1 text-xs"
        }`}
      >
        {purchasingId === game.id ? "..." : "Kaufen"}
      </button>
    );
  }

  return (
    <div
      className="flex h-full flex-col gap-6 overflow-y-auto p-6"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -150px, #1c2c3e 0%, #0d141c 55%, #0b1016 100%)",
      }}
    >
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
          <TagInput
            tags={newTags}
            onChange={setNewTags}
            suggestions={categories.filter((c) => c !== "Alle")}
          />
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
        <>
          {hero && (
            <section className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold tracking-tight text-zinc-100">
                  Empfohlen &amp; Featured
                </h2>
                {featuredGames.length > 1 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setFeaturedIndex(
                          (i) => (i - 1 + featuredGames.length) % featuredGames.length
                        )
                      }
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400 hover:bg-sky-600/30 hover:text-white"
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => setFeaturedIndex((i) => (i + 1) % featuredGames.length)}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-400 hover:bg-sky-600/30 hover:text-white"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>

              <div className="flex h-[380px] overflow-hidden rounded-xl shadow-2xl">
                <div
                  className="relative flex-1"
                  style={{
                    background: hero.cover_url
                      ? `url(${hero.cover_url}) center/cover`
                      : coverGradient(hero.id),
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(700px 380px at 22% 40%, rgba(0,0,0,0) 0%, rgba(0,0,0,.35) 100%)",
                    }}
                  />
                  <div className="absolute left-10 bottom-10 right-10">
                    {parseTags(hero.tags).length > 0 && (
                      <div className="mb-2 flex gap-3 text-sm font-semibold uppercase tracking-[3px] text-white/70">
                        {parseTags(hero.tags).join(" · ")}
                      </div>
                    )}
                    <div className="text-5xl font-black leading-none tracking-tight text-white drop-shadow-lg">
                      {hero.title}
                    </div>
                  </div>
                </div>

                <div className="flex w-[340px] flex-none flex-col bg-gradient-to-b from-[#1a2735] to-[#141d28] p-6">
                  <div className="mb-1 text-xl font-extrabold text-white">{hero.title}</div>
                  <p className="mb-auto mt-2 line-clamp-6 text-sm text-zinc-400">
                    {hero.description || "Keine Beschreibung vorhanden."}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-base font-bold text-sky-400">
                      {formatPrice(hero.price_cents)}
                    </span>
                    {renderPurchaseControl(hero, ownedIds.has(hero.id), "lg")}
                  </div>
                </div>
              </div>

              {featuredGames.length > 1 && (
                <div className="flex justify-center gap-2">
                  {featuredGames.map((g, i) => (
                    <button
                      key={g.id}
                      onClick={() => setFeaturedIndex(i)}
                      className="h-[7px] rounded-full transition-all"
                      style={{
                        width: i === featuredIndex ? 26 : 9,
                        background: i === featuredIndex ? "#66c0f4" : "rgba(255,255,255,.2)",
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="mt-4 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold tracking-tight text-zinc-100">
                Im Katalog stöbern
              </h2>
              <span className="text-sm text-zinc-500">{filteredGames.length} Spiele</span>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex h-[46px] flex-1 min-w-[200px] items-center gap-3 rounded-lg border border-white/10 bg-[#10171f] px-4">
                <span className="text-zinc-500">🔍</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Spiele durchsuchen..."
                  className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {visibleCategories.map((c) => {
                  const active = c === category;
                  return (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`h-[46px] rounded-lg border px-4 text-sm font-semibold ${
                        active
                          ? "border-sky-400/50 bg-gradient-to-b from-sky-500 to-sky-700 text-white"
                          : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
                <div className="flex h-[46px] w-[160px] items-center gap-2 rounded-lg border border-white/10 bg-[#10171f] px-3">
                  <span className="text-zinc-500">🏷️</span>
                  <input
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Mehr Tags..."
                    className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                  />
                </div>
              </div>
            </div>

            {filteredGames.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Keine Spiele gefunden, die zu deiner Suche passen.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
                {filteredGames.map((game) => {
                  const owned = ownedIds.has(game.id);
                  const isPublisher = authUser?.id === game.publisher_user_id;
                  const tags = parseTags(game.tags);
                  return (
                    <div
                      key={game.id}
                      className="group flex flex-col overflow-hidden rounded-lg border border-white/5 bg-[#141c26] shadow-lg transition-transform hover:-translate-y-1"
                    >
                      <div
                        className="relative aspect-[3/4] w-full"
                        style={{
                          background: game.cover_url
                            ? `url(${game.cover_url}) center/cover`
                            : coverGradient(game.id),
                        }}
                        title={game.description || undefined}
                      >
                        <div
                          className="absolute inset-0"
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%)",
                          }}
                        />
                        {tags.length > 0 && (
                          <div className="absolute left-3 top-3 flex flex-wrap gap-1">
                            {tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <span className="absolute bottom-4 left-4 right-4 text-lg font-black leading-tight text-white drop-shadow-lg">
                          {game.title}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2 p-3">
                        {isPublisher && game.status !== "approved" && (
                          <span
                            className={`self-start rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                              game.status === "pending"
                                ? "bg-amber-900/60 text-amber-300"
                                : "bg-red-900/60 text-red-300"
                            }`}
                          >
                            {game.status === "pending" ? "In Prüfung" : "Abgelehnt"}
                          </span>
                        )}
                        {game.file_size_bytes != null && (
                          <span className="text-xs text-zinc-500">
                            Download: {formatSize(game.file_size_bytes)} · v{game.version}
                          </span>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-zinc-100">
                            {formatPrice(game.price_cents)}
                          </span>
                          {game.status === "approved" && renderPurchaseControl(game, owned, "sm")}
                        </div>
                        {isPublisher && (
                          <button
                            onClick={() => startUpload(game)}
                            disabled={uploadingId === game.id}
                            className="rounded bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
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
          </section>
        </>
      )}

      <input
        ref={uploadInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleUploadFileChange}
      />

      {versionDialogGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="flex w-[24rem] flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-lg font-bold text-zinc-100">
              Versionsnummer für {versionDialogGame.title}
            </h2>
            {storageUsage && (
              <div className="text-xs text-zinc-500">
                Speicherplatz belegt: {formatSize(storageUsage.used_bytes)} /{" "}
                {formatSize(storageUsage.quota_bytes)}
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{
                      width: `${Math.min(
                        100,
                        (storageUsage.used_bytes / storageUsage.quota_bytes) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Version
              <input
                value={versionDraft}
                onChange={(e) => setVersionDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmVersionAndPickFile();
                }}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setVersionDialogGame(null)}
                className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirmVersionAndPickFile}
                disabled={!versionDraft.trim()}
                className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                Weiter & Datei auswählen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
