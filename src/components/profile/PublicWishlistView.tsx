import { useState } from "react";
import { API_BASE } from "../../authStore";
import { useCatalogStore } from "../../catalogStore";
import { GameDetailPage } from "../store/GameDetailPage";
import { Stars } from "../store/Stars";
import { useAuthStore } from "../../authStore";
import { useT } from "../../translations";
import type { TranslationKey } from "../../translations";
import type { CatalogGame } from "../../types";

function formatPrice(priceCents: number, t: (key: TranslationKey) => string): string {
  return priceCents === 0 ? t("price_free") : `${(priceCents / 100).toFixed(2)} €`;
}

interface Props {
  ownerName: string;
  games: CatalogGame[];
  onBack: () => void;
}

export function PublicWishlistView({ ownerName, games, onBack }: Props) {
  const t = useT();
  const library = useCatalogStore((s) => s.library);
  const purchasingId = useCatalogStore((s) => s.purchasingId);
  const openGameDetail = useCatalogStore((s) => s.openGameDetail);
  const openCheckout = useCatalogStore((s) => s.openCheckout);
  const detailGame = useCatalogStore((s) => s.detailGame);
  const authUser = useAuthStore((s) => s.user);
  const [ownedIds] = useState(() => new Set(library.map((g) => g.id)));

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-zinc-950">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">
              {t("pwl_title")} {ownerName}
            </h1>
            <p className="text-sm text-zinc-500">
              {games.length} {games.length === 1 ? t("pwl_game_singular") : t("pwl_game_plural")}{" "}
              {t("pwl_saved_suffix")}
            </p>
          </div>
          <button
            onClick={onBack}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
          >
            {t("pwl_back")}
          </button>
        </div>

        {games.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("pwl_no_games")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {games.map((game) => (
              <div
                key={game.id}
                onClick={() => openGameDetail(game)}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-white/5 bg-[#141c26] shadow-lg transition-transform hover:-translate-y-1"
              >
                <div
                  className="relative aspect-[3/4] w-full"
                  style={{
                    background: game.cover_url
                      ? `url(${game.cover_url.startsWith("http") ? game.cover_url : `${API_BASE}${game.cover_url}`}) center/cover`
                      : "linear-gradient(135deg,#2b5876,#4e4376)",
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%)",
                    }}
                  />
                  <span className="absolute bottom-4 left-4 right-4 text-lg font-black leading-tight text-white drop-shadow-lg">
                    {game.title}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  {game.review_count > 0 && (
                    <span className="flex items-center gap-1 text-xs">
                      <Stars rating={game.avg_rating ?? 0} />
                      <span className="text-zinc-500">({game.review_count})</span>
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-zinc-100">
                      {formatPrice(game.price_cents, t)}
                    </span>
                    {!ownedIds.has(game.id) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCheckout(game);
                        }}
                        disabled={purchasingId === game.id}
                        className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                      >
                        {purchasingId === game.id ? "..." : t("store_buy")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detailGame && (
        <GameDetailPage
          owned={ownedIds.has(detailGame.id)}
          isPublisher={authUser?.id === detailGame.publisher_user_id}
          purchasing={purchasingId === detailGame.id}
          onPurchase={() => openCheckout(detailGame)}
        />
      )}
    </div>
  );
}
