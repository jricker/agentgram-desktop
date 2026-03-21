mod process_manager;

use process_manager::ProcessManager;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let manager = ProcessManager::new();
            app.manage(Mutex::new(manager));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            process_manager::start_agent,
            process_manager::stop_agent,
            process_manager::get_agent_status,
            process_manager::get_all_statuses,
            process_manager::get_agent_logs,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill all managed bridge processes when the app window closes
                if let Some(state) = window.try_state::<Mutex<ProcessManager>>() {
                    if let Ok(mut manager) = state.lock() {
                        eprintln!("[ProcessManager] App closing — killing all bridge processes");
                        manager.kill_all();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
