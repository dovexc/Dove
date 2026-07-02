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

const PREVIEW_FALLBACK_GRADIENT = "linear-gradient(125deg,#2b5876,#4e4376)";

function centsFromEuroInput(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fieldClass(extra = ""): string {
  return `w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 text-[#dbe7f2] outline-none placeholder:text-[#566472] focus:border-sky-400/60 ${extra}`;
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
  const demoFileInputRef = useRef<HTMLInputElement>(null);

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
  const [isBeta, setIsBeta] = useState(false);
  const [price, setPrice] = useState("0.00");
  const [buildVersion, setBuildVersion] = useState("1.0.0");
  const [buildFile, setBuildFile] = useState<File | null>(null);
  const [demoVersion, setDemoVersion] = useState("1.0.0");
  const [demoFile, setDemoFile] = useState<File | null>(null);
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
        is_beta: isBeta,
      });
      if (!created) return;
      if (buildFile) {
        await uploadGameFile(created.id, buildFile, buildVersion.trim() || "1.0.0");
      }
      if (demoFile) {
        await uploadGameFile(created.id, demoFile, demoVersion.trim() || "1.0.0", true);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const priceCents = centsFromEuroInput(price);
  const previewPrice = priceCents > 0 ? `€${(priceCents / 100).toFixed(2)}` : t("price_free");
  const activeWarnings = CONTENT_WARNING_OPTIONS.filter((opt) => contentWarnings.has(opt.key));

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#0b1016]">
      <div className="flex-none border-b border-white/[0.04] bg-gradient-to-b from-[#171f29] to-[#121922] px-8 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-2 rounded-[9px] border border-white/10 bg-white/5 px-[18px] py-2.5 text-sm font-bold text-[#c7d5e0] hover:bg-white/10 hover:text-white"
        >
          ← {t("pub_back")}
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-y-auto bg-[radial-gradient(1200px_600px_at_50%_-150px,#1c2c3e_0%,#0d141c_55%,#0b1016_100%)]"
      >
        <div className="mx-auto flex max-w-[1180px] items-start gap-8 px-10 py-9">
          {/* ================= LEFT: FORM ================= */}
          <div className="min-w-0 flex-1">
            <h1 className="text-[34px] font-black tracking-tight text-white">{t("pub_page_title")}</h1>
            <p className="mb-7 mt-2.5 text-[15px] text-[#7b8794]">{t("pub_page_subtitle")}</p>

            {/* ============ BASICS card ============ */}
            <div className="mb-6 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] p-7">
              <div className="mb-5 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                {t("pub_section_basics")}
              </div>

              <label className="mb-5 flex flex-col gap-2 text-sm font-semibold text-[#c7d5e0]">
                {t("pub_title_label")}
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("pub_title_placeholder")}
                  required
                  className={fieldClass("h-12 text-base font-semibold")}
                />
              </label>

              <div className="mb-5 grid grid-cols-2 gap-5">
                <div className="flex flex-col gap-1 text-sm font-semibold text-[#c7d5e0]">
                  {t("pub_short_description_label")}
                  <span className="mb-1 text-xs font-normal text-[#6b7884]">
                    {t("pub_short_description_hint")}
                  </span>
                  <input
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder={t("pub_short_description_placeholder")}
                    className={fieldClass("h-12")}
                  />
                </div>
                <div className="flex flex-col gap-1 text-sm font-semibold text-[#c7d5e0]">
                  {t("pub_languages_label")}
                  <span className="mb-1 text-xs font-normal text-[#6b7884]">
                    {t("pub_languages_hint")}
                  </span>
                  <TagInput tags={languages} onChange={setLanguages} suggestions={["Deutsch", "English"]} />
                </div>
              </div>

              <label className="mb-5 flex flex-col gap-2 text-sm font-semibold text-[#c7d5e0]">
                {t("pub_description_label")}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  placeholder={t("pub_description_placeholder")}
                  className={fieldClass("min-h-[120px] resize-y py-3 text-[15px] font-normal leading-relaxed")}
                />
              </label>

              <div className="flex flex-col gap-2 text-sm font-semibold text-[#c7d5e0]">
                {t("pub_tags_label")}
                <TagInput tags={tags} onChange={setTags} suggestions={[]} />
              </div>
            </div>

            {/* ============ MEDIA + PRICING row ============ */}
            <div className="mb-6 flex flex-wrap items-start gap-6">
              <div className="min-w-[380px] flex-[2] rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] p-7">
                <div className="mb-5 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                  {t("pub_section_media")}
                </div>
                <label className="mb-5 flex flex-col gap-1 text-sm font-semibold text-[#c7d5e0]">
                  {t("pub_cover_url_label")}
                  <span className="mb-1 text-xs font-normal text-[#6b7884]">{t("pub_cover_url_hint")}</span>
                  <input
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://..."
                    className={fieldClass("h-12")}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-[#c7d5e0]">
                  {t("pub_trailer_label")}
                  <input
                    value={trailerUrl}
                    onChange={(e) => setTrailerUrl(e.target.value)}
                    placeholder={t("pub_trailer_placeholder")}
                    className={fieldClass("h-12")}
                  />
                </label>
              </div>

              <div className="min-w-[220px] flex-1 rounded-2xl border border-[rgba(140,210,60,.18)] bg-gradient-to-b from-[#182a1e] to-[#0f1a15] p-6">
                <div className="mb-5 text-xs font-extrabold uppercase tracking-[2px] text-[#8fd11f]">
                  {t("pub_section_pricing")}
                </div>
                <label className="flex flex-col gap-1 text-sm font-semibold text-[#c7d5e0]">
                  {t("pub_price_label")}
                  <span className="mb-2 text-xs font-normal text-[#6b7884]">{t("pub_price_hint")}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl font-extrabold text-[#8fd11f]">€</span>
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      className="h-[52px] w-full rounded-[9px] border border-[rgba(140,210,60,.25)] bg-[#0d141c] px-4 text-xl font-bold text-[#dbe7f2] outline-none focus:border-[rgba(140,210,60,.6)]"
                    />
                  </div>
                </label>
              </div>
            </div>

            {/* ============ SYSTEM REQUIREMENTS card ============ */}
            <div className="mb-6 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] p-7">
              <div className="mb-5 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                {t("pub_section_requirements")}
              </div>
              <div className="mb-5 grid grid-cols-2 gap-5">
                <label className="flex flex-col gap-2 text-sm font-semibold text-[#c7d5e0]">
                  {t("store_min_specs_label")}
                  <textarea
                    value={minSpecs}
                    onChange={(e) => setMinSpecs(e.target.value)}
                    rows={4}
                    placeholder={t("store_specs_placeholder")}
                    className={fieldClass("min-h-[110px] resize-y py-3 text-sm font-normal leading-relaxed")}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-semibold text-[#c7d5e0]">
                  {t("store_recommended_specs_label")}
                  <textarea
                    value={recommendedSpecs}
                    onChange={(e) => setRecommendedSpecs(e.target.value)}
                    rows={4}
                    placeholder={t("store_specs_placeholder")}
                    className={fieldClass("min-h-[110px] resize-y py-3 text-sm font-normal leading-relaxed")}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-2 text-sm font-semibold text-[#c7d5e0]">
                {t("store_save_path_label")}
                <input
                  value={savePathHint}
                  onChange={(e) => setSavePathHint(e.target.value)}
                  placeholder={t("store_save_path_placeholder")}
                  className={fieldClass("h-12")}
                />
                <span className="text-xs font-normal text-[#6b7884]">{t("store_save_path_hint")}</span>
              </label>
            </div>

            {/* ============ CONTENT INFO card ============ */}
            <div className="mb-6 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] p-7">
              <div className="mb-4 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                {t("pub_section_content")}
              </div>
              <div className="mb-3 text-[13px] text-[#6b7884]">{t("pub_content_warnings_hint")}</div>
              <div className="mb-[22px] flex flex-wrap gap-2.5">
                {CONTENT_WARNING_OPTIONS.map((opt) => {
                  const on = contentWarnings.has(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleContentWarning(opt.key)}
                      className={`h-[38px] rounded-full border px-4 text-[13px] font-semibold ${
                        on
                          ? "border-amber-400/40 bg-amber-500/[0.16] text-amber-300"
                          : "border-white/[0.08] bg-white/[0.03] text-[#9fb2c2] hover:border-white/20"
                      }`}
                    >
                      {t(opt.label)}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-[18px]">
                <div className="min-w-[240px] flex-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <button
                    type="button"
                    onClick={() => setIsEarlyAccess((v) => !v)}
                    className="flex w-full items-center gap-2.5 text-left"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border ${
                        isEarlyAccess
                          ? "border-[rgba(120,180,240,.6)] bg-gradient-to-b from-sky-500 to-sky-700"
                          : "border-white/20 bg-[#0d141c]"
                      }`}
                    >
                      {isEarlyAccess && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="text-[15px] font-bold text-[#e8f1f8]">{t("pub_early_access_label")}</span>
                  </button>
                  <span className="mt-1.5 block pl-[30px] text-[13px] text-[#7b8794]">
                    {t("pub_early_access_hint")}
                  </span>
                  {isEarlyAccess && (
                    <label className="mt-3 flex flex-col gap-2 pl-[30px] text-sm font-semibold text-[#c7d5e0]">
                      {t("pub_early_access_note_label")}
                      <textarea
                        value={earlyAccessNote}
                        onChange={(e) => setEarlyAccessNote(e.target.value)}
                        rows={3}
                        placeholder={t("pub_early_access_note_placeholder")}
                        className={fieldClass("resize-y py-2.5 text-sm font-normal leading-relaxed")}
                      />
                    </label>
                  )}
                </div>
                <div className="min-w-[240px] flex-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <button
                    type="button"
                    onClick={() => setIsBeta((v) => !v)}
                    className="flex w-full items-center gap-2.5 text-left"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border ${
                        isBeta
                          ? "border-[rgba(120,180,240,.6)] bg-gradient-to-b from-sky-500 to-sky-700"
                          : "border-white/20 bg-[#0d141c]"
                      }`}
                    >
                      {isBeta && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className="text-[15px] font-bold text-[#e8f1f8]">{t("pub_beta_label")}</span>
                  </button>
                  <span className="mt-1.5 block pl-[30px] text-[13px] text-[#7b8794]">{t("pub_beta_hint")}</span>
                </div>
              </div>
            </div>

            {/* ============ UPLOAD BUILD + DEMO row ============ */}
            <div className="mb-8 flex flex-wrap gap-6">
              <div className="min-w-[300px] flex-1 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] p-7">
                <div className="mb-[18px] text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                  {t("pub_section_build")}
                </div>
                <label className="mb-[18px] flex flex-col gap-2 text-sm font-semibold text-[#c7d5e0]">
                  {t("pub_build_version_label")}
                  <input
                    value={buildVersion}
                    onChange={(e) => setBuildVersion(e.target.value)}
                    className={fieldClass("h-11 w-[140px]")}
                  />
                </label>
                <div className="flex flex-col gap-1 text-sm font-semibold text-[#c7d5e0]">
                  {t("pub_build_file_label")}
                  <span className="mb-2.5 text-xs font-normal text-[#6b7884]">{t("pub_build_file_hint")}</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-[42px] rounded-[9px] border border-white/10 bg-white/5 px-5 text-sm font-bold text-[#dbe7f2] hover:bg-white/10 hover:text-white"
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
              </div>

              <div className="min-w-[300px] flex-1 rounded-2xl border border-dashed border-white/[0.12] bg-gradient-to-b from-[#141d27] to-[#111923] p-7">
                <div className="mb-1.5 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                  {t("pub_section_demo")}{" "}
                  <span className="font-semibold normal-case tracking-normal text-[#6b7884]">
                    ({t("pub_optional")})
                  </span>
                </div>
                <p className="mb-4 text-xs text-[#6b7884]">{t("pub_demo_hint")}</p>
                <label className="mb-[18px] flex flex-col gap-2 text-sm font-semibold text-[#c7d5e0]">
                  {t("pub_demo_version_label")}
                  <input
                    value={demoVersion}
                    onChange={(e) => setDemoVersion(e.target.value)}
                    className={fieldClass("h-11 w-[140px]")}
                  />
                </label>
                <div className="flex flex-col gap-2.5 text-sm font-semibold text-[#c7d5e0]">
                  {t("pub_demo_file_label")}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => demoFileInputRef.current?.click()}
                      className="h-[42px] rounded-[9px] border border-white/10 bg-white/5 px-5 text-sm font-bold text-[#dbe7f2] hover:bg-white/10 hover:text-white"
                    >
                      {t("pub_build_choose_file")}
                    </button>
                    {demoFile && (
                      <span className="text-xs text-zinc-400">
                        {t("pub_build_file_selected")}: {demoFile.name}
                      </span>
                    )}
                  </div>
                  <input
                    ref={demoFileInputRef}
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => setDemoFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            </div>

            {(validationError || error) && (
              <p className="mb-4 text-sm text-red-400">{validationError || error}</p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-5 border-t border-white/[0.06] pt-[22px]">
              <span className="mr-auto text-[13px] text-[#6b7884]">{t("pub_review_note")}</span>
              <button
                type="button"
                onClick={onClose}
                className="h-[46px] rounded-[9px] border border-white/10 bg-white/5 px-6 text-[15px] font-bold text-[#c7d5e0] hover:bg-white/10 hover:text-white"
              >
                {t("dialog_cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="h-[46px] rounded-[9px] bg-gradient-to-b from-sky-500 to-sky-700 px-[30px] text-[15px] font-bold text-white shadow-[0_8px_22px_rgba(40,120,200,.4)] hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? t("pub_submitting") : t("pub_submit")}
              </button>
            </div>
          </div>

          {/* ================= RIGHT: LIVE PREVIEW ================= */}
          <div className="sticky top-0 w-[300px] shrink-0">
            <div className="mb-3.5 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
              {t("pub_preview_label")}
            </div>
            <div className="overflow-hidden rounded-[14px] border border-white/[0.08] bg-gradient-to-b from-[#161f2a] to-[#121a23] shadow-[0_20px_50px_rgba(0,0,0,.4)]">
              <div
                className="relative h-[150px]"
                style={{
                  background: coverUrl.trim() ? `url(${coverUrl.trim()}) center/cover` : PREVIEW_FALLBACK_GRADIENT,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-[#121a23]/85" />
                <div className="absolute inset-x-4 bottom-3 text-[19px] font-black leading-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,.6)]">
                  {title.trim() || t("pub_title_placeholder")}
                </div>
              </div>
              <div className="flex flex-col gap-3 px-[18px] pb-[18px] pt-4">
                <div className="text-[13px] leading-relaxed text-[#9fb2c2]">
                  {shortDescription.trim() || t("pub_short_description_hint")}
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[10px] bg-sky-500/[0.14] px-2.5 py-1 text-[11px] font-bold text-[#9fe3ff]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5">
                  <span className="text-[17px] font-extrabold text-[#8fd11f]">{previewPrice}</span>
                  {isEarlyAccess && (
                    <span className="rounded-[6px] border border-[rgba(255,160,80,.35)] bg-[rgba(255,140,60,.16)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#ffb877]">
                      {t("pub_early_access_badge")}
                    </span>
                  )}
                  {isBeta && (
                    <span className="rounded-[6px] border border-[rgba(120,180,240,.35)] bg-[rgba(58,160,255,.16)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#9fe3ff]">
                      {t("pub_beta_badge")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {activeWarnings.length > 0 && (
              <div className="mt-[18px] rounded-xl border border-[rgba(255,160,80,.25)] bg-[rgba(255,140,60,.08)] px-4 py-3.5">
                <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[#ffb877]">
                  {t("pub_content_warnings_label")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activeWarnings.map((w) => (
                    <span key={w.key} className="text-[11px] font-semibold text-[#ffcfa0]">
                      {t(w.label)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
