/// Video editor backend library using FFmpeg for video processing.
///
/// # Features
/// - Video loading and metadata extraction
/// - Playback control (play/pause/seek)
/// - Frame decoding and rendering
/// - Cross-platform Linux Ubuntu support
///
/// # Usage
/// ```rust,no_run
/// use video_editor::{VideoEngine, VideoLoader, VideoMetadata};
/// 
/// // Initialize video engine
/// let engine = VideoEngine::new("/path/to/video.mp4")?;
/// 
/// // Load metadata
/// engine.load_metadata("/path/to/video.mp4")?;
/// 
/// // Play/pause/seek
/// engine.play();
/// engine.pause();
/// engine.seek(10.5)?;
/// 
/// // Get frame at current time
/// let frame = engine.decode_frame()?;
/// ```

pub mod backend;

// Re-export main public types from backend module
pub use backend::video_engine::{PlayState, VideoEngine};
pub use backend::video_loader::{VideoLoader, VideoMetadata, load_metadata, load_and_cache_metadata};
