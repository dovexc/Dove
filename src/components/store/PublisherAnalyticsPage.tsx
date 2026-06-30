import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useCatalogStore } from "../../catalogStore";
import { useI18nStore } from "../../i18nStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { PublisherGameStats } from "../../types";
import { PublisherGameDetailDialog } from "./PublisherGameDetailDialog";

// Unlike a game's listing price, 0 revenue means "no sales" — never
// "free" — so this always renders the amount instead of falling back to
// the "Kostenlos" label `formatPrice` elsewhere in the store uses.
function formatRevenue(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)} €`;
}

function formatPlaytime(seconds: number | null): string {
  if (seconds == null) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

const STATUS_KEY: Record<PublisherGameStats["status"], TranslationKey> = {
  pending: "store_in_review",
  approved: "analytics_status_approved",
  rejected: "store_rejected",
};

const STATUS_CLASS: Record<PublisherGameStats["status"], string> = {
  pending: "bg-amber-900/60 text-amber-300",
  approved: "bg-emerald-900/60 text-emerald-300",
  rejected: "bg-red-900/60 text-red-300",
};

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/// "all" = no filter, "last3" = rolling 3-month window, "YYYY-MM" = one
/// specific calendar month.
function dateRangeForPeriod(period: string): { from?: string; to?: string } {
  if (period === "all") return {};
  const now = new Date();
  if (period === "last3") {
    return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: toIsoDate(now) };
  }
  const [year, month] = period.split("-").map(Number);
  return {
    from: toIsoDate(new Date(year, month - 1, 1)),
    to: toIsoDate(new Date(year, month, 0)),
  };
}

interface Props {
  onClose: () => void;
}

export function PublisherAnalyticsPage({ onClose }: Props) {
  const t = useT();
  const language = useI18nStore((s) => s.language);
  const stats = useCatalogStore((s) => s.publisherStats);
  const loading = useCatalogStore((s) => s.publisherStatsLoading);
  const fetchPublisherStats = useCatalogStore((s) => s.fetchPublisherStats);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [period, setPeriod] = useState("all");

  const monthOptions = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
      month: "long",
      year: "numeric",
    });
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: formatter.format(d) };
    });
  }, [language]);

  useEffect(() => {
    fetchPublisherStats(dateRangeForPeriod(period));
  }, [period, fetchPublisherStats]);

  async function handleExportCsv() {
    setExportError(null);
    const header = [
      t("analytics_col_game"),
      t("analytics_col_status"),
      t("analytics_col_units_sold"),
      t("analytics_col_revenue"),
      t("analytics_col_wishlist"),
      t("analytics_col_views"),
      t("analytics_col_rating"),
      t("analytics_col_playtime"),
      t("analytics_col_installs"),
      t("analytics_col_uninstalls"),
    ];
    const rows = stats.map((g) => [
      g.title,
      t(STATUS_KEY[g.status]),
      String(g.units_sold),
      (g.revenue_cents / 100).toFixed(2).replace(".", ","),
      String(g.wishlist_count),
      String(g.view_count),
      g.review_count > 0 ? (g.avg_rating ?? 0).toFixed(1).replace(".", ",") : "",
      formatPlaytime(g.avg_playtime_seconds),
      String(g.installs_count),
      String(g.uninstalls_count),
    ]);
    // ";" instead of "," — German-locale Excel/Numbers treats "," as the
    // decimal separator and won't split columns on it. A leading UTF-8 BOM
    // is needed too, otherwise the same apps misread umlauts as garbage.
    const body = [header, ...rows]
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const csv = "\uFEFF" + body;

    try {
      // A plain `<a download>` blob-URL click doesn't reliably trigger a
      // download inside Tauri's webview (there's no browser download
      // manager behind it), so this goes through a native save dialog and
      // writes the file directly via the Rust side instead.
      const path = await save({
        defaultPath: `dove-analytics-${period}.csv`,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!path) return;
      await invoke("write_text_file", { path, content: csv });
    } catch (e) {
      setExportError(String(e));
    }
  }

  const totals = useMemo(() => {
    const base = stats.reduce(
      (acc, g) => ({
        revenueCents: acc.revenueCents + g.revenue_cents,
        unitsSold: acc.unitsSold + g.units_sold,
        wishlistCount: acc.wishlistCount + g.wishlist_count,
        viewCount: acc.viewCount + g.view_count,
        installsCount: acc.installsCount + g.installs_count,
        uninstallsCount: acc.uninstallsCount + g.uninstalls_count,
      }),
      { revenueCents: 0, unitsSold: 0, wishlistCount: 0, viewCount: 0, installsCount: 0, uninstallsCount: 0 }
    );
    const playtimeValues = stats.map((g) => g.avg_playtime_seconds).filter((v): v is number => v != null);
    const avgPlaytimeSeconds =
      playtimeValues.length > 0
        ? playtimeValues.reduce((sum, v) => sum + v, 0) / playtimeValues.length
        : null;
    return { ...base, avgPlaytimeSeconds };
  }, [stats]);

  return (
    <div
      className="h-full overflow-y-auto"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -150px, #1c2c3e 0%, #0d141c 55%, #0b1016 100%)",
      }}
    >
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">{t("analytics_title")}</h1>
            <p className="text-sm text-zinc-500">
              {stats.length} {t("analytics_games_count_suffix")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            >
              <option value="all">{t("analytics_period_all")}</option>
              <option value="last3">{t("analytics_period_last3")}</option>
              <optgroup label={t("analytics_period_month_group")}>
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            </select>
            {stats.length > 0 && (
              <button
                onClick={handleExportCsv}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                {t("analytics_export_csv")}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              {t("close")}
            </button>
          </div>
        </div>

        {exportError && (
          <div className="mb-4 flex items-center justify-between rounded bg-red-900/30 px-4 py-2 text-sm text-red-400">
            <span>{exportError}</span>
            <button onClick={() => setExportError(null)} className="font-bold">
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">{t("store_loading")}</p>
        ) : stats.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("analytics_empty")}</p>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs text-zinc-500">{t("analytics_total_revenue")}</p>
                <p className="mt-1 text-xl font-bold text-zinc-100">
                  {formatRevenue(totals.revenueCents)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs text-zinc-500">{t("analytics_total_units_sold")}</p>
                <p className="mt-1 text-xl font-bold text-zinc-100">{totals.unitsSold}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs text-zinc-500">{t("analytics_total_wishlist")}</p>
                <p className="mt-1 text-xl font-bold text-zinc-100">{totals.wishlistCount}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs text-zinc-500">{t("analytics_total_views")}</p>
                <p className="mt-1 text-xl font-bold text-zinc-100">{totals.viewCount}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs text-zinc-500">{t("analytics_total_playtime")}</p>
                <p className="mt-1 text-xl font-bold text-zinc-100">
                  {formatPlaytime(totals.avgPlaytimeSeconds)}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs text-zinc-500">{t("analytics_total_installs")}</p>
                <p className="mt-1 text-xl font-bold text-zinc-100">{totals.installsCount}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t("analytics_col_game")}</th>
                    <th className="px-4 py-3 font-semibold">{t("analytics_col_status")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("analytics_col_units_sold")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("analytics_col_revenue")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("analytics_col_wishlist")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("analytics_col_views")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("analytics_col_rating")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("analytics_col_playtime")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("analytics_col_installs")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("analytics_col_uninstalls")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {stats.map((g) => (
                    <tr
                      key={g.catalog_game_id}
                      onClick={() => setSelectedGameId(g.catalog_game_id)}
                      className="cursor-pointer bg-zinc-900/40 hover:bg-zinc-800/60"
                    >
                      <td className="px-4 py-3 font-semibold text-zinc-100">{g.title}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[g.status]}`}
                        >
                          {t(STATUS_KEY[g.status])}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-200">{g.units_sold}</td>
                      <td className="px-4 py-3 text-right text-zinc-200">
                        {formatRevenue(g.revenue_cents)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-200">{g.wishlist_count}</td>
                      <td className="px-4 py-3 text-right text-zinc-200">{g.view_count}</td>
                      <td className="px-4 py-3 text-right text-zinc-200">
                        {g.review_count > 0 ? `${g.avg_rating?.toFixed(1)} (${g.review_count})` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-200">
                        {formatPlaytime(g.avg_playtime_seconds)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-200">{g.installs_count}</td>
                      <td className="px-4 py-3 text-right text-zinc-200">{g.uninstalls_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {selectedGameId !== null && (
        <PublisherGameDetailDialog gameId={selectedGameId} onClose={() => setSelectedGameId(null)} />
      )}
    </div>
  );
}
