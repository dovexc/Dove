import { useAuthStore } from "../../authStore";
import { useCartStore } from "../../cartStore";
import { useT } from "../../translations";
import type { CatalogGame } from "../../types";

interface Props {
  game: CatalogGame;
  owned: boolean;
  size?: "sm" | "lg";
}

/// Icon-only on cards (matches the wishlist heart), text label at "lg" size
/// next to the buy button (hero, game detail page).
export function CartButton({ game, owned, size = "sm" }: Props) {
  const t = useT();
  const token = useAuthStore((s) => s.token);
  const inCart = useCartStore((s) => s.isInCart(game.id));
  const addToCart = useCartStore((s) => s.addToCart);
  const removeFromCart = useCartStore((s) => s.removeFromCart);

  if (owned || !token) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (inCart) removeFromCart(game.id);
        else addToCart(game);
      }}
      title={inCart ? t("cart_remove_title") : t("cart_add_title")}
      className={`flex items-center justify-center rounded font-semibold transition-colors ${
        inCart
          ? "bg-sky-900/60 text-sky-300"
          : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
      } ${size === "lg" ? "px-4 py-2.5 text-sm" : "h-7 w-7 text-sm"}`}
    >
      {size === "lg" ? (inCart ? t("cart_in_cart") : t("cart_add_title")) : "🛒"}
    </button>
  );
}
