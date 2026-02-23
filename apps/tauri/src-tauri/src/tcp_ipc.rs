use crate::ipc_common::{process_command, IpcCommand, IpcResponse};
use std::sync::Mutex;
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 7474;

pub struct TcpSocketState(pub Mutex<Option<String>>);

pub fn setup(app: &tauri::App) -> Result<(), String> {
    let addr = format!("{}:{}", DEFAULT_HOST, DEFAULT_PORT);

    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        match TcpListener::bind(&addr).await {
            Ok(listener) => {
                eprintln!("[TCP IPC] Listening on {}", addr);

                let state = app_handle.state::<TcpSocketState>();
                if let Ok(mut guard) = state.0.lock() {
                    *guard = Some(addr.clone());
                }

                tcp_listener_loop(listener, app_handle).await;
            }
            Err(e) => {
                eprintln!("[TCP IPC] Failed to bind to {}: {}", addr, e);
            }
        }
    });

    Ok(())
}

pub fn cleanup(state: tauri::State<TcpSocketState>) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(addr) = guard.take() {
            eprintln!("[TCP IPC] Shutting down listener on {}", addr);
        }
    }
}

async fn tcp_listener_loop(listener: TcpListener, app: tauri::AppHandle) {
    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                eprintln!("[TCP IPC] New connection from {}", addr);
                let app_clone = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = handle_client(stream, app_clone).await {
                        eprintln!("[TCP IPC] Client error: {}", e);
                    }
                });
            }
            Err(e) => {
                eprintln!("[TCP IPC] Accept error: {}", e);
            }
        }
    }
}

async fn handle_client(stream: TcpStream, app: tauri::AppHandle) -> Result<(), String> {
    let peer_addr = stream.peer_addr().map_err(|e| e.to_string())?;
    let (reader, mut writer) = stream.into_split();
    let reader = BufReader::new(reader);
    let mut lines = reader.lines();

    while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
        eprintln!("[TCP IPC] Received from {}: {}", peer_addr, line);

        let response = match serde_json::from_str::<IpcCommand>(&line) {
            Ok(cmd) => {
                eprintln!("[TCP IPC] Processing command: {}", cmd.command);
                process_command(cmd, &app)
            }
            Err(e) => IpcResponse {
                success: false,
                error: Some(format!("Invalid JSON: {}", e)),
            },
        };

        let json = serde_json::to_string(&response).unwrap_or_default();
        eprintln!("[TCP IPC] Sending response to {}: {}", peer_addr, json);

        writer
            .write_all(format!("{}\n", json).as_bytes())
            .await
            .map_err(|e| e.to_string())?;
    }

    eprintln!("[TCP IPC] Connection closed: {}", peer_addr);
    Ok(())
}
