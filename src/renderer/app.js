// Video Editor - Main Renderer Logic
(function() {
  'use strict';

  // DOM Elements
  const elements = {
    loadingScreen: document.getElementById('loading-screen'),
    playerContainer: document.getElementById('player-container'),
    mainVideo: document.getElementById('main-video'),
    controlsOverlay: document.getElementById('controls-overlay'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    playIcon: document.getElementById('play-icon'),
    pauseIcon: document.getElementById('pause-icon'),
    progressContainer: document.getElementById('progress-container'),
    seekBar: document.getElementById('seek-bar'),
    seekFill: document.getElementById('seek-fill'),
    seekSlider: document.getElementById('seek-slider'),
    currentTime: document.getElementById('current-time'),
    duration: document.getElementById('duration'),
    volumeContainer: document.getElementById('volume-container'),
    muteBtn: document.getElementById('mute-btn'),
    volumeSlider: document.getElementById('volume-slider'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    skipBackward: document.getElementById('skip-backward'),
    skipForward: document.getElementById('skip-forward'),
    videoLoading: document.getElementById('video-loading'),
    uploadScreen: document.getElementById('upload-screen'),
    errorScreen: document.getElementById('error-screen'),
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message'),
    closeErrorBtn: document.getElementById('close-error-btn'),
    videoInput: document.getElementById('video-input')
  };

  // State
  let isPlaying = false;
  let currentVolume = 0.8;
  let seekInterval = null;
  
  // Exposed API for main process (for IPC if needed)
  const api = window.api || {};

  /**
   * Initialize event listeners and start the app
   */
  function init() {
    setupPlayPauseButton();
    setupSeekControls();
    setupVolumeControls();
    setupFullscreenControl();
    setupSkipButtons();
    setupUploadScreen();
    
    // Request API from preload script
    api.onStatusChange(handleStatusChange);
    
    console.log('Video Editor initialized');
  }

  /**
   * Setup play/pause button
   */
  function setupPlayPauseButton() {
    elements.playPauseBtn.addEventListener('click', () => {
      if (elements.mainVideo.src) {
        isPlaying ? togglePause() : togglePlay();
      }
    });

    // Keyboard shortcuts: Space to play/pause, Left/Right arrow for seeking
    document.addEventListener('keydown', (e) => {
      if (!elements.mainVideo.src || elements.loadingScreen.classList.contains('visible')) return;
      
      switch(e.code) {
        case 'Space':
          e.preventDefault();
          isPlaying ? togglePause() : togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          const seconds = 5;
          if (elements.mainVideo.duration && !isNaN(elements.mainVideo.duration)) {
            seek(Math.max(0, Math.min(elements.mainVideo.currentTime - seconds, elements.mainVideo.duration));
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          const seconds = 5;
          if (elements.mainVideo.duration && !isNaN(elements.mainVideo.duration)) {
            seek(Math.max(0, Math.min(elements.mainVideo.currentTime + seconds, elements.mainVideo.duration));
          }
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    });
  }

  /**
   * Setup seek controls (hover show slider)
   */
  function setupSeekControls() {
    const container = elements.progressContainer;
    const hoverSlider = () => elements.seekBar.classList.remove('hidden');
    const hideSlider = () => elements.seekBar.classList.add('hidden');

    container.addEventListener('mouseenter', hoverSlider);
    container.addEventListener('mouseleave', hideSlider);

    // Seek slider: show on input, update fill bar and seek video
    container.addEventListener('mousedown', (e) => {
      if (e.target.id === 'seek-slider') {
        elements.seekSlider.classList.remove('hidden');
        handleSeekStart(e);
      }
    });
    
    // Initialize slider with current playback position after metadata loads
    elements.mainVideo.onloadedmetadata = function() {
      // Wait for duration to be available, then initialize slider
      const initSliderAfterMetadata = () => {
        if (elements.mainVideo.duration && !isNaN(elements.mainVideo.duration)) {
          const initialPercentage = (elements.mainVideo.currentTime / elements.mainVideo.duration) * 100;
          elements.seekSlider.value = initialPercentage.toFixed(2);
          updateSeekFill(initialPercentage);
        }
      };
      
      // Call immediately if duration available, otherwise wait a bit for metadata
      if (elements.mainVideo.duration && !isNaN(elements.mainVideo.duration)) {
        initSliderAfterMetadata();
      } else {
        setTimeout(initSliderAfterMetadata, 100);
      }
    };
    
    // Seek slider input: update video time when dragging
    elements.seekSlider.addEventListener('input', (e) => {
      const percentage = parseFloat(elements.seekSlider.value) / 100;
      if (!isNaN(percentage)) {
        seek(percentage * elements.mainVideo.duration, true);
      }
    });
    
    // Seek slider change (when drag ends): update fill bar only
    elements.seekSlider.addEventListener('change', () => {
      // Reset fill position to current slider value after drag
      const currentVal = parseFloat(elements.seekSlider.value);
      if (!isNaN(currentVal)) {
        updateSeekFill(currentVal / 100, true);
      }
    });
  }

  /**
   * Setup volume controls
   */
  function setupVolumeControls() {
    const handleVolumeChange = () => {
      const value = parseInt(elements.volumeSlider.value) / 100;
      setVolume(value);
    };

    elements.muteBtn.addEventListener('click', toggleMute);
    
    // Show volume slider on hover
    elements.volumeContainer.addEventListener('mouseenter', () => {
      if (!elements.volumeSlider.hidden) {
        handleVolumeChange();
      }
    });
  }

  /**
   * Setup fullscreen control
   */
  function setupFullscreenControl() {
    elements.fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // Listen for system fullscreen changes
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
        // Optional: Restore original size
      }
    });
  }

  /**
   * Setup skip buttons
   */
  function setupSkipButtons() {
    // Skip backward by 15 seconds (or -10% if near start)
    elements.skipBackward.addEventListener('click', () => {
      const duration = elements.mainVideo.duration;
      if (!duration || isNaN(duration)) return;
      
      const current = Math.max(0, elements.mainVideo.currentTime - 15);
      seek(current);
    });
    
    // Skip forward by 15 seconds (or to end if near end)
    elements.skipForward.addEventListener('click', () => {
      const duration = elements.mainVideo.duration;
      if (!duration || isNaN(duration)) return;
      
      const current = Math.min(duration, elements.mainVideo.currentTime + 15);
      seek(current);
    });
  }

  /**
   * Setup upload screen (file selection)
   */
  function setupUploadScreen() {
    elements.videoInput.addEventListener('change', handleFileSelect);
    
    elements.closeErrorBtn.addEventListener('click', closeErrorScreen);
  }

  /**
   * Handle file selection - load video via main process if needed
   */
  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show loading screen
    showLoading('Loading video...');

    // Create object URL for the video
    const fileURL = URL.createObjectURL(file);
    loadVideo(fileURL);

    // Clear input so same file can be selected again
    elements.videoInput.value = '';
  }

  /**
   * Load video into player
   */
  function loadVideo(url) {
    if (!elements.mainVideo.src) {
      // First video - switch screens
      hideScreen('upload-screen');
      showScreen('player-container');
      elements.playerContainer.classList.remove('hidden');
    }

    // Set new source
    elements.mainVideo.src = url;
    
    // Listen for video metadata loaded
    elements.mainVideo.onloadedmetadata = function() {
      hideLoading();
      updateDuration();
      
      // Initialize slider position with current playback time
      const initialPercentage = (elements.mainVideo.currentTime / elements.mainVideo.duration) * 100;
      elements.seekSlider.value = Math.min(initialPercentage, 100).toFixed(2);
      updateSeekFill(initialPercentage);
      
      if (!isPlaying) {
        togglePlay();
      } else {
        // If video is already playing, start seek interval
        startSeekInterval();
      }
    };

    // Error handling
    elements.mainVideo.onerror = (e) => {
      console.error('Video load error:', e);
      showError('Failed to load video. Please try another file.');
      hideScreen('player-container');
      showScreen('upload-screen');
    };
  }

  /**
   * Toggle play state
   */
  function togglePlay() {
    elements.mainVideo.play()
      .then(() => {
        isPlaying = true;
        updatePlayPauseIcon();
      })
      .catch((error) => {
        console.error('Play error:', error);
        if (isPlaying) {
          // Video was playing but now can't play - pause it
          togglePause();
        }
      });
  }

  /**
   * Toggle pause state
   */
  function togglePause() {
    elements.mainVideo.pause();
    isPlaying = false;
    updatePlayPauseIcon();
  }

  /**
   * Update play/pause icon visibility
   */
  function updatePlayPauseIcon() {
    if (isPlaying) {
      elements.playIcon.classList.add('hidden');
      elements.pauseIcon.classList.remove('hidden');
    } else {
      elements.playIcon.classList.remove('hidden');
      elements.pauseIcon.classList.add('hidden');
    }
  }

  /**
   * Setup seek slider to match current playback time
   */
  function setupSeekInterval() {
    // Only start interval when video is playing and duration is available
    if (isPlaying && elements.mainVideo.duration && !isNaN(elements.mainVideo.duration)) {
      // Update seek fill position periodically
      seekInterval = setInterval(() => {
        const percentage = (elements.mainVideo.currentTime / elements.mainVideo.duration) * 100;
        updateSeekFill(percentage);
      }, 50); // Update every 50ms
    } else {
      // Pause interval if video paused or duration not available
      clearInterval(seekInterval);
    }
  }

  /**
   * Start the seek interval when appropriate
   */
  function startSeekInterval() {
    setupSeekInterval();
  }

  /**
   * Stop the seek interval when seeking
   */
  function stopSeekInterval() {
    clearInterval(seekInterval);
  }

  /**
   * Update seek fill position and sync slider with playback
   */
  function updateSeekFill(percentage, isDragging = false) {
    if (!elements.mainVideo.duration || isNaN(elements.mainVideo.duration)) return;
    
    const validPercentage = Math.max(0, Math.min(percentage, 100));
    
    // Update seek fill bar width
    elements.seekFill.style.width = validPercentage + '%';
    
    // Only update slider value when not dragging (during normal playback)
    if (!isDragging) {
      elements.seekSlider.value = validPercentage.toFixed(2);
    } else {
      // During drag, keep slider at user's current position
      const currentValue = parseFloat(elements.seekSlider.value);
      elements.seekFill.style.width = Math.min(currentValue, 100) + '%';
    }
    
    // Update time display synchronously
    updateDisplay();
  }

  /**
   * Format time as mm:ss
   */
  function formatTime(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Update current time and duration display
   */
  function updateDisplay() {
    if (elements.mainVideo.currentTime !== undefined && !isNaN(elements.mainVideo.currentTime)) {
      elements.currentTime.textContent = formatTime(elements.mainVideo.currentTime);
    }
    
    if (elements.mainVideo.duration !== undefined && !isNaN(elements.mainVideo.duration)) {
      const durationStr = formatTime(elements.mainVideo.duration);
      elements.duration.textContent = ` / ${durationStr}`;
    }
  }

  /**
   * Handle seek bar drag start
   */
  function handleSeekStart(event) {
    // Show seek bar on drag start if hidden
    if (elements.seekBar.classList.contains('hidden')) {
      elements.seekBar.classList.remove('hidden');
      
      // Reset fill position to current slider value when starting to drag
      const currentVal = parseFloat(elements.seekSlider.value);
      updateSeekFill(currentVal / 100, true);
    }
    
    return false;
  }

  /**
   * Seek to a specific time (in seconds) with boundary checks
   */
  function seek(seconds, suppressInterval = false) {
    if (!elements.mainVideo.duration || isNaN(elements.mainVideo.duration)) return;
    
    const duration = elements.mainVideo.duration;
    // Clamp to valid range [0, duration] - allow seeking to exact end
    let newTime = Math.max(0, Math.min(seconds, duration));
    
    // Only update if time actually changed (prevent rapid-fire updates)
    if (Math.abs(newTime - elements.mainVideo.currentTime) > 0.1) {
      elements.mainVideo.currentTime = newTime;
      
      // Sync slider position with seeked time
      const percentage = (newTime / duration) * 100;
      elements.seekSlider.value = Math.min(percentage, 100).toFixed(2);
    }
    
    // Clear interval when seeking - will restart on next timeupdate event
    if (!suppressInterval) {
      clearInterval(seekInterval);
    }
    
    return newTime;
  }

  /**
   * Toggle mute
   */
  function toggleMute() {
    if (currentVolume > 0) {
      setVolume(0);
    } else {
      setVolume(currentVolume);
    }
  }

  /**
   * Set volume level
   */
  function setVolume(level) {
    currentVolume = Math.max(0, Math.min(1, level));
    elements.volumeSlider.value = (currentVolume * 100).toFixed(0);
    
    // If muted, ensure slider is not showing (or vice versa)
    if (currentVolume > 0.05) {
      elements.muteBtn.classList.add('hidden');
      elements.volumeSlider.classList.remove('hidden');
    } else {
      elements.muteBtn.classList.remove('hidden');
      elements.volumeSlider.classList.add('hidden');
    }
    
    // Update audio element volume directly too
    if (elements.mainVideo) {
      elements.mainVideo.volume = currentVolume;
    }
  }

  /**
   * Start seeking when video starts playing with metadata
   */
  function startSeekInterval() {
    if (!isPlaying || !elements.mainVideo.duration || isNaN(elements.mainVideo.duration)) return;
    
    // Update seek fill position periodically during playback
    seekInterval = setInterval(() => {
      const percentage = (elements.mainVideo.currentTime / elements.mainVideo.duration) * 100;
      updateSeekFill(percentage);
    }, 50); // Update every 50ms
    
    // Listen for time updates to keep sync
    elements.mainVideo.ontimeupdate = () => {
      if (elements.mainVideo.duration && !isNaN(elements.mainVideo.duration)) {
        const percentage = (elements.mainVideo.currentTime / elements.mainVideo.duration) * 100;
        updateSeekFill(percentage);
      }
    };
    
    // Re-enable interval when seeking completes
    elements.mainVideo.onseeked = () => {
      if (isPlaying) {
        startSeekInterval();
      }
    };
  }

  /**
   * Stop seeking when paused or seeking manually
   */
  function stopSeekInterval() {
    clearInterval(seekInterval);
  }

  /**
   * Toggle fullscreen
   */
  function toggleFullscreen() {
    const container = elements.playerContainer;
    
    if (!document.fullscreenElement && container.requestFullscreen) {
      container.requestFullscreen().catch((err) => {
        console.error('Fullscreen error:', err);
      });
    } else if (document.exitFullscreen && container.exitFullscreen) {
      container.exitFullscreen();
    }
  }

  /**
   * Show loading screen with message
   */
  function showLoading(message) {
    elements.loadingScreen.classList.remove('hidden');
    elements.playerContainer.classList.add('hidden');
    elements.uploadScreen.classList.add('hidden');
    
    if (elements.loadingText) {
      elements.loadingText.textContent = message;
    }
    
    document.body.classList.remove('loading'); // Allow scrolling during loading
  }

  /**
   * Hide loading screen
   */
  function hideLoading() {
    elements.loadingScreen.classList.add('hidden');
    elements.progressContainer.classList.add('hidden');
    document.body.classList.add('loading');
  }

  /**
   * Update duration display
   */
  function updateDuration() {
    const formatTime = (seconds) => {
      if (!seconds || isNaN(seconds)) return '0:00';
      
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (elements.mainVideo.duration) {
      elements.duration.textContent = ` / ${formatTime(elements.mainVideo.duration)}`;
      updateSeekFill((elements.mainVideo.currentTime / elements.mainVideo.duration) * 100);
    }
  }

  /**
   * Show error screen
   */
  function showError(message) {
    elements.errorTitle.textContent = 'Error';
    elements.errorMessage.textContent = message;
    
    elements.loadingScreen.classList.add('hidden');
    elements.playerContainer.classList.add('hidden');
    elements.uploadScreen.classList.add('hidden');
    elements.errorScreen.classList.remove('hidden');
  }

  /**
   * Close error screen
   */
  function closeErrorScreen() {
    hideScreen('error-screen');
    showScreen('upload-screen');
  }

  /**
   * Show/hide screens utility
   */
  function showScreen(screenId) {
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.remove('hidden');
    }
  }

  function hideScreen(screenId) {
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.add('hidden');
    }
  }

  /**
   * Handle status changes from main process
   */
  function handleStatusChange(status) {
    console.log('Status changed:', status);
    // Could be used for buffering, loading progress, etc.
  }

  // Initialize the app
  init();

})();
