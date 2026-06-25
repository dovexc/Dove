import { API_BASE, useAuthStore } from "../../authStore";
import { useEventsStore } from "../../eventsStore";

function formatPrize(priceCents: number): string {
  return priceCents === 0 ? "Kein Preisgeld" : `${(priceCents / 100).toFixed(2)} €`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

function isRegistrationOpen(deadline: string | null): boolean {
  if (!deadline) return true;
  return new Date(deadline).getTime() >= Date.now();
}

export function EventDetailPage() {
  const event = useEventsStore((s) => s.detailEvent);
  const participants = useEventsStore((s) => s.detailParticipants);
  const detailLoading = useEventsStore((s) => s.detailLoading);
  const joiningId = useEventsStore((s) => s.joiningId);
  const closeEventDetail = useEventsStore((s) => s.closeEventDetail);
  const joinEvent = useEventsStore((s) => s.joinEvent);
  const leaveEvent = useEventsStore((s) => s.leaveEvent);
  const deleteEvent = useEventsStore((s) => s.deleteEvent);
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);

  if (!event) return null;

  const isHost = authUser?.id === event.host_user_id;
  const open = isRegistrationOpen(event.registration_deadline);
  const deadline = formatDate(event.registration_deadline);
  const starts = formatDate(event.starts_at);
  const ends = formatDate(event.ends_at);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#0b1016]">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0b1016]/95 px-6 py-3 backdrop-blur">
        <button
          onClick={closeEventDetail}
          className="rounded bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/10"
        >
          ← Zurück zu Events
        </button>
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">{event.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">von {event.host_display_name}</p>
          </div>
          {event.prize_cents > 0 && (
            <span className="rounded bg-amber-900/50 px-3 py-2 text-sm font-bold text-amber-300">
              {formatPrize(event.prize_cents)}
            </span>
          )}
        </div>

        {event.catalog_game_title && (
          <span className="mt-3 inline-block rounded bg-sky-900/50 px-3 py-1.5 text-sm font-semibold text-sky-300">
            Turnier: {event.catalog_game_title}
          </span>
        )}

        <div className="mt-6 grid grid-cols-3 gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Anmeldeschluss</div>
            <div className={open ? "text-zinc-200" : "text-red-400"}>
              {deadline ?? "Keine Frist"} {deadline && !open && "(geschlossen)"}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Start</div>
            <div className="text-zinc-200">{starts ?? "Noch offen"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">Ende</div>
            <div className="text-zinc-200">{ends ?? "Noch offen"}</div>
          </div>
        </div>

        <div className="mt-2 flex gap-3">
          {token && !isHost && (
            <button
              onClick={() => (event.joined ? leaveEvent(event.id) : joinEvent(event.id))}
              disabled={joiningId === event.id || (!event.joined && !open)}
              className={`mt-4 rounded px-5 py-2.5 text-sm font-semibold disabled:opacity-50 ${
                event.joined
                  ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                  : "bg-sky-600 text-white hover:bg-sky-500"
              }`}
            >
              {joiningId === event.id
                ? "..."
                : event.joined
                  ? "Teilnahme zurückziehen"
                  : open
                    ? "Beitreten"
                    : "Anmeldung geschlossen"}
            </button>
          )}
          {isHost && (
            <button
              onClick={() => {
                deleteEvent(event.id);
                closeEventDetail();
              }}
              className="mt-4 rounded bg-red-900/40 px-5 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-900/60"
            >
              Event löschen
            </button>
          )}
        </div>

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Beschreibung
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {event.description || "Keine Beschreibung vorhanden."}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Teilnehmer ({event.participant_count})
          </h2>
          {detailLoading ? (
            <p className="text-sm text-zinc-500">Teilnehmer werden geladen...</p>
          ) : participants.length === 0 ? (
            <p className="text-sm text-zinc-500">Noch keine Teilnehmer.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {participants.map((p) => {
                const avatarUrl = resolveUrl(p.avatar_url);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-sm font-bold text-zinc-200">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        p.display_name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <span className="text-sm font-semibold text-zinc-200">{p.display_name}</span>
                    {p.online && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" title="Online" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
