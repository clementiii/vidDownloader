// Store detected videos per tab
const detectedVideos = new Map();

// Native messaging port
let nativePort = null;
let companionReady = false;

// Track current download state (persists when popup closes)
let currentDownload = {
  active: false,
  videoId: null,
  videoUrl: null,
  progress: 0,
  status: 'idle' // idle, downloading, merging, complete, error
};

// Video file extensions and MIME types
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.3gp', '.ogv'];
const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-flv', 'video/x-matroska'];

// Streaming patterns (HLS, DASH)
const STREAMING_PATTERNS = ['.m3u8', '.mpd'];

// URLs to ignore (streaming chunks, tracking, etc.)
const IGNORE_PATTERNS = [
  '/sq/',                            // YouTube sq segments
  'initializeMetadata',
];

// Connect to companion app
function connectToCompanion() {
  console.log('[Video Downloader] Attempting to connect to companion app...');
  
  try {
    nativePort = browser.runtime.connectNative('viddownloader');
    
    nativePort.onMessage.addListener((message) => {
      console.log('[Video Downloader] Companion message:', message);
      
      if (message.type === 'ready') {
        companionReady = true;
        console.log('[Video Downloader] Companion app connected!');
      }
      
      if (message.type === 'pong') {
        companionReady = message.ytdlp;
      }
      
      if (message.type === 'progress') {
        // Update download state
        currentDownload.progress = message.progress;
        currentDownload.status = message.status || 'downloading';
        
        // Broadcast progress to popup
        browser.runtime.sendMessage({
          type: 'DOWNLOAD_PROGRESS',
          progress: message.progress,
          status: message.status,
          videoId: currentDownload.videoId,
          videoUrl: currentDownload.videoUrl
        }).catch(() => {});
      }
      
      if (message.type === 'complete') {
        // Update download state
        currentDownload.active = false;
        currentDownload.status = message.success ? 'complete' : 'error';
        currentDownload.progress = message.success ? 100 : 0;
        
        if (message.success) {
          browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
            title: 'Download Complete!',
            message: message.filename || 'Video downloaded successfully'
          });
        } else {
          browser.notifications.create({
            type: 'basic',
            iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
            title: 'Download Failed',
            message: message.error || 'Could not download video'
          });
        }
        
        browser.runtime.sendMessage({
          type: 'DOWNLOAD_COMPLETE',
          success: message.success,
          error: message.error,
          videoId: currentDownload.videoId,
          videoUrl: currentDownload.videoUrl
        }).catch(() => {});
        
        // Reset download state after a short delay
        setTimeout(() => {
          currentDownload = {
            active: false,
            videoId: null,
            videoUrl: null,
            progress: 0,
            status: 'idle'
          };
        }, 3000);
      }
      
      if (message.type === 'error') {
        console.error('[Video Downloader] Companion error:', message.error);
        companionReady = false;
      }
    });
    
    nativePort.onDisconnect.addListener((port) => {
      const error = browser.runtime.lastError || port?.error;
      console.log('[Video Downloader] Companion disconnected:', error?.message || 'unknown reason');
      companionReady = false;
      nativePort = null;
      
      // Try to reconnect after a delay (but not too aggressively)
      setTimeout(connectToCompanion, 10000);
    });
    
  } catch (error) {
    console.error('[Video Downloader] Failed to connect to companion:', error);
    companionReady = false;
    nativePort = null;
  }
}

// Ping companion to check if it's ready
function pingCompanion() {
  if (nativePort && companionReady) {
    try {
      nativePort.postMessage({ action: 'ping' });
    } catch (e) {
      companionReady = false;
    }
  }
}

// Get video info (formats) from companion
function getVideoInfo(url) {
  return new Promise((resolve) => {
    if (!companionReady || !nativePort) {
      // Return default options if companion not available
      resolve({
        success: false,
        formats: getDefaultFormats()
      });
      return;
    }
    
    // Set up one-time listener for info response
    const infoHandler = (message) => {
      if (message.type === 'info') {
        resolve({
          success: message.success,
          title: message.title,
          formats: message.formats || getDefaultFormats()
        });
      }
    };
    
    // Store handler to remove later
    const originalHandler = nativePort.onMessage.hasListener;
    nativePort.onMessage.addListener(infoHandler);
    
    // Request info
    try {
      nativePort.postMessage({
        action: 'info',
        url: url
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        nativePort.onMessage.removeListener(infoHandler);
        resolve({
          success: false,
          formats: getDefaultFormats()
        });
      }, 10000);
    } catch (e) {
      resolve({
        success: false,
        formats: getDefaultFormats()
      });
    }
  });
}

// Default format options
function getDefaultFormats() {
  return [
    { quality: 'best', label: 'Best Quality', description: 'Highest available' },
    { quality: '2160p', label: '4K (2160p)', description: 'Ultra HD' },
    { quality: '1440p', label: '1440p', description: 'Quad HD' },
    { quality: '1080p', label: '1080p', description: 'Full HD' },
    { quality: '720p', label: '720p', description: 'HD' },
    { quality: '480p', label: '480p', description: 'SD' },
    { quality: '360p', label: '360p', description: 'Low' }
  ];
}

// Initialize companion connection
connectToCompanion();

// Periodic ping to keep connection alive and flushed
setInterval(() => {
  if (nativePort && companionReady) {
    try {
      nativePort.postMessage({ action: 'ping' });
    } catch (e) {
      console.log('[Video Downloader] Ping failed, reconnecting...');
      companionReady = false;
      connectToCompanion();
    }
  }
}, 5000);

// Initialize storage for tab
function initTab(tabId) {
  if (!detectedVideos.has(tabId)) {
    detectedVideos.set(tabId, new Map());
  }
}

// Check if URL should be ignored
function shouldIgnoreUrl(url) {
  const lowerUrl = url.toLowerCase();
  return IGNORE_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

// Check if URL is a video
function isVideoUrl(url) {
  const lowerUrl = url.toLowerCase();
  
  // Check extensions
  for (const ext of VIDEO_EXTENSIONS) {
    const extPattern = new RegExp(`\\${ext}(\\?|$)`, 'i');
    if (extPattern.test(lowerUrl)) return true;
  }
  
  // Check streaming patterns
  for (const pattern of STREAMING_PATTERNS) {
    if (lowerUrl.includes(pattern)) return true;
  }
  
  return false;
}

// Check if content type is video
function isVideoContentType(contentType) {
  if (!contentType) return false;
  const lowerType = contentType.toLowerCase();
  return VIDEO_MIME_TYPES.some(type => lowerType.includes(type)) || 
         lowerType.includes('video/') ||
         lowerType.includes('application/x-mpegurl') ||
         lowerType.includes('application/dash+xml');
}

// Extract filename from URL or title
function extractFilename(url, title = '') {
  if (title) {
    let filename = title
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
    
    if (!VIDEO_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext))) {
      const urlLower = url.toLowerCase();
      if (urlLower.includes('webm')) {
        filename += '.webm';
      } else {
        filename += '.mp4';
      }
    }
    
    return filename;
  }
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/').filter(s => s);
    let filename = segments[segments.length - 1] || 'video';
    
    filename = filename.split('?')[0];
    
    if (filename === 'videoplayback' || filename.length < 3 || /^[a-zA-Z0-9_-]{11}$/.test(filename)) {
      filename = 'video_' + Date.now();
    }
    
    const hasExtension = VIDEO_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
    if (!hasExtension) {
      filename += '.mp4';
    }
    
    return decodeURIComponent(filename);
  } catch (e) {
    return 'video_' + Date.now() + '.mp4';
  }
}

// Get video quality estimate from URL
function estimateQuality(url, providedQuality = '') {
  if (providedQuality && providedQuality !== 'Unknown') {
    return providedQuality;
  }
  
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('2160') || lowerUrl.includes('4k') || lowerUrl.includes('hd2160')) return '4K';
  if (lowerUrl.includes('1440') || lowerUrl.includes('2k') || lowerUrl.includes('hd1440')) return '1440p';
  if (lowerUrl.includes('1080') || lowerUrl.includes('fhd') || lowerUrl.includes('hd1080')) return '1080p';
  if (lowerUrl.includes('720') || lowerUrl.includes('hd720')) return '720p';
  if (lowerUrl.includes('480') || lowerUrl.includes('sd480')) return '480p';
  if (lowerUrl.includes('360') || lowerUrl.includes('sd360')) return '360p';
  if (lowerUrl.includes('240') || lowerUrl.includes('sd240')) return '240p';
  if (lowerUrl.includes('144') || lowerUrl.includes('sd144')) return '144p';
  
  return 'Unknown';
}

// Check if URL is from a site that needs companion app
function needsCompanion(url) {
  const supportedSites = [
    'youtube.com', 'youtu.be',
    'twitter.com', 'x.com',
    'facebook.com', 'fb.watch',
    'instagram.com',
    'tiktok.com',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv',
    'reddit.com', 'v.redd.it',
    'streamable.com',
    'gfycat.com',
    'imgur.com',
    'bilibili.com',
    'nicovideo.jp',
    'soundcloud.com',
    'mixcloud.com',
    'bandcamp.com',
    'pornhub.com',
    'xvideos.com',
    'xhamster.com'
  ];
  
  const lowerUrl = url.toLowerCase();
  return supportedSites.some(site => lowerUrl.includes(site));
}

// Add video to detected list
function addVideo(tabId, videoInfo) {
  initTab(tabId);
  const videos = detectedVideos.get(tabId);
  
  if (!videos.has(videoInfo.url)) {
    // Use needsCompanion from videoInfo if set, otherwise check URL
    const requiresCompanion = videoInfo.needsCompanion !== undefined ? videoInfo.needsCompanion : needsCompanion(videoInfo.url);
    
    videos.set(videoInfo.url, {
      ...videoInfo,
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      needsCompanion: requiresCompanion
    });
    
    updateBadge(tabId);
    console.log('[Video Downloader] Detected:', videoInfo.title || videoInfo.url, 'needsCompanion:', requiresCompanion);
  }
}

// Update extension badge with video count
function updateBadge(tabId) {
  const videos = detectedVideos.get(tabId);
  const count = videos ? videos.size : 0;
  
  browser.browserAction.setBadgeText({
    text: count > 0 ? count.toString() : '',
    tabId: tabId
  });
  
  browser.browserAction.setBadgeBackgroundColor({
    color: companionReady ? '#3fb950' : '#e53935',
    tabId: tabId
  });
}

// Monitor network requests for videos
browser.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { tabId, url, responseHeaders } = details;
    
    if (tabId < 0) return;
    if (shouldIgnoreUrl(url)) return;
    
    let contentType = '';
    let contentLength = 0;
    
    for (const header of responseHeaders || []) {
      const name = header.name.toLowerCase();
      if (name === 'content-type') {
        contentType = header.value;
      }
      if (name === 'content-length') {
        contentLength = parseInt(header.value, 10) || 0;
      }
    }
    
    if (isVideoContentType(contentType) || isVideoUrl(url)) {
      const minSize = 100000;
      if (contentLength > 0 && contentLength < minSize) {
        return;
      }
      
      addVideo(tabId, {
        url: url,
        filename: extractFilename(url),
        contentType: contentType,
        size: contentLength,
        quality: estimateQuality(url),
        source: 'network'
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Handle messages from content script and popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : message.tabId;
  
  switch (message.type) {
    case 'VIDEO_DETECTED':
      const video = message.video;
      // Check if this video needs companion app (page URLs, embeds, or known sites)
      const videoNeedsCompanion = video.needsCompanion || 
                                   video.type?.includes('/page') || 
                                   video.type?.includes('/embed') || 
                                   video.type === 'video/page' ||
                                   needsCompanion(video.src);
      
      // Extract site name from URL if not provided
      let siteName = video.siteName || '';
      if (!siteName && video.src) {
        try {
          const urlHost = new URL(video.src).hostname;
          siteName = urlHost.replace('www.', '').split('.')[0];
          siteName = siteName.charAt(0).toUpperCase() + siteName.slice(1);
        } catch (e) {}
      }
      
      addVideo(tabId, {
        url: video.src,
        filename: extractFilename(video.src, video.title),
        contentType: video.type || 'video/mp4',
        size: 0,
        quality: video.quality || estimateQuality(video.src),
        source: 'dom',
        poster: video.poster,
        title: video.title || '',
        isYouTube: video.type?.includes('youtube'),
        needsCompanion: videoNeedsCompanion,
        siteName: siteName
      });
      break;
      
    case 'GET_VIDEOS':
      initTab(tabId);
      const videos = Array.from(detectedVideos.get(tabId).values());
      sendResponse({ 
        videos: videos,
        companionReady: companionReady,
        downloadState: currentDownload
      });
      break;
      
    case 'DOWNLOAD_VIDEO':
      console.log('[Video Downloader] Download request received:', message.video?.url, message.quality);
      downloadVideo(message.video, message.quality);
      break;
      
    case 'GET_VIDEO_INFO':
      console.log('[Video Downloader] Getting video info:', message.url);
      getVideoInfo(message.url).then(info => {
        sendResponse(info);
      });
      return true; // Keep channel open for async response
      
    case 'CHECK_COMPANION':
      sendResponse({ ready: companionReady });
      break;
      
    case 'SCAN_PAGE':
      browser.tabs.sendMessage(tabId, { type: 'SCAN_PAGE' });
      break;
      
    case 'CLEAR_VIDEOS':
      console.log('[Video Downloader] Clearing videos for tab:', tabId);
      detectedVideos.set(tabId, new Map());
      updateBadge(tabId);
      break;
  }
  
  return true;
});

// Download video function
function downloadVideo(video, quality = 'best') {
  console.log('[Video Downloader] Download requested:', video.url, quality);
  console.log('[Video Downloader] Companion ready:', companionReady);
  console.log('[Video Downloader] Video needs companion:', video.needsCompanion);
  
  const videoNeedsCompanion = video.needsCompanion || video.isYouTube || needsCompanion(video.url);
  
  // Use companion app if available and video needs it
  if (companionReady && nativePort && videoNeedsCompanion) {
    console.log('[Video Downloader] Using companion app for:', video.url);
    
    // Set current download state
    currentDownload = {
      active: true,
      videoId: video.id,
      videoUrl: video.url,
      progress: 0,
      status: 'downloading'
    };
    
    try {
      // Send download request
      nativePort.postMessage({
        action: 'download',
        url: video.url,
        quality: quality
      });
      
      // Send a ping immediately after to flush the message buffer
      setTimeout(() => {
        if (nativePort) {
          nativePort.postMessage({ action: 'ping' });
        }
      }, 100);
      
      const siteName = video.siteName || 'video';
      browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
        title: 'Download Started',
        message: `Downloading ${siteName}...`
      });
      
      return;
    } catch (error) {
      console.error('[Video Downloader] Failed to send to companion:', error);
      companionReady = false;
      // Fall through to fallback
    }
  }
  
  // For sites that need companion but it's not connected
  if (videoNeedsCompanion && !companionReady) {
    // Copy yt-dlp command as fallback
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, {
          type: 'COPY_YTDLP_COMMAND',
          url: video.url
        });
      }
    });
    
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
      title: 'Companion App Not Connected',
      message: 'yt-dlp command copied! Run install.bat to enable one-click downloads, or paste command in terminal.'
    });
    
    return;
  }
  
  // Try browser download for direct URLs
  const filename = video.filename || extractFilename(video.url, video.title);
  console.log('[Video Downloader] Attempting browser download:', filename);
  
  browser.downloads.download({
    url: video.url,
    filename: filename,
    saveAs: true
  }).then(downloadId => {
    console.log('[Video Downloader] Browser download started:', downloadId);
    
    currentDownload = {
      active: true,
      videoId: video.id,
      videoUrl: video.url,
      progress: 0,
      status: 'downloading'
    };
  }).catch(error => {
    console.error('[Video Downloader] Browser download failed:', error);
    
    browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('icons/icon-48.svg'),
      title: 'Download Failed',
      message: error.message || 'Could not download. Try installing the companion app.'
    });
  });
}

// Clean up when tab is closed
browser.tabs.onRemoved.addListener((tabId) => {
  detectedVideos.delete(tabId);
});

// Clean up when tab navigates to new page
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    detectedVideos.set(tabId, new Map());
    updateBadge(tabId);
  }
});

// Initialize on install
browser.runtime.onInstalled.addListener(() => {
  console.log('[Video Downloader] Extension installed');
});

console.log('[Video Downloader] Background script loaded');
