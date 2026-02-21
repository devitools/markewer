use comrak::{markdown_to_html, Options};
use notify::{Event, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;
use tauri_plugin_cli::CliExt;

#[derive(Debug, Serialize, Clone)]
pub struct Heading {
    level: u8,
    text: String,
    index: usize,
}

#[tauri::command]
fn render_markdown(content: String) -> String {
    let mut options = Options::default();
    options.extension.table = true;
    options.extension.tasklist = true;
    options.extension.strikethrough = true;
    options.extension.autolink = true;
    markdown_to_html(&content, &options)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn extract_headings(markdown: String) -> Vec<Heading> {
    let mut headings = Vec::new();
    let mut index = 0;
    let mut in_code_block = false;

    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if in_code_block {
            continue;
        }
        let level = trimmed.chars().take_while(|&c| c == '#').count();
        if level >= 1 && level <= 4 && trimmed.len() > level {
            let text = trimmed[level..].trim().to_string();
            if !text.is_empty() {
                headings.push(Heading {
                    level: level as u8,
                    text,
                    index,
                });
                index += 1;
            }
        }
    }
    headings
}

struct WatcherState(Mutex<Option<notify::RecommendedWatcher>>);

#[tauri::command]
fn watch_file(path: String, app: tauri::AppHandle, state: tauri::State<WatcherState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    let target = PathBuf::from(&path);
    let app_handle = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            if event.kind.is_modify() {
                let _ = app_handle.emit("file-changed", ());
            }
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher
        .watch(&target, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch {}: {}", path, e))?;

    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
fn unwatch_file(state: tauri::State<WatcherState>) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = None;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(WatcherState(Mutex::new(None)))
        .setup(|app| {
            let matches = app.cli().matches().ok();
            if let Some(matches) = matches {
                if let Some(arg) = matches.args.get("file") {
                    if let serde_json::Value::String(path) = &arg.value {
                        if !path.is_empty() {
                            let abs = std::fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
                            let _ = app.emit("open-file", abs.to_string_lossy().to_string());
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            render_markdown,
            read_file,
            extract_headings,
            watch_file,
            unwatch_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
