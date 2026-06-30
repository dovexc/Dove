import { useState } from "react";
import { useAuthStore } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { CatalogGame } from "../../types";
import { WalletTopUpDialog } from "./WalletTopUpDialog";

function formatPrice(priceCents: number, t: (key: TranslationKey) => string): string {
  return priceCents === 0 ? t("price_free") : `${(priceCents / 100).toFixed(2)} €`;
}

interface Props {
  game: CatalogGame;
}

export function CheckoutDialog({ game }: Props) {
  const t = useT();
  const closeCheckout = useCatalogStore((s) => s.closeCheckout);
  const purchaseGame = useCatalogStore((s) => s.purchaseGame);
  const purchasingId = useCatalogStore((s) => s.purchasingId);
  const error = useCatalogStore((s) => s.error);
  const authUser = useAuthStore((s) => s.user);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeWithdrawal, setAgreeWithdrawal] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  const isPaid = game.price_cents > 0;
  const submitting = purchasingId === game.id;
  const canConfirm = isPaid ? agreeTerms && agreeWithdrawal : agreeTerms;
  const walletBalanceCents = authUser?.wallet_balance_cents ?? 0;
  const insufficientFunds = isPaid && walletBalanceCents < game.price_cents;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{t("checkout_title")}</h2>
          <button
            onClick={closeCheckout}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label={t("dialog_cancel")}
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-3 rounded bg-zinc-800/60 p-3">
          {game.cover_url ? (
            <img src={game.cover_url} className="h-14 w-14 rounded object-cover" alt={game.title} />
          ) : (
            <div className="h-14 w-14 rounded bg-zinc-700" />
          )}
          <div className="flex-1">
            <div className="font-semibold text-zinc-100">{game.title}</div>
            <div className="text-xs text-zinc-500">{t("gdp_version")} {game.version}</div>
          </div>
          <div className="text-right font-bold text-zinc-100">{formatPrice(game.price_cents, t)}</div>
        </div>

        <div className="flex flex-col gap-1 border-t border-zinc-800 pt-3 text-sm text-zinc-400">
          <div className="flex justify-between">
            <span>{t("checkout_subtotal")}</span>
            <span>{formatPrice(game.price_cents, t)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-zinc-100">
            <span>{t("checkout_total")}</span>
            <span>{formatPrice(game.price_cents, t)}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{t("checkout_vat_note")}</p>
        </div>

        {isPaid && (
          <div
            className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
              insufficientFunds ? "bg-red-900/30 text-red-300" : "bg-zinc-800/60 text-zinc-300"
            }`}
          >
            <span>{t("wallet_balance")}</span>
            <span className="font-semibold">{formatPrice(walletBalanceCents, t)}</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-300">{t("checkout_payment_method")}</span>
          <div className="flex items-center justify-between rounded border border-dashed border-zinc-700 bg-zinc-800/40 px-3 py-2.5 text-sm text-zinc-500">
            <span>{t("checkout_payment_placeholder")}</span>
            <span className="rounded bg-zinc-700 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
              {t("checkout_coming_soon")}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t("checkout_agree_terms")}</span>
          </label>
          {isPaid && (
            <label className="flex items-start gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={agreeWithdrawal}
                onChange={(e) => setAgreeWithdrawal(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t("checkout_agree_withdrawal")}</span>
            </label>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={closeCheckout}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            {t("dialog_cancel")}
          </button>
          {insufficientFunds ? (
            <button
              type="button"
              onClick={() => setShowTopUp(true)}
              className="rounded bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
            >
              {t("wallet_topup_open")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => purchaseGame(game.id)}
              disabled={!canConfirm || submitting}
              className="rounded bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {submitting ? t("checkout_processing") : isPaid ? t("checkout_confirm_paid") : t("checkout_confirm_free")}
            </button>
          )}
        </div>
      </div>

      {showTopUp && <WalletTopUpDialog onClose={() => setShowTopUp(false)} />}
    </div>
  );
}
