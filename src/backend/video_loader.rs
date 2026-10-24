//! Video loader module that uses FFmpeg's ffprobe to extract video metadata.
//!
//! This module provides:
//! - Loading video files and extracting metadata (duration, resolution, codecs)
//! - Caching mechanism for frequently accessed videos
//! - Error handling for file operations and FFmpeg command failures

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde_json::Value;

/// Metadata extracted from a video file using FFmpeg's ffprobe.
#[derive(Debug, Clone)]
pub struct VideoMetadata {
    pub duration: f64,
    pub resolution: Option<(u32, u32)>,
    pub video_codec: String,
    pub audio_codec: String,
    pub frame_rate: Option<f64>,
    pub file_path: PathBuf,
    pub error: Option<String>,
}

impl VideoMetadata {
    /// Check if metadata is valid (successfully loaded with positive duration).
    pub fn is_valid(&self) -> bool {
        self.error.is_none() && self.duration > 0.0
    }

    /// Get resolution as string like "1920x1080".
    pub fn resolution_str(&self) -> String {
        match self.resolution {
            Some((w, h)) => format!("{}x{}", w, h),
            None => "unknown".to_string(),
        }
    }

    /// Get base video codec name (without bit depth suffix).
    pub fn codec_str(&self) -> &str {
        if let Some(base) = self.video_codec.split('.').next() {
            base
        } else {
            "unknown"
        }
    }
}

/// Video loader that manages metadata cache in memory.
#[derive(Debug)]
pub struct VideoLoader {
    pub cache: HashMap<PathBuf, VideoMetadata>,
    pub max_cache_size: usize,
}

impl Default for VideoLoader {
    fn default() -> Self {
        VideoLoader::new(100)
    }
}

impl VideoLoader {
    /// Create a new VideoLoader with specified cache size.
    pub fn new(max_cache_size: usize) -> Self {
        VideoLoader {
            cache: HashMap::new(),
            max_cache_size,
        }
    }

    /// Clear the metadata cache.
    pub fn clear(&mut self) {
        self.cache.clear();
    }

    /// Check if metadata is cached for a path.
    pub fn has_cached<P: AsRef<Path>>(&self, path: P) -> bool {
        self.cache.contains_key(path.as_ref())
    }

    /// Get cached metadata without removing it.
    pub fn get_cached<P: AsRef<Path>>(&self, path: P) -> Option<&VideoMetadata> {
        self.cache.get(path.as_ref())
    }

    /// Remove and return cached metadata.
    pub fn remove_cached<P: AsRef<Path>>(&mut self, path: P) -> Option<VideoMetadata> {
        self.cache.remove(path.as_ref())
    }

    /// Get current cache size.
    pub fn cache_size(&self) -> usize {
        self.cache.len()
    }

    /// Evict oldest entries if cache is full before adding new entry.
    pub fn evict_if_needed(&mut self) {
        if self.cache.len() < self.max_cache_size {
            return;
        }
        
        // Collect invalid entries first
        let mut to_remove: Vec<PathBuf> = Vec::new();
        for (path, meta) in &self.cache {
            if !meta.is_valid() {
                to_remove.push(path.clone());
            }
        }
        
        // Remove invalid entries
        for path in to_remove {
            self.cache.remove(&path);
        }
    }
}

/// Load video metadata from file using FFmpeg's ffprobe command.
pub async fn load_metadata<P: AsRef<Path>>(path: P) -> Result<VideoMetadata, String> {
    let path = path.as_ref().to_path_buf();

    if !path.exists() {
        return Err(format!("File does not exist: {:?}", path));
    }

    if !path.metadata().map(|m| m.is_file()).unwrap_or(false) {
        return Err(format!(
            "Path is not a regular file: {:?}",
            path
        ));
    }

    let duration = probe_with_system_ffprobe(&path)?;
    let streams_info = get_streams_info(&path)?;

    let video_codec = extract_video_codec(&streams_info);
    let audio_codec = extract_audio_codec(&streams_info);
    let resolution = extract_resolution(&streams_info);
    let frame_rate = extract_frame_rate(&streams_info);

    Ok(VideoMetadata {
        duration,
        resolution,
        video_codec,
        audio_codec,
        frame_rate,
        file_path: path.clone(),
        error: None,
    })
}

/// Load and cache metadata (sync version with eviction).
pub async fn load_and_cache_metadata<P: AsRef<Path>>(
    loader: &mut VideoLoader,
    path: P,
) -> Result<VideoMetadata, String> {
    let metadata = load_metadata(path).await?;
    
    // Evict invalid entries if cache is full
    loader.evict_if_needed();

    let canonical_path = std::fs::canonicalize(&metadata.file_path).unwrap_or_else(|_| metadata.file_path.clone());
    loader.cache.insert(canonical_path, metadata.clone());

    Ok(metadata)
}

/// Get duration of video using ffprobe command.
fn probe_with_system_ffprobe(path: &Path) -> Result<f64, String> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            path.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    let json_str = String::from_utf8(output.stdout).map_err(|e| {
        format!("Failed to parse ffprobe output as JSON: {}", e)
    })?;

    // Extract duration from JSON
    if let Some(pos) = json_str.find("\"duration\":") {
        let start = pos + "\"duration\":".len();
        let rest = &json_str[start..];
        let end = rest.find(|c: char| c == ',' || c == '}').unwrap_or(rest.len());
        let duration_str = &rest[..end].trim();
        
        return duration_str.parse::<f64>().map_err(|e| {
            format!("Duration parse error: {}", e)
        });
    }

    Err("Could not parse duration from ffprobe output".to_string())
}

/// Get streams information from ffprobe.
fn get_streams_info(path: &Path) -> Result<Value, String> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            path.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    let json_str = String::from_utf8(output.stdout).map_err(|e| {
        format!("Failed to parse ffprobe JSON output: {}", e)
    })?;

    serde_json::from_str(&json_str).map_err(|e| {
        format!("Failed to parse ffprobe JSON output: {}", e)
    })
}

/// Extract video codec name.
fn extract_video_codec(streams_info: &Value) -> String {
    if let Some(streams_val) = streams_info.get("streams") {
        if let Some(streams_array) = streams_val.as_array() {
            for stream in streams_array.iter() {
                if stream.get("codec_type").and_then(|v| v.as_str()) == Some("video") {
                    return stream
                        .get("codec_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                }
            }
        }
    }
    "unknown".to_string()
}

/// Extract audio codec name.
fn extract_audio_codec(streams_info: &Value) -> String {
    if let Some(streams_val) = streams_info.get("streams") {
        if let Some(streams_array) = streams_val.as_array() {
            for stream in streams_array.iter() {
                if stream.get("codec_type").and_then(|v| v.as_str()) == Some("audio") {
                    return stream
                        .get("codec_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("none")
                        .to_string();
                }
            }
        }
    }
    "none".to_string()
}

/// Extract resolution (width, height).
fn extract_resolution(streams_info: &Value) -> Option<(u32, u32)> {
    if let Some(streams_val) = streams_info.get("streams") {
        if let Some(streams_array) = streams_val.as_array() {
            for stream in streams_array.iter() {
                if stream.get("codec_type").and_then(|v| v.as_str()) == Some("video") {
                    // Extract width and height as strings then parse
                    let width = match stream.get("width").and_then(|v: &Value| v.as_str()) {
                        Some(s) => s.parse::<u32>().ok(),
                        None => None,
                    };
                    let height = match stream.get("height").and_then(|v: &Value| v.as_str()) {
                        Some(s) => s.parse::<u32>().ok(),
                        None => None,
                    };
                    
                    if let (Some(w), Some(h)) = (width, height) {
                        return Some((w, h));
                    }
                }
            }
        }
    }
    None
}

/// Extract frame rate.
fn extract_frame_rate(streams_info: &Value) -> Option<f64> {
    if let Some(streams_val) = streams_info.get("streams") {
        if let Some(streams_array) = streams_val.as_array() {
            for stream in streams_array.iter() {
                if stream.get("codec_type").and_then(|v| v.as_str()) == Some("video") {
                    // Extract fps as string, handle rational format or simple number
                    if let Some(fps_val) = stream.get("r_frame_rate") {
                        if let Some(num_str) = fps_val.as_str() {
                            return Some(num_str.parse::<f64>().unwrap_or(0.0));
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_video_metadata_is_valid() {
        let meta = VideoMetadata {
            duration: 10.5,
            resolution: Some((1920, 1080)),
            video_codec: "h264".to_string(),
            audio_codec: "aac".to_string(),
            frame_rate: Some(30.0),
            file_path: PathBuf::from("/test.mp4"),
            error: None,
        };
        assert!(meta.is_valid());

        let meta_invalid = VideoMetadata {
            duration: -1.0,
            ..meta.clone()
        };
        assert!(!meta_invalid.is_valid());
    }

    #[test]
    fn test_video_loader_cache_operations() {
        let mut loader = VideoLoader::new(5);
        assert_eq!(loader.cache_size(), 0);
        
        // Simulate adding entries
        let sample_meta = VideoMetadata {
            duration: 10.0,
            resolution: Some((1280, 720)),
            video_codec: "h264".to_string(),
            audio_codec: "aac".to_string(),
            frame_rate: Some(30.0),
            file_path: PathBuf::from("/sample.mp4"),
            error: None,
        };
        
        loader.cache.insert(PathBuf::from("/sample1.mp4"), sample_meta.clone());
        assert_eq!(loader.cache_size(), 1);
        assert!(loader.has_cached("/sample1.mp4"));
        
        let cached = loader.get_cached("/sample1.mp4").unwrap();
        assert_eq!(cached.duration, 10.0);
        
        // Test eviction with invalid entries
        let mut_invalid_meta = VideoMetadata {
            duration: 0.0,
            resolution: None,
            video_codec: "unknown".to_string(),
            audio_codec: "none".to_string(),
            frame_rate: None,
            file_path: PathBuf::from("/invalid.mp4"),
            error: Some("corrupt".to_string()),
        };
        loader.cache.insert(PathBuf::from("/invalid.mp4"), mut_invalid_meta);
        
        // Evict invalid entries
        loader.evict_if_needed();
        assert!(!loader.has_cached("/invalid.mp4"));
    }

    #[test]
    fn test_video_metadata_display() {
        let meta = VideoMetadata {
            duration: 45.5,
            resolution: Some((1920, 1080)),
            video_codec: "h264".to_string(),
            audio_codec: "aac".to_string(),
            frame_rate: Some(30.0),
            file_path: PathBuf::from("/test.mp4"),
            error: None,
        };
        
        assert_eq!(meta.resolution_str(), "1920x1080");
        assert_eq!(meta.codec_str(), "h264");
    }
}
