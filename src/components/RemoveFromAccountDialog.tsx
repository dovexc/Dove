import { useState } from "react";
import { useLibraryStore } from "../store";
import { useCatalogStore } from "../catalogStore";
import type { Game } from "../types";

interface Props {
  game: Game;
}

export function RemoveFromAccountDialog({ game }: Props) {
  const closeRemoveAccountDialog = useLibraryStore((s) => s.closeRemoveAccountDialog);
  const deleteGame = useLibraryStore((s) => s.deleteGame);
  const revokeOwnership = useCatalogStore((s) => s.revokeOwnership);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!game.catalog_game_id) return;
    setSubmitting(true);
    try {
      await revokeOwnership(game.catalog_game_id);
      await deleteGame(game.id, true);
    } finally {
      setSubmitting(false);
      closeRemoveAccountDialog();
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60">
      <div className="flex w-[26rem] flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-100">Komplett vom Account löschen</h2>
        <p className="text-sm text-zinc-300">
          <span className="font-semibold">{game.name}</span> wird unwiderruflich aus
          deinem Account entfernt. Du verlierst den Besitz im Store und müsstest es
          erneut kaufen, um wieder Zugriff zu haben. Lokale Dateien werden ebenfalls
          gelöscht.
        </p>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeRemoveAccountDialog}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            Endgültig löschen
          </button>
        </div>
      </div>
    </div>
  );
}
