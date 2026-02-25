use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryEntry {
    pub path: String,
    pub last_opened: i64,
    pub open_count: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileHistory {
    pub version: String,
    pub max_entries: usize,
    pub entries: Vec<HistoryEntry>,
}

#[tauri::command]
pub fn load_history(app: tauri::AppHandle) -> Result<FileHistory, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let history_path = app_data.join("history.json");

    if history_path.exists() {
        let content = std::fs::read_to_string(&history_path)
            .map_err(|e| format!("Erro ao ler histórico: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Erro ao parsear histórico: {}", e))
    } else {
        Ok(FileHistory {
            version: "1.0".to_string(),
            max_entries: 20,
            entries: Vec::new(),
        })
    }
}

#[tauri::command]
pub fn save_history(app: tauri::AppHandle, history: FileHistory) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;

    let history_path = app_data.join("history.json");
    let json = serde_json::to_string_pretty(&history)
        .map_err(|e| format!("Erro ao serializar: {}", e))?;

    std::fs::write(&history_path, json)
        .map_err(|e| format!("Erro ao salvar histórico: {}", e))
}

#[tauri::command]
pub fn add_to_history(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let mut history = load_history(app.clone())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    if let Some(entry) = history.entries.iter_mut().find(|e| e.path == file_path) {
        entry.last_opened = timestamp;
        entry.open_count += 1;
    } else {
        history.entries.push(HistoryEntry {
            path: file_path,
            last_opened: timestamp,
            open_count: 1,
        });
    }

    history.entries.sort_by(|a, b| b.last_opened.cmp(&a.last_opened));
    history.entries.truncate(history.max_entries);

    save_history(app, history)
}

#[tauri::command]
pub fn remove_from_history(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    let mut history = load_history(app.clone())?;
    history.entries.retain(|e| e.path != file_path);
    save_history(app, history)
}

#[tauri::command]
pub fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let history_path = app_data.join("history.json");

    if history_path.exists() {
        std::fs::remove_file(&history_path)
            .map_err(|e| format!("Erro ao limpar histórico: {}", e))?;
    }

    Ok(())
}
