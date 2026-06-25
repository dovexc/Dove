import { useMemo, useRef, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";
import { formatSize } from "../../utils";
import { RatingPicker, Stars } from "./Stars";
import { RichNotes } from "./RichNotes";

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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  owned: boolean;
  isPublisher: boolean;
  onPurchase: () => void;
  purchasing: boolean;
}

export function GameDetailPage({ owned, isPublisher, onPurchase, purchasing }: Props) {
  const game = useCatalogStore((s) => s.detailGame);
  const screenshots = useCatalogStore((s) => s.detailScreenshots);
  const reviews = useCatalogStore((s) => s.detailReviews);
  const detailLoading = useCatalogStore((s) => s.detailLoading);
  const closeGameDetail = useCatalogStore((s) => s.closeGameDetail);
  const submitReview = useCatalogStore((s) => s.submitReview);
  const deleteReview = useCatalogStore((s) => s.deleteReview);
  const addGameScreenshot = useCatalogStore((s) => s.addGameScreenshot);
  const deleteGameScreenshot = useCatalogStore((s) => s.deleteGameScreenshot);
  const wishlist = useCatalogStore((s) => s.wishlist);
  const addToWishlist = useCatalogStore((s) => s.addToWishlist);
  const removeFromWishlist = useCatalogStore((s) => s.removeFromWishlist);
  const changelog = useCatalogStore((s) => s.detailChangelog);
  const submitVersionNote = useCatalogStore((s) => s.submitVersionNote);
  const deleteVersionNote = useCatalogStore((s) => s.deleteVersionNote);
  const authUser = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const [noteVersion, setNoteVersion] = useState(() => game?.version ?? "");
  const [noteText, setNoteText] = useState("");

  const ownReview = useMemo(
    () => reviews.find((r) => r.user_id === authUser?.id) ?? null,
    [reviews, authUser]
  );

  if (!game) return null;

  const heroImage = activeImage ?? game.cover_url;
  const tags = parseTags(game.tags);

  async function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !game) return;
    await addGameScreenshot(game.id, await fileToDataUrl(file));
  }

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (!game) return;
    await submitReview(game.id, reviewRating, reviewBody.trim() || null);
    setReviewBody("");
  }

  function startEditOwnReview() {
    if (!ownReview) return;
    setReviewRating(ownReview.rating);
    setReviewBody(ownReview.body ?? "");
  }

  async function handleSubmitVersionNote(e: React.FormEvent) {
    e.preventDefault();
    if (!game || !noteVersion.trim()) return;
    await submitVersionNote(game.id, noteVersion.trim(), noteText.trim() || null);
    setNoteText("");
  }

  function startEditVersionNote(note: { version: string; notes: string | null }) {
    setNoteVersion(note.version);
    setNoteText(note.notes ?? "");
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#0b1016]">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0b1016]/95 px-6 py-3 backdrop-blur">
        <button
          onClick={closeGameDetail}
          className="rounded bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/10"
        >
          ← Zurück zum Katalog
        </button>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <div
          className="relative h-[360px] w-full overflow-hidden rounded-xl"
          style={{
            background: heroImage
              ? `url(${heroImage}) center/cover`
              : "linear-gradient(135deg,#1c2c3e,#0d141c)",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,.75) 100%)",
            }}
          />
          <div className="absolute bottom-6 left-8 right-8">
            {tags.length > 0 && (
              <div className="mb-2 flex gap-3 text-sm font-semibold uppercase tracking-[3px] text-white/70">
                {tags.join(" · ")}
              </div>
            )}
            <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-lg">
              {game.title}
            </h1>
          </div>
        </div>

        {screenshots.length > 0 && (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {[game.cover_url, ...screenshots.map((s) => s.image_url)]
              .filter((url): url is string => Boolean(url))
              .map((url) => (
                <button
                  key={url}
                  onClick={() => setActiveImage(url)}
                  className={`h-16 w-28 shrink-0 rounded border-2 bg-cover bg-center ${
                    heroImage === url ? "border-sky-400" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  style={{ backgroundImage: `url(${url})` }}
                />
              ))}
          </div>
        )}

        {isPublisher && (
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => screenshotInputRef.current?.click()}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              + Bild zur Galerie hinzufügen
            </button>
            <input
              ref={screenshotInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleScreenshotChange}
            />
            {screenshots.map((s) => (
              <button
                key={s.id}
                onClick={() => deleteGameScreenshot(game.id, s.id)}
                className="text-xs text-red-400 hover:underline"
              >
                Bild #{s.id} entfernen
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-[1fr_280px] gap-8">
          <div className="flex flex-col gap-8">
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Über dieses Spiel
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {game.description || "Keine Beschreibung vorhanden."}
              </p>
            </section>

            {(game.min_specs || game.recommended_specs) && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Systemanforderungen
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Minimal
                    </h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                      {game.min_specs || "Keine Angabe"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                      Empfohlen
                    </h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                      {game.recommended_specs || "Keine Angabe"}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {owned && token && game.save_path_hint && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Cloud-Save
                </h2>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="text-sm text-zinc-400">
                    Spielstände werden beim Starten und Beenden automatisch synchronisiert.
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    Ordner: <span className="font-mono text-zinc-400">{game.save_path_hint}</span>
                  </p>
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Bewertungen
                </h2>
                {game.review_count > 0 ? (
                  <span className="flex items-center gap-2 text-sm text-zinc-400">
                    <Stars rating={game.avg_rating ?? 0} />
                    {(game.avg_rating ?? 0).toFixed(1)} ({game.review_count})
                  </span>
                ) : (
                  <span className="text-sm text-zinc-500">Noch keine Bewertungen</span>
                )}
              </div>

              {owned && (
                <form
                  onSubmit={handleSubmitReview}
                  className="mb-5 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">Deine Bewertung:</span>
                    <RatingPicker value={reviewRating} onChange={setReviewRating} />
                    <span className="text-sm text-zinc-500">{reviewRating.toFixed(1)}</span>
                  </div>
                  <textarea
                    value={reviewBody}
                    onChange={(e) => setReviewBody(e.target.value)}
                    rows={2}
                    placeholder="Was hältst du von diesem Spiel? (optional)"
                    className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                  />
                  <div className="flex justify-end gap-2">
                    {ownReview && (
                      <button
                        type="button"
                        onClick={() => deleteReview(game.id)}
                        className="rounded px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30"
                      >
                        Bewertung löschen
                      </button>
                    )}
                    <button
                      type="submit"
                      className="self-end rounded bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                    >
                      {ownReview ? "Bewertung aktualisieren" : "Bewertung abgeben"}
                    </button>
                  </div>
                </form>
              )}

              {detailLoading ? (
                <p className="text-sm text-zinc-500">Bewertungen werden geladen...</p>
              ) : reviews.length === 0 ? (
                <p className="text-sm text-zinc-500">Sei der Erste, der dieses Spiel bewertet.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {reviews.map((r) => (
                    <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-200">
                          {r.reviewer_display_name}
                        </span>
                        <Stars rating={r.rating} />
                      </div>
                      {r.body && (
                        <p className="mt-2 text-sm text-zinc-400">{r.body}</p>
                      )}
                      {r.user_id === authUser?.id && (
                        <button
                          onClick={startEditOwnReview}
                          className="mt-2 text-xs text-sky-400 hover:underline"
                        >
                          Bearbeiten
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Patch-Notes
              </h2>

              {isPublisher && (
                <form
                  onSubmit={handleSubmitVersionNote}
                  className="mb-5 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <label className="flex flex-col gap-1 text-sm text-zinc-300">
                    Version
                    <input
                      value={noteVersion}
                      onChange={(e) => setNoteVersion(e.target.value)}
                      required
                      className="w-40 rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                    />
                  </label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={5}
                    placeholder={
                      "Was hat sich in dieser Version geändert?\n\n" +
                      "Einfaches HTML wird unterstützt, z. B.:\n" +
                      "<h2>Überschrift</h2>\n<p>Text</p>\n<ul><li>Punkt 1</li></ul>\n<b>fett</b>, <i>kursiv</i>"
                    }
                    className="rounded bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                  />
                  <span className="text-xs text-zinc-500">
                    Erlaubte Tags: h1–h3, p, br, ul/ol/li, b/strong, i/em, u, code, blockquote. Andere
                    Tags (z. B. Links, Bilder, Skripte) werden entfernt.
                  </span>
                  <button
                    type="submit"
                    className="self-end rounded bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                  >
                    Patch-Notes speichern
                  </button>
                </form>
              )}

              {changelog.length === 0 ? (
                <p className="text-sm text-zinc-500">Noch keine Patch-Notes vorhanden.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {changelog.map((note) => (
                    <div key={note.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-zinc-200">Version {note.version}</span>
                        <span className="text-xs text-zinc-500">
                          {new Date(note.created_at).toLocaleDateString("de-DE")}
                        </span>
                      </div>
                      {note.notes ? (
                        <RichNotes
                          html={note.notes}
                          className="prose-patch-notes mt-2 text-sm text-zinc-400"
                        />
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500">Keine Details angegeben.</p>
                      )}
                      {isPublisher && (
                        <div className="mt-2 flex gap-3">
                          <button
                            onClick={() => startEditVersionNote(note)}
                            className="text-xs text-sky-400 hover:underline"
                          >
                            Bearbeiten
                          </button>
                          <button
                            onClick={() => deleteVersionNote(game.id, note.id)}
                            className="text-xs text-red-400 hover:underline"
                          >
                            Entfernen
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-4 self-start rounded-lg border border-white/10 bg-[#10171f] p-5">
            <span className="text-2xl font-bold text-sky-400">{formatPrice(game.price_cents)}</span>
            {owned ? (
              <span className="rounded bg-emerald-900/60 px-4 py-2 text-center text-sm font-semibold text-emerald-300">
                Im Besitz
              </span>
            ) : (
              <button
                onClick={onPurchase}
                disabled={purchasing}
                className="rounded bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {purchasing ? "..." : "Kaufen"}
              </button>
            )}
            {!owned && token && (
              <button
                onClick={() =>
                  wishlist.some((g) => g.id === game.id)
                    ? removeFromWishlist(game.id)
                    : addToWishlist(game.id)
                }
                className="rounded border border-pink-500/40 px-4 py-2 text-sm font-semibold text-pink-300 hover:bg-pink-900/30"
              >
                {wishlist.some((g) => g.id === game.id)
                  ? "♥ Von Wunschliste entfernen"
                  : "♡ Zur Wunschliste hinzufügen"}
              </button>
            )}
            {game.file_size_bytes != null && (
              <div className="text-xs text-zinc-500">
                Download: {formatSize(game.file_size_bytes)}
                <br />
                Version: {game.version}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
