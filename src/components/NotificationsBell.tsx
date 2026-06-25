import { useEffect, useMemo, useRef, useState } from "react";
import { useNotificationsStore } from "../notificationsStore";

interface Props {
  onOpenEvent: (eventId: number) => void;
}

const POLL_MS = 20000;

function formatRelativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "jetzt";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tagen`;
}

export function NotificationsBell({ onOpenEvent }: Props) {
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
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 hover:bg-white/5 hover:text-white"
        title="Benachrichtigungen"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="text-sm font-semibold text-zinc-200">Benachrichtigungen</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-semibold text-sky-400 hover:underline"
              >
                Alle als gelesen
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-zinc-500">
                Keine Benachrichtigungen.
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markRead(n.id);
                    if (n.event_id) {
                      setOpen(false);
                      onOpenEvent(n.event_id);
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
                        {formatRelativeTime(n.created_at)}
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
