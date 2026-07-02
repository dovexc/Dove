import { useEffect, useState } from "react";
import { API_BASE } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { CatalogGame } from "../../types";
import { EditCatalogGameDialog } from "./EditCatalogGameDialog";

const SOURCE_KEY: Record<string, TranslationKey> = {
  search: "analytics_source_search",
  recommendation: "analytics_source_recommendation",
  wishlist: "analytics_source_wishlist",
  catalog: "analytics_source_catalog",
};

// Unlike a game's listing price, 0 revenue means "no sales" — never
// "free" — so this always renders the amount.
function formatRevenue(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)} €`;
}

function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}.${month}.`;
}

interface Props {
  gameId: number;
  onClose: () => void;
}

export function PublisherGameDetailDialog({ gameId, onClose }: Props) {
  const t = useT();
  const detail = useCatalogStore((s) => s.publisherGameDetail);
  const loading = useCatalogStore((s) => s.publisherGameDetailLoading);
  const fetchPublisherGameDetail = useCatalogStore((s) => s.fetchPublisherGameDetail);
  const [editGame, setEditGame] = useState<CatalogGame | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    fetchPublisherGameDetail(gameId);
  }, [gameId, fetchPublisherGameDetail]);

  async function handleOpenEdit() {
    setEditLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/games/${gameId}`);
      if (response.ok) setEditGame(await response.json());
    } finally {
      setEditLoading(false);
    }
  }

  const maxRevenue = detail ? Math.max(...detail.daily.map((d) => d.revenue_cents), 1) : 1;
  const maxRatingCount = detail
    ? Math.max(...detail.rating_distribution.map((r) => r.count), 1)
    : 1;
  const maxSourceCount = detail
    ? Math.max(...detail.views_by_source.map((s) => s.count), 1)
    : 1;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-5 overflow-y-auto rounded-lg bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">
            {detail ? detail.stats.title : t("analytics_detail_title")}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenEdit}
              disabled={editLoading}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {t("edit_game_open")}
            </button>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-300"
              aria-label={t("dialog_cancel")}
            >
              ✕
            </button>
          </div>
        </div>

        {loading || !detail ? (
          <p className="text-sm text-zinc-500">{t("store_loading")}</p>
        ) : (
          <>
            {/* Zeitverlauf */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                {t("analytics_detail_trend")}
              </h3>
              <div className="flex h-28 items-end gap-[3px] rounded border border-zinc-800 bg-zinc-950/40 p-3">
                {detail.daily.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.units_sold} ${t("analytics_col_units_sold")}, ${formatRevenue(d.revenue_cents)}`}
                    className="flex-1 rounded-t-sm bg-sky-500/70 hover:bg-sky-400"
                    style={{
                      height: `${Math.max(2, (d.revenue_cents / maxRevenue) * 100)}%`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
                <span>{detail.daily[0] && formatShortDate(detail.daily[0].date)}</span>
                <span>
                  {detail.daily[detail.daily.length - 1] &&
                    formatShortDate(detail.daily[detail.daily.length - 1].date)}
                </span>
              </div>
            </section>

            {/* Funnel */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                {t("analytics_detail_funnel")}
              </h3>
              <div className="flex flex-col gap-2">
                {[
                  { label: t("analytics_col_views"), value: detail.stats.view_count },
                  { label: t("analytics_col_wishlist"), value: detail.stats.wishlist_count },
                  { label: t("analytics_col_units_sold"), value: detail.stats.units_sold },
                ].map((row) => {
                  const pct =
                    detail.stats.view_count > 0
                      ? Math.min(100, (row.value / detail.stats.view_count) * 100)
                      : 0;
                  return (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-zinc-400">{row.label}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-zinc-800">
                        <div className="h-full rounded bg-sky-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs text-zinc-300">
                        {row.value} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Traffic-Quelle */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                {t("analytics_views_by_source")}
              </h3>
              {detail.views_by_source.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("analytics_views_by_source_empty")}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {detail.views_by_source.map((s) => (
                    <div key={s.source} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs text-zinc-400">
                        {t(SOURCE_KEY[s.source] ?? "analytics_source_catalog")}
                      </span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                        <div
                          className="h-full rounded bg-sky-500"
                          style={{ width: `${(s.count / maxSourceCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs text-zinc-300">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Bewertungsverteilung */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                {t("analytics_detail_ratings")}
              </h3>
              {detail.stats.review_count === 0 ? (
                <p className="text-sm text-zinc-500">{t("analytics_detail_no_ratings")}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {[...detail.rating_distribution].reverse().map((bucket) => (
                    <div key={bucket.stars} className="flex items-center gap-3">
                      <span className="w-10 shrink-0 text-xs text-zinc-400">{bucket.stars}★</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-800">
                        <div
                          className="h-full rounded bg-amber-500"
                          style={{ width: `${(bucket.count / maxRatingCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs text-zinc-300">
                        {bucket.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Tag-Ranking */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                {t("analytics_detail_tag_ranking")}
              </h3>
              {detail.tag_rankings.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("analytics_detail_no_tags")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {detail.tag_rankings.map((tr) => {
                    const percentile = Math.max(1, Math.ceil((tr.rank / tr.total) * 100));
                    return (
                      <span
                        key={tr.tag}
                        className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200"
                      >
                        {tr.tag}: {t("analytics_detail_top_percent_prefix")} {percentile}%
                      </span>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {editGame && (
        <EditCatalogGameDialog
          game={editGame}
          onClose={() => {
            setEditGame(null);
            fetchPublisherGameDetail(gameId);
          }}
        />
      )}
    </div>
  );
}
