import { useEffect } from "react";
import { useAuthStore } from "../../authStore";
import { useT } from "../../translations";

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

interface Props {
  onClose: () => void;
}

export function WalletHistoryDialog({ onClose }: Props) {
  const t = useT();
  const walletTopups = useAuthStore((s) => s.walletTopups);
  const fetchWalletTopups = useAuthStore((s) => s.fetchWalletTopups);

  useEffect(() => {
    fetchWalletTopups();
  }, [fetchWalletTopups]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{t("wallet_history_title")}</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label={t("dialog_cancel")}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {walletTopups.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("wallet_history_empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {walletTopups.map((topup) => (
                <li
                  key={topup.id}
                  className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-800/40 px-3 py-2.5"
                >
                  <p className="text-xs text-zinc-500">{formatDate(topup.created_at)}</p>
                  <span className="text-sm font-semibold text-emerald-300">
                    +{formatPrice(topup.amount_cents)}
                  </span>
                </li>
              ))}
            </ul>
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
