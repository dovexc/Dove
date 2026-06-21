import { useEffect } from "react";
import { useLibraryStore, registerGameEventListeners } from "./store";
import { GameCard } from "./components/GameCard";
import { GameDetail } from "./components/GameDetail";
import { AddGameDialog } from "./components/AddGameDialog";

function App() {
  const games = useLibraryStore((s) => s.games);
  const selectedGameId = useLibraryStore((s) => s.selectedGameId);
  const isAddDialogOpen = useLibraryStore((s) => s.isAddDialogOpen);
  const error = useLibraryStore((s) => s.error);
  const fetchGames = useLibraryStore((s) => s.fetchGames);
  const selectGame = useLibraryStore((s) => s.selectGame);
  const launchGame = useLibraryStore((s) => s.launchGame);
  const deleteGame = useLibraryStore((s) => s.deleteGame);
  const openAddDialog = useLibraryStore((s) => s.openAddDialog);
  const clearError = useLibraryStore((s) => s.clearError);

  useEffect(() => {
    registerGameEventListeners();
    fetchGames();
  }, [fetchGames]);

  const selectedGame = games.find((g) => g.id === selectedGameId) ?? null;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-bold">Spielebibliothek</h1>
        <button
          onClick={openAddDialog}
          className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
        >
          + Spiel hinzufügen
        </button>
      </header>

      {error && (
        <div className="flex items-center justify-between bg-red-900/60 px-6 py-2 text-sm text-red-100">
          <span>{error}</span>
          <button onClick={clearError} className="font-bold">
            ✕
          </button>
        </div>
      )}

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
              onDelete={() => deleteGame(selectedGame.id)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500">
              Wähle ein Spiel aus der Bibliothek aus
            </div>
          )}
        </div>
      </div>

      {isAddDialogOpen && <AddGameDialog />}
    </div>
  );
}

export default App;
