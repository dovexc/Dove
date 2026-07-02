import { useEffect, useState } from "react";
import { useCatalogStore } from "../../catalogStore";
import { API_BASE, getAuthHeader, useAuthStore } from "../../authStore";
import { CONTENT_WARNING_OPTIONS } from "../store/PublishGamePage";
import { WarningIcon } from "../icons";
import { PlayIcon } from "../downloads/icons";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { PublicProfile, StoreUser, UnbanRequest, UserReport } from "../../types";
import { PublicProfileView } from "../profile/PublicProfileView";

interface Props {
  onClose: () => void;
}

type Tab = "spiele" | "nutzer" | "meldungen" | "entbannung";

function formatPrice(priceCents: number, t: (key: TranslationKey) => string): string {
  return priceCents === 0 ? t("price_free") : `${(priceCents / 100).toFixed(2)} €`;
}

async function parseErrorMessage(response: Response, t: (key: TranslationKey) => string): Promise<string> {
  const text = await response.text();
  return text || t("adm_error_status").replace("{n}", String(response.status));
}

function UsersTab() {
  const t = useT();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StoreUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/api/admin/users?q=${encodeURIComponent(query)}`,
        { headers: getAuthHeader() }
      );
      if (!response.ok) throw new Error(await parseErrorMessage(response, t));
      setResults(await response.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => search(), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function setAdmin(userId: number, makeAdmin: boolean) {
    setPendingId(userId);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/api/users/${userId}/${makeAdmin ? "promote" : "demote"}`,
        { method: "POST", headers: getAuthHeader() }
      );
      if (!response.ok) throw new Error(await parseErrorMessage(response, t));
      setResults((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_admin: makeAdmin } : u))
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setPendingId(null);
    }
  }

  async function unban(userId: number) {
    setPendingId(userId);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/users/${userId}/unban`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response, t));
      setResults((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_banned: false } : u))
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("adm_search_placeholder")}
        className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      {searching ? (
        <p className="text-sm text-zinc-500">{t("fr_searching")}</p>
      ) : !query.trim() ? (
        <p className="text-sm text-zinc-500">{t("adm_type_hint")}</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("fr_no_users_found")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-100">{user.display_name}</span>
                  {user.is_banned && (
                    <span className="rounded border border-red-400/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                      {t("adm_banned_label")}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">{user.email}</div>
              </div>
              {user.is_banned && (
                <button
                  onClick={() => unban(user.id)}
                  disabled={pendingId === user.id}
                  className="shrink-0 rounded border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {t("adm_unban")}
                </button>
              )}
              {user.is_admin ? (
                <button
                  onClick={() => setAdmin(user.id, false)}
                  disabled={pendingId === user.id || user.id === currentUserId}
                  title={
                    user.id === currentUserId
                      ? t("adm_cant_demote_self")
                      : undefined
                  }
                  className="shrink-0 rounded border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {t("adm_demote")}
                </button>
              ) : (
                <button
                  onClick={() => setAdmin(user.id, true)}
                  disabled={pendingId === user.id}
                  className="shrink-0 rounded border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
                >
                  {t("adm_promote")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsTab({ onCountChange }: { onCountChange: (n: number) => void }) {
  const t = useT();
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingProfile, setViewingProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  async function openProfile(userId: number) {
    setProfileLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/users/${userId}`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response, t));
      setViewingProfile(await response.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setProfileLoading(false);
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/reports`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response, t));
      const data: UserReport[] = await response.json();
      setReports(data);
      onCountChange(data.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(reportId: number, action: "dismiss" | "ban") {
    if (action === "ban" && !window.confirm(t("adm_ban_confirm"))) return;
    setPendingId(reportId);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/reports/${reportId}/${action}`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response, t));
      const remaining = reports.filter((r) => r.id !== reportId);
      setReports(remaining);
      onCountChange(remaining.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">{t("fr_loading")}</p>;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {reports.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("adm_no_pending_reports")}</p>
      ) : (
        reports.map((report) => (
          <div
            key={report.id}
            className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="text-xs text-zinc-500">
              {t("adm_report_reporter_prefix")} {report.reporter.display_name} (
              {report.reporter.email}) · {new Date(report.created_at).toLocaleString("de-DE")}
            </div>
            <button
              onClick={() => openProfile(report.reported.id)}
              disabled={profileLoading}
              className="self-start text-sm font-bold text-sky-400 hover:underline disabled:opacity-50"
            >
              {t("adm_report_reported_prefix")} {report.reported.display_name} (
              {report.reported.email})
            </button>
            <p className="text-sm text-zinc-300">{report.reason}</p>
            {report.images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {report.images.map((src) => (
                  <button key={src} type="button" onClick={() => setEnlargedImage(src)}>
                    <img
                      src={src}
                      alt=""
                      className="h-20 w-20 rounded border border-zinc-700 object-cover hover:opacity-80"
                    />
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                onClick={() => act(report.id, "dismiss")}
                disabled={pendingId === report.id}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {t("adm_dismiss")}
              </button>
              <button
                onClick={() => act(report.id, "ban")}
                disabled={pendingId === report.id}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {t("adm_ban")}
              </button>
            </div>
          </div>
        ))
      )}

      {enlargedImage && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-8"
          onClick={() => setEnlargedImage(null)}
        >
          <img src={enlargedImage} alt="" className="max-h-full max-w-full rounded" />
        </div>
      )}

      {viewingProfile && (
        <PublicProfileView profile={viewingProfile} onClose={() => setViewingProfile(null)} />
      )}
    </div>
  );
}

function UnbanRequestsTab({ onCountChange }: { onCountChange: (n: number) => void }) {
  const t = useT();
  const [requests, setRequests] = useState<UnbanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/admin/unban-requests`, {
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await parseErrorMessage(response, t));
      const data: UnbanRequest[] = await response.json();
      setRequests(data);
      onCountChange(data.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(requestId: number, action: "approve" | "deny") {
    setPendingId(requestId);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE}/api/admin/unban-requests/${requestId}/${action}`,
        { method: "POST", headers: getAuthHeader() }
      );
      if (!response.ok) throw new Error(await parseErrorMessage(response, t));
      const remaining = requests.filter((r) => r.id !== requestId);
      setRequests(remaining);
      onCountChange(remaining.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setPendingId(null);
    }
  }

  if (loading) return <p className="text-sm text-zinc-500">{t("fr_loading")}</p>;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {requests.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("adm_no_pending_unban_requests")}</p>
      ) : (
        requests.map((req) => (
          <div
            key={req.id}
            className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="text-sm font-bold text-zinc-100">
              {req.user.display_name} ({req.user.email})
            </div>
            <p className="text-xs text-zinc-500">
              {new Date(req.created_at).toLocaleString("de-DE")}
            </p>
            <p className="text-sm text-zinc-300">{req.message}</p>
            <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                onClick={() => act(req.id, "deny")}
                disabled={pendingId === req.id}
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-900/40 disabled:opacity-50"
              >
                {t("adm_unban_deny")}
              </button>
              <button
                onClick={() => act(req.id, "approve")}
                disabled={pendingId === req.id}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {t("adm_unban_approve")}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function AdminModerationView({ onClose }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("spiele");
  const [reportCount, setReportCount] = useState(0);
  const [unbanRequestCount, setUnbanRequestCount] = useState(0);

  const pendingGames = useCatalogStore((s) => s.pendingGames);
  const loadingPendingGames = useCatalogStore((s) => s.loadingPendingGames);
  const moderatingId = useCatalogStore((s) => s.moderatingId);
  const fetchPendingGames = useCatalogStore((s) => s.fetchPendingGames);
  const approveGame = useCatalogStore((s) => s.approveGame);
  const rejectGame = useCatalogStore((s) => s.rejectGame);
  const error = useCatalogStore((s) => s.error);

  useEffect(() => {
    fetchPendingGames();
  }, [fetchPendingGames]);

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">{t("adm_title")}</h1>
            <p className="text-sm text-zinc-500">{t("adm_subtitle")}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            {t("close")}
          </button>
        </div>

        <div className="mb-6 flex gap-2 border-b border-zinc-800">
          {(
            [
              ["spiele", t("adm_tab_pending_games").replace("{n}", String(pendingGames.length))],
              ["nutzer", t("adm_tab_user_management")],
              ["meldungen", t("adm_tab_reports").replace("{n}", String(reportCount))],
              ["entbannung", t("adm_tab_unban_requests").replace("{n}", String(unbanRequestCount))],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 pb-3 text-sm font-semibold ${
                tab === key
                  ? "border-b-2 border-sky-500 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "spiele" && (
          <>
            {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

            {loadingPendingGames ? (
              <p className="text-sm text-zinc-500">{t("fr_loading")}</p>
            ) : pendingGames.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("adm_no_pending_games")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {pendingGames.map((game) => (
                  <div
                    key={game.id}
                    className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-100">{game.title}</span>
                          {game.is_early_access && (
                            <span className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                              {t("pub_early_access_badge")}
                            </span>
                          )}
                          {game.is_beta && (
                            <span className="rounded bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                              {t("pub_beta_badge")}
                            </span>
                          )}
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              game.file_url
                                ? "bg-emerald-900/60 text-emerald-300"
                                : "bg-red-900/60 text-red-300"
                            }`}
                            title={t("pub_section_build")}
                          >
                            {game.file_url ? "✓ Build" : "✕ Build"}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500">
                          {t("adm_publisher_prefix").replace("{n}", String(game.publisher_user_id))} ·{" "}
                          {formatPrice(game.price_cents, t)} ·{" "}
                          {new Date(game.created_at).toLocaleString("de-DE")}
                        </div>
                      </div>
                    </div>
                    {game.short_description && (
                      <p className="text-sm font-semibold text-zinc-300">{game.short_description}</p>
                    )}
                    {game.description && (
                      <p className="text-sm text-zinc-400">{game.description}</p>
                    )}
                    {game.tags && (
                      <div className="flex flex-wrap gap-1.5">
                        {game.tags.split(",").map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-zinc-800 px-2 py-1 text-[11px] font-semibold uppercase text-zinc-400"
                          >
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    )}
                    {game.content_warnings && (
                      <div className="flex flex-wrap gap-1.5">
                        {game.content_warnings.split(",").map((key) => {
                          const opt = CONTENT_WARNING_OPTIONS.find((o) => o.key === key.trim());
                          return (
                            <span
                              key={key}
                              className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-900/30 px-2.5 py-1 text-[11px] font-semibold text-amber-300"
                            >
                              <WarningIcon size={11} />
                              {opt ? t(opt.label) : key.trim()}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {game.trailer_url && (
                      <a
                        href={game.trailer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 self-start text-xs text-sky-400 hover:underline"
                      >
                        <PlayIcon /> {t("pub_watch_trailer")}
                      </a>
                    )}
                    <div className="flex justify-end gap-2 border-t border-zinc-800 pt-3">
                      <button
                        onClick={() => rejectGame(game.id)}
                        disabled={moderatingId === game.id}
                        className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-900/40 disabled:opacity-50"
                      >
                        {t("adm_reject")}
                      </button>
                      <button
                        onClick={() => approveGame(game.id)}
                        disabled={moderatingId === game.id}
                        className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {t("adm_approve")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "nutzer" && <UsersTab />}
        {tab === "meldungen" && <ReportsTab onCountChange={setReportCount} />}
        {tab === "entbannung" && <UnbanRequestsTab onCountChange={setUnbanRequestCount} />}
      </div>
    </div>
  );
}
