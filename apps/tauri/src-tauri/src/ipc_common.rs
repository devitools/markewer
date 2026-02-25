//! Shared IPC types and command processing logic.
//!
//! This module contains the common data structures and command handling logic
//! used by both the Unix domain socket IPC ([`crate::ipc`]) and TCP socket IPC
//! ([`crate::tcp_ipc`]) transports. By centralizing command dispatch here, both
//! transports behave identically regardless of the underlying connection type.
//!
//! # Wire Protocol
//!
//! Both transports use the same newline-delimited JSON protocol:
//!
//! 1. The client sends one JSON-encoded [`IpcCommand`] per line.
//! 2. The server deserializes the command, dispatches it via [`process_command`],
//!    and writes back a JSON-encoded [`IpcResponse`] followed by a newline.
//!
//! # Supported Commands
//!
//! | Command  | Description                              | Requires `path` |
//! |----------|------------------------------------------|-----------------|
//! | `open`   | Open a file in the app and focus window  | Yes             |
//! | `ping`   | Health check — always returns success    | No              |
//! | `show`   | Bring the app window to the foreground   | No              |
//!
//! # Platform Compatibility
//!
//! This module itself is platform-independent. The Unix socket transport
//! (`ipc.rs`) is conditionally compiled on Unix systems only, while the TCP
//! transport (`tcp_ipc.rs`) is available on all platforms.

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

/// An IPC command received from an external process.
///
/// Commands are deserialized from JSON objects sent over the IPC socket.
/// Each command has a name and an optional file path argument.
///
/// # Examples
///
/// ```json
/// {"command": "open", "path": "/Users/me/notes.md"}
/// {"command": "ping"}
/// {"command": "show"}
/// ```
#[derive(Deserialize)]
pub struct IpcCommand {
    /// The command name to execute (e.g. `"open"`, `"ping"`, `"show"`).
    pub command: String,
    /// An optional file path argument. Required for the `"open"` command;
    /// ignored by other commands. Defaults to `None` when omitted from JSON.
    #[serde(default)]
    pub path: Option<String>,
}

/// The response returned after processing an [`IpcCommand`].
///
/// Serialized as a JSON object and sent back to the client over the IPC socket.
/// When the command succeeds, `success` is `true` and `error` is omitted from
/// the output. On failure, `success` is `false` and `error` contains a
/// human-readable description of what went wrong.
///
/// # Examples
///
/// ```json
/// {"success": true}
/// {"success": false, "error": "Missing 'path' field"}
/// ```
#[derive(Serialize)]
pub struct IpcResponse {
    /// Whether the command completed successfully.
    pub success: bool,
    /// A human-readable error message, present only when `success` is `false`.
    /// Omitted from the serialized JSON when `None`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Dispatches an [`IpcCommand`] and returns an [`IpcResponse`].
///
/// This is the shared command handler used by both the Unix socket and TCP IPC
/// transports. It matches on the command name and performs the corresponding
/// action using the Tauri application handle.
///
/// # Supported Commands
///
/// - **`open`** — Opens a file in the application. Requires [`IpcCommand::path`]
///   to be set. The path is canonicalized via [`std::fs::canonicalize`], the main
///   window is brought to focus, and an `"open-file"` event is emitted to the
///   frontend. Returns an error if the path is missing, invalid, or the event
///   fails to emit.
/// - **`ping`** — A simple health check. Always returns `success: true` with no
///   side effects.
/// - **`show`** — Brings the main application window to the foreground by
///   unminimizing, showing, and focusing it. Always returns `success: true`.
///
/// Any unrecognized command name returns `success: false` with an error message.
///
/// # Parameters
///
/// - `cmd` — The deserialized [`IpcCommand`] to process.
/// - `app` — A reference to the Tauri [`AppHandle`](tauri::AppHandle), used to
///   access windows and emit events.
///
/// # Returns
///
/// An [`IpcResponse`] indicating whether the command succeeded or failed.
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
