import { useRef, useState } from "react";
import { useCatalogStore } from "../../catalogStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import { TagInput } from "./StoreView";

// Internal, locale-independent keys stored in `content_warnings` — always
// rendered through `t()` so the stored value stays stable across language
// switches (unlike freeform tags, this is a fixed vocabulary).
export const CONTENT_WARNING_OPTIONS: { key: string; label: TranslationKey }[] = [
  { key: "violence", label: "pub_content_warning_violence" },
  { key: "sexual", label: "pub_content_warning_sexual" },
  { key: "drugs", label: "pub_content_warning_drugs" },
  { key: "language", label: "pub_content_warning_language" },
  { key: "flashing", label: "pub_content_warning_flashing" },
];

function centsFromEuroInput(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

interface Props {
  onClose: () => void;
}

/// Full-page, Steam-Direct-inspired submission flow: everything a publisher
/// needs to fill in before a game goes into moderation review, in one place
/// instead of the old inline "publish" form. Deliberately skips the parts of
/// Steamworks' real process that don't map onto this platform yet — legal
/// entity/bank/tax verification and the $100 fee (no payment processor
/// exists here at all), multiple capsule-image sizes (a single cover URL +
/// the existing post-publish screenshot gallery cover that need), and the
/// 30-day/coming-soon timing gates (the existing pending/approved/rejected
/// moderation flow already plays that role).
export function PublishGamePage({ onClose }: Props) {
  const t = useT();
  const publishGame = useCatalogStore((s) => s.publishGame);
  const uploadGameFile = useCatalogStore((s) => s.uploadGameFile);
  const error = useCatalogStore((s) => s.error);
  const clearError = useCatalogStore((s) => s.clearError);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState("");
  const [trailerUrl, setTrailerUrl] = useState("");
  const [minSpecs, setMinSpecs] = useState("");
  const [recommendedSpecs, setRecommendedSpecs] = useState("");
  const [savePathHint, setSavePathHint] = useState("");
  const [contentWarnings, setContentWarnings] = useState<Set<string>>(new Set());
  const [isEarlyAccess, setIsEarlyAccess] = useState(false);
  const [earlyAccessNote, setEarlyAccessNote] = useState("");
  const [price, setPrice] = useState("0.00");
  const [buildVersion, setBuildVersion] = useState("1.0.0");
  const [buildFile, setBuildFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  function toggleContentWarning(key: string) {
    setContentWarnings((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError(t("pub_title_required"));
      return;
    }
    setValidationError(null);
    clearError();
    setSubmitting(true);
    try {
      const created = await publishGame({
        title: title.trim(),
        short_description: shortDescription.trim() || null,
        description: description.trim() || null,
        cover_url: coverUrl.trim() || null,
        tags: tags.length > 0 ? tags.join(",") : null,
        min_specs: minSpecs.trim() || null,
        recommended_specs: recommendedSpecs.trim() || null,
        save_path_hint: savePathHint.trim() || null,
        price_cents: centsFromEuroInput(price),
        trailer_url: trailerUrl.trim() || null,
        supported_languages: languages.length > 0 ? languages.join(",") : null,
        content_warnings: contentWarnings.size > 0 ? Array.from(contentWarnings).join(",") : null,
        is_early_access: isEarlyAccess,
        early_access_note: isEarlyAccess ? earlyAccessNote.trim() || null : null,
      });
      if (!created) return;
      if (buildFile) {
        await uploadGameFile(created.id, buildFile, buildVersion.trim() || "1.0.0");
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#0b1016]">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0b1016]/95 px-6 py-3 backdrop-blur">
        <button
          onClick={onClose}
          className="rounded bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/10"
        >
          {t("pub_back")}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl flex-col gap-10 px-6 pb-16">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">{t("pub_page_title")}</h1>
          <p className="mt-2 text-sm text-zinc-400">{t("pub_page_subtitle")}</p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            {t("pub_section_basics")}
          </h2>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("pub_title_label")}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("pub_title_placeholder")}
              required
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("pub_short_description_label")}
            <span className="text-xs text-zinc-500">{t("pub_short_description_hint")}</span>
            <input
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder={t("pub_short_description_placeholder")}
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("pub_description_label")}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder={t("pub_description_placeholder")}
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <TagInput tags={tags} onChange={setTags} suggestions={[]} />
          <div className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("pub_languages_label")}
            <span className="text-xs text-zinc-500">{t("pub_languages_hint")}</span>
            <TagInput tags={languages} onChange={setLanguages} suggestions={["Deutsch", "English"]} />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            {t("pub_section_media")}
          </h2>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("pub_cover_url_label")}
            <span className="text-xs text-zinc-500">{t("pub_cover_url_hint")}</span>
            <input
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://..."
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          {coverUrl.trim() && (
            <div
              className="h-40 w-full max-w-xs rounded-lg bg-cover bg-center ring-1 ring-zinc-700"
              style={{ backgroundImage: `url(${coverUrl.trim()})` }}
            />
          )}
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("pub_trailer_label")}
            <input
              value={trailerUrl}
              onChange={(e) => setTrailerUrl(e.target.value)}
              placeholder={t("pub_trailer_placeholder")}
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            {t("pub_section_requirements")}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              {t("store_min_specs_label")}
              <textarea
                value={minSpecs}
                onChange={(e) => setMinSpecs(e.target.value)}
                rows={4}
                placeholder={t("store_specs_placeholder")}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              {t("store_recommended_specs_label")}
              <textarea
                value={recommendedSpecs}
                onChange={(e) => setRecommendedSpecs(e.target.value)}
                rows={4}
                placeholder={t("store_specs_placeholder")}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("store_save_path_label")}
            <input
              value={savePathHint}
              onChange={(e) => setSavePathHint(e.target.value)}
              placeholder={t("store_save_path_placeholder")}
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
            <span className="text-xs text-zinc-500">{t("store_save_path_hint")}</span>
          </label>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            {t("pub_section_content")}
          </h2>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-zinc-300">{t("pub_content_warnings_label")}</span>
            <span className="text-xs text-zinc-500">{t("pub_content_warnings_hint")}</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {CONTENT_WARNING_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleContentWarning(opt.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    contentWarnings.has(opt.key)
                      ? "border-amber-400/60 bg-amber-900/40 text-amber-300"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
                  }`}
                >
                  {t(opt.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded border border-zinc-800 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <input
                type="checkbox"
                checked={isEarlyAccess}
                onChange={(e) => setIsEarlyAccess(e.target.checked)}
              />
              {t("pub_early_access_label")}
            </label>
            <span className="text-xs text-zinc-500">{t("pub_early_access_hint")}</span>
            {isEarlyAccess && (
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                {t("pub_early_access_note_label")}
                <textarea
                  value={earlyAccessNote}
                  onChange={(e) => setEarlyAccessNote(e.target.value)}
                  rows={3}
                  placeholder={t("pub_early_access_note_placeholder")}
                  className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
              </label>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            {t("pub_section_pricing")}
          </h2>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("pub_price_label")}
            <span className="text-xs text-zinc-500">{t("pub_price_hint")}</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-32 rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-400">
            {t("pub_section_build")}
          </h2>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("pub_build_version_label")}
            <input
              value={buildVersion}
              onChange={(e) => setBuildVersion(e.target.value)}
              className="w-40 rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <div className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("pub_build_file_label")}
            <span className="text-xs text-zinc-500">{t("pub_build_file_hint")}</span>
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                {t("pub_build_choose_file")}
              </button>
              {buildFile && (
                <span className="text-xs text-zinc-400">
                  {t("pub_build_file_selected")}: {buildFile.name}
                </span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => setBuildFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </section>

        {(validationError || error) && (
          <p className="text-sm text-red-400">{validationError || error}</p>
        )}

        <div className="flex flex-col items-end gap-2 border-t border-zinc-800 pt-6">
          <p className="text-xs text-zinc-500">{t("pub_review_note")}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              {t("dialog_cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {submitting ? t("pub_submitting") : t("pub_submit")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
