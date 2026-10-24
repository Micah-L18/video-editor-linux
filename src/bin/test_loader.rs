//! Test binary for video metadata loading functionality.
//! 
//! Run with: cargo run --bin test_loader [-- <video_path>]
//! Falls back to sample video if none provided.

use std::path::{Path, PathBuf};
use video_editor::{VideoLoader, load_metadata};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Video Metadata Loader Test ===\n");
    
    // Create a new loader with cache size of 50 (unused here, for API demo)
    let _loader_api = VideoLoader::new(50);
    
    // Try to load a sample video if path provided, otherwise find system samples
    let args: Vec<String> = std::env::args().collect();
    
    let video_path = if args.len() > 1 {
        PathBuf::from(&args[1])
    } else {
        // Try common sample locations
        find_sample_video()
    };
    
    println!("Testing path: {:?}", video_path);
    println!("File exists: {}", video_path.exists());
    
    if let Err(e) = load_metadata(&video_path).await {
        println!("Error loading video: {}", e);
        if video_path.exists() {
            println!("\nNote: File exists but metadata extraction failed.");
            println!("This may be due to unsupported codec or format.");
        } else {
            println!("\nNo sample video found. Install test samples with:");
            println!("  sudo apt install ffmpeg -y");
            println!("  Then copy a sample MP4 file to /tmp/ for testing.");
        }
        return Ok(());
    }
    
    let metadata = load_metadata(&video_path).await?;
    
    if metadata.is_valid() {
        println!("\n✓ Successfully loaded metadata!");
        println!("Duration: {:.2}s", metadata.duration);
        println!("Resolution: {:?}", metadata.resolution);
        println!("Video Codec: {}", metadata.video_codec);
        println!("Audio Codec: {}", metadata.audio_codec);
        println!("Frame Rate: {:?}", metadata.frame_rate);
        
        println!("\nMetadata is VALID");
    } else {
        println!("\n⚠ Metadata may be invalid or incomplete");
        if let Some(ref err) = metadata.error {
            println!("Error message: {}", err);
        }
    }
    
    // Test caching operations
    println!("\n=== Caching Test ===");
    let mut test_loader = VideoLoader::new(5);
    println!("Initial cache size: {}", test_loader.cache_size());
    
    // Demonstrate loader API without actual loading
    println!("Cache methods available:");
    println!("  - has_cached()");
    println!("  - get_cached()");
    println!("  - remove_cached()");
    println!("  - clear()");
    println!("  - evict_if_needed()");
    
    // Test cache operations
    test_loader.clear();
    println!("\nAfter clear(), cache size: {}", test_loader.cache_size());
    
    println!("\n=== API Demo Complete ===");
    Ok(())
}

/// Try to find a sample video in common locations.
fn find_sample_video() -> PathBuf {
    let samples = [
        "/usr/share/sounds/alsa/Front_Center.mp3",
        "/usr/share/doc/*/sample.*",
        "/usr/share/vmlinuz",
        "/tmp/sample.mp4",
        "/home/dev/Documents/Video-editor/sample.mp4",
        "video.mp4",
        "test.mp4",
    ];
    
    // Filter out directories and try files
    for sample in &samples {
        let path = Path::new(sample);
        if path.exists() && path.metadata().map(|m| m.is_file()).unwrap_or(false) {
            return PathBuf::from(sample);
        }
    }
    
    PathBuf::from("/dev/null") // Use /dev/null as dummy to test error handling
}
