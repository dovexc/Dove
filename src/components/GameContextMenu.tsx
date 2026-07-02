import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useCollectionsStore } from "../collectionsStore";
import { useLibraryStore } from "../store";
import { useT } from "../translations";

const VIEWPORT_MARGIN = 8;

export function GameContextMenu() {
  const t = useT();
  const contextMenu = useLibraryStore((s) => s.contextMenu);
  const closeContextMenu = useLibraryStore((s) => s.closeContextMenu);
  const openDeleteDialog = useLibraryStore((s) => s.openDeleteDialog);
  const openRemoveAccountDialog = useLibraryStore((s) => s.openRemoveAccountDialog);
  const editGame = useLibraryStore((s) => s.editGame);
  const reportError = useLibraryStore((s) => s.reportError);
  const collections = useCollectionsStore((s) => s.collections);
  const createCollection = useCollectionsStore((s) => s.createCollection);
  const addGameToCollection = useCollectionsStore((s) => s.addGameToCollection);
  const removeGameFromCollection = useCollectionsStore((s) => s.removeGameFromCollection);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [showCollections, setShowCollections] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");

  useEffect(() => {
    if (!contextMenu) {
      setShowCollections(false);
      setNewCollectionName("");
    }
  }, [contextMenu]);

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
  }, [contextMenu, showCollections]);

  if (!contextMenu) return null;
  const { game, x, y } = contextMenu;

  async function handleChangeImage() {
    closeContextMenu();
    const path = await open({
      multiple: false,
      directory: false,
      title: t("dialog_choose_cover"),
      filters: [{ name: t("dialog_images"), extensions: ["png", "jpg", "jpeg", "webp"] }],
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

  function toggleCollectionMembership(collectionId: number, isMember: boolean) {
    if (isMember) removeGameFromCollection(collectionId, game.id);
    else addGameToCollection(collectionId, game.id);
  }

  async function handleCreateAndAddCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    await createCollection(name);
    const created = useCollectionsStore.getState().collections.find((c) => c.name === name);
    if (created) await addGameToCollection(created.id, game.id);
    setNewCollectionName("");
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
        {t("ctx_change_image")}
      </button>
      <button
        onClick={handleBrowseFiles}
        className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
      >
        {t("ctx_browse_files")}
      </button>
      <button
        onClick={() => setShowCollections((v) => !v)}
        className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-800"
      >
        {t("ctx_add_to_collection")}
      </button>
      {showCollections && (
        <div className="border-t border-zinc-800 py-1">
          {collections.map((collection) => {
            const isMember = collection.games.some((g) => g.id === game.id);
            return (
              <label
                key={collection.id}
                className="flex items-center gap-2 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={isMember}
                  onChange={() => toggleCollectionMembership(collection.id, isMember)}
                />
                <span className="truncate">{collection.name}</span>
              </label>
            );
          })}
          <div className="flex items-center gap-1 px-3 py-1.5">
            <input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateAndAddCollection();
              }}
              placeholder={t("lib_collection_name_placeholder")}
              className="w-full min-w-0 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 outline-none ring-1 ring-zinc-700 focus:ring-sky-500"
            />
          </div>
        </div>
      )}
      <button
        onClick={handleDelete}
        className="block w-full px-3 py-2 text-left text-red-400 hover:bg-zinc-800"
      >
        {game.catalog_game_id != null ? t("ctx_uninstall") : t("ctx_delete")}
      </button>
      {game.catalog_game_id != null && (
        <button
          onClick={handleRemoveFromAccount}
          className="block w-full px-3 py-2 text-left text-red-400 hover:bg-zinc-800"
        >
          {t("ctx_remove_from_account")}
        </button>
      )}
    </div>
  );
}
