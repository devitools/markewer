use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream};
use rubato::{SincFixedIn, SincInterpolationParameters, SincInterpolationType, Resampler, WindowFunction};
use std::sync::{Arc, Mutex};
use std::time::Instant;

const WHISPER_SAMPLE_RATE: u32 = 16_000;

pub struct AudioRecorder {
    buffer: Arc<Mutex<Vec<f32>>>,
    stream: Option<Stream>,
    device_sample_rate: u32,
    device_channels: u16,
    last_audio_received: Arc<Mutex<Option<Instant>>>,
}

// SAFETY: cpal::Stream on macOS contains raw pointers (AudioObjectPropertyListener)
// that prevent auto-deriving Send/Sync. However, we serialize all access through a
// Mutex in RecorderState, so cross-thread access is safe.
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
    pub fn new() -> Result<Self, String> {
        #[cfg(target_os = "macos")]
        {
            if !check_microphone_permission()? {
                return Err("Microphone permission denied. Please grant access in System Settings → Privacy & Security → Microphone".to_string());
            }
        }

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No input device available.")?;
        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get input config: {}", e))?;

        Ok(Self {
            buffer: Arc::new(Mutex::new(Vec::new())),
            stream: None,
            device_sample_rate: config.sample_rate().0,
            device_channels: config.channels(),
            last_audio_received: Arc::new(Mutex::new(None)),
        })
    }

    pub fn start(&mut self) -> Result<(), String> {
        if self.stream.is_some() {
            return Ok(());
        }

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No input device available")?;
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
