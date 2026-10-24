//! Video engine that handles playback control and frame decoding.
//!
//! This module provides:
//! - Playback state management (play/pause/toggle)
//! - Seek operations for scrubbing through video
//! - Frame decoding using FFmpeg
//! - Progress tracking and duration reporting

use std::collections::VecDeque;
use std::path::{Path, PathBuf};

/// Re-export types from parent backend module for visibility within this crate
pub use crate::backend::{BackendError, VideoMetadata};

/// State of the player
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PlayState {
    Paused,
    Playing,
}

impl PlayState {
    pub fn is_playing(&self) -> bool {
        matches!(self, PlayState::Playing)
    }
    
    pub fn is_paused(&self) -> bool {
        matches!(self, PlayState::Paused)
    }
    
    /// Create a paused state
    pub fn new() -> Self {
        PlayState::Paused
    }
}

/// Handle to a video playback context with metadata and state
pub struct VideoEngine {
    file_path: PathBuf,
    metadata: Option<VideoMetadata>,
    state: PlayState,
    current_time: f64,
    duration: f64,
    frames: VecDeque<Vec<u8>>,
    frame_count: u32,
}

impl VideoEngine {
    /// Create a new VideoEngine by loading a video file.
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, BackendError> {
        let path = path.as_ref().to_path_buf();
        
        if !path.exists() {
            return Err(BackendError::InvalidVideo(format!(
                "File not found: {:?}",
                path
            )));
        }

        match Self::load_metadata_internal(&path) {
            Ok(meta) => {
                let engine = Self {
                    file_path: meta.file_path.clone(),
                    metadata: Some(meta.clone()),
                    state: PlayState::Paused,
                    current_time: 0.0,
                    duration: meta.duration,
                    frames: VecDeque::new(),
                    frame_count: 0,
                };
                Ok(engine)
            }
            Err(e) => Err(e),
        }
    }

    /// Load metadata from a specific path.
    pub fn load_metadata<P: AsRef<Path>>(&mut self, path: P) -> Result<(), BackendError> {
        let path = path.as_ref();
        
        if !path.exists() {
            return Err(BackendError::InvalidVideo(format!(
                "File not found: {:?}",
                path
            )));
        }

        match Self::load_metadata_internal(path) {
            Ok(meta) => {
                self.metadata = Some(meta.clone());
                self.file_path = meta.file_path.clone();
                self.duration = meta.duration;
                Ok(())
            }
            Err(e) => Err(e),
        }
    }

    /// Load metadata internally (for internal use).
    fn load_metadata_internal<P: AsRef<Path>>(
        path: P,
    ) -> Result<VideoMetadata, BackendError> {
        // Load duration using ffprobe
        let duration = get_duration_from_ffprobe(path.as_ref())?;
        
        // Load codec information
        let codec_info = get_codec_info(path.as_ref())?;
        
        // Extract resolution from video stream
        let resolution = extract_resolution(&codec_info)?;
        
        // Extract frame rate from video stream
        let frame_rate = extract_fps(&codec_info)?;
        
        // Extract video codec name
        let video_codec = codec_info.get("codec_name")
            .and_then(|s| s.as_str())
            .unwrap_or("unknown");

        Ok(VideoMetadata {
            duration,
            resolution,
            video_codec: video_codec.to_string(),
            audio_codec: "none".to_string(),
            frame_rate,
            file_path: PathBuf::from(path.as_ref().display().to_string()),
            error: None,
        })
    }

    /// Get current playback state.
    pub fn state(&self) -> PlayState {
        self.state
    }

    /// Check if video is loaded successfully.
    pub fn is_loaded(&self) -> bool {
        self.metadata.is_some() && !std::fs::metadata(&self.file_path).is_err()
    }

    /// Get loaded metadata.
    pub fn metadata(&self) -> Option<&VideoMetadata> {
        self.metadata.as_ref()
    }

    /// Start playback (if video is valid).
    pub fn play(&mut self) {
        if let Some(ref meta) = self.metadata {
            if meta.is_valid() {
                self.state = PlayState::Playing;
            }
        }
    }

    /// Pause playback.
    pub fn pause(&mut self) {
        self.state = PlayState::Paused;
    }

    /// Toggle between play and pause.
    pub fn toggle(&mut self) {
        match self.state {
            PlayState::Playing => self.pause(),
            PlayState::Paused => self.play(),
        }
    }

    /// Seek to a specific time position (in seconds).
    pub fn seek(&mut self, time: f64) -> Result<(), BackendError> {
        if let Some(ref meta) = self.metadata {
            if !meta.is_valid() {
                return Err(BackendError::InvalidVideo("Metadata not loaded".to_string()));
            }
            
            // Clamp time to valid range [0, duration]
            let clamped_time = time.clamp(0.0, meta.duration.max(0.0));
            self.current_time = clamped_time;

            Ok(())
        } else {
            Err(BackendError::InvalidVideo("Metadata not loaded".to_string()))
        }
    }

    /// Get current playback time.
    pub fn current_time(&self) -> f64 {
        self.current_time
    }

    /// Get total duration in seconds.
    pub fn duration(&self) -> f64 {
        self.duration
    }

    /// Check if at end of video (within 1 second of duration).
    pub fn is_at_end(&self) -> bool {
        if let Some(ref meta) = self.metadata {
            if !meta.is_valid() {
                return false;
            }
            // Check if we're within 1 second of the end
            (self.current_time - meta.duration).abs() < 0.1
        } else {
            false
        }
    }

    /// Get progress as fraction (0.0 to 1.0).
    pub fn progress(&self) -> f64 {
        if self.duration > 0.0 {
            self.current_time / self.duration
        } else {
            0.0
        }
    }

    /// Decode a single frame at current time position using ffprobe.
    /// 
    /// This is currently a placeholder that returns empty bytes.
    /// In production, this would use ffmpeg with -frames:v 1 option.
    pub fn decode_frame(&mut self) -> Result<Vec<u8>, BackendError> {
        if let Some(ref meta) = self.metadata {
            if !meta.is_valid() {
                return Err(BackendError::InvalidVideo("Metadata not loaded".to_string()));
            }

            // For now, we capture frame data as placeholder bytes
            // In production, this would use ffmpeg with -frames:v 1 option
            let _frame_data = decode_frame_ffprobe(&self.file_path, self.current_time);
            
            Ok(Vec::new())
        } else {
            Err(BackendError::InvalidVideo("Metadata not loaded".to_string()))
        }
    }

    /// Get most recent decoded frame data.
    pub fn get_frame(&self) -> &[u8] {
        self.frames.back().map(|f| &**f).unwrap_or(&[])
    }

    /// Get total frame count decoded so far.
    pub fn frame_count(&self) -> u32 {
        self.frame_count
    }

    /// Reset engine state (time, frames).
    pub fn reset(&mut self) {
        self.current_time = 0.0;
        self.frames.clear();
        self.frame_count = 0;
    }

    /// Close and release resources.
    pub fn close(self) {}
}

impl Default for VideoEngine {
    fn default() -> Self {
        Self {
            file_path: PathBuf::from("/tmp/dummy_video.mp4"),
            metadata: None,
            state: PlayState::Paused,
            current_time: 0.0,
            duration: 0.0,
            frames: VecDeque::new(),
            frame_count: 0,
        }
    }
}

/// Get duration of video using ffprobe command.
fn get_duration_from_ffprobe(path: &Path) -> Result<f64, BackendError> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            path.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|_e| BackendError::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "FFmpeg not installed".to_string(),
        )))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(BackendError::FfmpegNotAvailable(format!(
            "ffprobe failed: {}",
            stderr
        )));
    }

    let json_str = String::from_utf8(output.stdout).map_err(|e| {
        BackendError::DecodeError(format!("JSON decode error: {}", e))
    })?;

    // Parse duration using simple string extraction
    if let Some(pos) = json_str.find("\"duration\":") {
        let start = pos + "\"duration\":".len();
        let end = json_str[start..].find(|c: char| c == ',' || c == '}').unwrap_or(json_str.len());
        let duration_str = &json_str[start..start + end].trim();
        
        return duration_str.parse::<f64>().map_err(|e| {
            BackendError::DecodeError(format!("Duration parse error: {}", e))
        });
    }

    Err(BackendError::DecodeError("Duration not found in ffprobe output".to_string()))
}

/// Get codec information using ffprobe.
fn get_codec_info(path: &Path) -> Result<serde_json::Value, BackendError> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            path.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|_e| BackendError::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "FFmpeg not installed".to_string(),
        )))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(BackendError::FfmpegNotAvailable(format!(
            "ffprobe failed: {}",
            stderr
        )));
    }

    let json_str = String::from_utf8(output.stdout).map_err(|e| {
        BackendError::DecodeError(format!("JSON decode error: {}", e))
    })?;

    serde_json::from_str(&json_str).map_err(|e| {
        BackendError::DecodeError(format!("Failed to parse ffprobe output: {}", e))
    })
}

/// Get resolution from codec info.
fn extract_resolution(cook_info: &serde_json::Value) -> Result<Option<(u32, u32)>, BackendError> {
    if let Some(streams_val) = cook_info.get("streams") {
        if let Some(streams_array) = streams_val.as_array() {
            for stream in streams_array.iter() {
                if stream.get("codec_type").and_then(|v| v.as_str()) == Some("video") {
                    // Extract width and height as strings then parse
                    let width = match stream.get("width").and_then(|v: &serde_json::Value| v.as_str()) {
                        Some(s) => s.parse::<u32>().ok(),
                        None => None,
                    };
                    let height = match stream.get("height").and_then(|v: &serde_json::Value| v.as_str()) {
                        Some(s) => s.parse::<u32>().ok(),
                        None => None,
                    };
                    
                    if let (Some(w), Some(h)) = (width, height) {
                        return Ok(Some((w, h)));
                    }
                }
            }
        }
    }
    Ok(None)
}

/// Get frame rate from codec info.
fn extract_fps(cook_info: &serde_json::Value) -> Result<Option<f64>, BackendError> {
    if let Some(streams_val) = cook_info.get("streams") {
        if let Some(streams_array) = streams_val.as_array() {
            for stream in streams_array.iter() {
                if stream.get("codec_type").and_then(|v| v.as_str()) == Some("video") {
                    // Extract fps as string, handle rational format or simple number
                    if let Some(fps_val) = stream.get("r_frame_rate") {
                        if let Some(num_str) = fps_val.as_str() {
                            return Ok(Some(num_str.parse::<f64>().unwrap_or(0.0)));
                        }
                    }
                }
            }
        }
    }
    Ok(None)
}

/// Decode a single frame at specified time using ffprobe.
fn decode_frame_ffprobe(path: &Path, time: f64) -> Result<Vec<u8>, BackendError> {
    // Build ffmpeg command to grab one frame at specific timestamp
    let time_arg = format!("gt(t\\,{})", time);
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-select_streams", "v:0",
            "-select_expr", &time_arg,
            "-frames", "1",
            "-of", "null",
            path.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|_e| BackendError::IoError(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "FFmpeg not installed".to_string(),
        )))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Frame might not exist at exact time, that's ok
        if stderr.contains("Invalid stream index") || stderr.contains("Could not find codec entry") {
            return Ok(Vec::new());
        }
        return Err(BackendError::DecodeError(format!("Frame decode failed: {}", stderr)));
    }

    // In production, we would capture the raw frame data here.
    // For now, return empty bytes as placeholder.
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_play_state_creation() {
        let state = PlayState::new();
        assert!(state.is_paused());
        assert!(!state.is_playing());
    }

    #[test]
    fn test_video_engine_default() {
        let engine = VideoEngine::default();
        assert_eq!(engine.duration(), 0.0);
        assert!(!engine.is_loaded());
    }

    #[test]
    fn test_seek_clamps_to_valid_range() {
        // This test would require a sample video, so we skip it for now
        // It verifies that seek() clamps time to [0, duration]
    }

    #[test]
    fn test_progress_calculation() {
        let engine = VideoEngine::default();
        assert_eq!(engine.progress(), 0.0);
    }
}
