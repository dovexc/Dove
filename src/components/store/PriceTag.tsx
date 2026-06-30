import type { TranslationKey } from "../../translations";

function formatAmount(cents: number, t: (key: TranslationKey) => string): string {
  return cents === 0 ? t("price_free") : `${(cents / 100).toFixed(2)} €`;
}

interface Props {
  priceCents: number;
  salePriceCents: number | null;
  t: (key: TranslationKey) => string;
  className?: string;
}

/// Shared price display for buyer-facing surfaces (store grid, game detail,
/// checkout, wishlist) — shows the struck-through listing price next to the
/// offer price whenever a game has an active offer (`salePriceCents` is
/// already only ever populated server-side when the offer hasn't expired).
export function PriceTag({ priceCents, salePriceCents, t, className }: Props) {
  if (salePriceCents == null) {
    return <span className={className}>{formatAmount(priceCents, t)}</span>;
  }
  return (
    <span className={className}>
      <span className="mr-1.5 text-zinc-500 line-through">{formatAmount(priceCents, t)}</span>
      <span className="text-emerald-400">{formatAmount(salePriceCents, t)}</span>
    </span>
  );
}

/// Small "-X%" corner badge for game cover art — the at-a-glance signal
/// that a game is currently on sale, separate from `PriceTag` (which
/// already shows the exact prices but only where price is displayed at
/// all, e.g. not on a cover image by itself).
export function SaleBadge({
  priceCents,
  salePriceCents,
  className,
}: {
  priceCents: number;
  salePriceCents: number | null;
  className?: string;
}) {
  if (salePriceCents == null || priceCents <= 0) return null;
  const percent = Math.round((1 - salePriceCents / priceCents) * 100);
  return (
    <span
      className={`rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white ${className ?? ""}`}
    >
      -{percent}%
    </span>
  );
}
