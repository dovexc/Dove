import { useState } from "react";
import { API_BASE, useAuthStore } from "../../authStore";
import { useEventsStore } from "../../eventsStore";
import type { EventMatch } from "../../types";

function formatPrize(priceCents: number): string {
  return priceCents === 0 ? "Kein Preisgeld" : `${(priceCents / 100).toFixed(2)} €`;
}

function totalPrize(event: { prize_mode: string; prize_cents: number; prize_second_cents: number; prize_third_cents: number }): number {
  return event.prize_mode === "split"
    ? event.prize_cents + event.prize_second_cents + event.prize_third_cents
    : event.prize_cents;
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
  const teams = useEventsStore((s) => s.detailTeams);
  const bracket = useEventsStore((s) => s.detailBracket);
  const detailLoading = useEventsStore((s) => s.detailLoading);
  const joiningId = useEventsStore((s) => s.joiningId);
  const teamActionPending = useEventsStore((s) => s.teamActionPending);
  const closeEventDetail = useEventsStore((s) => s.closeEventDetail);
  const joinEvent = useEventsStore((s) => s.joinEvent);
  const leaveEvent = useEventsStore((s) => s.leaveEvent);
  const deleteEvent = useEventsStore((s) => s.deleteEvent);
  const createTeam = useEventsStore((s) => s.createTeam);
  const joinTeam = useEventsStore((s) => s.joinTeam);
  const startTournament = useEventsStore((s) => s.startTournament);
  const setMatchWinner = useEventsStore((s) => s.setMatchWinner);
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);

  const [newTeamName, setNewTeamName] = useState("");

  if (!event) return null;

  const isHost = authUser?.id === event.host_user_id;
  const open = isRegistrationOpen(event.registration_deadline);
  const deadline = formatDate(event.registration_deadline);
  const starts = formatDate(event.starts_at);
  const ends = formatDate(event.ends_at);
  const hasTeams = event.team_size > 1;
  const entryName = (id: number | null) =>
    id === null ? null : bracket?.entries.find((e) => e.id === id)?.name ?? "?";

  const matchesByRound = new Map<number, EventMatch[]>();
  if (bracket) {
    for (const m of bracket.matches) {
      const list = matchesByRound.get(m.round) ?? [];
      list.push(m);
      matchesByRound.set(m.round, list);
    }
  }
  const rounds = [...matchesByRound.keys()].sort((a, b) => a - b);

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
          {totalPrize(event) > 0 && (
            <span className="rounded bg-amber-900/50 px-3 py-2 text-sm font-bold text-amber-300">
              {formatPrize(totalPrize(event))}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(event.catalog_game_title || event.custom_game_title) && (
            <span className="inline-block rounded bg-sky-900/50 px-3 py-1.5 text-sm font-semibold text-sky-300">
              Turnier: {event.catalog_game_title || event.custom_game_title}
            </span>
          )}
          <span className="inline-block rounded bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-400">
            {event.format === "knockout" ? "Knockout-Turnier" : "Offene Liste"}
          </span>
          {hasTeams && (
            <span className="inline-block rounded bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-400">
              Team: {event.team_size} Personen
            </span>
          )}
          {event.max_entries && (
            <span className="inline-block rounded bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-400">
              Max. {event.max_entries} {hasTeams ? "Teams" : "Teilnehmer"}
            </span>
          )}
          {event.is_private && (
            <span className="inline-block rounded bg-amber-900/40 px-3 py-1.5 text-sm font-semibold text-amber-300">
              🔒 Privat
            </span>
          )}
        </div>

        {isHost && event.join_code && (
          <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
            Beitritts-Code: <span className="font-mono text-base font-bold">{event.join_code}</span>{" "}
            — teile ihn mit den Teilnehmern, sonst kann niemand beitreten.
          </div>
        )}

        {totalPrize(event) > 0 && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
            <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
              Preisgeldverteilung
            </div>
            {event.prize_mode === "split" ? (
              <div className="flex flex-col gap-1 text-zinc-200">
                <span>🥇 1. Platz: {formatPrize(event.prize_cents)}</span>
                <span>🥈 2. Platz: {formatPrize(event.prize_second_cents)}</span>
                <span>🥉 3. Platz: {formatPrize(event.prize_third_cents)}</span>
              </div>
            ) : (
              <span className="text-zinc-200">Winner takes it all — der Gewinner erhält das gesamte Preisgeld.</span>
            )}
          </div>
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
          {token && !isHost && !hasTeams && (
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
          {token && !isHost && hasTeams && event.joined && (
            <button
              onClick={() => leaveEvent(event.id)}
              disabled={joiningId === event.id}
              className="mt-4 rounded bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {joiningId === event.id ? "..." : "Team verlassen"}
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

        {hasTeams ? (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Teams ({teams.length}
              {event.max_entries ? ` / ${event.max_entries}` : ""})
            </h2>

            {token && !event.joined && open && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTeamName.trim()) return;
                  createTeam(event.id, newTeamName.trim());
                  setNewTeamName("");
                }}
                className="mb-4 flex gap-2"
              >
                <input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Neues Team gründen..."
                  className="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  disabled={teamActionPending}
                  className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  Team erstellen
                </button>
              </form>
            )}

            {detailLoading ? (
              <p className="text-sm text-zinc-500">Teams werden geladen...</p>
            ) : teams.length === 0 ? (
              <p className="text-sm text-zinc-500">Noch keine Teams.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {teams.map((team) => {
                  const full = team.member_count >= event.team_size;
                  return (
                    <div
                      key={team.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-zinc-100">{team.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">
                            {team.member_count}/{event.team_size}
                          </span>
                          {token && !event.joined && open && !full && (
                            <button
                              onClick={() => joinTeam(event.id, team.id)}
                              disabled={teamActionPending}
                              className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                            >
                              Beitreten
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {team.members.map((m) => (
                          <span
                            key={m.id}
                            className="rounded bg-white/5 px-2 py-1 text-xs text-zinc-300"
                          >
                            {m.display_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
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
        )}

        {event.format === "knockout" && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Turnierbaum
            </h2>

            {!bracket || bracket.matches.length === 0 ? (
              isHost ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-zinc-500">
                    Das Turnier wurde noch nicht gestartet. Sobald alle Teilnehmer
                    {hasTeams ? "/Teams" : ""} angemeldet sind, kannst du den Turnierbaum generieren.
                  </p>
                  <button
                    onClick={() => startTournament(event.id)}
                    disabled={teamActionPending}
                    className="self-start rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    Turnier starten
                  </button>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Das Turnier wurde noch nicht gestartet.</p>
              )
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {rounds.map((round) => (
                  <div key={round} className="flex min-w-[220px] flex-col gap-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {round === rounds[rounds.length - 1] ? "Finale" : `Runde ${round}`}
                    </div>
                    {matchesByRound.get(round)!.map((m) => {
                      const nameA = entryName(m.entry_a_id);
                      const nameB = entryName(m.entry_b_id);
                      const canDecide =
                        isHost && !m.winner_entry_id && m.entry_a_id !== null && m.entry_b_id !== null;
                      return (
                        <div
                          key={m.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm"
                        >
                          {[
                            { id: m.entry_a_id, name: nameA },
                            { id: m.entry_b_id, name: nameB },
                          ].map((side, i) => (
                            <div
                              key={i}
                              className={`flex items-center justify-between gap-2 rounded px-2 py-1 ${
                                m.winner_entry_id && m.winner_entry_id === side.id
                                  ? "bg-emerald-900/40 text-emerald-300"
                                  : "text-zinc-300"
                              }`}
                            >
                              <span>{side.name ?? "TBD"}</span>
                              {canDecide && side.id !== null && (
                                <button
                                  onClick={() => setMatchWinner(event.id, m.id, side.id!)}
                                  disabled={teamActionPending}
                                  className="rounded bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                                >
                                  Sieger
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
