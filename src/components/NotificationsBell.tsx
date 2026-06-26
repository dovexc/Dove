import { useEffect, useMemo, useRef, useState } from "react";
import { useNotificationsStore } from "../notificationsStore";
import { useT } from "../translations";
import type { TranslationKey } from "../translations";

interface Props {
  onOpenEvent: (eventId: number) => void;
  onOpenFriends: () => void;
  onOpenProfile: () => void;
}

const POLL_MS = 20000;

function formatRelativeTime(value: string, t: (key: TranslationKey) => string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t("time_now");
  if (minutes < 60) return t("time_minutes_ago").replace("{n}", String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time_hours_ago").replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  return t("time_days_ago").replace("{n}", String(days));
}

export function NotificationsBell({ onOpenEvent, onOpenFriends, onOpenProfile }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const notifications = useNotificationsStore((s) => s.notifications);
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t("notif_title")}
        className="relative flex h-10 w-10 items-center justify-center rounded-[10px] border transition-colors"
        style={{
          borderColor: "rgba(255,255,255,.08)",
          background: "rgba(255,255,255,.04)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(58,160,255,.14)";
          e.currentTarget.style.borderColor = "rgba(120,180,240,.35)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,.04)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,.08)";
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9fb2c2"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white"
            style={{
              top: "-5px",
              right: "-5px",
              background: "#ff4655",
              border: "2px solid #141b24",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="text-sm font-semibold text-zinc-200">{t("notif_title")}</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-semibold text-sky-400 hover:underline"
              >
                {t("notif_mark_all_read")}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-zinc-500">{t("notif_none")}</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markRead(n.id);
                    if (n.event_id) {
                      setOpen(false);
                      onOpenEvent(n.event_id);
                    } else if (n.kind.startsWith("friend")) {
                      setOpen(false);
                      onOpenFriends();
                    } else if (n.kind === "badge_earned") {
                      setOpen(false);
                      onOpenProfile();
                    }
                  }}
                  className={`block w-full border-b border-zinc-800/60 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-zinc-800 ${
                    n.is_read ? "text-zinc-400" : "text-zinc-100"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-400" />
                    )}
                    <div className={n.is_read ? "" : "flex-1"}>
                      <p>{n.message}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {formatRelativeTime(n.created_at, t)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
