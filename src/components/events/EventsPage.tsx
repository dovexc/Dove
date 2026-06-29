import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";
import { useEventsStore } from "../../eventsStore";
import { EventDetailPage } from "./EventDetailPage";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { GameEvent } from "../../types";

function formatPrize(priceCents: number, t: (key: TranslationKey) => string): string {
  return priceCents === 0 ? t("evt_no_prize") : `${(priceCents / 100).toFixed(2)} €`;
}

function totalPrize(event: GameEvent): number {
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

function isRegistrationOpen(event: GameEvent): boolean {
  if (!event.registration_deadline) return true;
  return new Date(event.registration_deadline).getTime() >= Date.now();
}

function gameName(event: GameEvent): string {
  return event.catalog_game_title || event.custom_game_title || "";
}

function isFull(event: GameEvent): boolean {
  return event.max_entries != null && event.participant_count >= event.max_entries;
}

const CARD_ART = [
  "linear-gradient(125deg,#2b5876,#4e4376)",
  "linear-gradient(125deg,#614385,#516395)",
  "linear-gradient(125deg,#f7008e,#330867)",
  "linear-gradient(125deg,#0f2027,#2c5364)",
  "linear-gradient(125deg,#56ab2f,#a8e063)",
  "linear-gradient(125deg,#360033,#0b8793)",
];

type SortMode = "deadline" | "prize" | "newest" | "game";
type TypeFilter = "all" | "jam" | "tournament";

export function EventsPage() {
  const t = useT();
  const events = useEventsStore((s) => s.events);
  const loading = useEventsStore((s) => s.loading);
  const error = useEventsStore((s) => s.error);
  const joiningId = useEventsStore((s) => s.joiningId);
  const fetchEvents = useEventsStore((s) => s.fetchEvents);
  const createEvent = useEventsStore((s) => s.createEvent);
  const deleteEvent = useEventsStore((s) => s.deleteEvent);
  const joinEvent = useEventsStore((s) => s.joinEvent);
  const leaveEvent = useEventsStore((s) => s.leaveEvent);
  const clearError = useEventsStore((s) => s.clearError);
  const openEventDetail = useEventsStore((s) => s.openEventDetail);
  const findEventByCode = useEventsStore((s) => s.findEventByCode);
  const detailEvent = useEventsStore((s) => s.detailEvent);
  const token = useAuthStore((s) => s.token);
  const authUser = useAuthStore((s) => s.user);
  const catalogGames = useCatalogStore((s) => s.games);
  const fetchCatalog = useCatalogStore((s) => s.fetchCatalog);

  const [onlyOpenRegistration, setOnlyOpenRegistration] = useState(false);
  const [onlyWithPrize, setOnlyWithPrize] = useState(false);
  const [minPrizeEuros, setMinPrizeEuros] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("deadline");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [gameSearch, setGameSearch] = useState("");

  const [showHostForm, setShowHostForm] = useState(false);
  const [eventKind, setEventKind] = useState<"tournament" | "jam" | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [catalogGameId, setCatalogGameId] = useState("");
  const [customGameTitle, setCustomGameTitle] = useState("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [prizeEuros, setPrizeEuros] = useState("");
  const [prizeMode, setPrizeMode] = useState<"winner_takes_all" | "split">("winner_takes_all");
  const [prizeSecondEuros, setPrizeSecondEuros] = useState("");
  const [prizeThirdEuros, setPrizeThirdEuros] = useState("");
  const [format, setFormat] = useState<"knockout" | "all">("knockout");
  const [teamSize, setTeamSize] = useState("1");
  const [maxEntries, setMaxEntries] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [createdJoinCode, setCreatedJoinCode] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");

  useEffect(() => {
    fetchEvents();
    fetchCatalog();
  }, [fetchEvents, fetchCatalog]);

  const filteredEvents = useMemo(() => {
    const minPrizeCents = Math.round((parseFloat(minPrizeEuros) || 0) * 100);
    const gameQuery = gameSearch.trim().toLowerCase();
    let list = events.filter((e) => {
      if (onlyOpenRegistration && !isRegistrationOpen(e)) return false;
      if (onlyWithPrize && totalPrize(e) <= 0) return false;
      if (minPrizeCents > 0 && totalPrize(e) < minPrizeCents) return false;
      if (typeFilter === "jam" && gameName(e)) return false;
      if (typeFilter === "tournament" && !gameName(e)) return false;
      if (gameQuery && !gameName(e).toLowerCase().includes(gameQuery)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortMode === "prize") return totalPrize(b) - totalPrize(a);
      if (sortMode === "newest") return b.id - a.id;
      if (sortMode === "game") {
        const aName = gameName(a);
        const bName = gameName(b);
        if (!aName && !bName) return 0;
        if (!aName) return 1;
        if (!bName) return -1;
        return aName.localeCompare(bName);
      }
      const aDeadline = a.registration_deadline ? new Date(a.registration_deadline).getTime() : Infinity;
      const bDeadline = b.registration_deadline ? new Date(b.registration_deadline).getTime() : Infinity;
      return aDeadline - bDeadline;
    });
    return list;
  }, [events, onlyOpenRegistration, onlyWithPrize, minPrizeEuros, sortMode, typeFilter, gameSearch]);

  function resetHostForm() {
    setShowHostForm(false);
    setEventKind(null);
    setTitle("");
    setDescription("");
    setCatalogGameId("");
    setCustomGameTitle("");
    setRegistrationDeadline("");
    setStartsAt("");
    setEndsAt("");
    setPrizeEuros("");
    setPrizeMode("winner_takes_all");
    setPrizeSecondEuros("");
    setPrizeThirdEuros("");
    setFormat("knockout");
    setTeamSize("1");
    setMaxEntries("");
    setIsPrivate(false);
  }

  async function handleHostSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const isJam = eventKind === "jam";
    const created = await createEvent({
      title: title.trim(),
      description: description.trim() || null,
      catalog_game_id: isJam || !catalogGameId ? null : Number(catalogGameId),
      custom_game_title: isJam || !catalogGameId ? customGameTitle.trim() || null : null,
      registration_deadline: registrationDeadline || null,
      starts_at: startsAt || null,
      ends_at: endsAt || null,
      prize_cents: Math.round((parseFloat(prizeEuros) || 0) * 100),
      prize_mode: prizeMode,
      prize_second_cents: Math.round((parseFloat(prizeSecondEuros) || 0) * 100),
      prize_third_cents: Math.round((parseFloat(prizeThirdEuros) || 0) * 100),
      format: isJam ? "all" : format,
      team_size: Math.max(1, Math.round(parseFloat(teamSize) || 1)),
      max_entries: maxEntries ? Math.max(1, Math.round(parseFloat(maxEntries))) : null,
      is_private: isPrivate,
    });
    if (created?.join_code) setCreatedJoinCode(created.join_code);
    resetHostForm();
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -150px, #1c2c3e 0%, #0d141c 55%, #0b1016 100%)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-6 pb-16">
      <div className="flex items-end justify-between">
        <div>
          <div className="mb-2 text-[13px] font-extrabold uppercase tracking-[4px] text-[#5b8db8]">
            {t("evt_page_heading")}
          </div>
          <h1 className="text-[34px] font-black tracking-tight text-white">
            {t("evt_discover_heading")}
          </h1>
        </div>
        {token && (
          <button
            onClick={() => (showHostForm ? resetHostForm() : setShowHostForm(true))}
            className="flex items-center gap-2 rounded-[9px] bg-gradient-to-b from-sky-400 to-sky-600 px-6 py-3 text-[15px] font-bold text-white shadow-[0_8px_22px_rgba(40,120,200,0.4)] hover:from-sky-300 hover:to-sky-500"
          >
            {!showHostForm && <span className="text-lg leading-none">+</span>}
            {showHostForm ? t("dialog_cancel") : t("evt_host_event")}
          </button>
        )}
      </div>

      {!token && (
        <p className="text-sm text-zinc-500">
          {t("evt_login_hint")}
        </p>
      )}

      {error && (
        <div className="flex items-center justify-between rounded bg-red-900/30 px-4 py-2 text-sm text-red-400">
          <span>{error}</span>
          <button onClick={clearError} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {showHostForm && !eventKind && (
        <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2">
          <button
            onClick={() => setEventKind("tournament")}
            className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161f2a] to-[#121a23] text-left transition-all hover:-translate-y-1 hover:border-sky-300/40 hover:shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
          >
            <div className="relative h-[120px]" style={{ background: "linear-gradient(125deg,#2b5876,#1c3a5e)" }}>
              <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-[#121a23]/70" />
              <div className="absolute bottom-3.5 left-5 flex items-center gap-2.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/[0.35] text-xl backdrop-blur-sm">
                  🏆
                </div>
                <span className="text-[22px] font-black tracking-tight text-white">
                  {t("evt_kind_tournament_title")}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3.5 p-5">
              <span className="text-sm leading-relaxed text-[#9fb2c2]">{t("evt_kind_tournament_desc")}</span>
              <span className="text-[13px] font-bold text-[#9fe3ff]">{t("evt_choose_arrow")}</span>
            </div>
          </button>
          <button
            onClick={() => setEventKind("jam")}
            className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#161f2a] to-[#121a23] text-left transition-all hover:-translate-y-1 hover:border-sky-300/40 hover:shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
          >
            <div className="relative h-[120px]" style={{ background: "linear-gradient(125deg,#614385,#3a2151)" }}>
              <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-[#121a23]/70" />
              <div className="absolute bottom-3.5 left-5 flex items-center gap-2.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/[0.35] text-xl backdrop-blur-sm">
                  🎮
                </div>
                <span className="text-[22px] font-black tracking-tight text-white">
                  {t("evt_kind_jam_title")}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3.5 p-5">
              <span className="text-sm leading-relaxed text-[#9fb2c2]">{t("evt_kind_jam_desc")}</span>
              <span className="text-[13px] font-bold text-[#9fe3ff]">{t("evt_choose_arrow")}</span>
            </div>
          </button>
        </div>
      )}

      {showHostForm && eventKind && (
        <form
          onSubmit={handleHostSubmit}
          className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] p-8"
        >
          <button
            type="button"
            onClick={() => setEventKind(null)}
            className="mb-6 flex items-center gap-1.5 text-[13px] font-bold text-[#5b8db8] hover:text-[#9fe3ff]"
          >
            {t("evt_change_kind")}
          </button>

          <div className="mb-4 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
            {t("evt_section_basics")}
          </div>

          <label className="mb-5 block">
            <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_title_label")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={eventKind === "tournament" ? t("evt_title_placeholder_tournament") : t("evt_title_placeholder_jam")}
              className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 text-[15px] text-[#dbe7f2] outline-none placeholder:text-zinc-500 focus:border-sky-300/60"
            />
          </label>

          <label className="mb-5 block">
            <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_description")}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("evt_rules_placeholder")}
              className="min-h-[110px] w-full resize-vertical rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 py-3.5 text-[15px] leading-relaxed text-[#dbe7f2] outline-none placeholder:text-zinc-500 focus:border-sky-300/60"
            />
          </label>

          {eventKind === "tournament" && (
            <label className="mb-5 block">
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_linked_game_label")}</span>
              <select
                value={catalogGameId}
                onChange={(e) => setCatalogGameId(e.target.value)}
                className="h-12 w-full cursor-pointer rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 text-[15px] text-[#dbe7f2] outline-none"
              >
                <option value="">{t("evt_no_specific_game")}</option>
                {catalogGames
                  .filter((g) => g.status === "approved")
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {(eventKind === "jam" || !catalogGameId) && (
            <label className="mb-7 block">
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">
                {eventKind === "jam" ? t("evt_jam_theme_label") : t("evt_custom_game_label")}
              </span>
              <input
                value={customGameTitle}
                onChange={(e) => setCustomGameTitle(e.target.value)}
                placeholder={eventKind === "jam" ? t("evt_jam_theme_placeholder") : t("evt_custom_game_placeholder")}
                className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 text-[15px] text-[#dbe7f2] outline-none placeholder:text-zinc-500 focus:border-sky-300/60"
              />
            </label>
          )}

          <div className="mb-4 border-t border-white/[0.06] pt-6 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
            {t("evt_section_schedule")}
          </div>
          <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_registration_deadline")}</span>
              <input
                type="date"
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
                className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-3.5 text-[15px] text-[#dbe7f2] outline-none [color-scheme:dark] focus:border-sky-300/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_start")}</span>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-3.5 text-[15px] text-[#dbe7f2] outline-none [color-scheme:dark] focus:border-sky-300/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_end")}</span>
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-3.5 text-[15px] text-[#dbe7f2] outline-none [color-scheme:dark] focus:border-sky-300/60"
              />
            </label>
          </div>

          <div className="mb-4 border-t border-white/[0.06] pt-6 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
            {t("evt_section_prize")}
          </div>
          <div className="mb-7 grid grid-cols-1 gap-5 sm:grid-cols-[240px_1fr]">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">
                {prizeMode === "split" ? t("evt_prize_first_label") : t("evt_prize_label")}
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={prizeEuros}
                onChange={(e) => setPrizeEuros(e.target.value)}
                placeholder="0"
                className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 text-[15px] text-[#dbe7f2] outline-none placeholder:text-zinc-500 focus:border-sky-300/60"
              />
            </label>
            <div>
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_prize_split_label")}</span>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setPrizeMode("winner_takes_all")}
                  className={`flex h-12 flex-1 items-center gap-2.5 rounded-[9px] border px-4 text-sm font-semibold ${
                    prizeMode === "winner_takes_all"
                      ? "border-sky-300/60 bg-sky-400/[0.18] text-white"
                      : "border-white/[0.08] bg-[#0d141c] text-[#9fb2c2]"
                  }`}
                >
                  <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                      prizeMode === "winner_takes_all" ? "border-sky-300" : "border-zinc-600"
                    }`}
                  >
                    {prizeMode === "winner_takes_all" && <span className="h-2 w-2 rounded-full bg-sky-300" />}
                  </span>
                  {t("evt_winner_takes_all_radio")}
                </button>
                <button
                  type="button"
                  onClick={() => setPrizeMode("split")}
                  className={`flex h-12 flex-1 items-center gap-2.5 rounded-[9px] border px-4 text-sm font-semibold ${
                    prizeMode === "split"
                      ? "border-sky-300/60 bg-sky-400/[0.18] text-white"
                      : "border-white/[0.08] bg-[#0d141c] text-[#9fb2c2]"
                  }`}
                >
                  <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                      prizeMode === "split" ? "border-sky-300" : "border-zinc-600"
                    }`}
                  >
                    {prizeMode === "split" && <span className="h-2 w-2 rounded-full bg-sky-300" />}
                  </span>
                  {t("evt_split_1_3")}
                </button>
              </div>
            </div>
          </div>

          {prizeMode === "split" && (
            <div className="-mt-2 mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_prize_second_label")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={prizeSecondEuros}
                  onChange={(e) => setPrizeSecondEuros(e.target.value)}
                  placeholder="0"
                  className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 text-[15px] text-[#dbe7f2] outline-none placeholder:text-zinc-500 focus:border-sky-300/60"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_prize_third_label")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={prizeThirdEuros}
                  onChange={(e) => setPrizeThirdEuros(e.target.value)}
                  placeholder="0"
                  className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 text-[15px] text-[#dbe7f2] outline-none placeholder:text-zinc-500 focus:border-sky-300/60"
                />
              </label>
            </div>
          )}

          <div className="mb-4 border-t border-white/[0.06] pt-6 text-xs font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
            {t("evt_section_participation")}
          </div>

          {eventKind === "tournament" && (
            <div className="mb-5">
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_tournament_format_label")}</span>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setFormat("knockout")}
                  className={`flex h-12 flex-1 items-center gap-2.5 rounded-[9px] border px-4 text-sm font-semibold ${
                    format === "knockout"
                      ? "border-sky-300/60 bg-sky-400/[0.18] text-white"
                      : "border-white/[0.08] bg-[#0d141c] text-[#9fb2c2]"
                  }`}
                >
                  <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                      format === "knockout" ? "border-sky-300" : "border-zinc-600"
                    }`}
                  >
                    {format === "knockout" && <span className="h-2 w-2 rounded-full bg-sky-300" />}
                  </span>
                  {t("evt_knockout_radio")}
                </button>
                <button
                  type="button"
                  onClick={() => setFormat("all")}
                  className={`flex h-12 flex-1 items-center gap-2.5 rounded-[9px] border px-4 text-sm font-semibold ${
                    format === "all"
                      ? "border-sky-300/60 bg-sky-400/[0.18] text-white"
                      : "border-white/[0.08] bg-[#0d141c] text-[#9fb2c2]"
                  }`}
                >
                  <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                      format === "all" ? "border-sky-300" : "border-zinc-600"
                    }`}
                  >
                    {format === "all" && <span className="h-2 w-2 rounded-full bg-sky-300" />}
                  </span>
                  {t("evt_open_list_radio")}
                </button>
              </div>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_max_entries_label")}</span>
              <input
                type="number"
                min="1"
                value={maxEntries}
                onChange={(e) => setMaxEntries(e.target.value)}
                placeholder={t("evt_unlimited_placeholder")}
                className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 text-[15px] text-[#dbe7f2] outline-none placeholder:text-zinc-500 focus:border-sky-300/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#c7d5e0]">{t("evt_team_size_label")}</span>
              <input
                type="number"
                min="1"
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)}
                placeholder={t("evt_solo_placeholder")}
                className="h-12 w-full rounded-[9px] border border-white/[0.08] bg-[#0d141c] px-4 text-[15px] text-[#dbe7f2] outline-none placeholder:text-zinc-500 focus:border-sky-300/60"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => setIsPrivate((v) => !v)}
            className="mb-8 flex items-center gap-3"
          >
            <span
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border ${
                isPrivate ? "border-sky-300/60 bg-gradient-to-b from-sky-400 to-sky-600" : "border-white/[0.15] bg-[#0d141c]"
              }`}
            >
              {isPrivate && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            <span className="text-sm font-semibold text-[#c7d5e0]">
              {t("evt_private_checkbox")}
            </span>
          </button>

          <div className="flex items-center justify-end gap-3.5 border-t border-white/[0.06] pt-6">
            <button
              type="button"
              onClick={resetHostForm}
              className="rounded-[9px] border border-white/10 bg-white/5 px-6 py-3 text-[15px] font-bold text-[#c7d5e0] hover:bg-white/10 hover:text-white"
            >
              {t("dialog_cancel")}
            </button>
            <button
              type="submit"
              className="rounded-[9px] bg-gradient-to-b from-sky-400 to-sky-600 px-7 py-3 text-[15px] font-bold text-white shadow-[0_8px_22px_rgba(40,120,200,0.4)] hover:from-sky-300 hover:to-sky-500"
            >
              {t("evt_publish")}
            </button>
          </div>
        </form>
      )}

      {createdJoinCode && (
        <div className="flex items-center justify-between rounded bg-emerald-900/30 px-4 py-3 text-sm text-emerald-300">
          <span>
            {t("evt_created_join_code_prefix")} <span className="font-mono text-base font-bold">{createdJoinCode}</span> {t("evt_created_join_code_suffix")}
          </span>
          <button onClick={() => setCreatedJoinCode(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-[13px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] p-5">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex h-[46px] min-w-[260px] flex-1 items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#0d141c] px-4">
            <span className="text-[#5b6b7a]">🔍</span>
            <input
              value={gameSearch}
              onChange={(e) => setGameSearch(e.target.value)}
              placeholder={t("evt_search_by_game_placeholder")}
              className="flex-1 bg-transparent text-[15px] text-[#dbe7f2] outline-none placeholder:text-zinc-500"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[13px] font-semibold text-[#7b8794]">{t("evt_type_label")}</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="h-[46px] cursor-pointer rounded-lg border border-white/[0.08] bg-[#0d141c] px-3.5 text-sm font-semibold text-[#dbe7f2] outline-none"
            >
              <option value="all">{t("evt_type_all")}</option>
              <option value="jam">{t("evt_type_jams")}</option>
              <option value="tournament">{t("evt_type_tournaments")}</option>
            </select>
          </div>
          {token && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!joinCodeInput.trim()) return;
                findEventByCode(joinCodeInput.trim());
                setJoinCodeInput("");
              }}
              className="flex items-center gap-2"
            >
              <input
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder={t("evt_join_by_code_placeholder")}
                className="h-[46px] w-[230px] rounded-lg border border-white/[0.08] bg-[#0d141c] px-3.5 text-sm text-[#dbe7f2] outline-none placeholder:text-zinc-500"
              />
              <button
                type="submit"
                className="h-[46px] rounded-lg border border-white/10 bg-white/5 px-4.5 text-sm font-bold text-[#dbe7f2] hover:bg-white/10 hover:text-white"
              >
                {t("evt_search_action")}
              </button>
            </form>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-white/[0.05] pt-3.5">
          <button
            onClick={() => setOnlyOpenRegistration((v) => !v)}
            className={`flex h-[38px] items-center gap-2 rounded-full border px-4 text-[13px] font-semibold ${
              onlyOpenRegistration
                ? "border-sky-300/50 bg-sky-400/[0.18] text-white"
                : "border-white/[0.08] bg-white/[0.03] text-[#9fb2c2]"
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: onlyOpenRegistration ? "#5fd17a" : "#5b6671" }}
            />
            {t("evt_only_open_registration")}
          </button>
          <button
            onClick={() => setOnlyWithPrize((v) => !v)}
            className={`flex h-[38px] items-center gap-2 rounded-full border px-4 text-[13px] font-semibold ${
              onlyWithPrize
                ? "border-sky-300/50 bg-sky-400/[0.18] text-white"
                : "border-white/[0.08] bg-white/[0.03] text-[#9fb2c2]"
            }`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: onlyWithPrize ? "#5fd17a" : "#5b6671" }}
            />
            {t("evt_only_with_prize")}
          </button>
          <div className="flex h-[38px] items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5">
            <span className="text-[#7b8794]">€</span>
            <input
              type="number"
              min="0"
              value={minPrizeEuros}
              onChange={(e) => setMinPrizeEuros(e.target.value)}
              placeholder={t("evt_min_prize_placeholder")}
              className="w-28 bg-transparent text-[13px] text-[#dbe7f2] outline-none placeholder:text-zinc-500"
            />
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="text-[13px] font-semibold text-[#7b8794]">{t("evt_sort_label")}</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-[38px] cursor-pointer rounded-lg border border-white/[0.08] bg-[#0d141c] px-3.5 text-sm font-semibold text-[#dbe7f2] outline-none"
            >
              <option value="deadline">{t("evt_registration_deadline")}</option>
              <option value="prize">{t("evt_sort_prize")}</option>
              <option value="newest">{t("evt_sort_newest")}</option>
              <option value="game">{t("evt_sort_game")}</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{t("evt_loading")}</p>
      ) : filteredEvents.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/[0.12] bg-gradient-to-b from-[#141d27] to-[#111923] px-8 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-400/10">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#5b8db8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v4M16 2v4M3 10h18" />
              <rect x="3" y="4" width="18" height="18" rx="2" />
            </svg>
          </div>
          <div className="mb-2 text-[19px] font-extrabold text-[#e8f1f8]">{t("evt_empty_heading")}</div>
          <div className="mx-auto mb-5 max-w-[380px] text-sm text-[#7b8794]">{t("evt_empty_subtext")}</div>
          {token && (
            <button
              onClick={() => setShowHostForm(true)}
              className="rounded-[9px] bg-gradient-to-b from-sky-400 to-sky-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(40,120,200,0.3)] hover:from-sky-300 hover:to-sky-500"
            >
              {t("evt_host_event")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="text-[13px] text-[#7b8794]">
            {filteredEvents.length} {t("evt_events_found_suffix")}
          </div>
          <div className="grid grid-cols-1 gap-[22px] sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event, index) => {
              const isHost = authUser?.id === event.host_user_id;
              const open = isRegistrationOpen(event);
              const full = isFull(event);
              const deadline = formatDate(event.registration_deadline);
              const isTournament = Boolean(gameName(event));
              const statusColor = !open ? "#ff7a6b" : full ? "#ffb74d" : "#5fd17a";
              const statusLabel = !open ? t("evt_status_closed") : full ? t("evt_status_full") : t("evt_status_open");
              return (
                <div
                  key={event.id}
                  onClick={() => openEventDetail(event.id)}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#161f2a] to-[#121a23] transition-all hover:-translate-y-1 hover:border-sky-300/30 hover:shadow-[0_18px_38px_rgba(0,0,0,0.5)]"
                >
                  <div className="relative h-[130px]" style={{ background: CARD_ART[index % CARD_ART.length] }}>
                    <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-[#121a23]/85" />
                    <div
                      className="absolute left-3 top-3 rounded-md px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white"
                      style={{ background: isTournament ? "#2475c7" : "#7b4397" }}
                    >
                      {isTournament ? t("evt_card_type_tournament") : t("evt_card_type_jam")}
                    </div>
                    <div
                      className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1 text-[11px] font-bold backdrop-blur-sm"
                      style={{ color: statusColor }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
                      {statusLabel}
                    </div>
                    <div className="absolute bottom-3 left-4 right-4 text-[20px] font-black leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                      {event.title}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-3.5 p-4">
                    <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-[#8a97a5]">
                      <span>{gameName(event) || t("evt_hosted_by").replace("{name}", event.host_display_name)}</span>
                      {event.is_private && (
                        <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
                          {t("evt_private")}
                        </span>
                      )}
                      {event.team_size > 1 && (
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-400">
                          {t("evt_team_persons").replace("{n}", String(event.team_size))}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2.5">
                      <div className="flex-1 rounded-lg bg-white/[0.03] px-3 py-2.5">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-[#6b7884]">
                          {t("evt_prize_label").replace(" (€)", "")}
                        </div>
                        <div className="mt-0.5 text-base font-extrabold text-[#beee11]">
                          {totalPrize(event) > 0 ? formatPrize(totalPrize(event), t) : t("evt_no_prize")}
                        </div>
                      </div>
                      <div className="flex-1 rounded-lg bg-white/[0.03] px-3 py-2.5">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-[#6b7884]">
                          {t("evt_participant_count_suffix")}
                        </div>
                        <div className="mt-0.5 text-base font-extrabold text-[#dbe7f2]">
                          {event.max_entries
                            ? `${event.participant_count} / ${event.max_entries}`
                            : `${event.participant_count} ${t("evt_joined_suffix")}`}
                        </div>
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-[#7b8794]">
                        {deadline ? `${t("evt_registration_deadline")}: ${deadline}` : t("evt_no_deadline")}
                      </span>

                      {isHost ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteEvent(event.id);
                          }}
                          className="rounded-lg border border-red-400/30 bg-red-500/[0.12] px-4 py-2 text-[13px] font-bold text-red-300 hover:bg-red-500/25 hover:text-white"
                        >
                          {t("evt_delete_event")}
                        </button>
                      ) : token && event.team_size > 1 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEventDetail(event.id);
                          }}
                          className="rounded-lg border border-sky-300/30 bg-sky-400/[0.12] px-4 py-2 text-[13px] font-bold text-sky-200 hover:bg-sky-400/25 hover:text-white"
                        >
                          {t("evt_team_choose")}
                        </button>
                      ) : token && event.team_size <= 1 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            event.joined ? leaveEvent(event.id) : joinEvent(event.id);
                          }}
                          disabled={joiningId === event.id || (!event.joined && !open)}
                          className="rounded-lg border border-sky-300/30 bg-sky-400/[0.12] px-4 py-2 text-[13px] font-bold text-sky-200 disabled:opacity-50 hover:bg-sky-400/25 hover:text-white"
                        >
                          {joiningId === event.id
                            ? "..."
                            : event.joined
                              ? t("evt_card_leave")
                              : open
                                ? t("evt_join")
                                : t("evt_registration_closed")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {detailEvent && <EventDetailPage />}
      </div>
    </div>
  );
}
