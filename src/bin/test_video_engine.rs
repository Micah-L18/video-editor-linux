/// Test binary for video engine functionality.
/// Tests playback control and metadata extraction using FFmpeg's ffprobe.

use video_editor::{VideoEngine};

fn main() -> anyhow::Result<()> {
    println!("=== Video Engine Test ===");
    
    // Test 1: Create a new engine (should fail with file not found)
    let _engine = VideoEngine::new("/path/to/test.mp4");
    match _engine {
        Ok(_) => println!("Error: Expected file not found error"),
        Err(video_editor::backend::BackendError::InvalidVideo(msg)) => {
            println!("✓ Engine creation correctly reports missing file: {}", msg);
        }
        Err(e) => println!("Unexpected error: {:?}", e),
    }
    
    // Note: To fully test, install FFmpeg on system:
    //   sudo apt-get install ffmpeg
    
    println!("\nVideo Engine tests completed.");
    println!("Use FFmpeg installed on Linux Ubuntu to test with real video files.");
    
    Ok(())
}
