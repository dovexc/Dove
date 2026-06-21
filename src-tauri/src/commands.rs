use crate::models::{Game, NewGame, UpdateGame};
use crate::state::AppState;
use crate::steam::SteamGame;
use chrono::Utc;
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::process::Command;
use std::sync::{Arc, Mutex};
use sysinfo::{ProcessesToUpdate, System};
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
        size_on_disk_bytes: row.get(7)?,
        last_played_at: row.get(8)?,
        is_running: running.contains(&id),
    })
}

const GAME_SELECT: &str = "
    SELECT g.id, g.name, g.exe_path, g.cover_path, g.description, g.total_playtime_seconds,
           g.created_at, g.size_on_disk_bytes,
           (SELECT MAX(started_at) FROM play_sessions ps WHERE ps.game_id = g.id) AS last_played_at
    FROM games g
";

fn compute_dir_size(path: &std::path::Path) -> i64 {
    let mut total = 0i64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += compute_dir_size(&p);
            } else if let Ok(meta) = entry.metadata() {
                total += meta.len() as i64;
            }
        }
    }
    total
}

fn compute_size_on_disk(exe_path: &str) -> i64 {
    if exe_path.starts_with("steam://") {
        return 0;
    }
    std::path::Path::new(exe_path)
        .parent()
        .map(compute_dir_size)
        .unwrap_or(0)
}

#[tauri::command]
pub fn add_game(state: State<AppState>, new_game: NewGame) -> Result<Game, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let size_on_disk_bytes = new_game
        .size_on_disk_bytes
        .unwrap_or_else(|| compute_size_on_disk(&new_game.exe_path));
    conn.execute(
        "INSERT INTO games (name, exe_path, cover_path, description, size_on_disk_bytes, steam_install_dir) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            new_game.name,
            new_game.exe_path,
            new_game.cover_path,
            new_game.description,
            size_on_disk_bytes,
            new_game.steam_install_dir
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let running = state.running.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{GAME_SELECT} WHERE g.id = ?1"),
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
        .prepare(&format!("{GAME_SELECT} ORDER BY g.name"))
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
        &format!("{GAME_SELECT} WHERE g.id = ?1"),
        params![id],
        |row| row_to_game(row, &running),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_game(
    state: State<AppState>,
    id: i64,
    updated_game: UpdateGame,
) -> Result<Game, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let size_on_disk_bytes = updated_game
        .size_on_disk_bytes
        .unwrap_or_else(|| compute_size_on_disk(&updated_game.exe_path));
    conn.execute(
        "UPDATE games SET name = ?1, exe_path = ?2, cover_path = ?3, description = ?4, size_on_disk_bytes = ?5 WHERE id = ?6",
        params![
            updated_game.name,
            updated_game.exe_path,
            updated_game.cover_path,
            updated_game.description,
            size_on_disk_bytes,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    let running = state.running.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{GAME_SELECT} WHERE g.id = ?1"),
        params![id],
        |row| row_to_game(row, &running),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_game(state: State<AppState>, id: i64, delete_files: bool) -> Result<(), String> {
    let (exe_path, cover_path) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT exe_path, cover_path FROM games WHERE id = ?1",
            params![id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map_err(|e| e.to_string())?
    };

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM games WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
    }

    if delete_files && !exe_path.starts_with("steam://") {
        if let Some(dir) = std::path::Path::new(&exe_path).parent() {
            let _ = std::fs::remove_dir_all(dir);
        }
        if let Some(cover) = cover_path {
            let _ = std::fs::remove_file(cover);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn find_steam_games() -> Result<Vec<SteamGame>, String> {
    crate::steam::scan_installed_games()
}

#[tauri::command]
pub fn reveal_game_folder(state: State<AppState>, id: i64) -> Result<(), String> {
    let (exe_path, steam_install_dir) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT exe_path, steam_install_dir FROM games WHERE id = ?1",
            params![id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map_err(|e| e.to_string())?
    };

    let folder = if exe_path.starts_with("steam://") {
        steam_install_dir.ok_or("Kein Installationsordner bekannt")?
    } else {
        std::path::Path::new(&exe_path)
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .ok_or("Kein Ordner gefunden")?
    };

    open::that(&folder).map_err(|e| format!("Ordner konnte nicht geöffnet werden: {e}"))
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

    if exe_path.starts_with("steam://") {
        open::that(&exe_path).map_err(|e| format!("Steam konnte nicht gestartet werden: {e}"))?;

        let install_dir = {
            let conn = state.db.lock().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT steam_install_dir FROM games WHERE id = ?1",
                params![id],
                |row| row.get::<_, Option<String>>(0),
            )
            .map_err(|e| e.to_string())?
        };

        if let Some(install_dir) = install_dir {
            let db = state.db.clone();
            let running_set = state.running.clone();
            let app_handle = app.clone();
            std::thread::spawn(move || {
                watch_steam_game(db, running_set, app_handle, id, install_dir);
            });
        }

        return Ok(());
    }

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

fn watch_steam_game(
    db: Arc<Mutex<Connection>>,
    running_set: Arc<Mutex<HashSet<i64>>>,
    app: AppHandle,
    id: i64,
    install_dir: String,
) {
    let install_dir_lower = install_dir.to_lowercase();
    let mut sys = System::new();

    let mut found_pid = None;
    for _ in 0..60 {
        sys.refresh_processes(ProcessesToUpdate::All, true);
        for (pid, process) in sys.processes() {
            if let Some(exe) = process.exe() {
                if exe.to_string_lossy().to_lowercase().starts_with(&install_dir_lower) {
                    found_pid = Some(*pid);
                    break;
                }
            }
        }
        if found_pid.is_some() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_secs(2));
    }

    let Some(pid) = found_pid else {
        return;
    };

    {
        if let Ok(mut running) = running_set.lock() {
            running.insert(id);
        }
    }

    let started_at = Utc::now();
    if let Ok(conn) = db.lock() {
        let _ = conn.execute(
            "INSERT INTO play_sessions (game_id, started_at) VALUES (?1, ?2)",
            params![id, started_at.to_rfc3339()],
        );
    }
    app.emit("game-started", id).ok();

    loop {
        std::thread::sleep(std::time::Duration::from_secs(3));
        sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
        if sys.process(pid).is_none() {
            break;
        }
    }

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
    app.emit("game-stopped", id).ok();
}
