use crate::models::{Game, NewGame, UpdateAvailable, UpdateGame};
use crate::state::AppState;
use crate::steam::SteamGame;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager, State};

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
        catalog_game_id: row.get(9)?,
        installed_version: row.get(10)?,
    })
}

const GAME_SELECT: &str = "
    SELECT g.id, g.name, g.exe_path, g.cover_path, g.description, g.total_playtime_seconds,
           g.created_at, g.size_on_disk_bytes,
           (SELECT MAX(started_at) FROM play_sessions ps WHERE ps.game_id = g.id) AS last_played_at,
           g.catalog_game_id, g.installed_version
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
    if exe_path.starts_with("steam://") || exe_path.starts_with("store://") {
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
        "INSERT INTO games (name, exe_path, cover_path, description, size_on_disk_bytes, steam_install_dir, catalog_game_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            new_game.name,
            new_game.exe_path,
            new_game.cover_path,
            new_game.description,
            size_on_disk_bytes,
            new_game.steam_install_dir,
            new_game.catalog_game_id
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
        conn.execute(
            "DELETE FROM installed_files WHERE game_id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    }

    if delete_files && !exe_path.starts_with("steam://") && !exe_path.starts_with("store://") {
        if let Some(dir) = std::path::Path::new(&exe_path).parent() {
            let _ = std::fs::remove_dir_all(dir);
        }
        if let Some(cover) = cover_path {
            let _ = std::fs::remove_file(cover);
        }
    }

    Ok(())
}

/// Removes the locally installed files for a store-purchased game and resets
/// it back to the downloadable placeholder, without touching server-side
/// ownership — the game stays in the library and can be re-downloaded.
#[tauri::command]
pub fn uninstall_game(state: State<AppState>, id: i64) -> Result<Game, String> {
    let (exe_path, cover_path, catalog_game_id): (String, Option<String>, Option<i64>) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT exe_path, cover_path, catalog_game_id FROM games WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?
    };

    let catalog_game_id =
        catalog_game_id.ok_or("Dieses Spiel ist nicht mit dem Store verknüpft")?;

    if !exe_path.starts_with("store://") {
        if let Some(dir) = std::path::Path::new(&exe_path).parent() {
            let _ = std::fs::remove_dir_all(dir);
        }
        if let Some(cover) = &cover_path {
            if !cover.starts_with("http") {
                let _ = std::fs::remove_file(cover);
            }
        }
    }

    let placeholder = format!("store://catalog/{catalog_game_id}");
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE games SET exe_path = ?1, size_on_disk_bytes = 0, installed_version = NULL WHERE id = ?2",
            params![placeholder, id],
        )
        .map_err(|e| e.to_string())?;
        // The files are gone from disk now — forget what we "have", so a
        // future install re-downloads everything instead of wrongly
        // assuming the (now-deleted) files are still present and up to date.
        conn.execute(
            "DELETE FROM installed_files WHERE game_id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
    }

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

    if exe_path.starts_with("store://") {
        return Err("Für dieses Spiel wurde noch keine lokale Datei zugewiesen".into());
    }

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

/// Restores the frontend's bearer token into Rust-side state. The JWT
/// itself only lives in the webview's localStorage (managed by
/// `authStore.ts`); cloud-save sync runs around game launch/exit from Rust,
/// so the frontend calls this on every login/logout/hydrate to keep this
/// mirror in sync.
#[tauri::command]
pub fn set_auth_session(state: State<AppState>, token: Option<String>) -> Result<(), String> {
    let mut guard = state.auth_token.lock().map_err(|e| e.to_string())?;
    *guard = token;
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

    let catalog_game_id: Option<i64> = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT catalog_game_id FROM games WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    };
    try_sync_cloud_save_down(&state.auth_token, catalog_game_id);
    set_remote_playing_status(&state.auth_token, catalog_game_id);

    if exe_path.starts_with("store://") {
        return Err(
            "Für dieses gekaufte Spiel muss zuerst die ausführbare Datei zugewiesen werden (Bearbeiten -> Durchsuchen)"
                .into(),
        );
    }

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
            let auth_token = state.auth_token.clone();
            std::thread::spawn(move || {
                watch_process_under_dir(
                    db,
                    running_set,
                    app_handle,
                    id,
                    install_dir,
                    auth_token,
                    catalog_game_id,
                );
            });
        }

        return Ok(());
    }

    if exe_path.to_lowercase().ends_with(".app") {
        open::that(&exe_path).map_err(|e| format!("App konnte nicht gestartet werden: {e}"))?;

        let db = state.db.clone();
        let running_set = state.running.clone();
        let app_handle = app.clone();
        let bundle_path = exe_path.clone();
        let auth_token = state.auth_token.clone();
        std::thread::spawn(move || {
            watch_process_under_dir(
                db,
                running_set,
                app_handle,
                id,
                bundle_path,
                auth_token,
                catalog_game_id,
            );
        });

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
    let auth_token = state.auth_token.clone();

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
        try_sync_cloud_save_up(&auth_token, catalog_game_id);
        set_remote_playing_status(&auth_token, None);
    });

    Ok(())
}

/// Watches for a process whose executable path lives under `install_dir`
/// (used both for Steam games launched via `steam://` and for apps launched
/// indirectly, e.g. macOS `.app` bundles opened via `open`, where we don't
/// get a direct child process handle to `.wait()` on).
fn watch_process_under_dir(
    db: Arc<Mutex<Connection>>,
    running_set: Arc<Mutex<HashSet<i64>>>,
    app: AppHandle,
    id: i64,
    install_dir: String,
    auth_token: Arc<Mutex<Option<String>>>,
    catalog_game_id: Option<i64>,
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
    try_sync_cloud_save_up(&auth_token, catalog_game_id);
    set_remote_playing_status(&auth_token, None);
}

// Set DOVE_API_BASE at build time to point a release build at the deployed
// backend instead of localhost (mirrors VITE_API_BASE on the frontend side).
const STORE_API_BASE: &str = match option_env!("DOVE_API_BASE") {
    Some(url) => url,
    None => "http://127.0.0.1:4000",
};
const PAUSED_SENTINEL: &str = "__paused__";

/// Walks a directory recursively and returns every regular file found.
fn collect_files(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_files(&path, out);
            } else {
                out.push(path);
            }
        }
    }
}

const CLOUD_SAVE_MAX_BYTES: usize = 100 * 1024 * 1024;

/// Expands the placeholders a publisher might use in `save_path_hint`
/// (e.g. `%APPDATA%/MyGame/saves`, `~/Library/.../MyGame`). Returns `None`
/// if a placeholder can't be resolved on this OS (e.g. `%APPDATA%` on
/// macOS) — callers treat that as "skip sync", since a hint is free text
/// written for whichever platform the publisher targeted, not necessarily
/// this one.
fn expand_save_path(hint: &str) -> Option<std::path::PathBuf> {
    let trimmed = hint.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut expanded = trimmed.to_string();
    for (placeholder, env_var) in [
        ("%APPDATA%", "APPDATA"),
        ("%LOCALAPPDATA%", "LOCALAPPDATA"),
        ("%USERPROFILE%", "USERPROFILE"),
    ] {
        if expanded.to_uppercase().contains(placeholder) {
            let value = std::env::var(env_var).ok()?;
            expanded = expanded.replace(placeholder, &value);
        }
    }
    if let Some(rest) = expanded.strip_prefix('~') {
        let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).ok()?;
        expanded = format!("{home}{rest}");
    }
    Some(std::path::PathBuf::from(expanded))
}

#[derive(serde::Deserialize)]
struct RemoteSavePathHint {
    save_path_hint: Option<String>,
}

fn fetch_save_path_hint(catalog_game_id: i64) -> Option<String> {
    let info: RemoteSavePathHint =
        ureq::get(&format!("{STORE_API_BASE}/api/games/{catalog_game_id}"))
            .call()
            .ok()?
            .into_json()
            .ok()?;
    info.save_path_hint
}

#[derive(serde::Deserialize)]
struct RemoteCloudSaveMeta {
    updated_at: String,
}

fn zip_dir_to_bytes(dir: &std::path::Path) -> Result<Vec<u8>, String> {
    let mut files = Vec::new();
    collect_files(dir, &mut files);
    if files.is_empty() {
        return Err("Spielstand-Ordner ist leer".to_string());
    }
    let mut buf = Vec::new();
    {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for file_path in &files {
            let relative = file_path.strip_prefix(dir).map_err(|e| e.to_string())?;
            let name = relative.to_string_lossy().replace('\\', "/");
            writer.start_file(name, options).map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(file_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut writer).map_err(|e| e.to_string())?;
        }
        writer.finish().map_err(|e| e.to_string())?;
    }
    Ok(buf)
}

fn unzip_bytes_to_dir(bytes: &[u8], dir: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let out_path = dir.join(relative);
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Unix timestamp of the most recently modified file in `dir`, recursively.
fn newest_mtime_unix(dir: &std::path::Path) -> Option<i64> {
    let mut files = Vec::new();
    collect_files(dir, &mut files);
    files
        .iter()
        .filter_map(|f| std::fs::metadata(f).ok()?.modified().ok())
        .filter_map(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .max()
}

/// Pulls the cloud save down before launch if it's newer than the local
/// save folder. Best-effort and silent by design: missing token, no
/// `save_path_hint`, no cloud save yet, network errors, or an
/// unresolvable placeholder on this OS all just skip the sync rather than
/// blocking or failing the actual game launch.
fn try_sync_cloud_save_down(auth_token: &Arc<Mutex<Option<String>>>, catalog_game_id: Option<i64>) {
    let Some(catalog_game_id) = catalog_game_id else {
        return;
    };
    let Some(token) = auth_token.lock().ok().and_then(|t| t.clone()) else {
        return;
    };
    let Some(hint) = fetch_save_path_hint(catalog_game_id) else {
        return;
    };
    let Some(save_dir) = expand_save_path(&hint) else {
        return;
    };

    let meta: RemoteCloudSaveMeta = match ureq::get(&format!(
        "{STORE_API_BASE}/api/games/{catalog_game_id}/cloud-save"
    ))
    .set("Authorization", &format!("Bearer {token}"))
    .call()
    {
        Ok(response) => match response.into_json() {
            Ok(meta) => meta,
            Err(_) => return,
        },
        // 404 (no cloud save yet) or a network error — nothing to pull.
        Err(_) => return,
    };

    let remote_updated_at_unix =
        chrono::NaiveDateTime::parse_from_str(&meta.updated_at, "%Y-%m-%d %H:%M:%S")
            .ok()
            .map(|naive| naive.and_utc().timestamp());

    let local_newer = match (newest_mtime_unix(&save_dir), remote_updated_at_unix) {
        (Some(local_ts), Some(remote_ts)) => local_ts > remote_ts,
        (Some(_), None) => true,
        _ => false,
    };
    if local_newer {
        return;
    }

    let response = match ureq::get(&format!(
        "{STORE_API_BASE}/api/games/{catalog_game_id}/cloud-save/download"
    ))
    .set("Authorization", &format!("Bearer {token}"))
    .call()
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Cloud-Save-Download fehlgeschlagen: {e}");
            return;
        }
    };
    let mut bytes = Vec::new();
    {
        use std::io::Read;
        if response.into_reader().read_to_end(&mut bytes).is_err() {
            return;
        }
    }
    if let Err(e) = unzip_bytes_to_dir(&bytes, &save_dir) {
        eprintln!("Cloud-Save konnte nicht entpackt werden: {e}");
    }
}

/// Zips the local save folder and pushes it after the game exits. Same
/// best-effort/silent philosophy as the download side.
fn try_sync_cloud_save_up(auth_token: &Arc<Mutex<Option<String>>>, catalog_game_id: Option<i64>) {
    let Some(catalog_game_id) = catalog_game_id else {
        return;
    };
    let Some(token) = auth_token.lock().ok().and_then(|t| t.clone()) else {
        return;
    };
    let Some(hint) = fetch_save_path_hint(catalog_game_id) else {
        return;
    };
    let Some(save_dir) = expand_save_path(&hint) else {
        return;
    };
    if !save_dir.is_dir() {
        return;
    }

    let bytes = match zip_dir_to_bytes(&save_dir) {
        Ok(b) => b,
        Err(_) => return,
    };
    if bytes.len() > CLOUD_SAVE_MAX_BYTES {
        eprintln!("Cloud-Save zu groß, Upload übersprungen");
        return;
    }

    if let Err(e) = ureq::put(&format!(
        "{STORE_API_BASE}/api/games/{catalog_game_id}/cloud-save"
    ))
    .set("Authorization", &format!("Bearer {token}"))
    .set("Content-Type", "application/octet-stream")
    .send_bytes(&bytes)
    {
        eprintln!("Cloud-Save-Upload fehlgeschlagen: {e}");
    }
}

/// Tells the store who's playing what, so friends see "spielt gerade X" —
/// the server only surfaces this while the player is also "online" (recent
/// activity), so a crashed launcher that never clears this self-heals
/// rather than leaving a permanently stale status. Best-effort: no token or
/// a network error just means the status doesn't update this time.
fn set_remote_playing_status(
    auth_token: &Arc<Mutex<Option<String>>>,
    catalog_game_id: Option<i64>,
) {
    let Some(token) = auth_token.lock().ok().and_then(|t| t.clone()) else {
        return;
    };
    let body = serde_json::json!({ "catalog_game_id": catalog_game_id });
    if let Err(e) = ureq::patch(&format!("{STORE_API_BASE}/api/me/playing"))
        .set("Authorization", &format!("Bearer {token}"))
        .send_json(body)
    {
        eprintln!("Spielstatus konnte nicht aktualisiert werden: {e}");
    }
}

/// Walks a directory recursively and collects every macOS `.app` bundle
/// found (without descending into the bundle itself).
fn collect_app_bundles(dir: &std::path::Path, out: &mut Vec<std::path::PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) == Some("app") {
                out.push(path);
            } else {
                collect_app_bundles(&path, out);
            }
        }
    }
}

/// Heuristic for "this is probably the game's launcher", used to pick an
/// executable out of a folder containing multiple files. Files with no
/// extension are very commonly Unix binaries; the rest are well-known
/// script/launcher extensions across platforms.
fn looks_like_executable(path: &std::path::Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        None => true,
        Some(ext) => matches!(
            ext.to_lowercase().as_str(),
            "sh" | "command" | "exe" | "bat" | "appimage"
        ),
    }
}

#[cfg(unix)]
fn make_executable(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perms = meta.permissions();
        perms.set_mode(perms.mode() | 0o111);
        let _ = std::fs::set_permissions(path, perms);
    }
}

#[cfg(not(unix))]
fn make_executable(_path: &std::path::Path) {}

/// Picks the most likely game executable out of an extracted install
/// directory: a single `.app` bundle wins outright (macOS), then a single
/// file overall, then a single file that "looks like" an executable. If
/// none of these are unambiguous, the caller falls back to asking the user
/// to pick the file manually.
fn detect_exe_path(install_dir: &std::path::Path) -> Option<String> {
    let mut app_bundles = Vec::new();
    collect_app_bundles(install_dir, &mut app_bundles);
    if app_bundles.len() == 1 {
        return Some(app_bundles[0].to_string_lossy().into_owned());
    }
    if !app_bundles.is_empty() {
        return None;
    }

    let mut files = Vec::new();
    collect_files(install_dir, &mut files);

    if files.len() == 1 {
        make_executable(&files[0]);
        return Some(files[0].to_string_lossy().into_owned());
    }

    let candidates: Vec<_> = files.iter().filter(|f| looks_like_executable(f)).collect();
    if candidates.len() == 1 {
        make_executable(candidates[0]);
        return Some(candidates[0].to_string_lossy().into_owned());
    }

    None
}

/// Removes the cancellation flag for a download when dropped, so it can't
/// linger and falsely "pause" a later, unrelated download of the same id.
struct DownloadGuard {
    downloads: Arc<Mutex<std::collections::HashMap<i64, Arc<AtomicBool>>>>,
    id: i64,
}

impl Drop for DownloadGuard {
    fn drop(&mut self) {
        if let Ok(mut map) = self.downloads.lock() {
            map.remove(&self.id);
        }
    }
}

#[derive(serde::Deserialize)]
struct RemoteManifestFile {
    relative_path: String,
    sha256: String,
    size_bytes: i64,
}

#[derive(serde::Deserialize)]
struct RemoteManifest {
    version: String,
    file_url: String,
    files: Vec<RemoteManifestFile>,
}

fn fetch_manifest(catalog_game_id: i64) -> Result<RemoteManifest, String> {
    ureq::get(&format!(
        "{STORE_API_BASE}/api/games/{catalog_game_id}/manifest"
    ))
    .call()
    .map_err(|e| format!("Spiel-Infos konnten nicht geladen werden: {e}"))?
    .into_json()
    .map_err(|e| e.to_string())
}

fn encode_relative_path(relative_path: &str) -> String {
    relative_path
        .split('/')
        .map(|segment| urlencoding::encode(segment).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn local_installed_hashes(
    conn: &Connection,
    game_id: i64,
) -> Result<std::collections::HashMap<String, String>, String> {
    let mut stmt = conn
        .prepare("SELECT relative_path, sha256 FROM installed_files WHERE game_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![game_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

fn sha256_of_file(path: &std::path::Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let read = file.read(&mut buf).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Downloads a single manifest file into `dest_path`, resuming from a
/// matching `.part` file on disk if one exists, and reporting progress
/// against the overall (multi-file) download totals. After the transfer
/// completes, the file's SHA256 is verified against the manifest before it
/// is moved into place — a corrupted or tampered-with download is deleted
/// and reported as an error rather than silently installed.
fn download_one_file(
    app: &AppHandle,
    cancel_flag: &Arc<AtomicBool>,
    id: i64,
    url: &str,
    dest_path: &std::path::Path,
    relative_path: &str,
    expected_sha256: &str,
    hash_suffix: &str,
    downloaded_total: &mut u64,
    grand_total: u64,
    last_emit: &mut std::time::Instant,
) -> Result<(), String> {
    use std::fs::OpenOptions;
    use std::io::{Read, Write};

    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let temp_path = dest_path.with_file_name(format!(
        "{}.{}.part",
        dest_path.file_name().unwrap_or_default().to_string_lossy(),
        hash_suffix
    ));
    let existing_bytes = std::fs::metadata(&temp_path).map(|m| m.len()).unwrap_or(0);

    let mut request = ureq::get(url);
    if existing_bytes > 0 {
        request = request.set("Range", &format!("bytes={existing_bytes}-"));
    }
    let response = request
        .call()
        .map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    let is_resuming = existing_bytes > 0 && response.status() == 206;

    let mut reader = response.into_reader();
    let mut file = if is_resuming {
        OpenOptions::new()
            .append(true)
            .open(&temp_path)
            .map_err(|e| e.to_string())?
    } else {
        std::fs::File::create(&temp_path).map_err(|e| e.to_string())?
    };

    if is_resuming {
        *downloaded_total += existing_bytes;
    }

    let mut buf = [0u8; 65536];
    loop {
        if cancel_flag.load(Ordering::SeqCst) {
            app.emit(
                "install-progress",
                serde_json::json!({ "id": id, "phase": "paused" }),
            )
            .ok();
            return Err(PAUSED_SENTINEL.to_string());
        }

        let read = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        file.write_all(&buf[..read]).map_err(|e| e.to_string())?;
        *downloaded_total += read as u64;

        if last_emit.elapsed().as_millis() >= 100 {
            app.emit(
                "install-progress",
                serde_json::json!({
                    "id": id,
                    "phase": "downloading",
                    "downloaded": *downloaded_total,
                    "total": grand_total,
                }),
            )
            .ok();
            *last_emit = std::time::Instant::now();
        }
    }
    drop(file);

    let actual_sha256 = sha256_of_file(&temp_path)?;
    if actual_sha256 != expected_sha256 {
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!(
            "Prüfsumme stimmt nicht überein für {relative_path} \
             (Download beschädigt oder unterbrochen) — bitte erneut versuchen."
        ));
    }

    std::fs::rename(&temp_path, dest_path).map_err(|e| e.to_string())?;
    Ok(())
}

/// The actual download/extract work, run off the main thread via
/// `spawn_blocking` so the UI keeps rendering progress updates instead of
/// freezing for the duration of the (blocking) network + disk I/O. Acts as
/// both a fresh install AND an update: only files whose hash differs from
/// what's already recorded locally are downloaded, and locally-known files
/// removed from the new manifest are deleted — a delta update, not a full
/// re-download, regardless of overall game size.
const INSTALL_DIR_SETTING_KEY: &str = "install_dir";

fn default_install_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("installed"))
}

/// Resolves the configured install root, falling back to the default
/// `<app_data_dir>/installed` if the user has never overridden it.
fn install_root(app: &AppHandle, conn: &Connection) -> Result<PathBuf, String> {
    let custom: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![INSTALL_DIR_SETTING_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    match custom {
        Some(dir) => Ok(PathBuf::from(dir)),
        None => default_install_root(app),
    }
}

#[tauri::command]
pub fn get_install_dir(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let dir = install_root(&app, &conn)?;
    Ok(dir.to_string_lossy().to_string())
}

/// Changes where future game installs are written to. Existing installs are
/// left in place — this only takes effect for installs that happen after
/// the change.
#[tauri::command]
pub fn set_install_dir(state: State<AppState>, path: String) -> Result<(), String> {
    let dir = PathBuf::from(&path);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Ordner konnte nicht erstellt werden: {e}"))?;

    let probe = dir.join(".dove_write_test");
    std::fs::write(&probe, b"ok")
        .map_err(|e| format!("Ordner ist nicht beschreibbar: {e}"))?;
    let _ = std::fs::remove_file(&probe);

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![INSTALL_DIR_SETTING_KEY, path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Writes text to a path the user picked via a save dialog (e.g.
/// `@tauri-apps/plugin-dialog`'s `save()`). Exists because the
/// `<a download>` blob-URL trick that works in a real browser doesn't
/// reliably trigger a download inside Tauri's webview — this writes the
/// file directly instead.
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Datei konnte nicht gespeichert werden: {e}"))
}

fn install_catalog_game_blocking(app: AppHandle, state: AppState, id: i64) -> Result<Game, String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut map = state.downloads.lock().map_err(|e| e.to_string())?;
        map.insert(id, cancel_flag.clone());
    }
    let _guard = DownloadGuard {
        downloads: state.downloads.clone(),
        id,
    };

    let (catalog_game_id, current_exe_path): (Option<i64>, String) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT catalog_game_id, exe_path FROM games WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?
    };
    let catalog_game_id =
        catalog_game_id.ok_or("Dieses Spiel ist nicht mit dem Store verknüpft")?;
    let is_fresh_install = current_exe_path.starts_with("store://");

    let manifest = fetch_manifest(catalog_game_id)?;
    if manifest.files.is_empty() {
        return Err("Für dieses Spiel wurde noch keine Datei vom Publisher hochgeladen".into());
    }

    let (install_root, local_hashes) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        (install_root(&app, &conn)?, local_installed_hashes(&conn, id)?)
    };
    let install_dir = install_root.join(id.to_string());
    std::fs::create_dir_all(&install_dir).map_err(|e| e.to_string())?;

    let files_to_fetch: Vec<&RemoteManifestFile> = manifest
        .files
        .iter()
        .filter(|f| local_hashes.get(&f.relative_path) != Some(&f.sha256))
        .collect();

    let grand_total: u64 = files_to_fetch.iter().map(|f| f.size_bytes as u64).sum();
    let mut downloaded_total: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    for file in &files_to_fetch {
        let dest_path = install_dir.join(&file.relative_path);
        let url = format!(
            "{}{}",
            manifest.file_url,
            encode_relative_path(&file.relative_path)
        );

        download_one_file(
            &app,
            &cancel_flag,
            id,
            &url,
            &dest_path,
            &file.relative_path,
            &file.sha256,
            &file.sha256[..8],
            &mut downloaded_total,
            grand_total,
            &mut last_emit,
        )?;

        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO installed_files (game_id, relative_path, sha256) VALUES (?1, ?2, ?3)
             ON CONFLICT(game_id, relative_path) DO UPDATE SET sha256 = excluded.sha256",
            params![id, file.relative_path, file.sha256],
        )
        .map_err(|e| e.to_string())?;
    }

    if grand_total > 0 {
        app.emit(
            "install-progress",
            serde_json::json!({
                "id": id,
                "phase": "downloading",
                "downloaded": downloaded_total,
                "total": grand_total,
            }),
        )
        .ok();
    }

    // Remove files that existed locally but were dropped from the new manifest.
    let remote_paths: std::collections::HashSet<&str> = manifest
        .files
        .iter()
        .map(|f| f.relative_path.as_str())
        .collect();
    for stale_path in local_hashes.keys().filter(|p| !remote_paths.contains(p.as_str())) {
        let _ = std::fs::remove_file(install_dir.join(stale_path));
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let _ = conn.execute(
            "DELETE FROM installed_files WHERE game_id = ?1 AND relative_path = ?2",
            params![id, stale_path],
        );
    }

    app.emit(
        "install-progress",
        serde_json::json!({ "id": id, "phase": "extracting" }),
    )
    .ok();

    let exe_path = if is_fresh_install {
        detect_exe_path(&install_dir)
    } else {
        Some(current_exe_path)
    };
    let size_on_disk_bytes = compute_dir_size(&install_dir);

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(exe_path) = &exe_path {
            conn.execute(
                "UPDATE games SET exe_path = ?1, size_on_disk_bytes = ?2, installed_version = ?3 WHERE id = ?4",
                params![exe_path, size_on_disk_bytes, manifest.version, id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "UPDATE games SET size_on_disk_bytes = ?1, installed_version = ?2 WHERE id = ?3",
                params![size_on_disk_bytes, manifest.version, id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    if exe_path.is_none() {
        return Err(format!(
            "Spiel wurde installiert, aber die Programmdatei konnte nicht eindeutig erkannt werden. \
             Bitte über \"Bearbeiten\" die richtige Programmdatei in {} auswählen.",
            install_dir.display()
        ));
    }

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
pub async fn install_catalog_game(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
) -> Result<Game, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || install_catalog_game_blocking(app, state, id))
        .await
        .map_err(|e| e.to_string())?
}

fn check_for_update_blocking(state: AppState, id: i64) -> Result<Option<UpdateAvailable>, String> {
    let (catalog_game_id, installed_version, exe_path): (Option<i64>, Option<String>, String) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT catalog_game_id, installed_version, exe_path FROM games WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?
    };
    let catalog_game_id =
        catalog_game_id.ok_or("Dieses Spiel ist nicht mit dem Store verknüpft")?;

    if exe_path.starts_with("store://") {
        // Not installed yet — nothing to "update".
        return Ok(None);
    }

    let manifest = fetch_manifest(catalog_game_id)?;

    let local_hashes = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        local_installed_hashes(&conn, id)?
    };

    let outdated_files: Vec<&RemoteManifestFile> = manifest
        .files
        .iter()
        .filter(|f| local_hashes.get(&f.relative_path) != Some(&f.sha256))
        .collect();

    if outdated_files.is_empty() && installed_version.as_deref() == Some(manifest.version.as_str())
    {
        return Ok(None);
    }
    if outdated_files.is_empty() {
        // Version label changed but every file's content is identical —
        // still worth surfacing so the stored version label can catch up.
        return Ok(Some(UpdateAvailable {
            installed_version,
            latest_version: manifest.version,
            files_to_update: 0,
            bytes_to_download: 0,
        }));
    }

    Ok(Some(UpdateAvailable {
        installed_version,
        latest_version: manifest.version,
        files_to_update: outdated_files.len(),
        bytes_to_download: outdated_files.iter().map(|f| f.size_bytes).sum(),
    }))
}

#[tauri::command]
pub async fn check_for_update(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<UpdateAvailable>, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || check_for_update_blocking(state, id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn pause_download(state: State<AppState>, id: i64) -> Result<(), String> {
    let map = state.downloads.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = map.get(&id) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}
