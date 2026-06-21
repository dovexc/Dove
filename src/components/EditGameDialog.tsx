import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useLibraryStore } from "../store";
import type { Game } from "../types";

interface Props {
  game: Game;
}

export function EditGameDialog({ game }: Props) {
  const closeEditDialog = useLibraryStore((s) => s.closeEditDialog);
  const editGame = useLibraryStore((s) => s.editGame);

  const [name, setName] = useState(game.name);
  const [exePath, setExePath] = useState(game.exe_path);
  const [coverPath, setCoverPath] = useState(game.cover_path ?? "");
  const [description, setDescription] = useState(game.description ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function pickExe() {
    const path = await open({
      multiple: false,
      directory: false,
      title: "Spiel-Executable auswählen",
    });
    if (typeof path === "string") {
      setExePath(path);
    }
  }

  async function pickCover() {
    const path = await open({
      multiple: false,
      directory: false,
      title: "Cover-Bild auswählen",
      filters: [{ name: "Bilder", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (typeof path === "string") {
      setCoverPath(path);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !exePath.trim()) return;
    setSubmitting(true);
    try {
      await editGame(game.id, {
        name: name.trim(),
        exe_path: exePath.trim(),
        cover_path: coverPath.trim() || null,
        description: description.trim() || null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="flex w-[28rem] flex-col gap-4 rounded-lg bg-zinc-900 p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-zinc-100">Spiel bearbeiten</h2>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Executable (.exe)
          <div className="flex gap-2">
            <input
              value={exePath}
              onChange={(e) => setExePath(e.target.value)}
              required
              className="flex-1 rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
            <button
              type="button"
              onClick={pickExe}
              className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
            >
              Durchsuchen
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Cover-Bild (optional)
          <div className="flex gap-2">
            <input
              value={coverPath}
              onChange={(e) => setCoverPath(e.target.value)}
              className="flex-1 rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
            <button
              type="button"
              onClick={pickCover}
              className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
            >
              Durchsuchen
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          Beschreibung (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={closeEditDialog}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}
