import { useEffect, useState } from "react";
import { useCatalogStore } from "../../catalogStore";
import { API_BASE, getAuthHeader, useAuthStore } from "../../authStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { StoreUser } from "../../types";

interface Props {
  onClose: () => void;
}

type Tab = "spiele" | "nutzer";

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
                <div className="text-sm font-bold text-zinc-100">{user.display_name}</div>
                <div className="text-xs text-zinc-500">{user.email}</div>
              </div>
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

export function AdminModerationView({ onClose }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("spiele");

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
                        <div className="font-bold text-zinc-100">{game.title}</div>
                        <div className="text-xs text-zinc-500">
                          {t("adm_publisher_prefix").replace("{n}", String(game.publisher_user_id))} ·{" "}
                          {formatPrice(game.price_cents, t)} ·{" "}
                          {new Date(game.created_at).toLocaleString("de-DE")}
                        </div>
                      </div>
                    </div>
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
      </div>
    </div>
  );
}
