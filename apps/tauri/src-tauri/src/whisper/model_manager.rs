use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub id: &'static str,
    pub filename: &'static str,
    pub url: &'static str,
    pub size_bytes: u64,
    pub description: &'static str,
}

pub const MODELS: &[ModelInfo] = &[
    ModelInfo {
        id: "tiny",
        filename: "ggml-tiny.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
        size_bytes: 75_000_000,
        description: "Tiny (~75MB) - Fastest, lower accuracy",
    },
    ModelInfo {
        id: "base",
        filename: "ggml-base.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        size_bytes: 142_000_000,
        description: "Base (~142MB) - Good balance",
    },
    ModelInfo {
        id: "small",
        filename: "ggml-small.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        size_bytes: 466_000_000,
        description: "Small (~466MB) - Better accuracy",
    },
    ModelInfo {
        id: "medium",
        filename: "ggml-medium.bin",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
        size_bytes: 1_530_000_000,
        description: "Medium (~1.5GB) - Best accuracy, slower",
    },
];

#[derive(Debug, Clone, Serialize)]
pub struct ModelStatus {
    pub info: ModelInfo,
    pub downloaded: bool,
    pub path: Option<String>,
}

pub const DEFAULT_SHORTCUT: &str = "Alt+Space";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperSettings {
    pub active_model: Option<String>,
    pub language: String,
    #[serde(default = "default_shortcut")]
    pub shortcut: String,
}

fn default_shortcut() -> String {
    DEFAULT_SHORTCUT.to_string()
}

impl Default for WhisperSettings {
    fn default() -> Self {
        Self {
            active_model: None,
            language: "auto".to_string(),
            shortcut: DEFAULT_SHORTCUT.to_string(),
        }
    }
}

pub fn models_dir(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("models")
}

pub fn settings_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("whisper-settings.json")
}

pub fn load_settings(app_data_dir: &PathBuf) -> WhisperSettings {
    let path = settings_path(app_data_dir);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_settings(app_data_dir: &PathBuf, settings: &WhisperSettings) -> Result<(), String> {
    let path = settings_path(app_data_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn list_models(app_data_dir: &PathBuf) -> Vec<ModelStatus> {
    let dir = models_dir(app_data_dir);
    MODELS
        .iter()
        .map(|info| {
            let path = dir.join(info.filename);
            let downloaded = path.exists();
            ModelStatus {
                info: info.clone(),
                downloaded,
                path: if downloaded {
                    Some(path.to_string_lossy().to_string())
                } else {
                    None
                },
            }
        })
        .collect()
}

pub fn model_path(app_data_dir: &PathBuf, model_id: &str) -> Option<PathBuf> {
    MODELS
        .iter()
        .find(|m| m.id == model_id)
        .map(|m| models_dir(app_data_dir).join(m.filename))
}

pub async fn download_model<F>(
    app_data_dir: &PathBuf,
    model_id: &str,
    on_progress: F,
) -> Result<PathBuf, String>
where
    F: Fn(u64, u64),
{
    let model = MODELS
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| format!("Unknown model: {}", model_id))?;

    let dir = models_dir(app_data_dir);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create models dir: {}", e))?;

    let dest = dir.join(model.filename);
    let tmp = dir.join(format!("{}.tmp", model.filename));

    let response = reqwest::get(model.url)
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let total = response.content_length().unwrap_or(model.size_bytes);
    let mut stream = response.bytes_stream();

    let mut file = tokio::fs::File::create(&tmp)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut downloaded: u64 = 0;
    use tokio::io::AsyncWriteExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total);
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;

    tokio::fs::rename(&tmp, &dest)
        .await
        .map_err(|e| format!("Failed to finalize download: {}", e))?;

    Ok(dest)
}

pub async fn delete_model(app_data_dir: &PathBuf, model_id: &str) -> Result<(), String> {
    if let Some(path) = model_path(app_data_dir, model_id) {
        if path.exists() {
            tokio::fs::remove_file(&path)
                .await
                .map_err(|e| format!("Failed to delete model: {}", e))?;
        }
    }
    Ok(())
}
