import { API_BASE } from "../../authStore";
import type { PublicProfile } from "../../types";

interface Props {
  profile: PublicProfile;
  onClose: () => void;
}

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

export function PublicProfileView({ profile, onClose }: Props) {
  const backgroundUrl = resolveUrl(profile.background_url);
  const avatarUrl = resolveUrl(profile.avatar_url);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950">
      <div
        className="relative h-56 w-full bg-zinc-800 bg-cover bg-center"
        style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded bg-black/50 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black/70"
        >
          Schließen
        </button>
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-6 pb-12">
        <div className="-mt-12">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full ring-4 ring-zinc-950">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-700 text-2xl font-bold text-zinc-300">
                {profile.display_name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3">
          <h2 className="py-1 text-2xl font-bold leading-relaxed text-zinc-100">
            {profile.display_name}
          </h2>
        </div>

        <div className="mt-8">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Über mich
          </h3>
          <p className="rounded bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
            {profile.bio || "Keine Beschreibung vorhanden."}
          </p>
        </div>

        <div className="mt-8">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Screenshots
          </h3>
          {profile.screenshots.length === 0 ? (
            <p className="text-sm text-zinc-500">Noch keine Screenshots vorhanden.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {profile.screenshots.map((s) => (
                <div
                  key={s.id}
                  className="aspect-video overflow-hidden rounded bg-zinc-900"
                >
                  <img
                    src={resolveUrl(s.image_url) ?? ""}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
