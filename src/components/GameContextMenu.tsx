import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useLibraryStore } from "../store";

const VIEWPORT_MARGIN = 8;

export function GameContextMenu() {
  const contextMenu = useLibraryStore((s) => s.contextMenu);
  const closeContextMenu = useLibraryStore((s) => s.closeContextMenu);
  const openDeleteDialog = useLibraryStore((s) => s.openDeleteDialog);
  const openRemoveAccountDialog = useLibraryStore((s) => s.openRemoveAccountDialog);
  const editGame = useLibraryStore((s) => s.editGame);
  const reportError = useLibraryStore((s) => s.reportError);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeContextMenu();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu, closeContextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !ref.current) {
      setPosition(null);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    const top = Math.min(
      contextMenu.y,
      window.innerHeight - height - VIEWPORT_MARGIN
    );
    const left = Math.min(
      contextMenu.x,
      window.innerWidth - width - VIEWPORT_MARGIN
    );
    setPosition({ top: Math.max(top, VIEWPORT_MARGIN), left: Math.max(left, VIEWPORT_MARGIN) });
  }, [contextMenu]);

  if (!contextMenu) return null;
  const { game, x, y } = contextMenu;

  async function handleChangeImage() {
    closeContextMenu();
    const path = await open({
      multiple: false,
      directory: false,
      title: "Cover-Bild auswählen",
      filters: [{ name: "Bilder", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (typeof path === "string") {
      await editGame(game.id, {
        name: game.name,
        exe_path: game.exe_path,
        cover_path: path,
        description: game.description,
        size_on_disk_bytes: game.size_on_disk_bytes,
      });
    }
  }

  async function handleBrowseFiles() {
    closeContextMenu();
    try {
      await invoke("reveal_game_folder", { id: game.id });
    } catch (e) {
      reportError(String(e));
    }
  }

  function handleDelete() {
    closeContextMenu();
    openDeleteDialog(game.id);
  }

  function handleRemoveFromAccount() {
    closeContextMenu();
    openRemoveAccountDialog(game.id);
  }

  return (
    <div
      ref={ref}
      style={{
        top: position?.top ?? y,
        left: position?.left ?? x,
        visibility: position ? "visible" : "hidden",
      }}
      className="fixed z-50 w-52 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-xl"
    >
      <button
        onClick={handleChangeImage}
        className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
      >
        Bild ändern
      </button>
      <button
        onClick={handleBrowseFiles}
        className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
      >
        Lokale Dateien durchsuchen
      </button>
      <button
        onClick={handleDelete}
        className="block w-full px-3 py-2 text-left text-red-400 hover:bg-zinc-800"
      >
        {game.catalog_game_id != null ? "Deinstallieren" : "Löschen"}
      </button>
      {game.catalog_game_id != null && (
        <button
          onClick={handleRemoveFromAccount}
          className="block w-full px-3 py-2 text-left text-red-400 hover:bg-zinc-800"
        >
          Komplett vom Account löschen
        </button>
      )}
    </div>
  );
}
