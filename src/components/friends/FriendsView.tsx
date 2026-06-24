import { useEffect } from "react";
import { useFriendsStore } from "../../friendsStore";
import { API_BASE } from "../../authStore";
import { PublicProfileView } from "../profile/PublicProfileView";

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

interface Props {
  onClose: () => void;
}

export function FriendsView({ onClose }: Props) {
  const query = useFriendsStore((s) => s.query);
  const setQuery = useFriendsStore((s) => s.setQuery);
  const results = useFriendsStore((s) => s.results);
  const searching = useFriendsStore((s) => s.searching);
  const search = useFriendsStore((s) => s.search);
  const viewProfile = useFriendsStore((s) => s.viewProfile);
  const viewedProfile = useFriendsStore((s) => s.viewedProfile);
  const closeProfile = useFriendsStore((s) => s.closeProfile);
  const error = useFriendsStore((s) => s.error);

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col gap-6 overflow-y-auto bg-zinc-950 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Freunde
        </h2>
        <button
          onClick={onClose}
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
        >
          Schließen
        </button>
      </div>

      <div className="flex h-[46px] max-w-md items-center gap-3 rounded-lg border border-white/10 bg-[#10171f] px-4">
        <span className="text-zinc-500">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
          placeholder="Nutzer durchsuchen..."
          className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <button
          onClick={search}
          className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
        >
          Suchen
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {searching ? (
        <p className="text-sm text-zinc-500">Suche läuft...</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-zinc-500">Keine Nutzer gefunden.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((user) => (
            <button
              key={user.id}
              onClick={() => viewProfile(user.id)}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left hover:border-zinc-600"
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-700">
                {resolveUrl(user.avatar_url) ? (
                  <img
                    src={resolveUrl(user.avatar_url)!}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-zinc-300">
                    {user.display_name.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="truncate text-sm font-medium text-zinc-100">
                {user.display_name}
              </span>
            </button>
          ))}
        </div>
      )}

      {viewedProfile && (
        <PublicProfileView profile={viewedProfile} onClose={closeProfile} />
      )}
    </div>
  );
}
