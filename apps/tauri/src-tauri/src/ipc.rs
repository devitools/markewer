use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

#[derive(Deserialize)]
struct IpcCommand {
    command: String,
    #[serde(default)]
    path: Option<String>,
}

#[derive(Serialize)]
struct IpcResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub struct SocketState(pub Mutex<Option<PathBuf>>);

pub fn setup(app: &tauri::App) -> Result<(), String> {
    let sock_path = socket_path()?;
    cleanup_stale_socket(&sock_path)?;

    let state = app.state::<SocketState>();
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some(sock_path.clone());
    }

    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        match UnixListener::bind(&sock_path) {
            Ok(listener) => {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let perms = std::fs::Permissions::from_mode(0o600);
                    let _ = std::fs::set_permissions(&sock_path, perms);
                }

                socket_listener_loop(listener, app_handle).await;
            }
            Err(e) => {
                eprintln!("Failed to bind socket: {}", e);
            }
        }
    });

    Ok(())
}

pub fn cleanup(state: tauri::State<SocketState>) {
    if let Ok(guard) = state.0.lock() {
        if let Some(path) = guard.as_ref() {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn socket_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .map_err(|_| "HOME environment variable not set".to_string())?;
    let arandu_dir = PathBuf::from(home).join(".arandu");

    std::fs::create_dir_all(&arandu_dir)
        .map_err(|e| format!("Failed to create ~/.arandu: {}", e))?;

    Ok(arandu_dir.join("arandu.sock"))
}

fn cleanup_stale_socket(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    match std::os::unix::net::UnixStream::connect(path) {
        Ok(_) => Err("Socket already in use by another instance".to_string()),
        Err(_) => {
            std::fs::remove_file(path)
                .map_err(|e| format!("Failed to remove stale socket: {}", e))
        }
    }
}

async fn socket_listener_loop(listener: UnixListener, app: tauri::AppHandle) {
    loop {
        match listener.accept().await {
            Ok((stream, _addr)) => {
                let app_clone = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = handle_client(stream, app_clone).await {
                        eprintln!("Client error: {}", e);
                    }
                });
            }
            Err(e) => {
                eprintln!("Accept error: {}", e);
            }
        }
    }
}

async fn handle_client(stream: UnixStream, app: tauri::AppHandle) -> Result<(), String> {
    let (reader, mut writer) = stream.into_split();
    let reader = BufReader::new(reader);
    let mut lines = reader.lines();

    while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
        let response = match serde_json::from_str::<IpcCommand>(&line) {
            Ok(cmd) => process_command(cmd, &app),
            Err(e) => IpcResponse {
                success: false,
                error: Some(format!("Invalid JSON: {}", e)),
            },
        };

        let json = serde_json::to_string(&response).unwrap_or_default();
        writer
            .write_all(format!("{}\n", json).as_bytes())
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn process_command(cmd: IpcCommand, app: &tauri::AppHandle) -> IpcResponse {
    match cmd.command.as_str() {
        "open" => {
            if let Some(path) = cmd.path {
                match std::fs::canonicalize(&path) {
                    Ok(abs_path) => {
                        let path_str = abs_path.to_string_lossy().to_string();

                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }

                        match app.emit("open-file", &path_str) {
                            Ok(_) => IpcResponse {
                                success: true,
                                error: None,
                            },
                            Err(e) => IpcResponse {
                                success: false,
                                error: Some(format!("Failed to emit event: {}", e)),
                            },
                        }
                    }
                    Err(e) => IpcResponse {
                        success: false,
                        error: Some(format!("Invalid path: {}", e)),
                    },
                }
            } else {
                IpcResponse {
                    success: false,
                    error: Some("Missing 'path' field".to_string()),
                }
            }
        }
        "ping" => IpcResponse {
            success: true,
            error: None,
        },
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            IpcResponse {
                success: true,
                error: None,
            }
        }
        _ => IpcResponse {
            success: false,
            error: Some(format!("Unknown command: {}", cmd.command)),
        },
    }
}
