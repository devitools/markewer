use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream};
use rubato::{SincFixedIn, SincInterpolationParameters, SincInterpolationType, Resampler, WindowFunction};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;

const WHISPER_SAMPLE_RATE: u32 = 16_000;

#[derive(Debug, Clone, Serialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
}

pub fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let default_device = host.default_input_device();
    let default_name = default_device.as_ref().and_then(|d| d.name().ok());

    let devices: Vec<AudioDevice> = host
        .input_devices()
        .map_err(|e| format!("Failed to get input devices: {}", e))?
        .filter_map(|device| {
            device.name().ok().map(|name| {
                let is_default = Some(&name) == default_name.as_ref();
                AudioDevice { name, is_default }
            })
        })
        .collect();

    if devices.is_empty() {
        return Err("No input devices found".to_string());
    }

    Ok(devices)
}

pub struct AudioRecorder {
    buffer: Arc<Mutex<Vec<f32>>>,
    stream: Option<Stream>,
    device_sample_rate: u32,
    device_channels: u16,
    last_audio_received: Arc<Mutex<Option<Instant>>>,
    selected_device_name: Option<String>,
}

// SAFETY: cpal <0.17 on macOS has non-Send/Sync Stream due to
// AudioObjectPropertyListener FFI pointers. All access is serialized
// through RecorderState's Mutex. Can be removed when upgrading to cpal >= 0.17.
unsafe impl Send for AudioRecorder {}
unsafe impl Sync for AudioRecorder {}

#[cfg(target_os = "macos")]
fn check_microphone_permission() -> Result<bool, String> {
    let host = cpal::default_host();
    if let Some(device) = host.default_input_device() {
        match device.default_input_config() {
            Ok(_) => Ok(true),
            Err(e) => {
                let err_str = e.to_string().to_lowercase();
                if err_str.contains("permission") || err_str.contains("access") {
                    Ok(false)
                } else {
                    Err(format!("Audio device error: {}", e))
                }
            }
        }
    } else {
        Err("No input device found".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
fn check_microphone_permission() -> Result<bool, String> {
    Ok(true)
}

impl AudioRecorder {
    pub fn new(device_name: Option<String>) -> Result<Self, String> {
        #[cfg(target_os = "macos")]
        {
            if !check_microphone_permission()? {
                return Err("Microphone permission denied. Please grant access in System Settings → Privacy & Security → Microphone".to_string());
            }
        }

        let host = cpal::default_host();

        let device = if let Some(name) = &device_name {
            host.input_devices()
                .map_err(|e| format!("Failed to enumerate devices: {}", e))?
                .find(|d| d.name().ok().as_ref() == Some(name))
                .ok_or_else(|| format!("Device '{}' not found", name))?
        } else {
            host.default_input_device()
                .ok_or("No input device available.")?
        };

        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get input config: {}", e))?;

        Ok(Self {
            buffer: Arc::new(Mutex::new(Vec::new())),
            stream: None,
            device_sample_rate: config.sample_rate().0,
            device_channels: config.channels(),
            last_audio_received: Arc::new(Mutex::new(None)),
            selected_device_name: device_name,
        })
    }

    pub fn start(&mut self) -> Result<(), String> {
        if self.stream.is_some() {
            return Ok(());
        }

        let host = cpal::default_host();

        let device = if let Some(name) = &self.selected_device_name {
            host.input_devices()
                .map_err(|e| format!("Failed to enumerate: {}", e))?
                .find(|d| d.name().ok().as_ref() == Some(name))
                .ok_or_else(|| format!("Device '{}' not found", name))?
        } else {
            host.default_input_device()
                .ok_or("No input device available")?
        };

        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get input config: {}", e))?;

        self.device_sample_rate = config.sample_rate().0;
        self.device_channels = config.channels();

        if let Ok(mut buf) = self.buffer.lock() {
            buf.clear();
        }

        let buffer = self.buffer.clone();
        let channels = self.device_channels as usize;
        let audio_tracker = self.last_audio_received.clone();

        let err_fn = |err: cpal::StreamError| {
            eprintln!("Audio stream error: {}", err);
        };

        let stream = match config.sample_format() {
            SampleFormat::F32 => {
                let tracker = audio_tracker.clone();
                device.build_input_stream(
                    &config.into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        let mono = to_mono(data, channels);
                        if let Ok(mut buf) = buffer.lock() {
                            buf.extend_from_slice(&mono);
                            if let Ok(mut t) = tracker.lock() {
                                *t = Some(Instant::now());
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            },
            SampleFormat::I16 => {
                let buffer = self.buffer.clone();
                let tracker = audio_tracker.clone();
                device.build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let floats: Vec<f32> = data.iter().map(|&s| s as f32 / i16::MAX as f32).collect();
                        let mono = to_mono(&floats, channels);
                        if let Ok(mut buf) = buffer.lock() {
                            buf.extend_from_slice(&mono);
                            if let Ok(mut t) = tracker.lock() {
                                *t = Some(Instant::now());
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::U16 => {
                let buffer = self.buffer.clone();
                let tracker = audio_tracker.clone();
                device.build_input_stream(
                    &config.into(),
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        let floats: Vec<f32> = data
                            .iter()
                            .map(|&s| (s as f32 / u16::MAX as f32) * 2.0 - 1.0)
                            .collect();
                        let mono = to_mono(&floats, channels);
                        if let Ok(mut buf) = buffer.lock() {
                            buf.extend_from_slice(&mono);
                            if let Ok(mut t) = tracker.lock() {
                                *t = Some(Instant::now());
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            _ => return Err(format!("Unsupported sample format: {:?}", config.sample_format())),
        }
        .map_err(|e| format!("Failed to build input stream: {}", e))?;

        stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;
        self.stream = Some(stream);
        Ok(())
    }

    pub fn stop(&mut self) -> Result<Vec<f32>, String> {
        std::thread::sleep(std::time::Duration::from_millis(50));

        self.stream.take();

        let audio_received = {
            let tracker = self.last_audio_received.lock().map_err(|e| e.to_string())?;
            tracker.is_some()
        };

        if !audio_received {
            return Err("No audio data received. Check System Settings → Privacy & Security → Microphone.".to_string());
        }

        let raw = {
            let buf = self.buffer.lock().map_err(|e| e.to_string())?;
            buf.clone()
        };

        if raw.is_empty() {
            return Err("No audio captured. Recording too short or microphone not working.".to_string());
        }

        let rms: f32 = raw.iter().map(|&s| s * s).sum::<f32>() / raw.len() as f32;
        let rms = rms.sqrt();

        if rms < 0.001 {
            return Err(format!(
                "Audio too quiet (RMS: {:.6}). Speak louder or check microphone settings.",
                rms
            ));
        }

        eprintln!("Captured {} samples, RMS: {:.4}, duration: {:.2}s",
            raw.len(), rms, raw.len() as f32 / self.device_sample_rate as f32
        );

        if self.device_sample_rate == WHISPER_SAMPLE_RATE {
            return Ok(raw);
        }

        resample(&raw, self.device_sample_rate, WHISPER_SAMPLE_RATE)
    }
}

fn to_mono(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels == 1 {
        return samples.to_vec();
    }
    samples
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect()
}

fn resample(input: &[f32], from_rate: u32, to_rate: u32) -> Result<Vec<f32>, String> {
    let ratio = to_rate as f64 / from_rate as f64;
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let mut resampler = SincFixedIn::<f32>::new(ratio, 2.0, params, input.len(), 1)
        .map_err(|e| format!("Failed to create resampler: {}", e))?;

    let result = resampler
        .process(&[input], None)
        .map_err(|e| format!("Resampling failed: {}", e))?;

    Ok(result.into_iter().next().unwrap_or_default())
}
