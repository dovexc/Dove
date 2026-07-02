import { useEffect, useMemo, useState } from "react";
import { useFriendsStore } from "../../friendsStore";
import { API_BASE } from "../../authStore";
import { ChatIcon, SearchIcon } from "../icons";
import { PublicProfileView, type FriendStatus } from "../profile/PublicProfileView";
import { DirectMessageView } from "./DirectMessageView";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { UserSummary } from "../../types";

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#2b5876,#4e4376)",
  "linear-gradient(135deg,#0052d4,#65c7f7)",
  "linear-gradient(135deg,#614385,#516395)",
  "linear-gradient(135deg,#c31432,#240b36)",
  "linear-gradient(135deg,#56ab2f,#a8e063)",
  "linear-gradient(135deg,#360033,#0b8793)",
];

function avatarGradient(id: number): string {
  return AVATAR_GRADIENTS[id % AVATAR_GRADIENTS.length];
}

function statusStyle(
  status: string,
  t: (key: TranslationKey) => string
): { text: string; label: string } {
  switch (status) {
    case "friends":
      return { text: "#7fe39a", label: t("fr_status_friends") };
    case "pending_outgoing":
      return { text: "#7b8794", label: t("fr_status_pending_outgoing") };
    case "pending_incoming":
      return { text: "#9fe3ff", label: t("fr_status_pending_incoming") };
    default:
      return { text: "#7b8794", label: "" };
  }
}

interface Props {
  onClose: () => void;
}

type Tab = "freunde" | "suche" | "anfragen";

const FRIENDS_POLL_MS = 20000;
const SEARCH_DEBOUNCE_MS = 300;

function Avatar({ user }: { user: UserSummary }) {
  const url = resolveUrl(user.avatar_url);
  return (
    <div className="relative shrink-0">
      <div
        className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-[14px] text-xl font-extrabold text-white"
        style={{ background: avatarGradient(user.id) }}
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          user.display_name.slice(0, 1).toUpperCase()
        )}
      </div>
      <span
        className="absolute -bottom-0.5 -right-0.5 h-[15px] w-[15px] rounded-full border-[3px]"
        style={{
          borderColor: "#131b24",
          background: user.online ? "#5fd17a" : "#5b6671",
        }}
      />
    </div>
  );
}

function FriendCard({
  user,
  status,
  actionLabel,
  onAction,
  onOpen,
  onChat,
  busy,
  showOnlineStatus,
}: {
  user: UserSummary;
  status: FriendStatus;
  actionLabel?: string;
  onAction?: () => void;
  onOpen: () => void;
  onChat?: () => void;
  busy?: boolean;
  showOnlineStatus?: boolean;
}) {
  const t = useT();
  const statusInfo = showOnlineStatus
    ? user.online
      ? { text: "#7fe39a", label: t("fr_online") }
      : { text: "#7b8794", label: t("fr_offline") }
    : statusStyle(status, t);
  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-center gap-4 rounded-[11px] border border-white/[0.06] p-4 transition-all hover:-translate-y-[3px] hover:border-sky-400/30 hover:shadow-2xl"
      style={{ background: "linear-gradient(180deg,#161f2a,#121a23)" }}
    >
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-bold text-zinc-100">{user.display_name}</div>
        {showOnlineStatus && user.online && user.playing_title ? (
          <div className="mt-0.5 truncate text-[13px] font-semibold" style={{ color: "#66c0f4" }}>
            {t("fr_playing")}: {user.playing_title}
          </div>
        ) : (
          statusInfo.label && (
            <div className="mt-0.5 text-[13px]" style={{ color: statusInfo.text }}>
              {statusInfo.label}
            </div>
          )
        )}
      </div>
      {onChat && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChat();
          }}
          title={t("fr_chat")}
          className="flex shrink-0 items-center gap-1.5 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-2 text-[13px] font-bold text-zinc-300 hover:bg-white/10 hover:text-white"
        >
          <ChatIcon size={14} />
          {t("fr_chat_label")}
        </button>
      )}
      {actionLabel && onAction && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          disabled={busy}
          className="shrink-0 rounded-[7px] border border-sky-400/30 bg-sky-500/10 px-3.5 py-2 text-[13px] font-bold text-sky-300 hover:bg-sky-500/25 hover:text-white disabled:opacity-50"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function FriendsView({ onClose }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("freunde");
  const [chatFriend, setChatFriend] = useState<UserSummary | null>(null);

  const query = useFriendsStore((s) => s.query);
  const setQuery = useFriendsStore((s) => s.setQuery);
  const results = useFriendsStore((s) => s.results);
  const clearResults = useFriendsStore((s) => s.clearResults);
  const searching = useFriendsStore((s) => s.searching);
  const search = useFriendsStore((s) => s.search);
  const viewProfile = useFriendsStore((s) => s.viewProfile);
  const viewedProfile = useFriendsStore((s) => s.viewedProfile);
  const closeProfile = useFriendsStore((s) => s.closeProfile);
  const error = useFriendsStore((s) => s.error);

  const friends = useFriendsStore((s) => s.friends);
  const requests = useFriendsStore((s) => s.requests);
  const loadingFriends = useFriendsStore((s) => s.loadingFriends);
  const pendingActionId = useFriendsStore((s) => s.pendingActionId);
  const fetchFriends = useFriendsStore((s) => s.fetchFriends);
  const fetchFriendRequests = useFriendsStore((s) => s.fetchFriendRequests);
  const sendFriendRequest = useFriendsStore((s) => s.sendFriendRequest);
  const acceptFriendRequest = useFriendsStore((s) => s.acceptFriendRequest);
  const removeFriend = useFriendsStore((s) => s.removeFriend);

  useEffect(() => {
    fetchFriends();
    fetchFriendRequests();
    const interval = setInterval(() => {
      fetchFriends();
      fetchFriendRequests();
    }, FRIENDS_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      clearResults();
      return;
    }
    const timeout = setTimeout(() => search(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const sortedFriends = useMemo(
    () => [...friends].sort((a, b) => Number(b.online) - Number(a.online)),
    [friends]
  );

  const friendStatusOf = useMemo(() => {
    return (userId: number): FriendStatus => {
      if (friends.some((f) => f.id === userId)) return "friends";
      if (requests.incoming.some((f) => f.id === userId)) return "pending_incoming";
      if (requests.outgoing.some((f) => f.id === userId)) return "pending_outgoing";
      return "none";
    };
  }, [friends, requests]);

  const viewedStatus = viewedProfile ? friendStatusOf(viewedProfile.id) : "none";

  const tabs: [Tab, string][] = [
    ["freunde", `${t("fr_tab_friends")} (${friends.length})`],
    ["suche", t("fr_tab_search")],
    ["anfragen", `${t("fr_tab_requests")} (${requests.incoming.length})`],
  ];

  return (
    <div
      className="h-full flex flex-col overflow-y-auto"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -150px, #1c2c3e 0%, #0d141c 55%, #0b1016 100%)",
      }}
    >
      <div className="mx-auto w-full max-w-[1500px] flex-1 px-10 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="mb-2 text-[13px] font-bold uppercase tracking-[4px] text-[#5b8db8]">
              {t("fr_friends_label")}
            </div>
            <div className="flex items-center gap-3.5">
              <h1 className="m-0 text-[32px] font-black tracking-tight text-white">
                {t("fr_your_friends")}
              </h1>
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[13px] font-semibold text-emerald-300">
                <span
                  className="h-2 w-2 rounded-full bg-emerald-400"
                  style={{ boxShadow: "0 0 8px #5fd17a" }}
                />
                {friends.length} {t("fr_friends_label")}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10 hover:text-white"
          >
            {t("fr_close")}
          </button>
        </div>

        <div className="mb-6 flex gap-2 border-b border-white/[0.06]">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="relative px-5 pb-4 pt-3 text-[15px] font-bold"
              style={{ color: tab === key ? "#ffffff" : "#7e8c99" }}
            >
              {label}
              {tab === key && (
                <span
                  className="absolute bottom-0 left-3.5 right-3.5 h-[3px] rounded-t-[3px]"
                  style={{ background: "linear-gradient(90deg,#3aa0ff,#66c0f4)" }}
                />
              )}
            </button>
          ))}
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        {tab === "suche" && (
          <div className="flex flex-col gap-7">
            <div className="flex gap-3">
              <div className="flex h-[50px] max-w-[560px] flex-1 items-center gap-3 rounded-lg border border-white/[0.08] bg-[#10171f] px-4">
                <span className="text-[#5b6b7a]"><SearchIcon size={16} /></span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder={t("fr_search_placeholder")}
                  className="flex-1 bg-transparent text-[15px] text-[#dbe7f2] outline-none placeholder:text-[#5b6b7a]"
                />
              </div>
            </div>

            {!query.trim() ? (
              <p className="text-sm text-zinc-500">{t("fr_search_hint")}</p>
            ) : searching ? (
              <p className="text-sm text-zinc-500">{t("fr_searching")}</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("fr_no_users_found")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((user) => {
                  const status = friendStatusOf(user.id);
                  return (
                    <FriendCard
                      key={user.id}
                      user={user}
                      status={status}
                      onOpen={() => viewProfile(user.id)}
                      actionLabel={status === "none" ? t("fr_add") : undefined}
                      onAction={status === "none" ? () => sendFriendRequest(user.id) : undefined}
                      busy={pendingActionId === user.id}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "freunde" && (
          <div className="flex flex-col gap-4">
            {loadingFriends ? (
              <p className="text-sm text-zinc-500">{t("fr_loading")}</p>
            ) : friends.length === 0 ? (
              <p className="text-sm text-zinc-500">{t("fr_no_friends")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sortedFriends.map((user) => (
                  <FriendCard
                    key={user.id}
                    user={user}
                    status="friends"
                    showOnlineStatus
                    onOpen={() => viewProfile(user.id)}
                    onChat={() => setChatFriend(user)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "anfragen" && (
          <div className="flex flex-col gap-8">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {t("fr_incoming")}
              </h3>
              {requests.incoming.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("fr_no_incoming")}</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {requests.incoming.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-4 rounded-[11px] border border-white/[0.06] p-4"
                      style={{ background: "linear-gradient(180deg,#161f2a,#121a23)" }}
                    >
                      <Avatar user={user} />
                      <span className="min-w-0 flex-1 truncate text-base font-bold text-zinc-100">
                        {user.display_name}
                      </span>
                      <button
                        onClick={() => acceptFriendRequest(user.id)}
                        disabled={pendingActionId === user.id}
                        className="shrink-0 rounded-[7px] bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {t("fr_accept")}
                      </button>
                      <button
                        onClick={() => removeFriend(user.id)}
                        disabled={pendingActionId === user.id}
                        className="shrink-0 rounded-[7px] border border-white/10 bg-white/5 px-3.5 py-2 text-[13px] font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-50"
                      >
                        {t("fr_decline")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                {t("fr_outgoing")}
              </h3>
              {requests.outgoing.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("fr_no_outgoing")}</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {requests.outgoing.map((user) => (
                    <FriendCard
                      key={user.id}
                      user={user}
                      status="pending_outgoing"
                      onOpen={() => viewProfile(user.id)}
                      actionLabel={t("fr_withdraw")}
                      onAction={() => removeFriend(user.id)}
                      busy={pendingActionId === user.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {viewedProfile && (
        <PublicProfileView
          profile={viewedProfile}
          onClose={closeProfile}
          friendStatus={viewedStatus}
          friendActionBusy={pendingActionId === viewedProfile.id}
          onSendFriendRequest={() => sendFriendRequest(viewedProfile.id)}
          onAcceptFriendRequest={() => acceptFriendRequest(viewedProfile.id)}
          onRemoveFriend={() => removeFriend(viewedProfile.id)}
          onOpenChat={() =>
            setChatFriend({
              id: viewedProfile.id,
              display_name: viewedProfile.display_name,
              avatar_url: viewedProfile.avatar_url,
              online: false,
              playing_title: null,
            })
          }
        />
      )}

      {chatFriend && (
        <DirectMessageView friend={chatFriend} onClose={() => setChatFriend(null)} />
      )}
    </div>
  );
}
