import { useState } from "react";
import { useLibraryStore } from "../store";
import type { Game } from "../types";

interface Props {
  game: Game;
}

export function DeleteGameDialog({ game }: Props) {
  const closeDeleteDialog = useLibraryStore((s) => s.closeDeleteDialog);
  const deleteGame = useLibraryStore((s) => s.deleteGame);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await deleteGame(game.id, deleteFiles);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60">
      <div className="flex w-[26rem] flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-100">Spiel entfernen</h2>
        <p className="text-sm text-zinc-300">
          Soll <span className="font-semibold">{game.name}</span> wirklich aus
          der Bibliothek entfernt werden?
        </p>

        <label className="flex items-start gap-2 rounded bg-zinc-800/60 p-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Spieldateien zusätzlich von der Festplatte löschen
            <br />
            <span className="text-xs text-red-400">
              Löscht den gesamten Ordner der Executable unwiderruflich:{" "}
              {game.exe_path}
            </span>
          </span>
        </label>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeDeleteDialog}
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
            {deleteFiles ? "Entfernen & Dateien löschen" : "Entfernen"}
          </button>
        </div>
      </div>
    </div>
  );
}
