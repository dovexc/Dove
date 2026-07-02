import { create } from "zustand";
import { API_BASE, getAuthHeader, useAuthStore } from "./authStore";
import type {
  EventBracket,
  EventTeam,
  GameEvent,
  NewGameEvent,
  TournamentPayout,
  UserSummary,
} from "./types";

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `Fehler (${response.status})`;
}

interface EventsState {
  events: GameEvent[];
  loading: boolean;
  error: string | null;
  joiningId: number | null;
  detailEvent: GameEvent | null;
  detailEventCode: string | null;
  detailParticipants: UserSummary[];
  detailTeams: EventTeam[];
  detailBracket: EventBracket | null;
  detailLoading: boolean;
  teamActionPending: boolean;
  payouts: TournamentPayout[];
  payoutsLoading: boolean;
  fetchPayouts: () => Promise<void>;
  fetchEvents: () => Promise<void>;
  createEvent: (event: NewGameEvent) => Promise<GameEvent | null>;
  deleteEvent: (eventId: number) => Promise<void>;
  joinEvent: (eventId: number) => Promise<void>;
  leaveEvent: (eventId: number) => Promise<void>;
  createTeam: (eventId: number, name: string) => Promise<void>;
  joinTeam: (eventId: number, teamId: number) => Promise<void>;
  removeParticipant: (eventId: number, userId: number) => Promise<void>;
  startTournament: (eventId: number) => Promise<void>;
  setMatchWinner: (eventId: number, matchId: number, winnerEntryId: number) => Promise<void>;
  findEventByCode: (code: string) => Promise<void>;
  clearError: () => void;
  openEventDetail: (eventId: number) => Promise<void>;
  closeEventDetail: () => void;
}

async function fetchDetailExtras(eventId: number) {
  const [eventRes, participantsRes, teamsRes, bracketRes] = await Promise.all([
    fetch(`${API_BASE}/api/events/${eventId}`, { headers: getAuthHeader() }),
    fetch(`${API_BASE}/api/events/${eventId}/participants`),
    fetch(`${API_BASE}/api/events/${eventId}/teams`),
    fetch(`${API_BASE}/api/events/${eventId}/bracket`),
  ]);
  if (!eventRes.ok) throw new Error(await errorMessage(eventRes));
  const detailEvent: GameEvent = await eventRes.json();
  const detailParticipants: UserSummary[] = participantsRes.ok ? await participantsRes.json() : [];
  const detailTeams: EventTeam[] = teamsRes.ok ? await teamsRes.json() : [];
  const detailBracket: EventBracket | null = bracketRes.ok ? await bracketRes.json() : null;
  return { detailEvent, detailParticipants, detailTeams, detailBracket };
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  loading: false,
  error: null,
  joiningId: null,
  detailEvent: null,
  detailEventCode: null,
  detailParticipants: [],
  detailTeams: [],
  detailBracket: null,
  detailLoading: false,
  teamActionPending: false,
  payouts: [],
  payoutsLoading: false,

  fetchPayouts: async () => {
    const headers = getAuthHeader();
    if (!headers.Authorization) {
      set({ payouts: [] });
      return;
    }
    set({ payoutsLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/me/tournament-payouts`, { headers });
      if (!response.ok) throw new Error(await errorMessage(response));
      const payouts: TournamentPayout[] = await response.json();
      set({ payouts, payoutsLoading: false });
    } catch (e) {
      set({ error: String(e), payoutsLoading: false });
    }
  },

  fetchEvents: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/events`, { headers: getAuthHeader() });
      if (!response.ok) throw new Error(await errorMessage(response));
      const events: GameEvent[] = await response.json();
      set({ events, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createEvent: async (event) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify(event),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const created: GameEvent = await response.json();
      await get().fetchEvents();
      return created;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  deleteEvent: async (eventId) => {
    set({ error: null });
    try {
      const response = await fetch(`${API_BASE}/api/events/${eventId}`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok && response.status !== 404) throw new Error(await errorMessage(response));
      set({ events: get().events.filter((e) => e.id !== eventId) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  joinEvent: async (eventId) => {
    set({ error: null, joiningId: eventId });
    try {
      const code = get().detailEvent?.id === eventId ? get().detailEventCode : null;
      const response = await fetch(`${API_BASE}/api/events/${eventId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const bump = (e: GameEvent) =>
        e.id === eventId ? { ...e, joined: true, participant_count: e.participant_count + 1 } : e;
      const me = useAuthStore.getState().user;
      set((state) => ({
        events: state.events.map(bump),
        detailEvent: state.detailEvent ? bump(state.detailEvent) : state.detailEvent,
        detailParticipants:
          state.detailEvent?.id === eventId && me && !state.detailParticipants.some((p) => p.id === me.id)
            ? [
                ...state.detailParticipants,
                { id: me.id, display_name: me.display_name, avatar_url: me.avatar_url, online: true, playing_title: null },
              ]
            : state.detailParticipants,
      }));
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ joiningId: null });
    }
  },

  leaveEvent: async (eventId) => {
    set({ error: null, joiningId: eventId });
    try {
      const response = await fetch(`${API_BASE}/api/events/${eventId}/join`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const drop = (e: GameEvent) =>
        e.id === eventId
          ? { ...e, joined: false, participant_count: Math.max(0, e.participant_count - 1) }
          : e;
      const me = useAuthStore.getState().user;
      set((state) => ({
        events: state.events.map(drop),
        detailEvent: state.detailEvent ? drop(state.detailEvent) : state.detailEvent,
        detailParticipants:
          state.detailEvent?.id === eventId && me
            ? state.detailParticipants.filter((p) => p.id !== me.id)
            : state.detailParticipants,
        detailTeams:
          state.detailEvent?.id === eventId && me
            ? state.detailTeams
                .map((t) => ({ ...t, members: t.members.filter((m) => m.id !== me.id) }))
                .filter((t) => t.members.length > 0)
            : state.detailTeams,
      }));
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ joiningId: null });
    }
  },

  createTeam: async (eventId, name) => {
    set({ error: null, teamActionPending: true });
    try {
      const code = get().detailEvent?.id === eventId ? get().detailEventCode : null;
      const response = await fetch(`${API_BASE}/api/events/${eventId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ name, code }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const extras = await fetchDetailExtras(eventId);
      set(extras);
      await get().fetchEvents();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ teamActionPending: false });
    }
  },

  removeParticipant: async (eventId, userId) => {
    set({ error: null, teamActionPending: true });
    try {
      const response = await fetch(`${API_BASE}/api/events/${eventId}/participants/${userId}`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const extras = await fetchDetailExtras(eventId);
      set(extras);
      await get().fetchEvents();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ teamActionPending: false });
    }
  },

  joinTeam: async (eventId, teamId) => {
    set({ error: null, teamActionPending: true });
    try {
      const code = get().detailEvent?.id === eventId ? get().detailEventCode : null;
      const response = await fetch(`${API_BASE}/api/events/${eventId}/teams/${teamId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const extras = await fetchDetailExtras(eventId);
      set(extras);
      await get().fetchEvents();
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ teamActionPending: false });
    }
  },

  startTournament: async (eventId) => {
    set({ error: null, teamActionPending: true });
    try {
      const response = await fetch(`${API_BASE}/api/events/${eventId}/start`, {
        method: "POST",
        headers: getAuthHeader(),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const detailBracket: EventBracket = await response.json();
      set({ detailBracket });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ teamActionPending: false });
    }
  },

  setMatchWinner: async (eventId, matchId, winnerEntryId) => {
    set({ error: null, teamActionPending: true });
    try {
      const response = await fetch(`${API_BASE}/api/events/${eventId}/matches/${matchId}/winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ winner_entry_id: winnerEntryId }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const detailBracket: EventBracket = await response.json();
      set({ detailBracket });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ teamActionPending: false });
    }
  },

  findEventByCode: async (code) => {
    set({ detailLoading: true, error: null });
    try {
      const response = await fetch(`${API_BASE}/api/events/by-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const found: GameEvent = await response.json();
      const extras = await fetchDetailExtras(found.id);
      set({ ...extras, detailEventCode: code.trim().toUpperCase(), detailLoading: false });
    } catch (e) {
      set({ error: String(e), detailLoading: false });
    }
  },

  clearError: () => set({ error: null }),

  openEventDetail: async (eventId) => {
    set({ detailLoading: true, error: null, detailEventCode: null });
    try {
      const extras = await fetchDetailExtras(eventId);
      set({ ...extras, detailLoading: false });
    } catch (e) {
      set({ error: String(e), detailLoading: false });
    }
  },

  closeEventDetail: () =>
    set({
      detailEvent: null,
      detailEventCode: null,
      detailParticipants: [],
      detailTeams: [],
      detailBracket: null,
    }),
}));
