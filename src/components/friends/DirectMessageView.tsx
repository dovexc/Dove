import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useChatStore } from "../../chatStore";
import { useT } from "../../translations";
import type { UserSummary } from "../../types";

const POLL_MS = 4000;

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  friend: UserSummary;
  onClose: () => void;
}

export function DirectMessageView({ friend, onClose }: Props) {
  const t = useT();
  const messages = useChatStore((s) => s.directMessages);
  const sending = useChatStore((s) => s.sendingDirect);
  const error = useChatStore((s) => s.error);
  const openDirectChat = useChatStore((s) => s.openDirectChat);
  const closeDirectChat = useChatStore((s) => s.closeDirectChat);
  const refreshDirectMessages = useChatStore((s) => s.refreshDirectMessages);
  const sendDirectMessage = useChatStore((s) => s.sendDirectMessage);
  const clearError = useChatStore((s) => s.clearError);
  const authUser = useAuthStore((s) => s.user);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openDirectChat(friend.id);
    const interval = setInterval(refreshDirectMessages, POLL_MS);
    return () => {
      clearInterval(interval);
      closeDirectChat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friend.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    await sendDirectMessage(draft);
    setDraft("");
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60">
      <div className="flex h-[640px] w-[460px] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#0f161e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <span className="text-base font-bold text-zinc-100">{friend.display_name}</span>
          <button
            onClick={onClose}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            {t("close")}
          </button>
        </div>

        {error && (
          <div className="flex items-center justify-between bg-red-900/30 px-4 py-2 text-xs text-red-400">
            <span>{error}</span>
            <button onClick={clearError} className="font-bold">
              ✕
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("chat_no_messages")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {messages.map((m) => {
                const mine = m.sender_id === authUser?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        mine ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-100"
                      }`}
                    >
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
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form onSubmit={handleSend} className="flex gap-2 border-t border-zinc-800 p-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("chat_placeholder")}
            autoFocus
            className="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {t("chat_send")}
          </button>
        </form>
      </div>
    </div>
  );
}
