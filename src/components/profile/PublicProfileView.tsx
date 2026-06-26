import { useState } from "react";
import { API_BASE } from "../../authStore";
import type { PublicProfile } from "../../types";
import { PublicWishlistView } from "./PublicWishlistView";

export type FriendStatus = "none" | "friends" | "pending_outgoing" | "pending_incoming";

interface Props {
  profile: PublicProfile;
  onClose: () => void;
  friendStatus?: FriendStatus;
  friendActionBusy?: boolean;
  onSendFriendRequest?: () => void;
  onAcceptFriendRequest?: () => void;
  onRemoveFriend?: () => void;
  onOpenChat?: () => void;
}

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

export function PublicProfileView({
  profile,
  onClose,
  friendStatus,
  friendActionBusy,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRemoveFriend,
  onOpenChat,
}: Props) {
  const backgroundUrl = resolveUrl(profile.background_url);
  const avatarUrl = resolveUrl(profile.avatar_url);
  const [showWishlist, setShowWishlist] = useState(false);

  function renderFriendButton() {
    if (!friendStatus) return null;
    if (friendStatus === "friends") {
      return (
        <button
          onClick={onRemoveFriend}
          disabled={friendActionBusy}
          className="rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5 text-[13px] font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-50"
        >
          Freund entfernen
        </button>
      );
    }
    if (friendStatus === "pending_incoming") {
      return (
        <button
          onClick={onAcceptFriendRequest}
          disabled={friendActionBusy}
          className="rounded-md bg-emerald-600 px-3.5 py-1.5 text-[13px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Anfrage annehmen
        </button>
      );
    }
    if (friendStatus === "pending_outgoing") {
      return (
        <span className="rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5 text-[13px] font-bold text-zinc-400">
          Anfrage gesendet
        </span>
      );
    }
    return (
      <button
        onClick={onSendFriendRequest}
        disabled={friendActionBusy}
        className="rounded-md border border-sky-400/30 bg-sky-500/10 px-3.5 py-1.5 text-[13px] font-bold text-sky-300 hover:bg-sky-500/20 hover:text-white disabled:opacity-50"
      >
        Als Freund hinzufügen
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b1016]">
      <div
        className="relative h-[280px] w-full bg-cover bg-center"
        style={{
          background: backgroundUrl
            ? `url(${backgroundUrl}) center/cover`
            : "linear-gradient(125deg,#1c3a5e 0%,#2c1f4a 50%,#3a2151 100%)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1016]/15 via-[#0b1016]/55 to-[#0b1016]" />
        <button
          onClick={onClose}
          className="absolute right-8 top-4 rounded-md bg-black/40 px-3.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-black/60"
        >
          Schließen
        </button>
      </div>

      <div className="relative z-[2] mx-auto max-w-[1180px] px-10 pb-[90px]">
        <div className="-mt-[72px] flex flex-wrap items-end gap-6">
          <div className="shrink-0">
            <div
              className="flex h-[148px] w-[148px] items-center justify-center rounded-3xl border-4 border-[#0b1016] text-5xl font-black text-white shadow-2xl"
              style={{ background: "linear-gradient(135deg,#3aa0ff,#7b4397)" }}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full rounded-3xl object-cover" />
              ) : (
                profile.display_name.slice(0, 1).toUpperCase()
              )}
            </div>
          </div>

          <div className="flex-1 pb-2">
            <div className="flex flex-wrap items-center gap-3.5">
              <h1 className="text-[38px] font-black tracking-tight text-white">
                {profile.display_name}
              </h1>
              {profile.equipped_badge && (
                <span
                  title={profile.equipped_badge.description}
                  className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[13px] font-bold text-amber-300"
                >
                  <span>{profile.equipped_badge.icon}</span>
                  {profile.equipped_badge.label}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 pb-2">
            {friendStatus === "friends" && onOpenChat && (
              <button
                onClick={onOpenChat}
                className="rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5 text-[13px] font-bold text-zinc-300 hover:bg-white/10"
              >
                💬 Chat
              </button>
            )}
            <button
              onClick={() => setShowWishlist(true)}
              className="rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5 text-[13px] font-bold text-zinc-300 hover:bg-white/10"
            >
              ♥ Wunschliste
            </button>
            {renderFriendButton()}
          </div>
        </div>

        <div className="mt-[30px] flex flex-col gap-[30px]">
          <div>
            <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
              Über mich
            </div>
            <div className="rounded-[11px] border border-white/[0.06] bg-gradient-to-b from-[#141d27] to-[#111923] px-[22px] py-[22px] text-[15px] text-[#c7d5e0]">
              {profile.bio || "Keine Beschreibung vorhanden."}
            </div>
          </div>

          <div>
            <div className="mb-3 text-[13px] font-extrabold uppercase tracking-[2px] text-[#5b8db8]">
              Screenshots
            </div>
            {profile.screenshots.length === 0 ? (
              <p className="text-sm text-zinc-500">Noch keine Screenshots vorhanden.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {profile.screenshots.map((s) => (
                  <div
                    key={s.id}
                    className="aspect-[16/10] overflow-hidden rounded-[9px] bg-zinc-900"
                  >
                    <img
                      src={resolveUrl(s.image_url) ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showWishlist && (
        <PublicWishlistView
          ownerName={profile.display_name}
          games={profile.wishlist}
          onBack={() => setShowWishlist(false)}
        />
      )}
    </div>
  );
}
