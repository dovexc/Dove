import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useLibraryStore } from "../store";
import { useT } from "../translations";

export function AddGameDialog() {
  const t = useT();
  const closeAddDialog = useLibraryStore((s) => s.closeAddDialog);
  const addGame = useLibraryStore((s) => s.addGame);

  const [name, setName] = useState("");
  const [exePath, setExePath] = useState("");
  const [coverPath, setCoverPath] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function pickExe() {
    const path = await open({
      multiple: false,
      directory: false,
      title: t("dialog_pick_exe_title"),
    });
    if (typeof path === "string") {
      setExePath(path);
      if (!name) {
        const fileName = path.split(/[\\/]/).pop() ?? "";
        setName(fileName.replace(/\.[^/.]+$/, ""));
      }
    }
  }

  async function pickCover() {
    const path = await open({
      multiple: false,
      directory: false,
      title: t("dialog_choose_cover"),
      filters: [{ name: t("dialog_images"), extensions: ["png", "jpg", "jpeg", "webp"] }],
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
      await addGame({
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
        <h2 className="text-lg font-bold text-zinc-100">{t("dialog_add_game_title")}</h2>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("dialog_name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded bg-zinc-800 px-3 py-2 text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("dialog_executable")}
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
              {t("dialog_browse")}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("dialog_cover_optional")}
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
              {t("dialog_browse")}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-300">
          {t("dialog_description_optional")}
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
            onClick={closeAddDialog}
            className="rounded px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            {t("dialog_cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {t("dialog_add")}
          </button>
        </div>
      </form>
    </div>
  );
}
