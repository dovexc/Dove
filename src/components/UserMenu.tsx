import { useEffect, useRef, useState } from "react";

interface Props {
  displayName: string;
  isAdmin?: boolean;
  onOpenProfile: () => void;
  onOpenFriends: () => void;
  onOpenSettings: () => void;
  onOpenModeration?: () => void;
}

export function UserMenu({
  displayName,
  isAdmin,
  onOpenProfile,
  onOpenFriends,
  onOpenSettings,
  onOpenModeration,
}: Props) {
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
        className="text-sm text-[#9aa7b3] hover:text-zinc-200 hover:underline"
      >
        {displayName}
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
            Profil
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onOpenFriends();
            }}
            className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
          >
            Freunde
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
            className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
          >
            Einstellungen
          </button>
          {isAdmin && onOpenModeration && (
            <button
              onClick={() => {
                setOpen(false);
                onOpenModeration();
              }}
              className="block w-full border-t border-zinc-800 px-3 py-2 text-left text-amber-300 hover:bg-zinc-800"
            >
              Moderation
            </button>
          )}
        </div>
      )}
    </div>
  );
}
