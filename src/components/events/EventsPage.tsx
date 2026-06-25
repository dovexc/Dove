import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";
import { useEventsStore } from "../../eventsStore";
import { EventDetailPage } from "./EventDetailPage";
import type { GameEvent } from "../../types";

function formatPrize(priceCents: number): string {
  return priceCents === 0 ? "Kein Preisgeld" : `${(priceCents / 100).toFixed(2)} €`;
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
    await createEvent({
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
    });
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
          Game Jams &amp; Turniere
        </h2>
        {token && (
          <button
            onClick={() => setShowHostForm((v) => !v)}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            {showHostForm ? "Abbrechen" : "Event hosten"}
          </button>
        )}
      </div>

      {!token && (
        <p className="text-sm text-zinc-500">
          Melde dich an, um Events zu hosten oder beizutreten.
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
            Titel
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Beschreibung
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Regeln, Thema, Format, ..."
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            Verknüpftes Spiel (optional, für Turniere)
            <select
              value={catalogGameId}
              onChange={(e) => setCatalogGameId(e.target.value)}
              className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            >
              <option value="">Kein bestimmtes Spiel (Game Jam)</option>
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
              Oder eigenes Spiel angeben (nicht im Game Launcher)
              <input
                value={customGameTitle}
                onChange={(e) => setCustomGameTitle(e.target.value)}
                placeholder="z. B. Fortnite, Valorant, ..."
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
          )}
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Anmeldeschluss
              <input
                type="date"
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Start
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Ende
              <input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm text-zinc-300">
            {prizeMode === "split" ? "Preisgeld 1. Platz (€)" : "Preisgeld (€)"}
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
            Aufteilung des Preisgelds
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="prizeMode"
                  checked={prizeMode === "winner_takes_all"}
                  onChange={() => setPrizeMode("winner_takes_all")}
                />
                Winner takes it all
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="prizeMode"
                  checked={prizeMode === "split"}
                  onChange={() => setPrizeMode("split")}
                />
                Aufteilung auf Platz 1–3
              </label>
            </div>
          </div>

          {prizeMode === "split" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-zinc-300">
                Preisgeld 2. Platz (€)
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
                Preisgeld 3. Platz (€)
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

          <button
            type="submit"
            className="self-end rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            Veröffentlichen
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          Art:
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700"
          >
            <option value="all">Alle</option>
            <option value="jam">Game Jams</option>
            <option value="tournament">Turniere</option>
          </select>
        </div>
        <div className="flex h-[42px] items-center gap-2 rounded-lg border border-white/10 bg-[#10171f] px-3">
          <span className="text-zinc-500">🔍</span>
          <input
            value={gameSearch}
            onChange={(e) => setGameSearch(e.target.value)}
            placeholder="Turnier nach Spiel suchen"
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
          Nur offene Anmeldung
        </button>
        <button
          onClick={() => setOnlyWithPrize((v) => !v)}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
            onlyWithPrize
              ? "border-sky-400/50 bg-gradient-to-b from-sky-500 to-sky-700 text-white"
              : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10"
          }`}
        >
          Nur mit Preisgeld
        </button>
        <div className="flex h-[42px] items-center gap-2 rounded-lg border border-white/10 bg-[#10171f] px-3">
          <span className="text-zinc-500">€</span>
          <input
            type="number"
            min="0"
            value={minPrizeEuros}
            onChange={(e) => setMinPrizeEuros(e.target.value)}
            placeholder="Mind. Preisgeld"
            className="w-32 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          Sortieren:
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700"
          >
            <option value="deadline">Anmeldeschluss</option>
            <option value="prize">Preisgeld</option>
            <option value="newest">Neueste</option>
            <option value="game">Spiel</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Events werden geladen...</p>
      ) : filteredEvents.length === 0 ? (
        <p className="text-sm text-zinc-500">Keine Events gefunden.</p>
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
                    <p className="text-xs text-zinc-500">von {event.host_display_name}</p>
                  </div>
                  {totalPrize(event) > 0 && (
                    <span className="shrink-0 rounded bg-amber-900/50 px-2 py-1 text-xs font-bold text-amber-300">
                      {formatPrize(totalPrize(event))}
                      {event.prize_mode === "split" && " (aufgeteilt)"}
                    </span>
                  )}
                </div>

                {(event.catalog_game_title || event.custom_game_title) && (
                  <span className="self-start rounded bg-sky-900/50 px-2 py-1 text-[11px] font-semibold text-sky-300">
                    Turnier: {event.catalog_game_title || event.custom_game_title}
                  </span>
                )}

                {event.description && (
                  <p className="line-clamp-3 text-sm text-zinc-400">{event.description}</p>
                )}

                <div className="flex flex-col gap-1 text-xs text-zinc-500">
                  {deadline && (
                    <span className={open ? "" : "text-red-400"}>
                      Anmeldeschluss: {deadline} {!open && "(geschlossen)"}
                    </span>
                  )}
                  {starts && <span>Start: {starts}</span>}
                  {ends && <span>Ende: {ends}</span>}
                  <span>{event.participant_count} Teilnehmer</span>
                </div>

                <div className="mt-auto flex gap-2">
                  {token && !isHost && (
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
                          ? "Verlassen"
                          : open
                            ? "Beitreten"
                            : "Anmeldung geschlossen"}
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
                      Event löschen
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
