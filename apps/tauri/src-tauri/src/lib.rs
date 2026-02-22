use comrak::{markdown_to_html, Options};
use notify::{Event, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_cli::CliExt;

#[cfg(target_os = "macos")]
mod cli_installer;

#[derive(Debug, Serialize, Clone)]
pub struct Heading {
    level: u8,
    text: String,
    index: usize,
}

#[derive(Debug, Serialize, Clone)]
struct CliStatus {
    installed: bool,
    dismissed: bool,
}

#[derive(Debug, Serialize, Clone)]
struct InstallResult {
    success: bool,
    path: String,
    error: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Comment {
    id: String,
    block_ids: Vec<String>,
    text: String,
    timestamp: i64,
    resolved: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct CommentsFile {
    version: String,
    file_hash: String,
    comments: Vec<Comment>,
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
struct InitialFile(Mutex<Option<String>>);

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

#[tauri::command]
fn get_initial_file(state: tauri::State<InitialFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut guard| guard.take())
}

#[tauri::command]
fn check_cli_status(app: tauri::AppHandle) -> CliStatus {
    #[cfg(target_os = "macos")]
    {
        let app_data_dir = app.path().app_data_dir().unwrap_or_default();
        CliStatus {
            installed: cli_installer::is_cli_installed(),
            dismissed: cli_installer::has_been_dismissed(&app_data_dir),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        CliStatus {
            installed: true,
            dismissed: true,
        }
    }
}

#[tauri::command]
fn install_cli() -> InstallResult {
    #[cfg(target_os = "macos")]
    {
        let r = cli_installer::install();
        InstallResult {
            success: r.success,
            path: r.path,
            error: r.error,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        InstallResult {
            success: true,
            path: String::new(),
            error: String::new(),
        }
    }
}

#[tauri::command]
fn dismiss_cli_prompt(app: tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let app_data_dir = app.path().app_data_dir().unwrap_or_default();
        cli_installer::set_dismissed(&app_data_dir);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
    }
}

#[tauri::command]
fn load_comments(markdown_path: String) -> Result<CommentsFile, String> {
    let comments_path = format!("{}.comments.json", markdown_path);
    match std::fs::read_to_string(&comments_path) {
        Ok(content) => serde_json::from_str(&content)
            .map_err(|e| format!("Parse error: {}", e)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(CommentsFile {
            version: "1.0".to_string(),
            file_hash: String::new(),
            comments: Vec::new(),
        }),
        Err(e) => Err(format!("Failed to load comments: {}", e)),
    }
}

#[tauri::command]
fn save_comments(markdown_path: String, comments_data: CommentsFile) -> Result<(), String> {
    let comments_path = format!("{}.comments.json", markdown_path);
    let json = serde_json::to_string_pretty(&comments_data)
        .map_err(|e| format!("Serialize error: {}", e))?;
    std::fs::write(&comments_path, json)
        .map_err(|e| format!("Write error: {}", e))
}

#[tauri::command]
fn hash_file(path: String) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Read error: {}", e))?;
    let hash = Sha256::digest(content.as_bytes());
    Ok(format!("{:x}", hash))
}

#[cfg(target_os = "macos")]
fn setup_macos_menu(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

    let install_cli_item = MenuItemBuilder::with_id("install-cli", "Install Command Line Tool\u{2026}")
        .build(app)?;
    let open_file_item = MenuItemBuilder::with_id("open-file", "Open\u{2026}")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    let app_submenu = SubmenuBuilder::new(app, "Arandu")
        .about(None)
        .separator()
        .item(&install_cli_item)
        .separator()
        .quit()
        .build()?;

    let file_submenu = SubmenuBuilder::new(app, "File")
        .item(&open_file_item)
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .close_window()
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&file_submenu)
        .item(&edit_submenu)
        .item(&window_submenu)
        .build()?;

    app.set_menu(menu)?;

    let app_handle = app.handle().clone();
    app.on_menu_event(move |_app, event| {
        match event.id().as_ref() {
            "install-cli" => {
                let _ = app_handle.emit("menu-install-cli", ());
            }
            "open-file" => {
                let _ = app_handle.emit("menu-open-file", ());
            }
            _ => {}
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(WatcherState(Mutex::new(None)))
        .manage(InitialFile(Mutex::new(None)))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            setup_macos_menu(app)?;

            let matches = app.cli().matches().ok();
            if let Some(matches) = matches {
                if let Some(arg) = matches.args.get("file") {
                    if let serde_json::Value::String(path) = &arg.value {
                        if !path.is_empty() {
                            let abs = std::fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
                            let initial = app.state::<InitialFile>();
                            if let Ok(mut guard) = initial.0.lock() {
                                *guard = Some(abs.to_string_lossy().into());
                            };
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
            get_initial_file,
            check_cli_status,
            install_cli,
            dismiss_cli_prompt,
            load_comments,
            save_comments,
            hash_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        let path_str = path.to_string_lossy().to_string();
                        let initial = app_handle.state::<InitialFile>();
                        if let Ok(mut guard) = initial.0.lock() {
                            *guard = Some(path_str.clone());
                        }
                        let _ = app_handle.emit("open-file", &path_str);
                    }
                }
            }
        });
}
