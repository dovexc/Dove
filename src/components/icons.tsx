import type { ReactElement } from "react";

// Shared, minimal line-icon set — outlined, single-color (`currentColor`),
// no gradients/multi-color detail. Used in place of pictographic emoji
// throughout the UI for a flatter, more consistent look. Simple typographic
// symbols that already render as plain glyphs (✕ ✓ ← → ★ ♥) are left as-is;
// this set only covers the detailed/colorful pictograph emoji that used to
// live inline in JSX and translation strings.

export interface IconProps {
  className?: string;
  size?: number;
}

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SearchIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export function TagIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M3 11.5V4a1 1 0 0 1 1-1h7.5L21 11.5l-9.5 9.5L3 11.5z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LockIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function TrophyIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H4.5a1 1 0 0 0-1 1.1c.2 2 1.4 3.6 3.5 4" />
      <path d="M17 5h2.5a1 1 0 0 1 1 1.1c-.2 2-1.4 3.6-3.5 4" />
      <path d="M12 13v4" />
      <path d="M8.5 21h7" />
      <path d="M10 17h4l1 4h-6l1-4z" />
    </svg>
  );
}

export function MedalIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M8 3h8l3 6-5 3-2-2-2 2-5-3 3-6z" />
      <circle cx="12" cy="15" r="6" />
      <path d="M12 12v6" />
    </svg>
  );
}

export function ThumbsUpIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M7 10.5v10" />
      <path d="M11 20.5h6.4a2 2 0 0 0 2-1.7l1-6.5a2 2 0 0 0-2-2.3h-5l.7-4.2a1.6 1.6 0 0 0-3-1L7 10.5" />
    </svg>
  );
}

export function ThumbsDownIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ transform: "rotate(180deg)" }}
      {...base}
    >
      <path d="M7 10.5v10" />
      <path d="M11 20.5h6.4a2 2 0 0 0 2-1.7l1-6.5a2 2 0 0 0-2-2.3h-5l.7-4.2a1.6 1.6 0 0 0-3-1L7 10.5" />
    </svg>
  );
}

export function WarningIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M10.6 3.9 2.4 18.5a1.5 1.5 0 0 0 1.3 2.2h16.6a1.5 1.5 0 0 0 1.3-2.2L13.4 3.9a1.5 1.5 0 0 0-2.8 0z" />
      <path d="M12 9.5v4.2" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function CartIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="9" cy="20" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1.3" fill="currentColor" stroke="none" />
      <path d="M2.5 3h2l2.6 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7.5H5.8" />
    </svg>
  );
}

export function PeopleIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" />
      <path d="M15.8 8.2a3.2 3.2 0 1 1 3.5 3.2" />
      <path d="M15.3 14.3a6.2 6.2 0 0 1 5.9 5.7" />
    </svg>
  );
}

export function GamepadIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="2" y="7" width="20" height="11" rx="5.5" />
      <path d="M7 10v4" />
      <path d="M5 12h4" />
      <circle cx="16" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="18.3" cy="13" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ChatIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 4.5h16v12H8.5L4 20.5v-16z" />
    </svg>
  );
}

export function MicIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5v4" />
      <path d="M8.5 21.5h7" />
    </svg>
  );
}

export function MegaphoneIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M3 10v4a1 1 0 0 0 1 1h2l1 5h2l-.6-5H10l9 4V5l-9 4H4a1 1 0 0 0-1 1z" />
    </svg>
  );
}

export function PencilIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19 3 20l1-4 12.5-12.5z" />
      <path d="M14.5 5.5l4 4" />
    </svg>
  );
}

export function CodeIcon({ className, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} {...base}>
      <path d="M9 8 4 12l5 4" />
      <path d="M15 8l5 4-5 4" />
    </svg>
  );
}

// Maps a badge's `key` (see `server/src/badges.rs`) to a flat icon instead
// of rendering the server's raw pictograph-emoji `icon` string — that
// string is still sent/used server-side (e.g. in notification text), this
// is purely the frontend display swap.
const BADGE_ICONS: Record<string, (props: IconProps) => ReactElement> = {
  host_beginner: MicIcon,
  host_pro: MegaphoneIcon,
  tournament_winner_first: TrophyIcon,
  tournament_champion: MedalIcon,
  first_publish: GamepadIcon,
  first_review: PencilIcon,
  social_butterfly: PeopleIcon,
  developer: CodeIcon,
};

export function BadgeIcon({ badgeKey, className, size = 16 }: IconProps & { badgeKey: string }) {
  const Icon = BADGE_ICONS[badgeKey] ?? MedalIcon;
  return <Icon className={className} size={size} />;
}

export interface BadgeColor {
  border: string;
  bg: string;
  text: string;
  selectedBorder: string;
  selectedBg: string;
}

// One accent color per badge — developer is golden, first_publish ("Erster
// Release") is purple, the rest fan out across the palette so every badge
// reads as visually distinct at a glance instead of all sharing one amber
// chip style.
const BADGE_COLORS: Record<string, BadgeColor> = {
  developer: {
    border: "border-amber-400/30",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    selectedBorder: "border-amber-400/50",
    selectedBg: "bg-amber-500/15",
  },
  first_publish: {
    border: "border-purple-400/30",
    bg: "bg-purple-500/10",
    text: "text-purple-300",
    selectedBorder: "border-purple-400/50",
    selectedBg: "bg-purple-500/15",
  },
  first_review: {
    border: "border-sky-400/30",
    bg: "bg-sky-500/10",
    text: "text-sky-300",
    selectedBorder: "border-sky-400/50",
    selectedBg: "bg-sky-500/15",
  },
  social_butterfly: {
    border: "border-pink-400/30",
    bg: "bg-pink-500/10",
    text: "text-pink-300",
    selectedBorder: "border-pink-400/50",
    selectedBg: "bg-pink-500/15",
  },
  host_beginner: {
    border: "border-emerald-400/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    selectedBorder: "border-emerald-400/50",
    selectedBg: "bg-emerald-500/15",
  },
  host_pro: {
    border: "border-teal-400/30",
    bg: "bg-teal-500/10",
    text: "text-teal-300",
    selectedBorder: "border-teal-400/50",
    selectedBg: "bg-teal-500/15",
  },
  tournament_winner_first: {
    border: "border-orange-400/30",
    bg: "bg-orange-500/10",
    text: "text-orange-300",
    selectedBorder: "border-orange-400/50",
    selectedBg: "bg-orange-500/15",
  },
  tournament_champion: {
    border: "border-red-400/30",
    bg: "bg-red-500/10",
    text: "text-red-300",
    selectedBorder: "border-red-400/50",
    selectedBg: "bg-red-500/15",
  },
};

const DEFAULT_BADGE_COLOR: BadgeColor = {
  border: "border-zinc-400/30",
  bg: "bg-zinc-500/10",
  text: "text-zinc-300",
  selectedBorder: "border-zinc-400/50",
  selectedBg: "bg-zinc-500/15",
};

export function badgeColor(key: string): BadgeColor {
  return BADGE_COLORS[key] ?? DEFAULT_BADGE_COLOR;
}
