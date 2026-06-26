import { useEffect, useRef, useState } from "react";
import { useLibraryStore, registerGameEventListeners } from "./store";
import { useAuthStore } from "./authStore";
import { GameCard } from "./components/GameCard";
import { GameDetail } from "./components/GameDetail";
import { AddGameDialog } from "./components/AddGameDialog";
import { EditGameDialog } from "./components/EditGameDialog";
import { DeleteGameDialog } from "./components/DeleteGameDialog";
import { RemoveFromAccountDialog } from "./components/RemoveFromAccountDialog";
import { SteamImportDialog } from "./components/SteamImportDialog";
import { LibraryHome } from "./components/LibraryHome";
import { GameContextMenu } from "./components/GameContextMenu";
import { StoreView } from "./components/store/StoreView";
import { LoginDialog } from "./components/store/LoginDialog";
import { ProfilePage } from "./components/profile/ProfilePage";
import { DownloadBar } from "./components/downloads/DownloadBar";
import { DownloadsPage } from "./components/downloads/DownloadsPage";
import { registerDownloadEventListeners } from "./downloadStore";
import { UserMenu } from "./components/UserMenu";
import { FriendsView } from "./components/friends/FriendsView";
import { SettingsView } from "./components/settings/SettingsView";
import { AdminModerationView } from "./components/admin/AdminModerationView";
import { WishlistPage } from "./components/store/WishlistPage";
import { EventsPage } from "./components/events/EventsPage";
import { NotificationsBell } from "./components/NotificationsBell";
import { useEventsStore } from "./eventsStore";
import { useT } from "./translations";

const SIDEBAR_WIDTH_KEY = "library_sidebar_width";
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 640;

function App() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<
    | "library"
    | "store"
    | "events"
    | "downloads"
    | "profile"
    | "friends"
    | "settings"
    | "moderation"
    | "wishlist"
  >("library");
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return stored >= SIDEBAR_MIN_WIDTH && stored <= SIDEBAR_MAX_WIDTH ? stored : 288;
  });
  const isResizingRef = useRef(false);
  const sidebarWidthRef = useRef(sidebarWidth);

  function startSidebarResize(e: React.MouseEvent) {
    e.preventDefault();
    isResizingRef.current = true;

    function handleMouseMove(moveEvent: MouseEvent) {
      if (!isResizingRef.current) return;
      const next = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, moveEvent.clientX)
      );
      sidebarWidthRef.current = next;
      setSidebarWidth(next);
    }

    function handleMouseUp() {
      isResizingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidthRef.current));
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }
  const authUser = useAuthStore((s) => s.user);
  const authToken = useAuthStore((s) => s.token);
  const hydrateUser = useAuthStore((s) => s.hydrateUser);
  const logout = useAuthStore((s) => s.logout);
  const openEventDetail = useEventsStore((s) => s.openEventDetail);

  const games = useLibraryStore((s) => s.games);
  const selectedGameId = useLibraryStore((s) => s.selectedGameId);
  const isAddDialogOpen = useLibraryStore((s) => s.isAddDialogOpen);
  const editingGameId = useLibraryStore((s) => s.editingGameId);
  const deletingGameId = useLibraryStore((s) => s.deletingGameId);
  const removingAccountGameId = useLibraryStore((s) => s.removingAccountGameId);
  const isSteamImportOpen = useLibraryStore((s) => s.isSteamImportOpen);
  const error = useLibraryStore((s) => s.error);
  const fetchGames = useLibraryStore((s) => s.fetchGames);
  const selectGame = useLibraryStore((s) => s.selectGame);
  const launchGame = useLibraryStore((s) => s.launchGame);
  const openAddDialog = useLibraryStore((s) => s.openAddDialog);
  const openEditDialog = useLibraryStore((s) => s.openEditDialog);
  const openDeleteDialog = useLibraryStore((s) => s.openDeleteDialog);
  const openSteamImport = useLibraryStore((s) => s.openSteamImport);
  const clearError = useLibraryStore((s) => s.clearError);

  const accountOnlyTabs = ["profile", "friends", "settings", "moderation", "wishlist"];
  useEffect(() => {
    if (!authToken && accountOnlyTabs.includes(activeTab)) {
      setActiveTab("library");
    }
  }, [authToken, activeTab]);

  useEffect(() => {
    registerGameEventListeners();
    registerDownloadEventListeners();
    fetchGames();
    hydrateUser();

    // The backend can still be starting up right as the window opens; retry
    // a few times so a slow launch doesn't strand the user logged-out-looking
    // even though their token is still valid.
    let attempts = 0;
    const retry = setInterval(() => {
      attempts += 1;
      const { token, user } = useAuthStore.getState();
      if (!token || user || attempts >= 5) {
        clearInterval(retry);
        return;
      }
      hydrateUser();
    }, 2000);
    return () => clearInterval(retry);
  }, [fetchGames, hydrateUser]);

  const selectedGame = games.find((g) => g.id === selectedGameId) ?? null;
  const editingGame = games.find((g) => g.id === editingGameId) ?? null;
  const deletingGame = games.find((g) => g.id === deletingGameId) ?? null;
  const removingAccountGame = games.find((g) => g.id === removingAccountGameId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header
        className="flex h-[62px] flex-none items-center justify-between border-b border-white/5 px-8"
        style={{ background: "linear-gradient(180deg,#171f29,#121922)" }}
      >
        <div className="flex h-full items-center gap-8">
          <button
            onClick={() => {
              setActiveTab("library");
              selectGame(null);
            }}
            className="flex h-full flex-col items-center justify-center gap-1.5"
          >
            <span
              className={`text-[17px] font-bold tracking-wide ${
                activeTab === "library" ? "text-white" : "text-[#9aa7b3] hover:text-zinc-200"
              }`}
            >
              {t("nav_library")}
            </span>
            <span
              className="h-[3px] w-[22px] rounded-sm"
              style={{
                background:
                  activeTab === "library" ? "linear-gradient(90deg,#3aa0ff,#66c0f4)" : "transparent",
              }}
            />
          </button>
          <button
            onClick={() => setActiveTab("store")}
            className="flex h-full flex-col items-center justify-center gap-1.5"
          >
            <span
              className={`text-[17px] font-bold tracking-wide ${
                activeTab === "store" ? "text-white" : "text-[#9aa7b3] hover:text-zinc-200"
              }`}
            >
              {t("nav_store")}
            </span>
            <span
              className="h-[3px] w-[22px] rounded-sm"
              style={{
                background:
                  activeTab === "store" ? "linear-gradient(90deg,#3aa0ff,#66c0f4)" : "transparent",
              }}
            />
          </button>
          <button
            onClick={() => setActiveTab("events")}
            className="flex h-full flex-col items-center justify-center gap-1.5"
          >
            <span
              className={`text-[17px] font-bold tracking-wide ${
                activeTab === "events" ? "text-white" : "text-[#9aa7b3] hover:text-zinc-200"
              }`}
            >
              {t("nav_events")}
            </span>
            <span
              className="h-[3px] w-[22px] rounded-sm"
              style={{
                background:
                  activeTab === "events" ? "linear-gradient(90deg,#3aa0ff,#66c0f4)" : "transparent",
              }}
            />
          </button>
          <button
            onClick={() => setActiveTab("downloads")}
            className="flex h-full flex-col items-center justify-center gap-1.5"
          >
            <span
              className={`text-[17px] font-bold tracking-wide ${
                activeTab === "downloads" ? "text-white" : "text-[#9aa7b3] hover:text-zinc-200"
              }`}
            >
              {t("nav_downloads")}
            </span>
            <span
              className="h-[3px] w-[22px] rounded-sm"
              style={{
                background:
                  activeTab === "downloads" ? "linear-gradient(90deg,#3aa0ff,#66c0f4)" : "transparent",
              }}
            />
          </button>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "library" && (
            <>
              <button
                onClick={openSteamImport}
                className="rounded bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                {t("steam_import")}
              </button>
              <button
                onClick={openAddDialog}
                className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
              >
                {t("add_game")}
              </button>
            </>
          )}
          {authToken && authUser ? (
            <NotificationsBell
              onOpenEvent={(eventId) => {
                setActiveTab("events");
                openEventDetail(eventId);
              }}
              onOpenFriends={() => setActiveTab("friends")}
              onOpenProfile={() => setActiveTab("profile")}
            />
          ) : null}
          {authToken && authUser ? (
            <UserMenu
              displayName={authUser.display_name}
              avatarUrl={authUser.avatar_url}
              isAdmin={authUser.is_admin}
              onOpenProfile={() => setActiveTab("profile")}
              onOpenFriends={() => setActiveTab("friends")}
              onOpenSettings={() => setActiveTab("settings")}
              onOpenModeration={() => setActiveTab("moderation")}
              onOpenWishlist={() => setActiveTab("wishlist")}
              onLogout={logout}
            />
          ) : (
            <button
              onClick={() => setIsLoginOpen(true)}
              className="rounded px-[22px] py-[9px] text-sm font-semibold text-[#dbe7f2]"
              style={{
                border: "1px solid rgba(120,180,240,.35)",
                background:
                  "linear-gradient(180deg,rgba(70,130,200,.25),rgba(40,80,140,.15))",
              }}
            >
              {t("login")}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between bg-red-900/60 px-6 py-2 text-sm text-red-100">
          <span>{error}</span>
          <button onClick={clearError} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {activeTab === "library" ? (
        <div className="flex flex-1 overflow-hidden">
          <div
            style={{ width: sidebarWidth }}
            className="shrink-0 overflow-y-auto p-4"
          >
            {games.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {t("lib_no_games_yet")}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {games.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    isSelected={game.id === selectedGameId}
                    onSelect={() => selectGame(game.id)}
                    onPlay={() => launchGame(game.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div
            onMouseDown={startSidebarResize}
            className="w-1 shrink-0 cursor-col-resize border-r border-zinc-800 bg-transparent hover:bg-sky-500/50"
          />

          <div className="flex-1 overflow-y-auto">
            {selectedGame ? (
              <GameDetail
                game={selectedGame}
                onPlay={() => launchGame(selectedGame.id)}
                onEdit={() => openEditDialog(selectedGame.id)}
                onDelete={() => openDeleteDialog(selectedGame.id)}
              />
            ) : (
              <LibraryHome
                games={games}
                onSelect={selectGame}
                onPlay={launchGame}
              />
            )}
          </div>
        </div>
      ) : activeTab === "store" ? (
        <div className="flex-1 overflow-hidden">
          <StoreView />
        </div>
      ) : activeTab === "events" ? (
        <div className="flex-1 overflow-hidden">
          <EventsPage />
        </div>
      ) : activeTab === "downloads" ? (
        <div className="flex-1 overflow-hidden">
          <DownloadsPage
            onOpenGame={(id) => {
              setActiveTab("library");
              selectGame(id);
            }}
          />
        </div>
      ) : activeTab === "profile" ? (
        <div className="flex-1 overflow-hidden">
          <ProfilePage onOpenFriends={() => setActiveTab("friends")} />
        </div>
      ) : activeTab === "friends" ? (
        <div className="flex-1 overflow-hidden">
          <FriendsView onClose={() => setActiveTab("library")} />
        </div>
      ) : activeTab === "settings" ? (
        <div className="flex-1 overflow-hidden">
          <SettingsView onClose={() => setActiveTab("library")} />
        </div>
      ) : activeTab === "moderation" ? (
        <div className="flex-1 overflow-hidden">
          <AdminModerationView onClose={() => setActiveTab("library")} />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <WishlistPage onClose={() => setActiveTab("library")} />
        </div>
      )}

      <DownloadBar onOpen={() => setActiveTab("downloads")} />

      {isAddDialogOpen && <AddGameDialog />}
      {editingGame && <EditGameDialog game={editingGame} />}
      {deletingGame && <DeleteGameDialog game={deletingGame} />}
      {removingAccountGame && <RemoveFromAccountDialog game={removingAccountGame} />}
      {isSteamImportOpen && <SteamImportDialog />}
      {isLoginOpen && <LoginDialog onClose={() => setIsLoginOpen(false)} />}
      <GameContextMenu />
    </div>
  );
}

export default App;
