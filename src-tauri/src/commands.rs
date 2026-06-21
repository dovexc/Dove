use crate::models::{Game, NewGame};
use crate::state::AppState;
use chrono::Utc;
use rusqlite::params;
use std::collections::HashSet;
use std::process::Command;
use tauri::{AppHandle, Emitter, State};

fn row_to_game(row: &rusqlite::Row, running: &HashSet<i64>) -> rusqlite::Result<Game> {
    let id: i64 = row.get(0)?;
    Ok(Game {
        id,
        name: row.get(1)?,
        exe_path: row.get(2)?,
        cover_path: row.get(3)?,
        description: row.get(4)?,
        total_playtime_seconds: row.get(5)?,
        created_at: row.get(6)?,
        is_running: running.contains(&id),
    })
}

const GAME_COLUMNS: &str =
    "id, name, exe_path, cover_path, description, total_playtime_seconds, created_at";

#[tauri::command]
pub fn add_game(state: State<AppState>, new_game: NewGame) -> Result<Game, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO games (name, exe_path, cover_path, description) VALUES (?1, ?2, ?3, ?4)",
        params![
            new_game.name,
            new_game.exe_path,
            new_game.cover_path,
            new_game.description
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let running = state.running.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {GAME_COLUMNS} FROM games WHERE id = ?1"),
        params![id],
        |row| row_to_game(row, &running),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_games(state: State<AppState>) -> Result<Vec<Game>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let running = state.running.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!("SELECT {GAME_COLUMNS} FROM games ORDER BY name"))
        .map_err(|e| e.to_string())?;
    let games = stmt
        .query_map([], |row| row_to_game(row, &running))
        .map_err(|e| e.to_string())?
        .filter_map(|g| g.ok())
        .collect();
    Ok(games)
}

#[tauri::command]
pub fn get_game(state: State<AppState>, id: i64) -> Result<Game, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let running = state.running.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {GAME_COLUMNS} FROM games WHERE id = ?1"),
        params![id],
        |row| row_to_game(row, &running),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_game(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM games WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn launch_game(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    let exe_path = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT exe_path FROM games WHERE id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| e.to_string())?
    };

    {
        let mut running = state.running.lock().map_err(|e| e.to_string())?;
        if running.contains(&id) {
            return Err("Spiel läuft bereits".into());
        }
        running.insert(id);
    }

    let spawn_result = Command::new(&exe_path).spawn();
    let mut child = match spawn_result {
        Ok(child) => child,
        Err(e) => {
            state.running.lock().map_err(|e| e.to_string())?.remove(&id);
            return Err(format!("Spiel konnte nicht gestartet werden: {e}"));
        }
    };

    let started_at = Utc::now();
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO play_sessions (game_id, started_at) VALUES (?1, ?2)",
            params![id, started_at.to_rfc3339()],
        )
        .map_err(|e| e.to_string())?;
    }

    app.emit("game-started", id).ok();

    let db = state.db.clone();
    let running_set = state.running.clone();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let _ = child.wait();
        let ended_at = Utc::now();
        let elapsed = (ended_at - started_at).num_seconds().max(0);

        if let Ok(conn) = db.lock() {
            let _ = conn.execute(
                "UPDATE play_sessions SET ended_at = ?1 WHERE game_id = ?2 AND ended_at IS NULL",
                params![ended_at.to_rfc3339(), id],
            );
            let _ = conn.execute(
                "UPDATE games SET total_playtime_seconds = total_playtime_seconds + ?1 WHERE id = ?2",
                params![elapsed, id],
            );
        }
        if let Ok(mut running) = running_set.lock() {
            running.remove(&id);
        }
        app_handle.emit("game-stopped", id).ok();
    });

    Ok(())
}
