import { useEffect, useState } from "react";
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

function App() {
  const [activeTab, setActiveTab] = useState<"library" | "store">("library");
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const authUser = useAuthStore((s) => s.user);
  const authToken = useAuthStore((s) => s.token);
  const hydrateUser = useAuthStore((s) => s.hydrateUser);

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

  useEffect(() => {
    registerGameEventListeners();
    fetchGames();
    hydrateUser();
  }, [fetchGames, hydrateUser]);

  const selectedGame = games.find((g) => g.id === selectedGameId) ?? null;
  const editingGame = games.find((g) => g.id === editingGameId) ?? null;
  const deletingGame = games.find((g) => g.id === deletingGameId) ?? null;
  const removingAccountGame = games.find((g) => g.id === removingAccountGameId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-6">
          <button
            onClick={() => {
              setActiveTab("library");
              selectGame(null);
            }}
            className={`text-lg font-bold ${
              activeTab === "library" ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Bibliothek
          </button>
          <button
            onClick={() => setActiveTab("store")}
            className={`text-lg font-bold ${
              activeTab === "store" ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Store
          </button>
        </div>
        <div className="flex gap-3">
          {activeTab === "library" && (
            <>
              <button
                onClick={openSteamImport}
                className="rounded bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
              >
                Steam importieren
              </button>
              <button
                onClick={openAddDialog}
                className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
              >
                + Spiel hinzufügen
              </button>
            </>
          )}
          {authToken && authUser ? (
            <button
              onClick={() => setIsProfileOpen(true)}
              className="text-sm text-zinc-400 hover:text-zinc-200 hover:underline"
            >
              {authUser.display_name}
            </button>
          ) : (
            <button
              onClick={() => setIsLoginOpen(true)}
              className="rounded bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              Anmelden
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
          <div className="w-72 shrink-0 overflow-y-auto border-r border-zinc-800 p-4">
            {games.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Noch keine Spiele vorhanden. Füge ein Spiel hinzu, um zu
                beginnen.
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
      ) : (
        <div className="flex-1 overflow-hidden">
          <StoreView />
        </div>
      )}

      {isAddDialogOpen && <AddGameDialog />}
      {editingGame && <EditGameDialog game={editingGame} />}
      {deletingGame && <DeleteGameDialog game={deletingGame} />}
      {removingAccountGame && <RemoveFromAccountDialog game={removingAccountGame} />}
      {isSteamImportOpen && <SteamImportDialog />}
      {isLoginOpen && <LoginDialog onClose={() => setIsLoginOpen(false)} />}
      {isProfileOpen && <ProfilePage onClose={() => setIsProfileOpen(false)} />}
      <GameContextMenu />
    </div>
  );
}

export default App;
