import { useEffect, useRef, useState } from "react";
import { API_BASE, useAuthStore } from "../../authStore";
import { useEventsStore } from "../../eventsStore";
import { CHAT_MESSAGE_MAX_LENGTH, useChatStore } from "../../chatStore";
import { LockIcon, MedalIcon } from "../icons";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { EventMatch } from "../../types";

const CHAT_POLL_MS = 4000;

const AVATAR_COLORS = [
  "#3aa0ff",
  "#7b4397",
  "#2475c7",
  "#56ab2f",
  "#e0529c",
  "#0b8793",
  "#614385",
  "#d97706",
];

function avatarColor(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}

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
  const removeParticipant = useEventsStore((s) => s.removeParticipant);
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
  const chatError = useChatStore((s) => s.error);
  const clearChatError = useChatStore((s) => s.clearError);

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
  const isTournament = Boolean(event.catalog_game_title || event.custom_game_title);
  const full = event.max_entries != null && event.participant_count >= event.max_entries;
  const statusColor = !open ? "#ff7a6b" : full ? "#ffb74d" : "#5fd17a";
  const statusLabel = !open ? t("evt_status_closed") : full ? t("evt_status_full") : t("evt_status_open");
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
    <div
      className="fixed inset-0 z-[70] overflow-y-auto"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -150px, #1c2c3e 0%, #0d141c 55%, #0b1016 100%)",
      }}
    >
      <div className="mx-auto max-w-[1000px] px-10 py-8 pb-24">
        <button
          onClick={closeEventDetail}
          className="mb-7 flex items-center gap-2 rounded-[9px] border border-white/10 bg-white/5 px-[18px] py-2.5 text-sm font-bold text-zinc-300 hover:bg-white/10 hover:text-white"
        >
          ← {t("evt_back_to_events")}
        </button>

        <div className="mb-[18px] flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-[40px] font-black leading-none tracking-tight text-white">{event.title}</h1>
            <div className="mt-2.5 text-[15px] text-[#7b8794]">
              {t("evt_hosted_by").replace("{name}", event.host_display_name)}
            </div>
          </div>
          {totalPrize(event) > 0 && (
            <div className="flex shrink-0 items-center gap-2 rounded-[11px] border border-[#beee11]/30 bg-gradient-to-b from-[#beee11]/[0.16] to-[#78960a]/10 px-5 py-3 text-xl font-extrabold text-[#d4f436] shadow-[0_8px_22px_rgba(120,150,10,0.18)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4f436" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
              {formatPrize(totalPrize(event), t)}
            </div>
          )}
        </div>

        <div className="mb-7 flex flex-wrap items-center gap-2.5">
          <span
            className="rounded-md px-3.5 py-[7px] text-xs font-extrabold uppercase tracking-wide text-white"
            style={{ background: isTournament ? "#2475c7" : "#7b4397" }}
          >
            {isTournament ? t("evt_card_type_tournament") : t("evt_card_type_jam")}
          </span>
          <span
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-[13px] font-bold"
            style={{ color: statusColor }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
            />
            {statusLabel}
          </span>
          {event.is_private && (
            <span className="flex items-center gap-1.5 rounded-md bg-amber-900/40 px-3.5 py-1.5 text-[13px] font-bold text-amber-300">
              <LockIcon size={13} />
              {t("evt_private")}
            </span>
          )}
          <span className="rounded-md bg-white/5 px-3.5 py-1.5 text-[13px] font-bold text-zinc-400">
            {event.format === "knockout" ? t("evt_format_knockout") : t("evt_format_open")}
          </span>
          {hasTeams && (
            <span className="rounded-md bg-white/5 px-3.5 py-1.5 text-[13px] font-bold text-zinc-400">
              {t("evt_team_persons").replace("{n}", String(event.team_size))}
            </span>
          )}
          {event.max_entries && (
            <span className="rounded-md bg-white/5 px-3.5 py-1.5 text-[13px] font-bold text-zinc-400">
              {(hasTeams ? t("evt_max_teams") : t("evt_max_participants")).replace("{n}", String(event.max_entries))}
            </span>
          )}
        </div>

        {isHost && event.join_code && (
          <div className="mb-[18px] rounded-[13px] border border-amber-800/40 bg-amber-900/20 px-5 py-4 text-sm text-amber-300">
            {t("evt_join_code_label")} <span className="font-mono text-base font-bold">{event.join_code}</span>{" "}
            {t("evt_join_code_hint")}
          </div>
        )}

        {totalPrize(event) > 0 && (
          <div className="mb-[18px] rounded-[13px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-[22px] py-5">
            <div className="mb-2.5 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
              {t("evt_prize_distribution")}
            </div>
            {event.prize_mode === "split" ? (
              <div className="flex flex-col gap-1.5 text-[16px] leading-[1.5] text-[#dbe7f2]">
                <span className="flex items-center gap-2">
                  <MedalIcon size={16} className="text-amber-400" />
                  {t("evt_place_1").replace("{value}", formatPrize(event.prize_cents, t))}
                </span>
                <span className="flex items-center gap-2">
                  <MedalIcon size={16} className="text-zinc-300" />
                  {t("evt_place_2").replace("{value}", formatPrize(event.prize_second_cents, t))}
                </span>
                <span className="flex items-center gap-2">
                  <MedalIcon size={16} className="text-amber-700" />
                  {t("evt_place_3").replace("{value}", formatPrize(event.prize_third_cents, t))}
                </span>
              </div>
            ) : (
              <span className="text-[16px] leading-[1.5] text-[#dbe7f2]">{t("evt_winner_takes_all_desc")}</span>
            )}
          </div>
        )}

        <div className="mb-[26px] grid grid-cols-3 gap-5 rounded-[13px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-[22px] py-5">
          <div>
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[1.5px] text-[#6b7884]">
              {t("evt_registration_deadline")}
            </div>
            <div className={`text-lg font-bold ${open ? "text-[#f0f6fb]" : "text-red-400"}`}>
              {deadline ?? t("evt_no_deadline")} {deadline && !open && t("evt_closed_suffix")}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[1.5px] text-[#6b7884]">
              {t("evt_start")}
            </div>
            <div className="text-lg font-bold text-[#f0f6fb]">{starts ?? t("evt_still_open")}</div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[1.5px] text-[#6b7884]">
              {t("evt_end")}
            </div>
            <div className="text-lg font-bold text-[#f0f6fb]">{ends ?? t("evt_still_open")}</div>
          </div>
        </div>

        <div className="mb-7 flex gap-3">
          {token && !isHost && !hasTeams && (
            <button
              onClick={() => (event.joined ? leaveEvent(event.id) : joinEvent(event.id))}
              disabled={joiningId === event.id || (!event.joined && !open)}
              className={`rounded-[9px] px-5 py-2.5 text-sm font-bold disabled:opacity-50 ${
                event.joined
                  ? "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                  : "bg-gradient-to-b from-sky-400 to-sky-600 text-white shadow-[0_6px_16px_rgba(40,120,200,0.3)] hover:from-sky-300 hover:to-sky-500"
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
              className="rounded-[9px] border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-50"
            >
              {joiningId === event.id ? "..." : t("evt_leave_team")}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-7">
            <div>
              <div className="mb-3 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                {t("evt_description")}
              </div>
              <div className="whitespace-pre-wrap text-[15px] leading-[1.6] text-[#c7d5e0]">
                {event.description || t("evt_no_description")}
              </div>
            </div>

            {hasTeams ? (
              <div>
                <div className="mb-3 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                  {t("evt_teams_heading")
                    .replace("{n}", String(teams.length))
                    .replace("{max}", event.max_entries ? ` / ${event.max_entries}` : "")}
                </div>

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
                      className="flex-1 rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-3.5 py-2 text-sm text-[#dbe7f2] outline-none placeholder:text-zinc-500"
                    />
                    <button
                      type="submit"
                      disabled={teamActionPending}
                      className="rounded-[9px] bg-gradient-to-b from-sky-400 to-sky-600 px-4 py-2 text-sm font-bold text-white hover:from-sky-300 hover:to-sky-500 disabled:opacity-50"
                    >
                      {t("evt_create_team")}
                    </button>
                  </form>
                )}

                {detailLoading ? (
                  <p className="text-sm text-zinc-500">{t("evt_teams_loading")}</p>
                ) : teams.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-[18px] text-center text-sm text-[#7b8794]">
                    {t("evt_no_teams")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {teams.map((team) => {
                      const teamFull = team.member_count >= event.team_size;
                      return (
                        <div
                          key={team.id}
                          className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-[#e8f1f8]">{team.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-[#7b8794]">
                                {team.member_count}/{event.team_size}
                              </span>
                              {token && !event.joined && open && !teamFull && (
                                <button
                                  onClick={() => joinTeam(event.id, team.id)}
                                  disabled={teamActionPending}
                                  className="rounded-md bg-gradient-to-b from-sky-400 to-sky-600 px-3 py-1 text-xs font-bold text-white hover:from-sky-300 hover:to-sky-500 disabled:opacity-50"
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
                                className="flex items-center gap-1.5 rounded bg-white/5 px-2 py-1 text-xs text-zinc-300"
                              >
                                {m.display_name}
                                {isHost && !bracket && (
                                  <button
                                    onClick={() => removeParticipant(event.id, m.id)}
                                    disabled={teamActionPending}
                                    title={t("evt_kick_participant")}
                                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                                  >
                                    ✕
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-3 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
                  {t("evt_participants_heading").replace("{n}", String(event.participant_count))}
                </div>
                {detailLoading ? (
                  <p className="text-sm text-zinc-500">{t("evt_participants_loading")}</p>
                ) : participants.length === 0 ? (
                  <div className="rounded-[10px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-[18px] text-center text-sm text-[#7b8794]">
                    {t("evt_no_participants")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {participants.map((p) => {
                      const avatarUrl = resolveUrl(p.avatar_url);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-[13px] py-2.5"
                        >
                          <div
                            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] text-sm font-extrabold text-white"
                            style={{ background: avatarColor(p.id) }}
                          >
                            {avatarUrl ? (
                              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              p.display_name.slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <span className="text-sm font-semibold text-[#e8f1f8]">{p.display_name}</span>
                          <div className="ml-auto flex items-center gap-2.5">
                            {p.online && (
                              <span className="h-2 w-2 rounded-full bg-emerald-400" title={t("fr_online")} />
                            )}
                            {isHost && !bracket && (
                              <button
                                onClick={() => removeParticipant(event.id, p.id)}
                                disabled={teamActionPending}
                                title={t("evt_kick_participant")}
                                className="rounded bg-red-900/30 px-2 py-1 text-xs font-semibold text-red-300 hover:bg-red-900/50 disabled:opacity-50"
                              >
                                {t("evt_kick_participant")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {isHost && (
              <button
                onClick={() => {
                  deleteEvent(event.id);
                  closeEventDetail();
                }}
                className="flex items-center gap-2 self-start rounded-[9px] border border-red-500/30 bg-red-500/[0.08] px-5 py-2.5 text-sm font-bold text-[#ff8a7a] hover:bg-red-500/[0.18] hover:text-[#ff9f92]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                {t("evt_delete_event")}
              </button>
            )}
          </div>

          <div>
            <div className="mb-3 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
              {t("evt_chat_heading")}
            </div>
            <div className="flex h-[440px] flex-col overflow-hidden rounded-[13px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923]">
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {!canChat ? (
                  <p className="m-auto text-center text-sm text-[#5b6671]">{t("evt_login_hint")}</p>
                ) : eventMessages.length === 0 ? (
                  <p className="m-auto text-center text-sm text-[#5b6671]">{t("evt_no_messages")}</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {eventMessages.map((m) => (
                      <div key={m.id} className="flex gap-2.5">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-extrabold text-white"
                          style={{ background: avatarColor(m.sender_id) }}
                        >
                          {m.sender_display_name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13px] font-bold text-[#e8f1f8]">{m.sender_display_name}</span>
                            <span className="text-[11px] text-[#5b6671]">{formatTime(m.created_at)}</span>
                          </div>
                          <div className="mt-0.5 whitespace-pre-wrap text-sm leading-[1.4] text-[#c7d5e0]">
                            {m.body}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={chatBottomRef} />
                  </div>
                )}
              </div>
              {canChat && (
                <div className="border-t border-white/[0.06] bg-black/20 p-3.5">
                  {chatError && (
                    <div className="mb-2 flex items-center justify-between rounded bg-red-900/40 px-3 py-1.5 text-xs text-red-300">
                      <span>{chatError}</span>
                      <button onClick={clearChatError} className="font-bold">
                        ✕
                      </button>
                    </div>
                  )}
                  {chatDraft.length > CHAT_MESSAGE_MAX_LENGTH * 0.8 && (
                    <div
                      className={`mb-1 text-right text-[11px] ${
                        chatDraft.length >= CHAT_MESSAGE_MAX_LENGTH ? "text-red-400" : "text-zinc-500"
                      }`}
                    >
                      {chatDraft.length}/{CHAT_MESSAGE_MAX_LENGTH}
                    </div>
                  )}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!chatDraft.trim()) return;
                      await sendEventMessage(chatDraft);
                      setChatDraft("");
                    }}
                    className="flex gap-2.5"
                  >
                    <input
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                      placeholder={t("evt_message_placeholder")}
                      maxLength={CHAT_MESSAGE_MAX_LENGTH}
                      className="h-11 flex-1 rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-3.5 text-sm text-[#dbe7f2] outline-none placeholder:text-zinc-500"
                    />
                    <button
                      type="submit"
                      disabled={sendingEvent || !chatDraft.trim()}
                      className="h-11 shrink-0 rounded-[9px] bg-gradient-to-b from-sky-400 to-sky-600 px-[22px] text-sm font-bold text-white shadow-[0_6px_16px_rgba(40,120,200,0.3)] hover:from-sky-300 hover:to-sky-500 disabled:opacity-50"
                    >
                      {t("chat_send")}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>

        {event.format === "knockout" && (
          <div className="mt-8">
            <div className="mb-3 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
              {t("evt_bracket_heading")}
            </div>

            {!bracket || bracket.matches.length === 0 ? (
              isHost ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-[#7b8794]">
                    {t("evt_bracket_not_started_host").replace(
                      "{teamsSuffix}",
                      hasTeams ? t("evt_teams_suffix") : ""
                    )}
                  </p>
                  <button
                    onClick={() => startTournament(event.id)}
                    disabled={teamActionPending}
                    className="self-start rounded-[9px] bg-gradient-to-b from-sky-400 to-sky-600 px-4 py-2 text-sm font-bold text-white hover:from-sky-300 hover:to-sky-500 disabled:opacity-50"
                  >
                    {t("evt_start_tournament")}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[#7b8794]">{t("evt_bracket_not_started")}</p>
              )
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {rounds.map((round) => (
                  <div key={round} className="flex min-w-[220px] flex-col gap-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-[#7b8794]">
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
                          className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3 text-sm"
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
          </div>
        )}
      </div>
    </div>
  );
}
