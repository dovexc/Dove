mod commands;
mod db;
mod models;
mod state;
mod steam;

use state::AppState;
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let conn = db::init(&app_data_dir);
            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                running: Arc::new(Mutex::new(Default::default())),
                downloads: Arc::new(Mutex::new(Default::default())),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_game,
            commands::list_games,
            commands::get_game,
            commands::update_game,
            commands::delete_game,
            commands::uninstall_game,
            commands::launch_game,
            commands::find_steam_games,
            commands::reveal_game_folder,
            commands::install_catalog_game,
            commands::pause_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
