// Timeline component for video editor
(function() {
  'use strict';

  // DOM Elements
  const timelineContainer = document.getElementById('timeline');

  // State
  let thumbnails = [];
  let thumbnailWidth = 120;
  let thumbnailHeight = 68;
  let playheadPosition = 0;
  let trimStart = 0;
  let trimEnd = 0;

  /**
   * Initialize timeline component
   */
  function initTimeline() {
    if (!timelineContainer) {
      console.warn('Timeline container not found');
      return;
    }

    // Create timeline structure
    createTimelineStructure();

    // Request thumbnails from main process
    requestThumbnails();

    // Setup timeline event listeners
    setupTimelineListeners();
  }

  /**
   * Create the basic timeline HTML structure
   */
  function createTimelineStructure() {
    timelineContainer.innerHTML = `
      <div class="timeline-header">
        <h3>Timeline</h3>
      </div>
      <div class="timeline-content">
        <div class="timeline-track-container">
          <div class="thumbnail-track" id="thumbnail-track"></div>
          <div class="playhead" id="playhead">
            <div class="playhead-handle"></div>
          </div>
          <div class="trim-start-handle" id="trim-start-handle">
            <div class="handle-grip"></div>
          </div>
          <div class="trim-end-handle" id="trim-end-handle">
            <div class="handle-grip"></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Request thumbnails from main process
   */
  function requestThumbnails() {
    if (window.api && typeof window.api.requestThumbnails === 'function') {
      // In a real implementation, this would be called with video duration and thumbnail count
      // For now we'll simulate some thumbnails
      const simulatedThumbnails = [
        { time: 0, url: '' },
        { time: 5, url: '' },
        { time: 10, url: '' },
        { time: 15, url: '' },
        { time: 20, url: '' },
        { time: 25, url: '' },
        { time: 30, url: '' },
        { time: 35, url: '' },
        { time: 40, url: '' },
        { time: 45, url: '' },
        { time: 50, url: '' },
        { time: 55, url: '' },
        { time: 60, url: '' }
      ];

      renderThumbnails(simulatedThumbnails);
    } else {
      console.warn('Thumbnail request API not available');
      // Fallback to a simple representation
      const fallbackTrack = document.getElementById('thumbnail-track');
      if (fallbackTrack) {
        fallbackTrack.innerHTML = '<div class="thumbnail-placeholder">Thumbnails will appear here</div>';
      }
    }
  }

  /**
   * Render thumbnails in the timeline
   */
  function renderThumbnails(thumbData) {
    const thumbnailTrack = document.getElementById('thumbnail-track');
    if (!thumbnailTrack) return;

    // Clear existing thumbnails
    thumbnailTrack.innerHTML = '';

    // Create thumbnail elements
    thumbData.forEach((thumb, index) => {
      const thumbElement = document.createElement('div');
      thumbElement.className = 'thumbnail';
      thumbElement.dataset.time = thumb.time;
      thumbElement.style.width = thumbnailWidth + 'px';
      thumbElement.style.height = thumbnailHeight + 'px';

      // For now using a placeholder - in real implementation this would be actual thumbnails
      thumbElement.innerHTML = `
        <div class="thumbnail-content">
          <span class="thumbnail-time">${formatTime(thumb.time)}</span>
        </div>
      `;

      thumbnailTrack.appendChild(thumbElement);
    });

    // Add scrollable container for thumbnails
    thumbnailTrack.style.display = 'flex';
    thumbnailTrack.style.overflowX = 'auto';
    thumbnailTrack.style.scrollBehavior = 'smooth';
  }

  /**
   * Setup timeline event listeners
   */
  function setupTimelineListeners() {
    const timelineTrack = document.getElementById('thumbnail-track');
    if (!timelineTrack) return;

    // Handle click on timeline to set playhead position
    timelineTrack.addEventListener('click', (e) => {
      const rect = timelineTrack.getBoundingClientRect();
      const clickPosition = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (clickPosition / rect.width) * 100));

      // Update playhead position
      updatePlayheadPosition(percentage);
    });

    // Handle drag to set trim points
    setupTrimHandles();
  }

  /**
   * Setup trim handle drag functionality
   */
  function setupTrimHandles() {
    const trimStartHandle = document.getElementById('trim-start-handle');
    const trimEndHandle = document.getElementById('trim-end-handle');

    if (!trimStartHandle || !trimEndHandle) return;

    // Make handles draggable
    makeDraggable(trimStartHandle, 'start');
    makeDraggable(trimEndHandle, 'end');
  }

  /**
   * Make an element draggable for trim handles
   */
  function makeDraggable(element, type) {
    let isDragging = false;

    element.addEventListener('mousedown', (e) => {
      isDragging = true;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const timelineTrack = document.getElementById('thumbnail-track');
      if (!timelineTrack) return;

      const rect = timelineTrack.getBoundingClientRect();
      let position = ((e.clientX - rect.left) / rect.width) * 100;
      position = Math.max(0, Math.min(100, position));

      // Update handle position
      updateTrimHandlePosition(element, position, type);
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  /**
   * Update trim handle position
   */
  function updateTrimHandlePosition(handleElement, percentage, type) {
    if (type === 'start') {
      trimStart = Math.max(0, Math.min(percentage, trimEnd));
    } else {
      trimEnd = Math.max(trimStart, Math.min(percentage, 100));
    }

    handleElement.style.left = percentage + '%';

    // Update the UI to reflect new trim points
    updateTrimUI();
  }

  /**
   * Update playhead position on timeline
   */
  function updatePlayheadPosition(percentage) {
    playheadPosition = Math.max(0, Math.min(100, percentage));

    const playhead = document.getElementById('playhead');
    if (playhead) {
      playhead.style.left = playheadPosition + '%';
    }
  }

  /**
   * Update UI to show trim points
   */
  function updateTrimUI() {
    const trimStartHandle = document.getElementById('trim-start-handle');
    const trimEndHandle = document.getElementById('trim-end-handle');

    if (trimStartHandle) {
      trimStartHandle.style.left = trimStart + '%';
    }

    if (trimEndHandle) {
      trimEndHandle.style.left = trimEnd + '%';
    }
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

  // Expose public methods
  window.timeline = {
    init: initTimeline,
    updatePlayheadPosition: updatePlayheadPosition,
    updateTrimPoints: (start, end) => {
      trimStart = start;
      trimEnd = end;
      updateTrimUI();
    }
  };

})();