import { useState } from "react";
import { useCatalogStore } from "../../catalogStore";
import { useT } from "../../translations";
import { TagInput } from "./StoreView";
import type { CatalogGame } from "../../types";

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function euroInputToCents(value: string): number {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/// `datetime-local` inputs want "YYYY-MM-DDTHH:mm" in local time, with no
/// timezone suffix — `toISOString()` is UTC, so the offset is stripped back
/// out here instead of just slicing it.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  game: CatalogGame;
  onClose: () => void;
}

export function EditCatalogGameDialog({ game, onClose }: Props) {
  const t = useT();
  const updateGame = useCatalogStore((s) => s.updateGame);
  const error = useCatalogStore((s) => s.error);
  const clearError = useCatalogStore((s) => s.clearError);

  const [title, setTitle] = useState(game.title);
  const [description, setDescription] = useState(game.description ?? "");
  const [coverUrl, setCoverUrl] = useState(game.cover_url ?? "");
  const [tags, setTags] = useState<string[]>(parseTags(game.tags));
  const [minSpecs, setMinSpecs] = useState(game.min_specs ?? "");
  const [recommendedSpecs, setRecommendedSpecs] = useState(game.recommended_specs ?? "");
  const [savePathHint, setSavePathHint] = useState(game.save_path_hint ?? "");
  const [price, setPrice] = useState(centsToEuroInput(game.price_cents));
  const [offerEnabled, setOfferEnabled] = useState(game.sale_price_cents != null);
  const [salePrice, setSalePrice] = useState(
    game.sale_price_cents != null ? centsToEuroInput(game.sale_price_cents) : ""
  );
  const [saleEndsAt, setSaleEndsAt] = useState(
    game.sale_ends_at ? isoToLocalInput(game.sale_ends_at) : ""
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    clearError();
    setSubmitting(true);
    try {
      await updateGame(game.id, {
        title: title.trim(),
        description: description.trim() || null,
        cover_url: coverUrl.trim() || null,
        tags: tags.length > 0 ? tags.join(",") : null,
        min_specs: minSpecs.trim() || null,
        recommended_specs: recommendedSpecs.trim() || null,
        save_path_hint: savePathHint.trim() || null,
        price_cents: euroInputToCents(price),
        sale_price_cents: offerEnabled && salePrice ? euroInputToCents(salePrice) : null,
        sale_ends_at: offerEnabled && saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
      });
      onClose();
    } catch {
      // error is already surfaced via the store's `error` state below
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-zinc-900 p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{t("edit_game_title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label={t("dialog_cancel")}
          >
            ✕
          </button>
        </div>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("evt_title_label")}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("evt_description")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("edit_game_cover_url")}
          <input
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            placeholder="https://..."
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        <TagInput tags={tags} onChange={setTags} suggestions={[]} />

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("store_min_specs_label")}
            <textarea
              value={minSpecs}
              onChange={(e) => setMinSpecs(e.target.value)}
              rows={3}
              placeholder={t("store_specs_placeholder")}
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("store_recommended_specs_label")}
            <textarea
              value={recommendedSpecs}
              onChange={(e) => setRecommendedSpecs(e.target.value)}
              rows={3}
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
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("edit_game_price")}
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-32 rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        <div className="flex flex-col gap-3 rounded border border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <input
              type="checkbox"
              checked={offerEnabled}
              onChange={(e) => setOfferEnabled(e.target.checked)}
            />
            {t("edit_game_offer_enable")}
          </label>
          {offerEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                {t("edit_game_offer_price")}
                <input
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="0.00"
                  required={offerEnabled}
                  className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                {t("edit_game_offer_ends_at")}
                <input
                  type="datetime-local"
                  value={saleEndsAt}
                  onChange={(e) => setSaleEndsAt(e.target.value)}
                  required={offerEnabled}
                  className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
              </label>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
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
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {submitting ? t("checkout_processing") : t("edit_game_save")}
          </button>
        </div>
      </form>
    </div>
  );
}
