mod backend;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    backend::run();
}
