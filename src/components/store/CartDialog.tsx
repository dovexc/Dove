import { useEffect, useState } from "react";
import { useAuthStore } from "../../authStore";
import { useCartStore } from "../../cartStore";
import { useCatalogStore } from "../../catalogStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import { PriceTag } from "./PriceTag";
import { WalletTopUpDialog } from "./WalletTopUpDialog";

function formatPrice(cents: number, t: (key: TranslationKey) => string): string {
  return cents === 0 ? t("price_free") : `${(cents / 100).toFixed(2)} €`;
}

function effectivePrice(game: { price_cents: number; sale_price_cents: number | null }): number {
  return game.sale_price_cents ?? game.price_cents;
}

// There's no multi-item order endpoint on the server, so checkout purchases
// each cart item one at a time through the existing per-game endpoint and
// stops (leaving the rest in the cart) the moment one fails.
export function CartDialog() {
  const t = useT();
  const isOpen = useCartStore((s) => s.isOpen);
  const items = useCartStore((s) => s.items);
  const closeCart = useCartStore((s) => s.closeCart);
  const removeFromCart = useCartStore((s) => s.removeFromCart);
  const clearCart = useCartStore((s) => s.clearCart);
  const library = useCatalogStore((s) => s.library);
  const purchaseGame = useCatalogStore((s) => s.purchaseGame);
  const purchasingId = useCatalogStore((s) => s.purchasingId);
  const error = useCatalogStore((s) => s.error);
  const clearError = useCatalogStore((s) => s.clearError);
  const authUser = useAuthStore((s) => s.user);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeWithdrawal, setAgreeWithdrawal] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    const ownedIds = new Set(library.map((g) => g.id));
    for (const item of items) {
      if (ownedIds.has(item.id)) removeFromCart(item.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library]);

  if (!isOpen) return null;

  const totalCents = items.reduce((sum, g) => sum + effectivePrice(g), 0);
  const isPaid = totalCents > 0;
  const canConfirm = isPaid ? agreeTerms && agreeWithdrawal : agreeTerms;
  const walletBalanceCents = authUser?.wallet_balance_cents ?? 0;
  const insufficientFunds = isPaid && walletBalanceCents < totalCents;

  async function handleCheckout() {
    clearError();
    setCheckingOut(true);
    for (const item of items) {
      await purchaseGame(item.id);
      if (useCatalogStore.getState().error) {
        setCheckingOut(false);
        return;
      }
      removeFromCart(item.id);
    }
    setCheckingOut(false);
    clearCart();
    closeCart();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{t("cart_title")}</h2>
          <button
            onClick={closeCart}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label={t("dialog_cancel")}
          >
            ✕
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("cart_empty")}</p>
        ) : (
          <>
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {items.map((game) => (
                <div key={game.id} className="flex items-center gap-3 rounded bg-zinc-800/60 p-3">
                  {game.cover_url ? (
                    <img src={game.cover_url} className="h-12 w-12 rounded object-cover" alt={game.title} />
                  ) : (
                    <div className="h-12 w-12 rounded bg-zinc-700" />
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-zinc-100">{game.title}</div>
                    <div className="text-xs text-zinc-400">
                      <PriceTag priceCents={game.price_cents} salePriceCents={game.sale_price_cents} t={t} />
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromCart(game.id)}
                    title={t("cart_remove_title")}
                    className="text-zinc-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1 border-t border-zinc-800 pt-3 text-sm text-zinc-400">
              <div className="flex justify-between text-base font-semibold text-zinc-100">
                <span>{t("checkout_total")}</span>
                <span>{formatPrice(totalCents, t)}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{t("checkout_vat_note")}</p>
            </div>

            {isPaid && (
              <button
                type="button"
                onClick={() => setShowTopUp(true)}
                title={t("wallet_topup_open")}
                className={`flex items-center justify-between rounded px-3 py-2 text-sm hover:brightness-110 ${
                  insufficientFunds ? "bg-red-900/30 text-red-300" : "bg-zinc-800/60 text-zinc-300"
                }`}
              >
                <span>{t("wallet_balance")}</span>
                <span className="flex items-center gap-2 font-semibold">
                  {formatPrice(walletBalanceCents, t)}
                  <span className="text-xs font-normal underline">{t("wallet_topup_open")}</span>
                </span>
              </button>
            )}

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
          </>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={closeCart}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            {t("cart_continue_shopping")}
          </button>
          {items.length > 0 &&
            (insufficientFunds ? (
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
                onClick={handleCheckout}
                disabled={!canConfirm || checkingOut || purchasingId !== null}
                className="rounded bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {checkingOut ? t("checkout_processing") : t("cart_checkout_now")}
              </button>
            ))}
        </div>
      </div>

      {showTopUp && <WalletTopUpDialog onClose={() => setShowTopUp(false)} />}
    </div>
  );
}
