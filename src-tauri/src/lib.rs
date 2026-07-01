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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            let conn = db::init(&app_data_dir);
            let auth_token = Arc::new(Mutex::new(None));
            let achievement_sessions = Arc::new(Mutex::new(Default::default()));

            // Local-only relay so a running game can report achievement
            // unlocks without ever holding the user's real JWT — see
            // `commands::run_achievement_relay`. Binds to port 0 (OS picks
            // a free one) so there's no fixed-port collision risk.
            let relay_server = tiny_http::Server::http("127.0.0.1:0")
                .expect("failed to bind achievement relay");
            let achievement_port = relay_server.server_addr().to_ip().expect("relay must be TCP").port();
            {
                let sessions = achievement_sessions.clone();
                let auth_token = auth_token.clone();
                std::thread::spawn(move || {
                    commands::run_achievement_relay(relay_server, sessions, auth_token);
                });
            }

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                running: Arc::new(Mutex::new(Default::default())),
                downloads: Arc::new(Mutex::new(Default::default())),
                auth_token,
                achievement_sessions,
                achievement_port,
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
            commands::check_for_update,
            commands::set_auth_session,
            commands::get_install_dir,
            commands::set_install_dir,
            commands::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
