use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

/// IPC command structure shared between Unix socket and TCP implementations
#[derive(Deserialize)]
pub struct IpcCommand {
    pub command: String,
    #[serde(default)]
    pub path: Option<String>,
}

/// IPC response structure shared between Unix socket and TCP implementations
#[derive(Serialize)]
pub struct IpcResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Process IPC commands (shared logic for both Unix socket and TCP IPC)
pub fn process_command(cmd: IpcCommand, app: &tauri::AppHandle) -> IpcResponse {
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
