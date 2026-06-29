import { useEffect } from "react";
import { useEventsStore } from "../../eventsStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { TournamentPayout } from "../../types";

function formatPrice(amountCents: number): string {
  return `${(amountCents / 100).toFixed(2)} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const PLACEMENT_KEY: Record<TournamentPayout["placement"], TranslationKey> = {
  1: "payouts_placement_1",
  2: "payouts_placement_2",
};

const STATUS_KEY: Record<TournamentPayout["status"], TranslationKey> = {
  pending: "payouts_status_pending",
  paid: "payouts_status_paid",
};

interface Props {
  onClose: () => void;
}

export function TournamentPayoutsDialog({ onClose }: Props) {
  const t = useT();
  const payouts = useEventsStore((s) => s.payouts);
  const payoutsLoading = useEventsStore((s) => s.payoutsLoading);
  const fetchPayouts = useEventsStore((s) => s.fetchPayouts);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{t("payouts_title")}</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label={t("dialog_cancel")}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {payoutsLoading ? (
            <p className="text-sm text-zinc-500">{t("checkout_processing")}</p>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("payouts_empty")}</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-zinc-500">{t("payouts_manual_note")}</p>
              <ul className="flex flex-col gap-2">
                {payouts.map((payout) => (
                  <li
                    key={payout.id}
                    className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-800/40 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-100">
                        {payout.event_title}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {t(PLACEMENT_KEY[payout.placement])} · {formatDate(payout.created_at)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-zinc-200">
                      {formatPrice(payout.amount_cents)}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        payout.status === "paid"
                          ? "bg-emerald-900/60 text-emerald-300"
                          : "bg-amber-900/60 text-amber-300"
                      }`}
                    >
                      {t(STATUS_KEY[payout.status])}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
