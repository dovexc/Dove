import { useEffect, useRef, useState } from "react";
import { API_BASE, useAuthStore } from "../../authStore";
import { useEventsStore } from "../../eventsStore";
import { useChatStore } from "../../chatStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { EventMatch } from "../../types";

const CHAT_POLL_MS = 4000;

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatPrize(priceCents: number, t: (key: TranslationKey) => string): string {
  return priceCents === 0 ? t("evt_no_prize") : `${(priceCents / 100).toFixed(2)} €`;
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
  const t = useT();
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

  const eventMessages = useChatStore((s) => s.eventMessages);
  const sendingEvent = useChatStore((s) => s.sendingEvent);
  const openEventChat = useChatStore((s) => s.openEventChat);
  const closeEventChat = useChatStore((s) => s.closeEventChat);
  const refreshEventMessages = useChatStore((s) => s.refreshEventMessages);
  const sendEventMessage = useChatStore((s) => s.sendEventMessage);

  const [newTeamName, setNewTeamName] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const isHost = authUser?.id === event?.host_user_id;
  const canChat = Boolean(token && event && (isHost || event.joined));

  useEffect(() => {
    if (!event || !canChat) return;
    openEventChat(event.id);
    const interval = setInterval(refreshEventMessages, CHAT_POLL_MS);
    return () => {
      clearInterval(interval);
      closeEventChat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, canChat]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [eventMessages.length]);

  if (!event) return null;
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
          {t("evt_back_to_events")}
        </button>
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">{event.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t("evt_hosted_by").replace("{name}", event.host_display_name)}</p>
          </div>
          {totalPrize(event) > 0 && (
            <span className="rounded bg-amber-900/50 px-3 py-2 text-sm font-bold text-amber-300">
              {formatPrize(totalPrize(event), t)}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(event.catalog_game_title || event.custom_game_title) && (
            <span className="inline-block rounded bg-sky-900/50 px-3 py-1.5 text-sm font-semibold text-sky-300">
              {t("evt_tournament_prefix").replace("{name}", event.catalog_game_title || event.custom_game_title || "")}
            </span>
          )}
          <span className="inline-block rounded bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-400">
            {event.format === "knockout" ? t("evt_format_knockout") : t("evt_format_open")}
          </span>
          {hasTeams && (
            <span className="inline-block rounded bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-400">
              {t("evt_team_persons").replace("{n}", String(event.team_size))}
            </span>
          )}
          {event.max_entries && (
            <span className="inline-block rounded bg-white/5 px-3 py-1.5 text-sm font-semibold text-zinc-400">
              {(hasTeams ? t("evt_max_teams") : t("evt_max_participants")).replace("{n}", String(event.max_entries))}
            </span>
          )}
          {event.is_private && (
            <span className="inline-block rounded bg-amber-900/40 px-3 py-1.5 text-sm font-semibold text-amber-300">
              {t("evt_private")}
            </span>
          )}
        </div>

        {isHost && event.join_code && (
          <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-900/20 px-4 py-3 text-sm text-amber-300">
            {t("evt_join_code_label")} <span className="font-mono text-base font-bold">{event.join_code}</span>{" "}
            {t("evt_join_code_hint")}
          </div>
        )}

        {totalPrize(event) > 0 && (
          <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
            <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
              {t("evt_prize_distribution")}
            </div>
            {event.prize_mode === "split" ? (
              <div className="flex flex-col gap-1 text-zinc-200">
                <span>{t("evt_place_1").replace("{value}", formatPrize(event.prize_cents, t))}</span>
                <span>{t("evt_place_2").replace("{value}", formatPrize(event.prize_second_cents, t))}</span>
                <span>{t("evt_place_3").replace("{value}", formatPrize(event.prize_third_cents, t))}</span>
              </div>
            ) : (
              <span className="text-zinc-200">{t("evt_winner_takes_all_desc")}</span>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t("evt_registration_deadline")}</div>
            <div className={open ? "text-zinc-200" : "text-red-400"}>
              {deadline ?? t("evt_no_deadline")} {deadline && !open && t("evt_closed_suffix")}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t("evt_start")}</div>
            <div className="text-zinc-200">{starts ?? t("evt_still_open")}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">{t("evt_end")}</div>
            <div className="text-zinc-200">{ends ?? t("evt_still_open")}</div>
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
                  ? t("evt_leave")
                  : open
                    ? t("evt_join")
                    : t("evt_registration_closed")}
            </button>
          )}
          {token && !isHost && hasTeams && event.joined && (
            <button
              onClick={() => leaveEvent(event.id)}
              disabled={joiningId === event.id}
              className="mt-4 rounded bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              {joiningId === event.id ? "..." : t("evt_leave_team")}
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
              {t("evt_delete_event")}
            </button>
          )}
        </div>

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {t("evt_description")}
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {event.description || t("evt_no_description")}
          </p>
        </section>

        {hasTeams ? (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {t("evt_teams_heading")
                .replace("{n}", String(teams.length))
                .replace("{max}", event.max_entries ? ` / ${event.max_entries}` : "")}
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
                  placeholder={t("evt_new_team_placeholder")}
                  className="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  disabled={teamActionPending}
                  className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {t("evt_create_team")}
                </button>
              </form>
            )}

            {detailLoading ? (
              <p className="text-sm text-zinc-500">{t("evt_teams_loading")}</p>
            ) : teams.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("evt_no_teams")}</p>
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
                              {t("evt_join")}
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
              {t("evt_participants_heading").replace("{n}", String(event.participant_count))}
            </h2>
            {detailLoading ? (
              <p className="text-sm text-zinc-500">{t("evt_participants_loading")}</p>
            ) : participants.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("evt_no_participants")}</p>
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
                        <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" title={t("fr_online")} />
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
              {t("evt_bracket_heading")}
            </h2>

            {!bracket || bracket.matches.length === 0 ? (
              isHost ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-zinc-500">
                    {t("evt_bracket_not_started_host").replace(
                      "{teamsSuffix}",
                      hasTeams ? t("evt_teams_suffix") : ""
                    )}
                  </p>
                  <button
                    onClick={() => startTournament(event.id)}
                    disabled={teamActionPending}
                    className="self-start rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  >
                    {t("evt_start_tournament")}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">{t("evt_bracket_not_started")}</p>
              )
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {rounds.map((round) => (
                  <div key={round} className="flex min-w-[220px] flex-col gap-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {round === rounds[rounds.length - 1] ? t("evt_final") : t("evt_round").replace("{n}", String(round))}
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
                              <span>{side.name ?? t("evt_tbd")}</span>
                              {canDecide && side.id !== null && (
                                <button
                                  onClick={() => setMatchWinner(event.id, m.id, side.id!)}
                                  disabled={teamActionPending}
                                  className="rounded bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                                >
                                  {t("evt_winner")}
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

        {canChat && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              {t("evt_chat_heading")}
            </h2>
            <div className="flex h-[360px] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60">
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {eventMessages.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    {t("evt_no_messages")}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {eventMessages.map((m) => {
                      const mine = m.sender_id === authUser?.id;
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                              mine ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-100"
                            }`}
                          >
                            {!mine && (
                              <span className="mb-0.5 block text-xs font-semibold text-sky-300">
                                {m.sender_display_name}
                              </span>
                            )}
                            <p className="whitespace-pre-wrap">{m.body}</p>
                            <span
                              className={`mt-1 block text-[10px] ${
                                mine ? "text-sky-200/70" : "text-zinc-500"
                              }`}
                            >
                              {formatTime(m.created_at)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatBottomRef} />
                  </div>
                )}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!chatDraft.trim()) return;
                  await sendEventMessage(chatDraft);
                  setChatDraft("");
                }}
                className="flex gap-2 border-t border-zinc-800 p-3"
              >
                <input
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  placeholder={t("evt_message_placeholder")}
                  className="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
                <button
                  type="submit"
                  disabled={sendingEvent || !chatDraft.trim()}
                  className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {t("chat_send")}
                </button>
              </form>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
