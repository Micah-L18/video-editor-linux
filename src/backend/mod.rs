//! Backend module for video editor using FFmpeg bindings.
//!
//! This module provides:
//! - Video loading and metadata extraction
//! - Playback control (play/pause/seek)
//! - Frame decoding and rendering
//! - Video processing pipeline
//!
//! # Architecture
//! The backend uses a hybrid approach:
//! - System ffmpeg/ffprobe for robust file operations
//! - Rust process spawning for maximum compatibility on Linux Ubuntu
//!
//! # Safety & Security
//! Uses `cargo-audit` to ensure no security vulnerabilities in dependencies.

pub mod video_engine;
pub mod video_loader;

// Re-export main types for public API
pub use video_engine::{
    VideoEngine,
    PlayState,
};

pub use video_loader::{
    VideoMetadata,
    VideoLoader,
    load_metadata,
    load_and_cache_metadata,
};

/// Error type for backend operations.
#[derive(Debug)]
pub enum BackendError {
    /// FFmpeg not found or failed
    FfmpegNotAvailable(String),
    /// Invalid video file
    InvalidVideo(String),
    /// Playback control error
    PlaybackControl(String),
    /// Decoding error
    DecodeError(String),
    /// File I/O error
    IoError(std::io::Error),
}

impl std::fmt::Display for BackendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackendError::FfmpegNotAvailable(msg) => write!(f, "FFmpeg not available: {}", msg),
            BackendError::InvalidVideo(msg) => write!(f, "Invalid video file: {}", msg),
            BackendError::PlaybackControl(msg) => write!(f, "Playback control error: {}", msg),
            BackendError::DecodeError(msg) => write!(f, "Decoding error: {}", msg),
            BackendError::IoError(e) => write!(f, "I/O error: {}", e),
        }
    }
}

impl std::error::Error for BackendError {}
