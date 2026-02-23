use comrak::{markdown_to_html, Options};
use notify::{Event, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_cli::CliExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg(target_os = "macos")]
mod cli_installer;
mod tray;
mod whisper;

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
    eprintln!("[DEBUG] read_file called with path: {:?}", path);

    // Try to canonicalize the path to handle relative paths correctly
    let resolved_path = match std::fs::canonicalize(&path) {
        Ok(p) => {
            eprintln!("[DEBUG] Canonicalized to: {:?}", p);
            p
        }
        Err(e) => {
            eprintln!("[DEBUG] Canonicalize failed ({}), trying as-is", e);
            PathBuf::from(&path)
        }
    };

    std::fs::read_to_string(&resolved_path)
        .map_err(|e| format!("Failed to read {}: {}", resolved_path.display(), e))
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

pub struct ExplicitQuit(pub Arc<AtomicBool>);
pub struct IsRecording(pub Arc<AtomicBool>);

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
    let content = std::fs::read(&path)
        .map_err(|e| format!("Read error: {}", e))?;
    let hash = Sha256::digest(&content);
    Ok(format!("{:x}", hash))
}

#[tauri::command]
fn show_recording_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("recording") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn hide_recording_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("recording") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn write_clipboard(text: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard()
        .write_text(text)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))
}

pub fn handle_recording_toggle(handle: &tauri::AppHandle) {
    let is_recording = handle.state::<IsRecording>();
    let currently_recording = is_recording.0.load(Ordering::Relaxed);

    if currently_recording {
        let _ = handle.emit("stop-recording", ());
    } else {
        if let Some(window) = handle.get_webview_window("recording") {
            let _ = window.show();
        }

        let _ = handle.emit("start-recording-shortcut", ());

        let recorder_state = handle.state::<whisper::commands::RecorderState>();
        if let Err(e) = whisper::commands::start_recording(recorder_state, handle.clone()) {
            eprintln!("Failed to start recording: {}", e);
            let _ = handle.emit("recording-error", e);
        }
    }
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
    // Separate builder to allow conditional state management (e.g., for IPC socket in feat/unix-socket-ipc branch)
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["recording"])
                .build()
        )
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            eprintln!("[DEBUG] Second instance detected: {:?}", args);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            if args.len() > 1 {
                let file_path = &args[1];
                eprintln!("[DEBUG] Processing file argument: {:?}", file_path);
                if !file_path.is_empty() && !file_path.starts_with('-') {
                    if let Ok(abs_path) = std::fs::canonicalize(file_path) {
                        let path_str = abs_path.to_string_lossy().to_string();
                        eprintln!("[DEBUG] Emitting open-file with: {:?}", path_str);
                        let _ = app.emit("open-file", &path_str);
                    } else {
                        eprintln!("[DEBUG] Failed to canonicalize path: {:?}", file_path);
                    }
                }
            }
        }))
        .manage(WatcherState(Mutex::new(None)))
        .manage(InitialFile(Mutex::new(None)))
        .manage(ExplicitQuit(Arc::new(AtomicBool::new(false))))
        .manage(IsRecording(Arc::new(AtomicBool::new(false))))
        .manage(whisper::commands::RecorderState(Mutex::new(None)))
        .manage(whisper::commands::TranscriberState(Mutex::new(None)));

    // Conditional state management (placeholder for feat/unix-socket-ipc branch merge)
    // When merging with feat/unix-socket-ipc, add:
    // #[cfg(unix)]
    // let builder = builder.manage(ipc::SocketState(Mutex::new(None)));

    builder
        .setup(|app| {
            #[cfg(target_os = "macos")]
            setup_macos_menu(app)?;

            tray::setup(app)?;

            // IPC socket setup (placeholder for feat/unix-socket-ipc branch merge)
            // When merging with feat/unix-socket-ipc, add:
            // #[cfg(unix)]
            // {
            //     if let Err(e) = ipc::setup(app) {
            //         eprintln!("Failed to setup IPC socket: {}", e);
            //     }
            // }

            let shortcut_str = if let Ok(app_data_dir) = app.path().app_data_dir() {
                let settings = whisper::model_manager::load_settings(&app_data_dir);
                settings.shortcut
            } else {
                whisper::model_manager::DEFAULT_SHORTCUT.to_string()
            };

            let handle = app.handle().clone();

            let register = app.global_shortcut().on_shortcut(shortcut_str.as_str(), move |_app, _shortcut, event| {
                if let ShortcutState::Pressed = event.state {
                    handle_recording_toggle(&handle);
                }
            });

            if let Err(e) = register {
                eprintln!("Invalid shortcut '{}': {e}. Falling back to default.", shortcut_str);
                let handle = app.handle().clone();
                if let Err(e) = app.global_shortcut().on_shortcut(whisper::model_manager::DEFAULT_SHORTCUT, move |_app, _shortcut, event| {
                    if let ShortcutState::Pressed = event.state {
                        handle_recording_toggle(&handle);
                    }
                }) {
                    eprintln!("Failed to register default shortcut: {e}");
                }
            }

            // Auto-load saved whisper model
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let settings = whisper::model_manager::load_settings(&app_data_dir);
                if let Some(model_id) = &settings.active_model {
                    if let Some(path) = whisper::model_manager::model_path(&app_data_dir, model_id) {
                        if path.exists() {
                            if let Ok(transcriber) = whisper::transcriber::WhisperTranscriber::new(&path.to_string_lossy()) {
                                let state = app.state::<whisper::commands::TranscriberState>();
                                let mut guard = state.0.lock().unwrap();
                                *guard = Some(transcriber);
                            }
                        }
                    }
                }
            }

            let matches = app.cli().matches().ok();
            if let Some(matches) = matches {
                if let Some(arg) = matches.args.get("file") {
                    if let serde_json::Value::String(path) = &arg.value {
                        eprintln!("[DEBUG] CLI argument received: {:?}", path);
                        if !path.is_empty() {
                            let abs = std::fs::canonicalize(path).unwrap_or_else(|e| {
                                eprintln!("[DEBUG] Canonicalize failed ({}), using as-is", e);
                                PathBuf::from(path)
                            });
                            eprintln!("[DEBUG] Setting initial file to: {:?}", abs);
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
            show_recording_window,
            hide_recording_window,
            write_clipboard,
            whisper::commands::start_recording,
            whisper::commands::start_recording_button_mode,
            whisper::commands::cancel_recording,
            whisper::commands::stop_and_transcribe,
            whisper::commands::load_whisper_model,
            whisper::commands::is_model_loaded,
            whisper::commands::list_models,
            whisper::commands::download_model,
            whisper::commands::delete_model,
            whisper::commands::get_whisper_settings,
            whisper::commands::set_whisper_settings,
            whisper::commands::set_active_model,
            whisper::commands::set_shortcut,
            whisper::commands::check_audio_permissions,
            whisper::commands::list_audio_devices,
            whisper::commands::set_audio_device,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = &event {
                let quit_flag = app_handle.state::<ExplicitQuit>();
                if quit_flag.0.load(Ordering::Relaxed) {
                    // IPC socket cleanup (placeholder for feat/unix-socket-ipc branch merge)
                    // When merging with feat/unix-socket-ipc, add:
                    // #[cfg(unix)]
                    // {
                    //     let socket_state = app_handle.state::<ipc::SocketState>();
                    //     ipc::cleanup(socket_state);
                    // }
                    return;
                }
                api.prevent_exit();
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                for url in urls {
                    if let Ok(path) = url.to_file_path() {
                        eprintln!("[DEBUG] Opened event received with path: {:?}", path);
                        // Canonicalize to ensure absolute path
                        let abs_path = std::fs::canonicalize(&path).unwrap_or(path);
                        let path_str = abs_path.to_string_lossy().to_string();
                        eprintln!("[DEBUG] Emitting open-file with: {:?}", path_str);
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
