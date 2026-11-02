// Backend bridge - handles video loading and playback control via ffmpeg
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

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
      // Try ffprobe directly with full path first
      const command = '/usr/bin/ffprobe';
      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ];

      execFile(command, args, { timeout: 30 }, (error, stdout) => {
        if (!error) {
          const duration = parseFloat(stdout.trim());
          resolve(duration || null);
          return;
        }

        // Try with alternative path if needed
        const altCommand = 'ffprobe';
        execFile(altCommand, args, { timeout: 30 }, (altError, altStdout) => {
          if (!altError) {
            const duration = parseFloat(altStdout.trim());
            resolve(duration || null);
            return;
          }

          // Both failed - reject with original error
          reject(new Error(`Failed to get duration for ${filePath}: ${error.message}`));
        });
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
      if (!outputPath) outputPath = path.join(path.dirname(filePath), `thumb_${seconds}s.png`);

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
          // Try alternative approach if the first fails
          const altArgs = [
            '-i', filePath,
            '-ss', seconds.toString(),
            '-vframes', '1',
            '-y', outputPath
          ];

          execFile(command, altArgs, { timeout: 30 }, (altError) => {
            if (altError) {
              reject(new Error(`Failed to generate thumbnail for ${filePath} at ${seconds}s: ${error.message || altError.message}`));
            } else {
              resolve(outputPath);
            }
          });
        } else {
          resolve(outputPath);
        }
      });
    });
  }

  /**
   * Trim video from start time to end time
   */
  async trimVideo(inputPath, startTime, endTime) {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(path.dirname(inputPath), `trimmed_${path.basename(inputPath)}`);

      // Validate inputs
      if (startTime < 0 || endTime <= startTime) {
        reject(new Error('Invalid trim times'));
        return;
      }

      const command = this.ffmpegPath;
      const args = [
        '-i', inputPath,
        '-ss', startTime.toString(),
        '-to', endTime.toString(),
        '-c', 'copy',
        '-y', outputPath
      ];

      execFile(command, args, { timeout: 60 }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(outputPath);
        }
      });
    });
  }

  /**
   * Split video at specific time point into two parts
   */
  async splitVideo(inputPath, splitTime) {
    return new Promise((resolve, reject) => {
      // Validate inputs
      if (splitTime <= 0) {
        reject(new Error('Invalid split time'));
        return;
      }

      const directory = path.dirname(inputPath);
      const basename = path.basename(inputPath, path.extname(inputPath));
      const extension = path.extname(inputPath);

      // First part: from start to split point
      const firstOutputPath = path.join(directory, `${basename}_part1${extension}`);

      // Second part: from split point to end
      const secondOutputPath = path.join(directory, `${basename}_part2${extension}`);

      const command = this.ffmpegPath;
      const args = [
        '-i', inputPath,
        '-ss', '0',
        '-to', splitTime.toString(),
        '-c', 'copy',
        '-y', firstOutputPath,
        '-ss', splitTime.toString(),
        '-c', 'copy',
        '-y', secondOutputPath
      ];

      execFile(command, args, { timeout: 60 }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            firstPart: firstOutputPath,
            secondPart: secondOutputPath
          });
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
   * Generate thumbnails from video
   */
  async generateThumbnails(videoPath, frameCount = 10) {
    try {
      // Create a temporary directory for thumbnails
      const tempDir = require('os').tmpdir();
      const thumbnailDir = path.join(tempDir, 'video-editor-thumbnails');

      // Ensure the thumbnail directory exists
      await fs.mkdir(thumbnailDir, { recursive: true });

      // Get video duration to determine thumbnail positions
      const duration = await this.getDuration(videoPath);

      if (!duration || duration <= 0) {
        throw new Error('Could not determine video duration');
      }

      console.log(`Video duration: ${duration}s, generating ${frameCount} thumbnails`);

      // Calculate interval between thumbnails
      const interval = duration / (frameCount + 1);

      // Generate thumbnails at calculated intervals
      const thumbnailPaths = [];

      for (let i = 1; i <= frameCount; i++) {
        const seconds = interval * i;
        const thumbnailPath = path.join(thumbnailDir, `thumb_${i}_${path.basename(videoPath, path.extname(videoPath))}.png`);

        // Generate single thumbnail using ffmpeg
        try {
          await this.generateThumbnail(videoPath, seconds, thumbnailPath);
          thumbnailPaths.push(thumbnailPath);
          console.log(`Generated thumbnail: ${thumbnailPath}`);
        } catch (thumbError) {
          console.error(`Failed to generate thumbnail at ${seconds}s:`, thumbError.message);
          // Continue with other thumbnails even if one fails
        }
      }

      return thumbnailPaths;
    } catch (error) {
      console.error('Error generating thumbnails:', error);
      throw error;
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

// Export both the class and standalone functions for IPC use
const backendInstance = new VideoBackend();

module.exports = VideoBackend;
module.exports.trimVideo = async (inputPath, startTime, endTime) => {
  return await backendInstance.trimVideo(inputPath, startTime, endTime);
};

module.exports.splitVideo = async (inputPath, splitTime) => {
  return await backendInstance.splitVideo(inputPath, splitTime);
};

// Export thumbnail generation function
module.exports.generateThumbnails = async (videoPath, frameCount = 10) => {
  return await backendInstance.generateThumbnails(videoPath, frameCount);
};
