// Backend bridge - handles video loading and playback control via ffmpeg
const { execFile } = require('child_process');
const path = require('path');

class VideoBackend {
  constructor() {
    this.ffmpegPath = null;
    this.currentVideoPath = null;
    this.isPlaying = false;
  }

  /**
   * Detect ffmpeg installation
   */
  async init() {
    return new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-version'], (error, stdout, stderr) => {
        if (error) {
          console.error('FFmpeg not found:', error.message);
          // Try alternative paths common on Linux Ubuntu
          const alternatives = ['/usr/bin/ffmpeg', '/snap/bin/ffmpeg'];
          let found = false;
          
          for (const altPath of alternatives) {
            if (require('fs').existsSync(altPath)) {
              this.ffmpegPath = altPath;
              console.log(`Using FFmpeg at: ${this.ffmpegPath}`);
              found = true;
              break;
            }
          }
          
          if (!found) {
            reject(new Error('FFmpeg not installed. Please install via: sudo apt install ffmpeg'));
            return;
          }
        } else {
          // Found in PATH
          this.ffmpegPath = 'ffmpeg';
        }
        
        resolve(this);
      });
    });
  }

  /**
   * Get video duration using ffprobe
   */
  async getDuration(filePath) {
    return new Promise((resolve, reject) => {
      const command = this.ffmpegPath;
      const args = [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ];

      execFile(command, args, { timeout: 30 }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        
        const duration = parseFloat(stdout.trim());
        resolve(duration || null);
      });
    });
  }

  /**
   * Get video frame count for thumbnail generation
   */
  async getFrameCount(filePath, duration) {
    return new Promise((resolve, reject) => {
      if (!duration) {
        this.getDuration(filePath).then(dur => this.getFrameCount(filePath, dur)).catch(reject);
        return;
      }

      // Estimate frames based on resolution and duration
      // This is a rough estimate - real frame count requires actual processing
      const estimatedFrames = Math.floor(duration * 30); // Assume 30fps
      resolve(estimatedFrames);
    });
  }

  /**
   * Generate thumbnail at specific time
   */
  generateThumbnail(filePath, seconds, outputPath) {
    return new Promise((resolve, reject) => {
      if (!outputPath) outputPath = path.join(path.dirname(filePath), `thumb_${seconds}s.jpg`);
      
      const command = this.ffmpegPath;
      const args = [
        '-i', filePath,
        '-ss', seconds.toString(),
        '-vframes', '1',
        '-vf', 'scale=320:-1',
        '-y', outputPath
      ];

      execFile(command, args, { timeout: 30 }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(outputPath);
        }
      });
    });
  }

  /**
   * Main playback control handler - would integrate with actual video rendering
   * For now, this is a placeholder for the main process to handle IPC
   */
  onMessage(channel, data) {
    console.log(`Backend received: ${channel}`, data);
    
    switch (channel) {
      case 'play':
        this.isPlaying = true;
        break;
      
      case 'pause':
        this.isPlaying = false;
        break;
      
      case 'seek':
        if (this.currentVideoPath && data) {
          // Seek logic would go here
          // This is a placeholder for now
        }
        break;
      
      case 'set-volume':
        console.log(`Volume set to: ${data}`);
        break;
      
      case 'get-current-time':
        return this.currentVideoTime || 0;
      
      case 'get-duration':
        if (this.currentVideoPath) {
          this.getDuration(this.currentVideoPath).then(resolve => {
            return resolve;
          }).catch(console.error);
        }
        break;
      
      case 'load-video':
        this.handleLoadVideo(data);
        break;
    }
  }

  /**
   * Handle video load request
   */
  handleLoadVideo(filePath) {
    this.currentVideoPath = filePath;
    
    // Get duration asynchronously
    this.getDuration(filePath).then(duration => {
      if (duration) {
        console.log(`Video loaded: ${filePath}, duration: ${duration.toFixed(2)}s`);
        this.emit('status-change', { 
          state: 'ready', 
          duration: duration,
          filePath: filePath
        });
      }
    }).catch(error => {
      console.error('Failed to load video:', error.message);
      this.emit('status-change', { 
        state: 'error', 
        message: error.message 
      });
    });
  }

  /**
   * Emit event to renderer via IPC
   */
  emit(channel, data) {
    const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Close/destroy backend
   */
  close() {
    this.currentVideoPath = null;
    this.isPlaying = false;
  }
}

module.exports = VideoBackend;
