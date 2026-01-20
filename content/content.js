// Content script - Detects videos in the DOM

(function() {
  'use strict';
  
  const detectedSources = new Set();
  
  // Video source patterns (excluding streaming playlists which need special handling)
  const VIDEO_EXTENSIONS = /\.(mp4|webm|mkv|avi|mov|flv|wmv|m4v|3gp|ogv)/i;
  
  // Streaming patterns to IGNORE (these are playlists/segments, not downloadable videos)
  const STREAMING_PATTERNS = /\.(m3u8|mpd|ts)(\?|$)/i;
  const SEGMENT_PATTERNS = /(playlist|manifest|index|master|chunk|segment|frag)/i;
  
  // Sites that need special handling (use page URL with yt-dlp)
  const SUPPORTED_SITES = {
    'youtube.com': { name: 'YouTube', needsCompanion: true },
    'youtu.be': { name: 'YouTube', needsCompanion: true },
    'twitter.com': { name: 'Twitter', needsCompanion: true },
    'x.com': { name: 'Twitter/X', needsCompanion: true },
    'instagram.com': { name: 'Instagram', needsCompanion: true },
    'facebook.com': { name: 'Facebook', needsCompanion: true },
    'fb.watch': { name: 'Facebook', needsCompanion: true },
    'tiktok.com': { name: 'TikTok', needsCompanion: true },
    'vimeo.com': { name: 'Vimeo', needsCompanion: true },
    'dailymotion.com': { name: 'Dailymotion', needsCompanion: true },
    'twitch.tv': { name: 'Twitch', needsCompanion: true },
    'reddit.com': { name: 'Reddit', needsCompanion: true },
    'v.redd.it': { name: 'Reddit', needsCompanion: true },
    'streamable.com': { name: 'Streamable', needsCompanion: true },
    'gfycat.com': { name: 'Gfycat', needsCompanion: true },
    'imgur.com': { name: 'Imgur', needsCompanion: true },
    'bilibili.com': { name: 'Bilibili', needsCompanion: true },
    'nicovideo.jp': { name: 'Niconico', needsCompanion: true },
    'soundcloud.com': { name: 'SoundCloud', needsCompanion: true },
    'mixcloud.com': { name: 'Mixcloud', needsCompanion: true },
    'bandcamp.com': { name: 'Bandcamp', needsCompanion: true },
    // Adult sites with HLS streaming
    'pornhub.com': { name: 'Pornhub', needsCompanion: true },
    'xvideos.com': { name: 'XVideos', needsCompanion: true },
    'xhamster.com': { name: 'xHamster', needsCompanion: true },
    'missav.com': { name: 'MissAV', needsCompanion: true },
    'missav.live': { name: 'MissAV', needsCompanion: true },
    'jable.tv': { name: 'Jable', needsCompanion: true },
    'javhd.com': { name: 'JAVHD', needsCompanion: true },
    'spankbang.com': { name: 'SpankBang', needsCompanion: true },
    'redtube.com': { name: 'RedTube', needsCompanion: true },
    'youporn.com': { name: 'YouPorn', needsCompanion: true },
    'tube8.com': { name: 'Tube8', needsCompanion: true },
    'eporner.com': { name: 'EPorner', needsCompanion: true },
    // Other streaming sites
    'odysee.com': { name: 'Odysee', needsCompanion: true },
    'rumble.com': { name: 'Rumble', needsCompanion: true },
    'bitchute.com': { name: 'BitChute', needsCompanion: true },
  };
  
  // Detect if site uses HLS/blob streaming (needs companion regardless of being in list)
  let detectedHlsStreaming = false;
  
  // Get current site info
  function getCurrentSiteInfo() {
    const hostname = window.location.hostname.toLowerCase();
    for (const [domain, info] of Object.entries(SUPPORTED_SITES)) {
      if (hostname.includes(domain)) {
        return { domain, ...info };
      }
    }
    return null;
  }
  
  const currentSite = getCurrentSiteInfo();
  const isYouTube = currentSite?.domain?.includes('youtube') || currentSite?.domain?.includes('youtu.be');
  
  // Send detected video to background script
  function reportVideo(videoData) {
    const src = typeof videoData === 'string' ? videoData : videoData.src;
    
    if (!src || detectedSources.has(src)) return;
    
    // Allow blob URLs for supported sites (we'll use page URL instead)
    if (src.startsWith('data:')) return;
    
    // Skip tiny data URLs
    if (src.length > 50000) return;
    
    // Skip YouTube/Google video chunks (small adaptive streaming segments)
    if (src.includes('googlevideo.com') && !videoData.isFullVideo) return;
    
    detectedSources.add(src);
    
    const video = typeof videoData === 'string' 
      ? { src, type: '', poster: '' }
      : videoData;
    
    console.log('[Video Downloader] Reporting video:', src.substring(0, 100));
    
    browser.runtime.sendMessage({
      type: 'VIDEO_DETECTED',
      video: {
        src: video.src,
        type: video.type || '',
        poster: video.poster || '',
        title: video.title || document.title || '',
        quality: video.quality || '',
        isFullVideo: video.isFullVideo || false,
        needsCompanion: video.needsCompanion || false,
        siteName: video.siteName || '',
        pageUrl: video.pageUrl || window.location.href  // Keep page URL for referer
      }
    }).catch(() => {});
  }
  
  // Report the current page URL for supported sites
  function reportPageUrl() {
    if (!currentSite) return;
    
    const pageUrl = window.location.href;
    
    // Don't report home pages for major sites
    if (isYouTube && !pageUrl.includes('/watch')) return;
    if ((currentSite.domain === 'twitter.com' || currentSite.domain === 'x.com') && !pageUrl.includes('/status/')) return;
    if (currentSite.domain === 'instagram.com' && !pageUrl.includes('/p/') && !pageUrl.includes('/reel/') && !pageUrl.includes('/tv/')) return;
    if (currentSite.domain === 'tiktok.com' && !pageUrl.includes('/video/') && !pageUrl.includes('/@')) return;
    if (currentSite.domain === 'reddit.com' && !pageUrl.includes('/comments/')) return;
    
    // For other sites, just report the page (video element might load later)
    
    // Get thumbnail if available
    let thumbnail = '';
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      thumbnail = ogImage.getAttribute('content');
    }
    // Try data-poster from video element
    if (!thumbnail) {
      const video = document.querySelector('video');
      if (video) {
        thumbnail = video.poster || video.getAttribute('data-poster') || '';
      }
    }
    
    // Get title
    let title = document.title;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      title = ogTitle.getAttribute('content');
    }
    
    // Clean up title
    title = title.replace(/ - [^-]+$/, ''); // Remove site name suffix
    
    // Try to find actual m3u8 URL for HLS sites
    const m3u8Url = findM3u8Url();
    const videoUrl = m3u8Url || pageUrl;
    
    console.log('[Video Downloader] Detected supported site:', currentSite.name, videoUrl);
    
    reportVideo({
      src: videoUrl,
      type: `${currentSite.name.toLowerCase()}/page`,
      poster: thumbnail,
      title: title,
      quality: 'Best Available',
      needsCompanion: true,
      siteName: currentSite.name,
      isFullVideo: true,
      pageUrl: pageUrl  // Keep original page URL for referer
    });
  }
  
  // Extract YouTube video info from page
  function extractYouTubeVideos() {
    console.log('[Video Downloader] Extracting YouTube videos...');
    
    try {
      let playerResponse = null;
      
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        
        const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
        if (match) {
          try {
            playerResponse = JSON.parse(match[1]);
            break;
          } catch (e) {}
        }
        
        const match2 = text.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
        if (match2) {
          try {
            playerResponse = JSON.parse(match2[1]);
            break;
          } catch (e) {}
        }
      }
      
      if (!playerResponse && window.ytInitialPlayerResponse) {
        playerResponse = window.ytInitialPlayerResponse;
      }
      
      if (playerResponse) {
        const videoDetails = playerResponse.videoDetails || {};
        
        const title = videoDetails.title || 'YouTube Video';
        const videoId = videoDetails.videoId || '';
        const thumbnail = videoDetails.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
        
        console.log('[Video Downloader] Found YouTube video:', title);
        
        if (videoId) {
          reportVideo({
            src: `https://www.youtube.com/watch?v=${videoId}`,
            type: 'youtube/page',
            poster: thumbnail,
            title: title,
            quality: 'All Qualities',
            needsCompanion: true,
            siteName: 'YouTube',
            isFullVideo: true
          });
        }
        
        return true;
      }
    } catch (e) {
      console.error('[Video Downloader] YouTube extraction error:', e);
    }
    
    return false;
  }
  
  // Store captured m3u8 URLs from network
  let capturedM3u8Urls = [];
  
  // Try to intercept fetch/XHR to capture m3u8 URLs (wrapped in try-catch to avoid breaking pages)
  try {
    // Intercept fetch
    const originalFetch = window.fetch;
    if (originalFetch) {
      window.fetch = function(...args) {
        try {
          const url = args[0]?.url || args[0];
          if (typeof url === 'string' && url.includes('.m3u8')) {
            console.log('[Video Downloader] Captured m3u8 from fetch:', url);
            capturedM3u8Urls.push(url);
          }
        } catch (e) {}
        return originalFetch.apply(this, args);
      };
    }
    
    // Intercept XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    if (originalOpen) {
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        try {
          if (typeof url === 'string' && url.includes('.m3u8')) {
            console.log('[Video Downloader] Captured m3u8 from XHR:', url);
            capturedM3u8Urls.push(url);
          }
        } catch (e) {}
        return originalOpen.apply(this, [method, url, ...rest]);
      };
    }
  } catch (e) {
    console.log('[Video Downloader] Could not intercept network requests:', e);
  }
  
  // Try to find actual m3u8 URL in page source
  function findM3u8Url() {
    // First check captured URLs from network requests
    if (capturedM3u8Urls.length > 0) {
      // Prefer URLs with 'playlist' or 'master' or higher resolution indicators
      for (const url of capturedM3u8Urls) {
        if (!url.includes('preview') && !url.includes('thumb')) {
          console.log('[Video Downloader] Using captured m3u8 URL:', url);
          return url;
        }
      }
      return capturedM3u8Urls[capturedM3u8Urls.length - 1]; // Return last captured
    }
    
    // Search in all scripts for m3u8 URLs
    const scripts = document.querySelectorAll('script');
    const m3u8Pattern = /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/gi;
    
    for (const script of scripts) {
      const text = script.textContent || '';
      const matches = text.match(m3u8Pattern);
      if (matches && matches.length > 0) {
        // Return the first valid m3u8 URL (prefer ones without 'preview' or 'thumbnail')
        for (const url of matches) {
          if (!url.includes('preview') && !url.includes('thumb')) {
            console.log('[Video Downloader] Found m3u8 URL in script:', url);
            return url;
          }
        }
        return matches[0];
      }
    }
    
    // Search in page HTML for m3u8 URLs (some sites embed in HTML)
    const pageHtml = document.documentElement.innerHTML;
    const htmlMatches = pageHtml.match(m3u8Pattern);
    if (htmlMatches && htmlMatches.length > 0) {
      for (const url of htmlMatches) {
        if (!url.includes('preview') && !url.includes('thumb')) {
          console.log('[Video Downloader] Found m3u8 URL in HTML:', url);
          return url;
        }
      }
    }
    
    // Also check for m3u8 in data attributes
    const elements = document.querySelectorAll('[data-src*=".m3u8"], [data-url*=".m3u8"], [data-video*=".m3u8"]');
    for (const el of elements) {
      const url = el.getAttribute('data-src') || el.getAttribute('data-url') || el.getAttribute('data-video');
      if (url && url.includes('.m3u8')) {
        console.log('[Video Downloader] Found m3u8 in data attribute:', url);
        return url;
      }
    }
    
    // Check network requests that might be stored in performance API
    if (window.performance) {
      const entries = window.performance.getEntriesByType('resource');
      for (const entry of entries) {
        if (entry.name.includes('.m3u8') && !entry.name.includes('preview') && !entry.name.includes('thumb')) {
          console.log('[Video Downloader] Found m3u8 in performance entries:', entry.name);
          return entry.name;
        }
      }
    }
    
    return null;
  }
  
  // Helper to report the page URL for HLS/blob streaming sites
  function reportPageAsVideo(poster = '') {
    const pageUrl = window.location.href;
    
    // Don't report if already reported this page
    if (detectedSources.has(pageUrl + '_page')) return;
    detectedSources.add(pageUrl + '_page');
    
    // Try to find actual m3u8 URL
    const m3u8Url = findM3u8Url();
    const videoUrl = m3u8Url || pageUrl;
    
    // Get site name
    let siteName = currentSite?.name || '';
    if (!siteName) {
      siteName = window.location.hostname.replace('www.', '').split('.')[0];
      siteName = siteName.charAt(0).toUpperCase() + siteName.slice(1);
    }
    
    // Get best thumbnail
    if (!poster) {
      const ogImage = document.querySelector('meta[property="og:image"]');
      if (ogImage) poster = ogImage.getAttribute('content');
    }
    
    // Get title
    let title = document.title || 'Video';
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) title = ogTitle.getAttribute('content') || title;
    
    console.log('[Video Downloader] Reporting video for streaming site:', videoUrl);
    
    reportVideo({
      src: videoUrl,
      type: 'video/page',
      poster: poster,
      title: title,
      quality: 'Best Available',
      needsCompanion: true,
      siteName: siteName,
      isFullVideo: true,
      pageUrl: pageUrl  // Keep page URL for referer
    });
  }
  
  // Scan a video element
  function scanVideoElement(video) {
    // Skip YouTube player videos (handled separately)
    if (isYouTube && video.closest('#movie_player, .html5-video-player')) {
      return;
    }
    
    // Get poster/thumbnail
    const poster = video.poster || video.getAttribute('data-poster') || '';
    
    // If video has blob URL, this site uses HLS streaming - report PAGE URL
    if (video.src && video.src.startsWith('blob:')) {
      console.log('[Video Downloader] Found blob video - site uses HLS streaming');
      detectedHlsStreaming = true;
      reportPageAsVideo(poster);
      return; // Don't report individual streams
    }
    
    // If video.currentSrc is blob, also report page
    if (video.currentSrc && video.currentSrc.startsWith('blob:')) {
      console.log('[Video Downloader] Found blob currentSrc - site uses HLS streaming');
      detectedHlsStreaming = true;
      reportPageAsVideo(poster);
      return;
    }
    
    // Skip m3u8/HLS URLs - these are just playlists, not actual videos
    if (video.src && (video.src.includes('.m3u8') || video.src.includes('.mpd'))) {
      console.log('[Video Downloader] Found HLS manifest in video src, reporting page URL');
      detectedHlsStreaming = true;
      reportPageAsVideo(poster);
      return;
    }
    
    // Check main src (direct video URL only)
    if (video.src && !video.src.startsWith('data:') && !video.src.includes('.m3u8')) {
      reportVideo({
        src: video.src,
        type: video.type || '',
        poster: poster,
        title: document.title
      });
    }
    
    // Check currentSrc (only if it's a direct URL)
    if (video.currentSrc && video.currentSrc !== video.src && 
        !video.currentSrc.startsWith('blob:') && 
        !video.currentSrc.startsWith('data:') &&
        !video.currentSrc.includes('.m3u8')) {
      reportVideo({
        src: video.currentSrc,
        type: '',
        poster: poster,
        title: document.title
      });
    }
    
    // Check source children (only direct video URLs)
    const sources = video.querySelectorAll('source');
    sources.forEach(source => {
      if (source.src && 
          !source.src.startsWith('blob:') && 
          !source.src.startsWith('data:') &&
          !source.src.includes('.m3u8') &&
          !source.src.includes('.mpd')) {
        reportVideo({
          src: source.src,
          type: source.type || '',
          poster: poster,
          title: document.title
        });
      }
    });
  }
  
  // Scan iframe for videos
  function scanIframe(iframe) {
    // Check if iframe is from a supported site
    try {
      const iframeSrc = iframe.src || '';
      for (const domain of Object.keys(SUPPORTED_SITES)) {
        if (iframeSrc.includes(domain)) {
          reportVideo({
            src: iframeSrc,
            type: `${SUPPORTED_SITES[domain].name.toLowerCase()}/embed`,
            poster: '',
            title: `Embedded ${SUPPORTED_SITES[domain].name} Video`,
            quality: 'Best Available',
            needsCompanion: true,
            siteName: SUPPORTED_SITES[domain].name,
            isFullVideo: true
          });
          return;
        }
      }
    } catch (e) {}
    
    // Try to access iframe content
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        const videos = iframeDoc.querySelectorAll('video');
        videos.forEach(scanVideoElement);
      }
    } catch (e) {
      // Cross-origin iframe, can't access
    }
  }
  
  // Scan for video URLs in page source/scripts
  function scanForVideoUrls() {
    // Skip scanning scripts on YouTube (we use special extraction)
    if (isYouTube) return;
    
    // Check all scripts and inline content for video URLs
    const scripts = document.querySelectorAll('script');
    const videoUrlPattern = /(https?:\/\/[^\s"'<>\\]+\.(mp4|webm|m4v|mov|avi|mkv)(\?[^\s"'<>\\]*)?)/gi;
    
    scripts.forEach(script => {
      if (script.textContent) {
        const matches = script.textContent.match(videoUrlPattern);
        if (matches) {
          matches.forEach(url => {
            let cleanUrl = url.replace(/\\u002F/g, '/').replace(/\\/g, '').replace(/&amp;/g, '&');
            if (!cleanUrl.includes('googlevideo.com')) {
              reportVideo({
                src: cleanUrl,
                title: document.title
              });
            }
          });
        }
      }
    });
    
    // Check meta tags
    const metaTags = document.querySelectorAll('meta[property*="video"], meta[name*="video"]');
    metaTags.forEach(meta => {
      const content = meta.getAttribute('content');
      if (content && VIDEO_EXTENSIONS.test(content)) {
        reportVideo({
          src: content,
          title: document.title
        });
      }
    });
    
    // Check og:video tags
    const ogVideo = document.querySelector('meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]');
    if (ogVideo) {
      const content = ogVideo.getAttribute('content');
      if (content && !content.includes('facebook.com/plugins')) {
        reportVideo({
          src: content,
          title: document.title
        });
      }
    }
    
    // Check JSON-LD structured data
    const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
    jsonLd.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        findVideoInObject(data);
      } catch (e) {}
    });
  }
  
  // Recursively find video URLs in objects
  function findVideoInObject(obj, depth = 0) {
    if (depth > 10 || !obj) return;
    
    if (typeof obj === 'string') {
      if (VIDEO_EXTENSIONS.test(obj) && obj.startsWith('http') && !obj.includes('googlevideo.com')) {
        reportVideo({
          src: obj,
          title: document.title
        });
      }
      return;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach(item => findVideoInObject(item, depth + 1));
      return;
    }
    
    if (typeof obj === 'object') {
      const videoProps = ['contentUrl', 'embedUrl', 'videoUrl', 'url', 'src', 'file', 'source', 'stream', 'video_url', 'media_url'];
      videoProps.forEach(prop => {
        if (obj[prop] && typeof obj[prop] === 'string') {
          if ((VIDEO_EXTENSIONS.test(obj[prop]) || obj['@type']?.includes('Video')) && !obj[prop].includes('googlevideo.com')) {
            reportVideo({
              src: obj[prop],
              title: document.title
            });
          }
        }
      });
      
      Object.values(obj).forEach(value => findVideoInObject(value, depth + 1));
    }
  }
  
  // Full page scan
  function scanPage() {
    console.log('[Video Downloader] Scanning page for videos...', window.location.href);
    
    // For YouTube, use special extraction
    if (isYouTube) {
      extractYouTubeVideos();
      return;
    }
    
    // Scan video elements first to detect if site uses HLS/blob streaming
    document.querySelectorAll('video').forEach(scanVideoElement);
    
    // For known supported sites with blob/HLS, report the page URL
    if (currentSite && !detectedHlsStreaming) {
      reportPageUrl();
    }
    
    // If we detected HLS streaming, the page URL has already been reported
    if (detectedHlsStreaming) {
      console.log('[Video Downloader] HLS streaming detected');
      return;
    }
    
    // Scan iframes
    document.querySelectorAll('iframe').forEach(scanIframe);
    
    // Scan for video URLs in page
    scanForVideoUrls();
    
    // Check for video players
    scanVideoPlayers();
  }
  
  // Scan common video player implementations
  function scanVideoPlayers() {
    if (isYouTube) return;
    
    // JW Player
    if (typeof jwplayer !== 'undefined') {
      try {
        const players = document.querySelectorAll('[id^="jwplayer"]');
        players.forEach((el, idx) => {
          try {
            const player = jwplayer(idx);
            if (player && player.getPlaylistItem) {
              const item = player.getPlaylistItem();
              if (item && item.file) {
                reportVideo({
                  src: item.file,
                  title: item.title || document.title
                });
              }
            }
          } catch (e) {}
        });
      } catch (e) {}
    }
    
    // Video.js
    if (typeof videojs !== 'undefined') {
      try {
        const players = videojs.getPlayers();
        Object.values(players).forEach(player => {
          if (player && player.currentSrc) {
            const src = player.currentSrc();
            if (src && !src.startsWith('blob:')) {
              reportVideo({
                src: src,
                title: document.title
              });
            }
          }
        });
      } catch (e) {}
    }
    
    // HTML5 video with data attributes
    document.querySelectorAll('[data-video-src], [data-src], [data-url], [data-video-url]').forEach(el => {
      const src = el.getAttribute('data-video-src') || el.getAttribute('data-src') || el.getAttribute('data-url') || el.getAttribute('data-video-url');
      if (src && (VIDEO_EXTENSIONS.test(src) || src.startsWith('http'))) {
        reportVideo({
          src: src,
          title: document.title
        });
      }
    });
  }
  
  // Watch for dynamically added videos
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        
        if (node.tagName === 'VIDEO') {
          scanVideoElement(node);
        }
        
        if (node.querySelectorAll) {
          node.querySelectorAll('video').forEach(scanVideoElement);
        }
        
        if (node.tagName === 'IFRAME') {
          setTimeout(() => scanIframe(node), 1000);
        }
      });
    });
  });
  
  // Start observing
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Listen for SPA navigation on supported sites
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log('[Video Downloader] Navigation detected:', location.href);
      
      // Clear local tracking
      detectedSources.clear();
      detectedHlsStreaming = false; // Reset HLS detection flag
      
      // Tell background to clear videos for this tab
      browser.runtime.sendMessage({ type: 'CLEAR_VIDEOS' }).catch(() => {});
      
      // Wait for new page to load, then scan
      setTimeout(() => {
        scanPage();
      }, 1500);
    }
  });
  
  if (document.body) {
    urlObserver.observe(document.body, { childList: true, subtree: true });
  }
  
  // Listen for messages from background
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAN_PAGE') {
      detectedSources.clear();
      detectedHlsStreaming = false;
      capturedM3u8Urls = []; // Reset captured URLs
      
      // Wait a moment then scan
      setTimeout(() => {
        scanPage();
        // Also do a delayed rescan to catch player-loaded URLs
        setTimeout(scanPage, 2000);
      }, 500);
    }
    
    if (message.type === 'FORCE_DOWNLOAD') {
      const a = document.createElement('a');
      a.href = message.video.url;
      a.download = message.video.filename || 'video.mp4';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    
    if (message.type === 'COPY_YTDLP_COMMAND') {
      const cmd = `yt-dlp "${message.url}"`;
      navigator.clipboard.writeText(cmd).then(() => {
        console.log('[Video Downloader] Copied yt-dlp command:', cmd);
      }).catch(err => {
        console.error('[Video Downloader] Failed to copy:', err);
        prompt('Copy this command:', cmd);
      });
    }
  });
  
  // Initial scan
  if (document.readyState === 'complete') {
    setTimeout(scanPage, 500);  // Small delay to let video player initialize
  } else {
    window.addEventListener('load', () => {
      setTimeout(scanPage, 1000);  // Longer delay after load
    });
  }
  
  // Rescan after delays for lazy-loaded content and video player initialization
  setTimeout(scanPage, 3000);   // Video players often take time to load
  setTimeout(scanPage, 6000);   // Final rescan for slow sites
  setTimeout(scanPage, 10000);  // Extra late scan for very slow sites
  
  console.log('[Video Downloader] Content script loaded on:', window.location.hostname);
  console.log('[Video Downloader] Current site info:', currentSite);
  console.log('[Video Downloader] Is YouTube:', isYouTube);
})();
