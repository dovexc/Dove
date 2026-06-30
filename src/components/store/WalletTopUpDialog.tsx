import { useState } from "react";
import { useAuthStore } from "../../authStore";
import { useT } from "../../translations";

const PRESET_AMOUNTS_CENTS = [500, 1000, 2500, 5000];

interface Props {
  onClose: () => void;
}

export function WalletTopUpDialog({ onClose }: Props) {
  const t = useT();
  const authUser = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const topUpWallet = useAuthStore((s) => s.topUpWallet);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(PRESET_AMOUNTS_CENTS[1]);
  const [customAmount, setCustomAmount] = useState("");

  const amountCents = customAmount.trim()
    ? Math.round(Number(customAmount.replace(",", ".")) * 100)
    : selectedPreset;

  async function handleConfirm() {
    if (!amountCents || amountCents <= 0) return;
    clearError();
    await topUpWallet(amountCents);
    if (!useAuthStore.getState().error) onClose();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{t("wallet_topup_title")}</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label={t("dialog_cancel")}
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-zinc-500">{t("wallet_topup_desc")}</p>

        <div className="flex items-center justify-between rounded bg-zinc-800/60 px-3 py-2 text-sm text-zinc-300">
          <span>{t("wallet_balance")}</span>
          <span className="font-semibold text-zinc-100">
            {(((authUser?.wallet_balance_cents ?? 0) / 100).toFixed(2))} €
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {PRESET_AMOUNTS_CENTS.map((cents) => (
            <button
              key={cents}
              type="button"
              onClick={() => {
                setSelectedPreset(cents);
                setCustomAmount("");
              }}
              className={`rounded px-2 py-2 text-sm font-semibold ${
                selectedPreset === cents && !customAmount.trim()
                  ? "bg-sky-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {(cents / 100).toFixed(0)} €
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("wallet_topup_custom")}
          <input
            value={customAmount}
            onChange={(e) => {
              setCustomAmount(e.target.value);
              setSelectedPreset(null);
            }}
            placeholder="0.00 €"
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            {t("dialog_cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!amountCents || amountCents <= 0 || loading}
            className="rounded bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {loading ? t("checkout_processing") : t("wallet_topup_confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
