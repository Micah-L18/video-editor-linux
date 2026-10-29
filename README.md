# Video Editor

A simple Electron-based video editor for Linux.

## Features

- Play/pause video playback with keyboard shortcuts (Space to play/pause, arrow keys for seeking)
- Full seek bar with slider that appears on hover
- Volume control with mute functionality
- Skip backward/forward buttons (15 seconds each)
- File upload screen with support for MP4, WebM, OGG formats
- Trim controls for setting in/out points
- Split clip functionality at specified time
- Export video functionality for trimmed segments

## Trimming, Splitting, and Exporting Videos

The editor now includes UI controls for trimming and splitting clips. Use the start and end input fields to specify trim boundaries, then click **Split Clip** to split the video at the specified frame. For exporting a trimmed segment, enter start and end times and click **Export Video**. A progress bar will appear during processing.

## UI Polish and Cleanup

This version includes:
- Improved layout and spacing throughout the interface
- Enhanced accessibility with proper ARIA labels and keyboard navigation
- Visual feedback for interactive elements (buttons, sliders)
- Responsive design improvements for different screen sizes
- Code cleanup and removal of duplicate functions
- Better error handling and user feedback

## Development Status

UI polish and cleanup completed. Backend integration for trim/split/export functions in progress.

## Development Status

UI polish and cleanup completed. Backend integration for trim/split/export functions in progress.