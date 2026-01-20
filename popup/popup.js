// Video Downloader - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const videoList = document.getElementById('videoList');
  const loading = document.getElementById('loading');
  const noVideos = document.getElementById('noVideos');
  const videoCount = document.getElementById('videoCount');
  const scanBtn = document.getElementById('scanBtn');
  const clearBtn = document.getElementById('clearBtn');
  const companionStatus = document.getElementById('companionStatus');
  const qualityModal = document.getElementById('qualityModal');
  const closeModal = document.getElementById('closeModal');
  const qualityOptions = document.getElementById('qualityOptions');
  const qualityLoading = document.getElementById('qualityLoading');
  const modalVideoTitle = document.getElementById('modalVideoTitle');
  
  let currentTabId = null;
  let companionReady = false;
  let selectedVideo = null;
  
  // Get current tab
  async function getCurrentTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }
  
  // Update companion status display
  function updateCompanionStatus(ready) {
    companionReady = ready;
    const statusText = companionStatus.querySelector('.status-text');
    
    if (ready) {
      companionStatus.className = 'companion-status connected';
      statusText.textContent = 'Companion app connected - Ready to download!';
    } else {
      companionStatus.className = 'companion-status disconnected';
      statusText.textContent = 'Companion app not connected - Run install.bat';
    }
  }
  
  // Format file size
  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
  
  // Get quality class
  function getQualityClass(quality) {
    if (!quality || quality === 'Unknown') return '';
    const num = parseInt(quality);
    if (num >= 1080 || quality.includes('4K') || quality.includes('1440')) return 'hd';
    if (num >= 720) return 'hd';
    return 'sd';
  }
  
  // Create video item element
  function createVideoItem(video) {
    const li = document.createElement('li');
    li.className = 'video-item';
    if (video.isYouTube || video.needsCompanion) {
      li.classList.add('youtube-video');
    }
    li.dataset.url = video.url;
    
    const thumbnail = video.poster 
      ? `<img src="${escapeHtml(video.poster)}" alt="Thumbnail" onerror="this.parentElement.innerHTML='<svg width=\\'24\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><rect x=\\'2\\' y=\\'4\\' width=\\'20\\' height=\\'16\\' rx=\\'2\\'/><path d=\\'M10 9l5 3-5 3V9z\\'/></svg>'">`
      : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>`;
    
    const qualityClass = getQualityClass(video.quality);
    const qualityBadge = video.quality && video.quality !== 'Unknown' 
      ? `<span class="video-quality ${qualityClass}">${escapeHtml(video.quality)}</span>` 
      : '';
    
    const size = formatSize(video.size);
    const sizeDisplay = size ? `<span class="video-size">${size}</span>` : '';
    
    // Show badge for videos that need companion
    const companionBadge = (video.isYouTube || video.needsCompanion)
      ? `<span class="video-youtube">📺 HD Ready</span>` 
      : '';
    
    // Use title if available, otherwise filename
    const displayName = video.title || video.filename;
    
    li.innerHTML = `
      <div class="video-thumbnail">
        ${thumbnail}
      </div>
      <div class="video-info">
        <div class="video-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
        <div class="video-meta">
          ${companionBadge}
          ${qualityBadge}
          ${sizeDisplay}
        </div>
        <div class="progress-container" id="progress-${video.id}">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <div class="progress-text">Starting...</div>
        </div>
      </div>
      <button class="copy-btn" title="Copy URL" data-url="${escapeHtml(video.url)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      </button>
      <button class="download-btn" title="Download">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    `;
    
    // Download button click
    const downloadBtn = li.querySelector('.download-btn');
    downloadBtn.addEventListener('click', () => {
      console.log('[Video Downloader Popup] Download button clicked for:', video.url);
      if (video.isYouTube || video.needsCompanion) {
        // Show quality selector for YouTube/companion videos
        showQualityModal(video);
      } else {
        // Direct download
        startDownload(video, 'best', downloadBtn);
      }
    });
    
    // Copy button click
    const copyBtn = li.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => {
      copyToClipboard(video.url, copyBtn);
    });
    
    return li;
  }
  
  // Show quality modal with dynamic options
  async function showQualityModal(video) {
    selectedVideo = video;
    modalVideoTitle.textContent = video.title || video.filename || 'Video';
    
    // Show modal with loading state
    qualityModal.classList.remove('hidden');
    qualityLoading.classList.remove('hidden');
    qualityOptions.classList.add('hidden');
    qualityOptions.innerHTML = '';
    
    // Fetch available qualities
    let formats = null;
    
    if (companionReady) {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_VIDEO_INFO',
          url: video.url
        });
        
        if (response && response.formats && response.formats.length > 0) {
          formats = response.formats;
        }
      } catch (e) {
        console.error('Error fetching video info:', e);
      }
    }
    
    // Use default formats if fetch failed
    if (!formats) {
      formats = [
        { quality: 'best', label: 'Best Quality' },
        { quality: '2160p', label: '4K (2160p)' },
        { quality: '1440p', label: '1440p' },
        { quality: '1080p', label: '1080p' },
        { quality: '720p', label: '720p' },
        { quality: '480p', label: '480p' },
        { quality: '360p', label: '360p' }
      ];
    }
    
    // Hide loading, show options
    qualityLoading.classList.add('hidden');
    qualityOptions.classList.remove('hidden');
    
    // Create quality buttons
    // Always add "Best Quality" first
    const bestBtn = document.createElement('button');
    bestBtn.className = 'quality-btn best';
    bestBtn.dataset.quality = 'best';
    bestBtn.innerHTML = `
      <span class="quality-label">⭐ Best Quality</span>
      <span class="quality-desc">Highest available resolution</span>
    `;
    qualityOptions.appendChild(bestBtn);
    
    // Add available formats
    const qualityOrder = ['2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p'];
    const addedQualities = new Set();
    
    // First add formats from the response
    formats.forEach(format => {
      const quality = format.quality || format.format_id;
      if (quality === 'best' || addedQualities.has(quality)) return;
      
      addedQualities.add(quality);
      
      const btn = document.createElement('button');
      btn.className = 'quality-btn';
      btn.dataset.quality = quality;
      
      let label = format.label || quality;
      let desc = '';
      
      // Add HD/SD labels
      const height = parseInt(quality);
      if (height >= 2160) desc = 'Ultra HD';
      else if (height >= 1440) desc = 'Quad HD';
      else if (height >= 1080) desc = 'Full HD';
      else if (height >= 720) desc = 'HD';
      else desc = 'SD';
      
      // Add file size if available
      const sizeText = format.filesize ? formatSize(format.filesize) : '';
      
      btn.innerHTML = `
        <span class="quality-label">${escapeHtml(label)}</span>
        <span class="quality-desc">${desc}</span>
        ${sizeText ? `<span class="quality-size">${sizeText}</span>` : ''}
      `;
      
      qualityOptions.appendChild(btn);
    });
    
    // If no formats were added from response, add common ones
    if (addedQualities.size === 0) {
      qualityOrder.slice(0, 6).forEach(quality => {
        const btn = document.createElement('button');
        btn.className = 'quality-btn';
        btn.dataset.quality = quality;
        
        const height = parseInt(quality);
        let desc = '';
        if (height >= 2160) desc = 'Ultra HD';
        else if (height >= 1440) desc = 'Quad HD';
        else if (height >= 1080) desc = 'Full HD';
        else if (height >= 720) desc = 'HD';
        else desc = 'SD';
        
        btn.innerHTML = `
          <span class="quality-label">${quality}</span>
          <span class="quality-desc">${desc}</span>
        `;
        
        qualityOptions.appendChild(btn);
      });
    }
  }
  
  // Start download
  function startDownload(video, quality, btn) {
    console.log('[Video Downloader Popup] Starting download:', video.url, video.title, quality);
    
    if (btn) {
      btn.classList.add('downloading');
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      `;
    }
    
    browser.runtime.sendMessage({
      type: 'DOWNLOAD_VIDEO',
      video: video,
      quality: quality,
      tabId: currentTabId
    });
    
    // Show progress
    const progressEl = document.getElementById(`progress-${video.id}`);
    if (progressEl) {
      progressEl.classList.add('active');
    }
    
    // Close modal
    qualityModal.classList.add('hidden');
  }
  
  // Escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  
  // Copy to clipboard
  async function copyToClipboard(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      `;
      
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        `;
      }, 1500);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  }
  
  // Load videos
  async function loadVideos() {
    loading.classList.remove('hidden');
    noVideos.classList.add('hidden');
    videoList.classList.add('hidden');
    
    try {
      const tab = await getCurrentTab();
      currentTabId = tab.id;
      
      const response = await browser.runtime.sendMessage({
        type: 'GET_VIDEOS',
        tabId: currentTabId
      });
      
      const videos = response.videos || [];
      updateCompanionStatus(response.companionReady);
      
      loading.classList.add('hidden');
      
      if (videos.length === 0) {
        noVideos.classList.remove('hidden');
        videoCount.textContent = '0 videos found';
      } else {
        videoList.innerHTML = '';
        videos.forEach((video, index) => {
          const item = createVideoItem(video);
          item.style.animationDelay = `${index * 0.05}s`;
          videoList.appendChild(item);
        });
        videoList.classList.remove('hidden');
        videoCount.textContent = `${videos.length} video${videos.length !== 1 ? 's' : ''} found`;
        
        // Restore download state if there's an active download
        const downloadState = response.downloadState;
        if (downloadState && downloadState.active) {
          restoreDownloadState(downloadState);
        }
      }
    } catch (error) {
      console.error('Error loading videos:', error);
      loading.classList.add('hidden');
      noVideos.classList.remove('hidden');
      videoCount.textContent = 'Error loading videos';
    }
  }
  
  // Restore download state from background
  function restoreDownloadState(state) {
    if (!state.videoUrl) return;
    
    // Find the video item by URL
    const videoItem = document.querySelector(`[data-url="${CSS.escape(state.videoUrl)}"]`);
    if (!videoItem) return;
    
    const downloadBtn = videoItem.querySelector('.download-btn');
    const progressEl = videoItem.querySelector('.progress-container');
    
    if (downloadBtn) {
      downloadBtn.classList.add('downloading');
      downloadBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      `;
    }
    
    if (progressEl) {
      progressEl.classList.add('active');
      const fill = progressEl.querySelector('.progress-fill');
      const text = progressEl.querySelector('.progress-text');
      
      if (fill) fill.style.width = `${state.progress}%`;
      if (text) {
        if (state.status === 'merging') {
          text.textContent = 'Merging video and audio...';
        } else {
          text.textContent = `Downloading... ${Math.round(state.progress)}%`;
        }
      }
    }
  }
  
  // Scan page
  async function scanPage() {
    scanBtn.querySelector('svg').style.animation = 'spin 0.8s linear infinite';
    
    try {
      await browser.runtime.sendMessage({
        type: 'SCAN_PAGE',
        tabId: currentTabId
      });
      
      setTimeout(() => {
        loadVideos();
        scanBtn.querySelector('svg').style.animation = '';
      }, 1000);
    } catch (error) {
      console.error('Error scanning:', error);
      scanBtn.querySelector('svg').style.animation = '';
    }
  }
  
  // Clear videos
  async function clearVideos() {
    try {
      await browser.runtime.sendMessage({
        type: 'CLEAR_VIDEOS',
        tabId: currentTabId
      });
      loadVideos();
    } catch (error) {
      console.error('Error clearing:', error);
    }
  }
  
  // Quality selection handler
  qualityOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.quality-btn');
    if (btn && selectedVideo) {
      const quality = btn.dataset.quality;
      
      // Find the download button for this video
      const videoItem = document.querySelector(`[data-url="${CSS.escape(selectedVideo.url)}"]`);
      const downloadBtn = videoItem?.querySelector('.download-btn');
      
      startDownload(selectedVideo, quality, downloadBtn);
      selectedVideo = null;
    }
  });
  
  closeModal.addEventListener('click', () => {
    qualityModal.classList.add('hidden');
    selectedVideo = null;
  });
  
  qualityModal.addEventListener('click', (e) => {
    if (e.target === qualityModal) {
      qualityModal.classList.add('hidden');
      selectedVideo = null;
    }
  });
  
  // Listen for download progress
  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'DOWNLOAD_PROGRESS') {
      // Find the specific video item if we have the URL
      let targetItem = null;
      if (message.videoUrl) {
        targetItem = document.querySelector(`[data-url="${CSS.escape(message.videoUrl)}"]`);
      }
      
      // Update progress for the target item (or all active ones as fallback)
      const containers = targetItem 
        ? [targetItem.querySelector('.progress-container')]
        : document.querySelectorAll('.progress-container.active');
      
      containers.forEach(el => {
        if (!el) return;
        el.classList.add('active');
        const fill = el.querySelector('.progress-fill');
        const text = el.querySelector('.progress-text');
        if (fill) fill.style.width = `${message.progress}%`;
        if (text) {
          if (message.status === 'merging') {
            text.textContent = 'Merging video and audio...';
          } else {
            text.textContent = `Downloading... ${Math.round(message.progress)}%`;
          }
        }
      });
    }
    
    if (message.type === 'DOWNLOAD_COMPLETE') {
      // Find the specific video item if we have the URL
      let targetItem = null;
      if (message.videoUrl) {
        targetItem = document.querySelector(`[data-url="${CSS.escape(message.videoUrl)}"]`);
      }
      
      // Reset download buttons
      const buttons = targetItem
        ? [targetItem.querySelector('.download-btn')]
        : document.querySelectorAll('.download-btn.downloading');
      
      buttons.forEach(btn => {
        if (!btn) return;
        btn.classList.remove('downloading');
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            ${message.success 
              ? '<polyline points="20 6 9 17 4 12"/>' 
              : '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
            }
          </svg>
        `;
        
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          `;
        }, 2000);
      });
      
      // Hide progress bars
      const progressContainers = targetItem
        ? [targetItem.querySelector('.progress-container')]
        : document.querySelectorAll('.progress-container.active');
      
      progressContainers.forEach(el => {
        if (!el) return;
        setTimeout(() => {
          el.classList.remove('active');
          const fill = el.querySelector('.progress-fill');
          if (fill) fill.style.width = '0%';
        }, 2000);
      });
    }
  });
  
  // Event listeners
  scanBtn.addEventListener('click', scanPage);
  clearBtn.addEventListener('click', clearVideos);
  
  // Initial load
  loadVideos();
});
