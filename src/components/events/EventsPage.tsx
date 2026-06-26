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

  async function handleHostSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const created = await createEvent({
      title: title.trim(),
      description: description.trim() || null,
      catalog_game_id: catalogGameId ? Number(catalogGameId) : null,
      custom_game_title: catalogGameId ? null : customGameTitle.trim() || null,
      registration_deadline: registrationDeadline || null,
      starts_at: startsAt || null,
      ends_at: endsAt || null,
      prize_cents: Math.round((parseFloat(prizeEuros) || 0) * 100),
      prize_mode: prizeMode,
      prize_second_cents: Math.round((parseFloat(prizeSecondEuros) || 0) * 100),
      prize_third_cents: Math.round((parseFloat(prizeThirdEuros) || 0) * 100),
      format,
      team_size: Math.max(1, Math.round(parseFloat(teamSize) || 1)),
      max_entries: maxEntries ? Math.max(1, Math.round(parseFloat(maxEntries))) : null,
      is_private: isPrivate,
    });
    if (created?.join_code) setCreatedJoinCode(created.join_code);
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
    setShowHostForm(false);
  }

  return (
    <div
      className="flex h-full flex-col gap-6 overflow-y-auto p-6"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -150px, #1c2c3e 0%, #0d141c 55%, #0b1016 100%)",
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          {t("evt_page_heading")}
        </h2>
        {token && (
          <button
            onClick={() => setShowHostForm((v) => !v)}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
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

      {showHostForm && (
        <form
          onSubmit={handleHostSubmit}
          className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
        >
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("evt_title_label")}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("evt_description")}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("evt_rules_placeholder")}
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {t("evt_linked_game_label")}
            <select
              value={catalogGameId}
              onChange={(e) => setCatalogGameId(e.target.value)}
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
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
          {!catalogGameId && (
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              {t("evt_custom_game_label")}
              <input
                value={customGameTitle}
                onChange={(e) => setCustomGameTitle(e.target.value)}
                placeholder={t("evt_custom_game_placeholder")}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
          )}
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              {t("evt_registration_deadline")}
              <input
                type="date"
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              {t("evt_start")}
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              {t("evt_end")}
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {prizeMode === "split" ? t("evt_prize_first_label") : t("evt_prize_label")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={prizeEuros}
              onChange={(e) => setPrizeEuros(e.target.value)}
              placeholder="0"
              className="w-40 rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>

          <div className="flex flex-col gap-2 text-sm text-zinc-300">
            {t("evt_prize_split_label")}
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="prizeMode"
                  checked={prizeMode === "winner_takes_all"}
                  onChange={() => setPrizeMode("winner_takes_all")}
                />
                {t("evt_winner_takes_all_radio")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="prizeMode"
                  checked={prizeMode === "split"}
                  onChange={() => setPrizeMode("split")}
                />
                {t("evt_split_1_3")}
              </label>
            </div>
          </div>

          {prizeMode === "split" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                {t("evt_prize_second_label")}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={prizeSecondEuros}
                  onChange={(e) => setPrizeSecondEuros(e.target.value)}
                  placeholder="0"
                  className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                {t("evt_prize_third_label")}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={prizeThirdEuros}
                  onChange={(e) => setPrizeThirdEuros(e.target.value)}
                  placeholder="0"
                  className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
                />
              </label>
            </div>
          )}

          <div className="flex flex-col gap-2 text-sm text-zinc-300">
            {t("evt_tournament_format_label")}
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="format"
                  checked={format === "knockout"}
                  onChange={() => setFormat("knockout")}
                />
                {t("evt_knockout_radio")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="format"
                  checked={format === "all"}
                  onChange={() => setFormat("all")}
                />
                {t("evt_open_list_radio")}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              {t("evt_max_entries_label")}
              <input
                type="number"
                min="1"
                value={maxEntries}
                onChange={(e) => setMaxEntries(e.target.value)}
                placeholder={t("evt_unlimited_placeholder")}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              {t("evt_team_size_label")}
              <input
                type="number"
                min="1"
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)}
                placeholder={t("evt_solo_placeholder")}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            {t("evt_private_checkbox")}
          </label>

          <button
            type="submit"
            className="self-end rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            {t("evt_publish")}
          </button>
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
            className="w-64 rounded border border-white/10 bg-[#10171f] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <button
            type="submit"
            className="rounded bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/10"
          >
            {t("evt_search_action")}
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          {t("evt_type_label")}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700"
          >
            <option value="all">{t("evt_type_all")}</option>
            <option value="jam">{t("evt_type_jams")}</option>
            <option value="tournament">{t("evt_type_tournaments")}</option>
          </select>
        </div>
        <div className="flex h-[42px] items-center gap-2 rounded-lg border border-white/10 bg-[#10171f] px-3">
          <span className="text-zinc-500">🔍</span>
          <input
            value={gameSearch}
            onChange={(e) => setGameSearch(e.target.value)}
            placeholder={t("evt_search_by_game_placeholder")}
            className="w-44 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </div>
        <button
          onClick={() => setOnlyOpenRegistration((v) => !v)}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
            onlyOpenRegistration
              ? "border-sky-400/50 bg-gradient-to-b from-sky-500 to-sky-700 text-white"
              : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
          }`}
        >
          {t("evt_only_open_registration")}
        </button>
        <button
          onClick={() => setOnlyWithPrize((v) => !v)}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
            onlyWithPrize
              ? "border-sky-400/50 bg-gradient-to-b from-sky-500 to-sky-700 text-white"
              : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
          }`}
        >
          {t("evt_only_with_prize")}
        </button>
        <div className="flex h-[42px] items-center gap-2 rounded-lg border border-white/10 bg-[#10171f] px-3">
          <span className="text-zinc-500">€</span>
          <input
            type="number"
            min="0"
            value={minPrizeEuros}
            onChange={(e) => setMinPrizeEuros(e.target.value)}
            placeholder={t("evt_min_prize_placeholder")}
            className="w-32 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          {t("evt_sort_label")}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700"
          >
            <option value="deadline">{t("evt_registration_deadline")}</option>
            <option value="prize">{t("evt_sort_prize")}</option>
            <option value="newest">{t("evt_sort_newest")}</option>
            <option value="game">{t("evt_sort_game")}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{t("evt_loading")}</p>
      ) : filteredEvents.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("evt_none_found")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event) => {
            const isHost = authUser?.id === event.host_user_id;
            const open = isRegistrationOpen(event);
            const deadline = formatDate(event.registration_deadline);
            const starts = formatDate(event.starts_at);
            const ends = formatDate(event.ends_at);
            return (
              <div
                key={event.id}
                onClick={() => openEventDetail(event.id)}
                className="flex cursor-pointer flex-col gap-3 rounded-lg border border-white/5 bg-[#141c26] p-4 shadow-lg transition-transform hover:-translate-y-1"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-zinc-100">{event.title}</h3>
                    <p className="text-xs text-zinc-500">{t("evt_hosted_by").replace("{name}", event.host_display_name)}</p>
                  </div>
                  {totalPrize(event) > 0 && (
                    <span className="shrink-0 rounded bg-amber-900/50 px-2 py-1 text-xs font-bold text-amber-300">
                      {formatPrize(totalPrize(event), t)}
                      {event.prize_mode === "split" && t("evt_split_suffix")}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {event.is_private && (
                    <span className="self-start rounded bg-amber-900/40 px-2 py-1 text-[11px] font-semibold text-amber-300">
                      {t("evt_private")}
                    </span>
                  )}
                  {(event.catalog_game_title || event.custom_game_title) && (
                    <span className="self-start rounded bg-sky-900/50 px-2 py-1 text-[11px] font-semibold text-sky-300">
                      {t("evt_tournament_prefix").replace("{name}", event.catalog_game_title || event.custom_game_title || "")}
                    </span>
                  )}
                  <span className="self-start rounded bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-400">
                    {event.format === "knockout" ? t("evt_card_knockout") : t("evt_format_open")}
                  </span>
                  {event.team_size > 1 && (
                    <span className="self-start rounded bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-400">
                      {t("evt_team_persons").replace("{n}", String(event.team_size))}
                    </span>
                  )}
                  {event.max_entries && (
                    <span className="self-start rounded bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-400">
                      {(event.team_size > 1 ? t("evt_max_teams") : t("evt_max_participants")).replace("{n}", String(event.max_entries))}
                    </span>
                  )}
                </div>

                {event.description && (
                  <p className="line-clamp-3 text-sm text-zinc-400">{event.description}</p>
                )}

                <div className="flex flex-col gap-1 text-xs text-zinc-500">
                  {deadline && (
                    <span className={open ? "" : "text-red-400"}>
                      {t("evt_registration_deadline")}: {deadline} {!open && t("evt_closed_suffix")}
                    </span>
                  )}
                  {starts && <span>{t("evt_start")}: {starts}</span>}
                  {ends && <span>{t("evt_end")}: {ends}</span>}
                  <span>{event.participant_count} {t("evt_participant_count_suffix")}</span>
                </div>

                <div className="mt-auto flex gap-2">
                  {token && !isHost && event.team_size <= 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        event.joined ? leaveEvent(event.id) : joinEvent(event.id);
                      }}
                      disabled={joiningId === event.id || (!event.joined && !open)}
                      className={`flex-1 rounded px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${
                        event.joined
                          ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                          : "bg-sky-600 text-white hover:bg-sky-500"
                      }`}
                    >
                      {joiningId === event.id
                        ? "..."
                        : event.joined
                          ? t("evt_card_leave")
                          : open
                            ? t("evt_join")
                            : t("evt_registration_closed")}
                    </button>
                  )}
                  {token && !isHost && event.team_size > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEventDetail(event.id);
                      }}
                      className="flex-1 rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
                    >
                      {t("evt_team_choose")}
                    </button>
                  )}
                  {isHost && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEvent(event.id);
                      }}
                      className="flex-1 rounded bg-red-900/40 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-900/60"
                    >
                      {t("evt_delete_event")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detailEvent && <EventDetailPage />}
    </div>
  );
}
