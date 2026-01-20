// Video Downloader - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  // Video tab elements
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
  
  // Tab elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const videosTabCount = document.getElementById('videosTabCount');
  const downloadsTabCount = document.getElementById('downloadsTabCount');
  
  // Downloads tab elements
  const downloadsList = document.getElementById('downloadsList');
  const noDownloads = document.getElementById('noDownloads');
  
  // Pin tooltip elements
  const pinHint = document.getElementById('pinHint');
  const pinTooltip = document.getElementById('pinTooltip');
  const closePinTooltip = document.getElementById('closePinTooltip');
  
  let currentTabId = null;
  let companionReady = false;
  let selectedVideo = null;
  let activeDownloads = new Map(); // Track all downloads
  
  // Tab switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      
      // Update button states
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update content visibility
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabName}Tab`) {
          content.classList.add('active');
        }
      });
      
      // Update footer text based on tab
      if (tabName === 'downloads') {
        videoCount.textContent = `${activeDownloads.size} active download${activeDownloads.size !== 1 ? 's' : ''}`;
      } else {
        loadVideos();
      }
    });
  });
  
  // Pin tooltip
  pinHint.addEventListener('click', () => {
    pinTooltip.classList.toggle('hidden');
  });
  
  closePinTooltip.addEventListener('click', () => {
    pinTooltip.classList.add('hidden');
    // Remember that user saw the tooltip
    browser.storage.local.set({ pinTooltipSeen: true });
  });
  
  // Check if we should show pin tooltip
  const { pinTooltipSeen } = await browser.storage.local.get('pinTooltipSeen');
  if (!pinTooltipSeen) {
    // Show hint icon with a pulse animation
    pinHint.style.animation = 'pulse 2s infinite';
  }
  
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
  
  // Update tab counts
  function updateTabCounts(videoCount, downloadCount) {
    videosTabCount.textContent = videoCount || 0;
    downloadsTabCount.textContent = downloadCount || activeDownloads.size;
  }
  
  // Create video item element
  function createVideoItem(video) {
    const li = document.createElement('li');
    li.className = 'video-item';
    if (video.needsCompanion || video.isYouTube) {
      li.classList.add('companion-video');
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
    let companionBadge = '';
    if (video.needsCompanion || video.isYouTube) {
      let siteName = video.siteName || (video.isYouTube ? 'YouTube' : '');
      if (!siteName) {
        try {
          const urlHost = new URL(video.url).hostname;
          siteName = urlHost.replace('www.', '').split('.')[0];
          siteName = siteName.charAt(0).toUpperCase() + siteName.slice(1);
        } catch (e) {
          siteName = 'Video';
        }
      }
      companionBadge = `<span class="video-youtube">📺 ${escapeHtml(siteName)}</span>`;
    }
    
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
          <div class="progress-stats">
            <span class="progress-speed"></span>
            <span class="progress-remaining"></span>
            <span class="progress-eta"></span>
          </div>
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
      if (video.isYouTube || video.needsCompanion) {
        showQualityModal(video);
      } else {
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
  
  // Create download item for downloads tab
  function createDownloadItem(download) {
    const li = document.createElement('li');
    li.className = 'download-item';
    li.dataset.url = download.url;
    
    const iconClass = download.status === 'complete' ? 'complete' : 
                      download.status === 'error' ? 'error' : '';
    
    const icon = download.status === 'complete' 
      ? '<polyline points="20 6 9 17 4 12"/>'
      : download.status === 'error'
      ? '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
      : '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';
    
    const statusClass = download.status === 'complete' ? 'complete' : 
                        download.status === 'error' ? 'error' : '';
    
    let statusText = download.status === 'complete' ? 'Download complete' :
                     download.status === 'error' ? (download.error || 'Download failed') :
                     download.statusText || `Downloading... ${Math.round(download.progress)}%`;
    
    // Add speed and remaining info to status if available
    const statsInfo = [];
    if (download.speed) statsInfo.push(`⚡ ${download.speed}`);
    if (download.remaining) statsInfo.push(`${download.remaining} left`);
    if (download.eta) statsInfo.push(`⏱️ ${download.eta}`);
    const statsText = statsInfo.join(' • ');
    
    li.innerHTML = `
      <div class="download-item-header">
        <div class="download-icon ${iconClass}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${icon}
          </svg>
        </div>
        <div class="download-details">
          <div class="download-title" title="${escapeHtml(download.title)}">${escapeHtml(download.title)}</div>
          <div class="download-status ${statusClass}">${statusText}</div>
          ${statsText && download.status !== 'complete' && download.status !== 'error' ? `
            <div class="download-stats">${statsText}</div>
          ` : ''}
        </div>
        ${download.status !== 'complete' && download.status !== 'error' ? `
          <button class="download-cancel-btn" data-url="${escapeHtml(download.url)}">Cancel</button>
        ` : ''}
      </div>
      ${download.status !== 'complete' && download.status !== 'error' ? `
        <div class="download-progress">
          <div class="download-progress-fill" style="width: ${download.progress}%"></div>
        </div>
      ` : ''}
    `;
    
    // Cancel button
    const cancelBtn = li.querySelector('.download-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        // Remove from active downloads
        activeDownloads.delete(download.url);
        renderDownloadsList();
        // TODO: Actually cancel the download in background
      });
    }
    
    return li;
  }
  
  // Render downloads list
  function renderDownloadsList() {
    if (activeDownloads.size === 0) {
      noDownloads.classList.remove('hidden');
      downloadsList.classList.add('hidden');
    } else {
      noDownloads.classList.add('hidden');
      downloadsList.classList.remove('hidden');
      downloadsList.innerHTML = '';
      
      // Sort: active first, then by timestamp
      const sorted = Array.from(activeDownloads.values()).sort((a, b) => {
        if (a.status === 'downloading' && b.status !== 'downloading') return -1;
        if (b.status === 'downloading' && a.status !== 'downloading') return 1;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
      
      sorted.forEach(download => {
        downloadsList.appendChild(createDownloadItem(download));
      });
    }
    
    updateTabCounts(videosTabCount.textContent, activeDownloads.size);
  }
  
  // Show quality modal
  async function showQualityModal(video) {
    selectedVideo = video;
    modalVideoTitle.textContent = video.title || video.filename || 'Video';
    
    qualityModal.classList.remove('hidden');
    qualityLoading.classList.remove('hidden');
    qualityOptions.classList.add('hidden');
    qualityOptions.innerHTML = '';
    
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
    
    qualityLoading.classList.add('hidden');
    qualityOptions.classList.remove('hidden');
    
    // Best quality button
    const bestBtn = document.createElement('button');
    bestBtn.className = 'quality-btn best';
    bestBtn.dataset.quality = 'best';
    bestBtn.innerHTML = `
      <span class="quality-label">⭐ Best Quality</span>
      <span class="quality-desc">Highest available resolution</span>
    `;
    qualityOptions.appendChild(bestBtn);
    
    const addedQualities = new Set();
    
    formats.forEach(format => {
      const quality = format.quality || format.format_id;
      if (quality === 'best' || addedQualities.has(quality)) return;
      
      addedQualities.add(quality);
      
      const btn = document.createElement('button');
      btn.className = 'quality-btn';
      btn.dataset.quality = quality;
      
      let label = format.label || quality;
      let desc = '';
      
      const height = parseInt(quality);
      if (height >= 2160) desc = 'Ultra HD';
      else if (height >= 1440) desc = 'Quad HD';
      else if (height >= 1080) desc = 'Full HD';
      else if (height >= 720) desc = 'HD';
      else desc = 'SD';
      
      const sizeText = format.filesize ? formatSize(format.filesize) : '';
      
      btn.innerHTML = `
        <span class="quality-label">${escapeHtml(label)}</span>
        <span class="quality-desc">${desc}</span>
        ${sizeText ? `<span class="quality-size">${sizeText}</span>` : ''}
      `;
      
      qualityOptions.appendChild(btn);
    });
    
    if (addedQualities.size === 0) {
      ['2160p', '1440p', '1080p', '720p', '480p', '360p'].forEach(quality => {
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
    if (btn) {
      btn.classList.add('downloading');
      btn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      `;
    }
    
    // Add to active downloads
    activeDownloads.set(video.url, {
      url: video.url,
      title: video.title || video.filename || 'Video',
      quality: quality,
      progress: 0,
      status: 'downloading',
      statusText: 'Starting...',
      timestamp: Date.now()
    });
    renderDownloadsList();
    updateTabCounts(videosTabCount.textContent, activeDownloads.size);
    
    browser.runtime.sendMessage({
      type: 'DOWNLOAD_VIDEO',
      video: video,
      quality: quality,
      tabId: currentTabId
    });
    
    const progressEl = document.getElementById(`progress-${video.id}`);
    if (progressEl) {
      progressEl.classList.add('active');
    }
    
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
        
        const downloadState = response.downloadState;
        if (downloadState && downloadState.active) {
          restoreDownloadState(downloadState);
        }
      }
      
      updateTabCounts(videos.length, activeDownloads.size);
    } catch (error) {
      console.error('Error loading videos:', error);
      loading.classList.add('hidden');
      noVideos.classList.remove('hidden');
      videoCount.textContent = 'Error loading videos';
    }
  }
  
  // Restore download state
  function restoreDownloadState(state) {
    if (!state.videoUrl) return;
    
    // Add to active downloads if not already there
    if (!activeDownloads.has(state.videoUrl)) {
      activeDownloads.set(state.videoUrl, {
        url: state.videoUrl,
        title: 'Downloading...',
        progress: state.progress || 0,
        status: state.status || 'downloading',
        timestamp: Date.now()
      });
      renderDownloadsList();
    }
    
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
      // Update active downloads
      if (message.videoUrl && activeDownloads.has(message.videoUrl)) {
        const download = activeDownloads.get(message.videoUrl);
        download.progress = message.progress;
        download.status = message.status === 'error' ? 'error' : 'downloading';
        download.error = message.error;
        download.speed = message.speed;
        download.remaining = message.remaining;
        download.totalSize = message.totalSize;
        download.eta = message.eta;
        
        switch (message.status) {
          case 'starting':
            download.statusText = 'Starting download...';
            break;
          case 'extracting':
            download.statusText = 'Extracting video info...';
            break;
          case 'extracting playlist':
            download.statusText = 'Processing stream playlist...';
            break;
          case 'merging':
            download.statusText = 'Merging video and audio...';
            break;
          case 'error':
            download.statusText = message.error || 'Download error';
            break;
          default:
            download.statusText = `Downloading... ${Math.round(message.progress)}%`;
        }
        
        renderDownloadsList();
      }
      
      // Update video tab progress
      let targetItem = null;
      if (message.videoUrl) {
        targetItem = document.querySelector(`[data-url="${CSS.escape(message.videoUrl)}"]`);
      }
      
      const containers = targetItem 
        ? [targetItem.querySelector('.progress-container')]
        : document.querySelectorAll('.progress-container.active');
      
      containers.forEach(el => {
        if (!el) return;
        el.classList.add('active');
        const fill = el.querySelector('.progress-fill');
        const text = el.querySelector('.progress-text');
        const speedEl = el.querySelector('.progress-speed');
        const remainingEl = el.querySelector('.progress-remaining');
        const etaEl = el.querySelector('.progress-eta');
        
        if (fill) fill.style.width = `${message.progress}%`;
        if (text) {
          switch (message.status) {
            case 'starting':
              text.textContent = 'Starting download...';
              break;
            case 'extracting':
              text.textContent = 'Extracting video info...';
              break;
            case 'extracting playlist':
              text.textContent = 'Processing stream playlist...';
              break;
            case 'merging':
              text.textContent = 'Merging video and audio...';
              break;
            case 'error':
              text.textContent = message.error || 'Download error';
              text.style.color = '#e53935';
              break;
            default:
              text.textContent = `Downloading... ${Math.round(message.progress)}%`;
          }
        }
        
        // Update speed, remaining, and ETA
        if (speedEl) {
          speedEl.textContent = message.speed ? `⚡ ${message.speed}` : '';
        }
        if (remainingEl) {
          if (message.remaining && message.totalSize) {
            remainingEl.textContent = `${message.remaining} left of ${message.totalSize}`;
          } else {
            remainingEl.textContent = '';
          }
        }
        if (etaEl) {
          etaEl.textContent = message.eta ? `⏱️ ${message.eta}` : '';
        }
      });
    }
    
    if (message.type === 'DOWNLOAD_COMPLETE') {
      // Update active downloads
      if (message.videoUrl && activeDownloads.has(message.videoUrl)) {
        const download = activeDownloads.get(message.videoUrl);
        download.status = message.success ? 'complete' : 'error';
        download.progress = message.success ? 100 : download.progress;
        download.error = message.error;
        renderDownloadsList();
        
        // Remove completed downloads after a delay
        if (message.success) {
          setTimeout(() => {
            activeDownloads.delete(message.videoUrl);
            renderDownloadsList();
          }, 5000);
        }
      }
      
      // Update video tab
      let targetItem = null;
      if (message.videoUrl) {
        targetItem = document.querySelector(`[data-url="${CSS.escape(message.videoUrl)}"]`);
      }
      
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
  renderDownloadsList();
});
