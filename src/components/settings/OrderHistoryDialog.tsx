import { useEffect } from "react";
import { useCatalogStore } from "../../catalogStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { Order } from "../../types";

function formatPrice(amountCents: number, t: (key: TranslationKey) => string): string {
  return amountCents === 0 ? t("price_free") : `${(amountCents / 100).toFixed(2)} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const STATUS_KEY: Record<Order["status"], TranslationKey> = {
  pending: "order_history_status_pending",
  paid: "order_history_status_paid",
  failed: "order_history_status_failed",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending: "bg-amber-900/60 text-amber-300",
  paid: "bg-emerald-900/60 text-emerald-300",
  failed: "bg-red-900/60 text-red-300",
};

interface Props {
  onClose: () => void;
}

export function OrderHistoryDialog({ onClose }: Props) {
  const t = useT();
  const orders = useCatalogStore((s) => s.orders);
  const ordersLoading = useCatalogStore((s) => s.ordersLoading);
  const fetchOrders = useCatalogStore((s) => s.fetchOrders);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">{t("order_history_title")}</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label={t("dialog_cancel")}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {ordersLoading ? (
            <p className="text-sm text-zinc-500">{t("checkout_processing")}</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("order_history_empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-800/40 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-100">
                      {order.catalog_game_title}
                    </p>
                    <p className="text-xs text-zinc-500">{formatDate(order.created_at)}</p>
                  </div>
                  <span className="text-sm font-semibold text-zinc-200">
                    {formatPrice(order.amount_cents, t)}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[order.status]}`}
                  >
                    {t(STATUS_KEY[order.status])}
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
