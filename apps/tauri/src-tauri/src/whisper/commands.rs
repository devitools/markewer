use super::audio::AudioRecorder;
use super::model_manager::{self, ModelStatus, WhisperSettings};
use super::transcriber::WhisperTranscriber;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub struct RecorderState(pub Mutex<Option<AudioRecorder>>);
pub struct TranscriberState(pub Mutex<Option<WhisperTranscriber>>);

#[tauri::command]
pub fn start_recording(state: tauri::State<RecorderState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let mut recorder = AudioRecorder::new()?;
    recorder.start()?;
    *guard = Some(recorder);
    Ok(())
}

#[tauri::command]
pub fn stop_and_transcribe(
    recorder_state: tauri::State<RecorderState>,
    transcriber_state: tauri::State<TranscriberState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let audio = {
        let mut guard = recorder_state.0.lock().map_err(|e| e.to_string())?;
        match guard.take() {
            Some(mut recorder) => recorder.stop()?,
            None => return Err("No active recording".to_string()),
        }
    };

    if audio.is_empty() {
        return Err("No audio captured".to_string());
    }

    let guard = transcriber_state.0.lock().map_err(|e| e.to_string())?;
    let transcriber = guard.as_ref().ok_or("No whisper model loaded")?;

    let _ = app.emit("transcription-started", ());

    match transcriber.transcribe(&audio) {
        Ok(text) => {
            let _ = app.emit("transcription-complete", text.clone());
            Ok(text)
        }
        Err(e) => {
            let _ = app.emit("transcription-error", e.clone());
            Err(e)
        }
    }
}

#[tauri::command]
pub fn load_whisper_model(
    path: String,
    state: tauri::State<TranscriberState>,
) -> Result<(), String> {
    let transcriber = WhisperTranscriber::new(&path)?;
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(transcriber);
    Ok(())
}

#[tauri::command]
pub fn is_model_loaded(state: tauri::State<TranscriberState>) -> bool {
    state.0.lock().map(|g| g.is_some()).unwrap_or(false)
}

#[tauri::command]
pub fn list_models(app: tauri::AppHandle) -> Result<Vec<ModelStatus>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(model_manager::list_models(&app_data_dir))
}

#[tauri::command]
pub async fn download_model(model_id: String, app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let app_clone = app.clone();

    let model_id_for_progress = model_id.clone();
    let dest = model_manager::download_model(&app_data_dir, &model_id, move |downloaded, total| {
        let _ = app_clone.emit(
            "model-download-progress",
            serde_json::json!({
                "model_id": model_id_for_progress.clone(),
                "downloaded": downloaded,
                "total": total,
            }),
        );
    })
    .await?;

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_model(model_id: String, app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    model_manager::delete_model(&app_data_dir, &model_id).await
}

#[tauri::command]
pub fn get_whisper_settings(app: tauri::AppHandle) -> Result<WhisperSettings, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(model_manager::load_settings(&app_data_dir))
}

#[tauri::command]
pub fn set_whisper_settings(
    settings: WhisperSettings,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    model_manager::save_settings(&app_data_dir, &settings)
}

#[tauri::command]
pub fn set_active_model(
    model_id: String,
    app: tauri::AppHandle,
    transcriber_state: tauri::State<TranscriberState>,
) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let path = model_manager::model_path(&app_data_dir, &model_id)
        .ok_or_else(|| format!("Unknown model: {}", model_id))?;

    if !path.exists() {
        return Err(format!("Model not downloaded: {}", model_id));
    }

    let transcriber = WhisperTranscriber::new(&path.to_string_lossy())?;
    let mut guard = transcriber_state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(transcriber);

    let mut settings = model_manager::load_settings(&app_data_dir);
    settings.active_model = Some(model_id);
    model_manager::save_settings(&app_data_dir, &settings)?;

    Ok(())
}

#[tauri::command]
pub fn set_shortcut(shortcut: String, app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // Unregister all existing shortcuts
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister shortcuts: {}", e))?;

    // Register the new shortcut
    let handle = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut.as_str(), move |_app, _shortcut, event| {
            match event.state {
                tauri_plugin_global_shortcut::ShortcutState::Pressed => {
                    let _ = handle.emit("start-recording", ());
                }
                tauri_plugin_global_shortcut::ShortcutState::Released => {
                    let _ = handle.emit("stop-recording", ());
                }
            }
        })
        .map_err(|e| format!("Invalid shortcut '{}': {}", shortcut, e))?;

    let mut settings = model_manager::load_settings(&app_data_dir);
    settings.shortcut = shortcut;
    model_manager::save_settings(&app_data_dir, &settings)?;

    Ok(())
}

#[tauri::command]
pub fn check_audio_permissions() -> Result<String, String> {
    match AudioRecorder::new() {
        Ok(_) => Ok("Microphone OK".to_string()),
        Err(e) => Err(e),
    }
}
