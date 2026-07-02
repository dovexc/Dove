import { useMemo, useRef, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";
import { formatSize } from "../../utils";
import { CartButton } from "./CartButton";
import { PriceTag, SaleBadge } from "./PriceTag";
import { RatingPicker, Stars } from "./Stars";
import { RichNotes } from "./RichNotes";
import { useT } from "../../translations";

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
  const t = useT();
  const game = useCatalogStore((s) => s.detailGame);
  const screenshots = useCatalogStore((s) => s.detailScreenshots);
  const reviews = useCatalogStore((s) => s.detailReviews);
  const detailLoading = useCatalogStore((s) => s.detailLoading);
  const closeGameDetail = useCatalogStore((s) => s.closeGameDetail);
  const submitReview = useCatalogStore((s) => s.submitReview);
  const deleteReview = useCatalogStore((s) => s.deleteReview);
  const voteOnReview = useCatalogStore((s) => s.voteOnReview);
  const removeReviewVote = useCatalogStore((s) => s.removeReviewVote);
  const addGameScreenshot = useCatalogStore((s) => s.addGameScreenshot);
  const deleteGameScreenshot = useCatalogStore((s) => s.deleteGameScreenshot);
  const wishlist = useCatalogStore((s) => s.wishlist);
  const addToWishlist = useCatalogStore((s) => s.addToWishlist);
  const removeFromWishlist = useCatalogStore((s) => s.removeFromWishlist);
  const changelog = useCatalogStore((s) => s.detailChangelog);
  const submitVersionNote = useCatalogStore((s) => s.submitVersionNote);
  const deleteVersionNote = useCatalogStore((s) => s.deleteVersionNote);
  const achievements = useCatalogStore((s) => s.detailAchievements);
  const submitAchievement = useCatalogStore((s) => s.submitAchievement);
  const deleteAchievement = useCatalogStore((s) => s.deleteAchievement);
  const authUser = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const [noteVersion, setNoteVersion] = useState(() => game?.version ?? "");
  const [noteText, setNoteText] = useState("");
  const [reviewSort, setReviewSort] = useState<"newest" | "helpful">("newest");
  const [achKey, setAchKey] = useState("");
  const [achTitle, setAchTitle] = useState("");
  const [achDescription, setAchDescription] = useState("");
  const [achIcon, setAchIcon] = useState<string | null>(null);
  const [achHidden, setAchHidden] = useState(false);
  const achievementIconInputRef = useRef<HTMLInputElement>(null);

  const ownReview = useMemo(
    () => reviews.find((r) => r.user_id === authUser?.id) ?? null,
    [reviews, authUser]
  );

  const sortedReviews = useMemo(() => {
    if (reviewSort === "helpful") {
      return [...reviews].sort(
        (a, b) => (b.helpful_count - b.unhelpful_count) - (a.helpful_count - a.unhelpful_count)
      );
    }
    return reviews;
  }, [reviews, reviewSort]);

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

  async function handleVote(reviewId: number, currentVote: boolean | null, isHelpful: boolean) {
    if (!game) return;
    if (currentVote === isHelpful) {
      await removeReviewVote(game.id, reviewId);
    } else {
      await voteOnReview(game.id, reviewId, isHelpful);
    }
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

  async function handleAchievementIconChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAchIcon(await fileToDataUrl(file));
  }

  async function handleSubmitAchievement(e: React.FormEvent) {
    e.preventDefault();
    if (!game || !achKey.trim() || !achTitle.trim()) return;
    await submitAchievement(
      game.id,
      achKey.trim(),
      achTitle.trim(),
      achDescription.trim() || null,
      achIcon,
      achHidden
    );
    setAchKey("");
    setAchTitle("");
    setAchDescription("");
    setAchIcon(null);
    setAchHidden(false);
  }

  function startEditAchievement(achievement: {
    key: string;
    title: string | null;
    description: string | null;
    hidden: boolean;
  }) {
    setAchKey(achievement.key);
    setAchTitle(achievement.title ?? "");
    setAchDescription(achievement.description ?? "");
    setAchIcon(null);
    setAchHidden(achievement.hidden);
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#0b1016]">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0b1016]/95 px-6 py-3 backdrop-blur">
        <button
          onClick={closeGameDetail}
          className="rounded bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/10"
        >
          {t("gdp_back_to_catalog")}
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
          <div className="absolute right-6 top-6">
            <SaleBadge priceCents={game.price_cents} salePriceCents={game.sale_price_cents} />
          </div>
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
              {t("gdp_add_gallery_image")}
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
                {t("gdp_remove_image").replace("{n}", String(s.id))}
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-[1fr_280px] gap-8">
          <div className="flex flex-col gap-8">
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                {t("gdp_about_game")}
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {game.description || t("gdp_no_description")}
              </p>
            </section>

            {(game.min_specs || game.recommended_specs) && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  {t("gdp_system_requirements")}
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                      {t("gdp_minimal")}
                    </h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                      {game.min_specs || t("gdp_no_info")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">
                      {t("gdp_recommended")}
                    </h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                      {game.recommended_specs || t("gdp_no_info")}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {owned && token && game.save_path_hint && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  {t("gdp_cloud_save")}
                </h2>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                  <p className="text-sm text-zinc-400">
                    {t("gdp_cloud_save_desc")}
                  </p>
                  <p className="mt-2 text-sm text-zinc-500">
                    {t("gdp_folder")}: <span className="font-mono text-zinc-400">{game.save_path_hint}</span>
                  </p>
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  {t("gdp_reviews")}
                </h2>
                {game.review_count > 0 ? (
                  <span className="flex items-center gap-2 text-sm text-zinc-400">
                    <Stars rating={game.avg_rating ?? 0} />
                    {(game.avg_rating ?? 0).toFixed(1)} ({game.review_count})
                  </span>
                ) : (
                  <span className="text-sm text-zinc-500">{t("gdp_no_reviews")}</span>
                )}
                {reviews.length > 1 && (
                  <select
                    value={reviewSort}
                    onChange={(e) => setReviewSort(e.target.value as "newest" | "helpful")}
                    className="ml-auto rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                  >
                    <option value="newest">{t("gdp_sort_newest")}</option>
                    <option value="helpful">{t("gdp_sort_helpful")}</option>
                  </select>
                )}
              </div>

              {owned && (
                <form
                  onSubmit={handleSubmitReview}
                  className="mb-5 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">{t("gdp_your_rating")}</span>
                    <RatingPicker value={reviewRating} onChange={setReviewRating} />
                    <span className="text-sm text-zinc-500">{reviewRating.toFixed(1)}</span>
                  </div>
                  <textarea
                    value={reviewBody}
                    onChange={(e) => setReviewBody(e.target.value)}
                    rows={2}
                    placeholder={t("gdp_review_placeholder")}
                    className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                  />
                  <div className="flex justify-end gap-2">
                    {ownReview && (
                      <button
                        type="button"
                        onClick={() => deleteReview(game.id)}
                        className="rounded px-3 py-1.5 text-sm text-red-400 hover:bg-red-900/30"
                      >
                        {t("gdp_delete_review")}
                      </button>
                    )}
                    <button
                      type="submit"
                      className="self-end rounded bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                    >
                      {ownReview ? t("gdp_update_review") : t("gdp_submit_review")}
                    </button>
                  </div>
                </form>
              )}

              {detailLoading ? (
                <p className="text-sm text-zinc-500">{t("gdp_loading_reviews")}</p>
              ) : reviews.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("gdp_be_first_review")}</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {sortedReviews.map((r) => (
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
                      <div className="mt-2 flex items-center gap-3">
                        {authUser && r.user_id !== authUser.id ? (
                          <>
                            <button
                              onClick={() => handleVote(r.id, r.my_vote, true)}
                              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                                r.my_vote === true
                                  ? "bg-sky-600 text-white"
                                  : "text-zinc-400 hover:bg-zinc-800"
                              }`}
                            >
                              👍 {t("gdp_helpful")} ({r.helpful_count})
                            </button>
                            <button
                              onClick={() => handleVote(r.id, r.my_vote, false)}
                              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                                r.my_vote === false
                                  ? "bg-red-600 text-white"
                                  : "text-zinc-400 hover:bg-zinc-800"
                              }`}
                            >
                              👎 {t("gdp_not_helpful")} ({r.unhelpful_count})
                            </button>
                          </>
                        ) : (
                          (r.helpful_count > 0 || r.unhelpful_count > 0) && (
                            <span className="text-xs text-zinc-500">
                              👍 {r.helpful_count} · 👎 {r.unhelpful_count}
                            </span>
                          )
                        )}
                        {r.user_id === authUser?.id && (
                          <button
                            onClick={startEditOwnReview}
                            className="text-xs text-sky-400 hover:underline"
                          >
                            {t("gdp_edit")}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                {t("gdp_patch_notes")}
              </h2>

              {isPublisher && (
                <form
                  onSubmit={handleSubmitVersionNote}
                  className="mb-5 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <label className="flex flex-col gap-1 text-sm text-zinc-300">
                    {t("gdp_version")}
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
                    placeholder={t("gdp_changelog_placeholder")}
                    className="rounded bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                  />
                  <span className="text-xs text-zinc-500">
                    {t("gdp_allowed_tags")}
                  </span>
                  <button
                    type="submit"
                    className="self-end rounded bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                  >
                    {t("gdp_save_patch_notes")}
                  </button>
                </form>
              )}

              {changelog.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("gdp_no_patch_notes")}</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {changelog.map((note) => (
                    <div key={note.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-zinc-200">{t("gdp_version")} {note.version}</span>
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
                        <p className="mt-2 text-sm text-zinc-500">{t("gdp_no_details")}</p>
                      )}
                      {isPublisher && (
                        <div className="mt-2 flex gap-3">
                          <button
                            onClick={() => startEditVersionNote(note)}
                            className="text-xs text-sky-400 hover:underline"
                          >
                            {t("gdp_edit")}
                          </button>
                          <button
                            onClick={() => deleteVersionNote(game.id, note.id)}
                            className="text-xs text-red-400 hover:underline"
                          >
                            {t("gdp_remove")}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                {t("gdp_achievements")}
              </h2>

              {isPublisher && (
                <form
                  onSubmit={handleSubmitAchievement}
                  className="mb-5 flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-sm text-zinc-300">
                      {t("gdp_achievement_key")}
                      <input
                        value={achKey}
                        onChange={(e) => setAchKey(e.target.value)}
                        required
                        placeholder="FIRST_WIN"
                        className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                      />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-sm text-zinc-300">
                      {t("gdp_achievement_title")}
                      <input
                        value={achTitle}
                        onChange={(e) => setAchTitle(e.target.value)}
                        required
                        className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                      />
                    </label>
                  </div>
                  <textarea
                    value={achDescription}
                    onChange={(e) => setAchDescription(e.target.value)}
                    rows={2}
                    placeholder={t("gdp_achievement_description_placeholder")}
                    className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => achievementIconInputRef.current?.click()}
                      className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      {achIcon ? t("gdp_achievement_icon_selected") : t("gdp_achievement_add_icon")}
                    </button>
                    <input
                      ref={achievementIconInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAchievementIconChange}
                    />
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={achHidden}
                        onChange={(e) => setAchHidden(e.target.checked)}
                      />
                      {t("gdp_achievement_hidden")}
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="self-end rounded bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                  >
                    {t("gdp_save_achievement")}
                  </button>
                </form>
              )}

              {achievements.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("gdp_no_achievements")}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {achievements.map((a) => (
                    <div
                      key={a.id}
                      className={`relative group flex items-center gap-3 rounded-lg border border-zinc-800 p-3 ${
                        a.unlocked ? "bg-zinc-900/60" : "bg-zinc-900/20 opacity-70"
                      }`}
                    >
                      {!a.hidden && a.unlock_percentage !== null && (
                        <div className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100 whitespace-nowrap">
                          {a.unlock_percentage.toFixed(1)}% {t("gdp_achievement_global_percentage")}
                        </div>
                      )}
                      {a.icon_url ? (
                        <img src={a.icon_url} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-800 text-lg">
                          {a.unlocked ? "🏆" : "🔒"}
                        </div>
                      )}
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-zinc-200">
                          {a.title ?? "???"}
                        </span>
                        {a.description && (
                          <p className="text-xs text-zinc-500">{a.description}</p>
                        )}
                        {a.unlocked && a.unlocked_at && (
                          <p className="text-xs text-emerald-400">
                            {t("gdp_achievement_unlocked_on")}{" "}
                            {new Date(a.unlocked_at).toLocaleDateString("de-DE")}
                          </p>
                        )}
                      </div>
                      {isPublisher && (
                        <div className="flex gap-3">
                          <button
                            onClick={() => startEditAchievement(a)}
                            className="text-xs text-sky-400 hover:underline"
                          >
                            {t("gdp_edit")}
                          </button>
                          <button
                            onClick={() => deleteAchievement(game.id, a.id)}
                            className="text-xs text-red-400 hover:underline"
                          >
                            {t("gdp_remove")}
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
            <span className="text-2xl font-bold text-sky-400">
              <PriceTag priceCents={game.price_cents} salePriceCents={game.sale_price_cents} t={t} />
            </span>
            {owned ? (
              <span className="rounded bg-emerald-900/60 px-4 py-2 text-center text-sm font-semibold text-emerald-300">
                {t("store_owned")}
              </span>
            ) : (
              <>
                <button
                  onClick={onPurchase}
                  disabled={purchasing}
                  className="rounded bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {purchasing ? "..." : t("store_buy")}
                </button>
                <CartButton game={game} owned={owned} size="lg" />
              </>
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
                  ? t("gdp_remove_from_wishlist")
                  : t("gdp_add_to_wishlist")}
              </button>
            )}
            {game.file_size_bytes != null && (
              <div className="text-xs text-zinc-500">
                {t("gdp_download")}: {formatSize(game.file_size_bytes)}
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
