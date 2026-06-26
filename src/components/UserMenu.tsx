import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../authStore";
import { useT } from "../translations";

interface Props {
  displayName: string;
  avatarUrl: string | null;
  isAdmin?: boolean;
  onOpenProfile: () => void;
  onOpenFriends: () => void;
  onOpenSettings: () => void;
  onOpenModeration?: () => void;
  onOpenWishlist: () => void;
  onLogout: () => void;
}

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

export function UserMenu({
  displayName,
  avatarUrl,
  isAdmin,
  onOpenProfile,
  onOpenFriends,
  onOpenSettings,
  onOpenModeration,
  onOpenWishlist,
  onLogout,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        title={displayName}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-xs font-bold text-zinc-200 ring-1 ring-white/10 hover:ring-sky-400/50"
      >
        {resolveUrl(avatarUrl) ? (
          <img src={resolveUrl(avatarUrl)!} alt="" className="h-full w-full object-cover" />
        ) : (
          displayName.slice(0, 1).toUpperCase()
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-xl">
          <button
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
            className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
          >
            {t("menu_profile")}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onOpenFriends();
            }}
            className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
          >
            {t("menu_friends")}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
          >
            {t("menu_settings")}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onOpenWishlist();
            }}
            className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
          >
            {t("menu_wishlist")}
          </button>
          {isAdmin && onOpenModeration && (
            <button
              onClick={() => {
                setOpen(false);
                onOpenModeration();
              }}
              className="block w-full border-t border-zinc-800 px-3 py-2 text-left text-amber-300 hover:bg-zinc-800"
            >
              {t("menu_moderation")}
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="block w-full border-t border-zinc-800 px-3 py-2 text-left text-red-400 hover:bg-zinc-800"
          >
            {t("menu_logout")}
          </button>
        </div>
      )}
    </div>
  );
}
