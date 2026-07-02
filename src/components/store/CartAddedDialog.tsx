import { useCartStore } from "../../cartStore";
import { useT } from "../../translations";

export function CartAddedDialog() {
  const t = useT();
  const promptGame = useCartStore((s) => s.promptGame);
  const dismissPrompt = useCartStore((s) => s.dismissPrompt);
  const openCart = useCartStore((s) => s.openCart);

  if (!promptGame) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center gap-3">
          {promptGame.cover_url ? (
            <img
              src={promptGame.cover_url}
              className="h-12 w-12 rounded object-cover"
              alt={promptGame.title}
            />
          ) : (
            <div className="h-12 w-12 rounded bg-zinc-700" />
          )}
          <div>
            <h2 className="text-base font-bold text-zinc-100">{t("cart_added_title")}</h2>
            <p className="text-sm text-zinc-400">{promptGame.title}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={dismissPrompt}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            {t("cart_keep_browsing")}
          </button>
          <button
            onClick={() => {
              dismissPrompt();
              openCart();
            }}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            {t("cart_go_to_checkout")}
          </button>
        </div>
      </div>
    </div>
  );
}
