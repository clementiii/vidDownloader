// Content script - Detects videos in the DOM

(function() {
  'use strict';
  
  const detectedSources = new Set();
  
  // Video source patterns
  const VIDEO_EXTENSIONS = /\.(mp4|webm|mkv|avi|mov|flv|wmv|m4v|3gp|ogv|m3u8|mpd)/i;
  
  // Sites that need special handling (adaptive streaming)
  const isYouTube = window.location.hostname.includes('youtube.com');
  const isVimeo = window.location.hostname.includes('vimeo.com');
  
  // Send detected video to background script
  function reportVideo(videoData) {
    const src = typeof videoData === 'string' ? videoData : videoData.src;
    
    if (!src || detectedSources.has(src)) return;
    if (src.startsWith('blob:') || src.startsWith('data:')) return;
    
    // Skip tiny data URLs
    if (src.length > 50000) return;
    
    // Skip YouTube/Google video chunks (small adaptive streaming segments)
    if (src.includes('googlevideo.com') && !videoData.isFullVideo) return;
    
    detectedSources.add(src);
    
    const video = typeof videoData === 'string' 
      ? { src, type: '', poster: '' }
      : videoData;
    
    browser.runtime.sendMessage({
      type: 'VIDEO_DETECTED',
      video: {
        src: video.src,
        type: video.type || '',
        poster: video.poster || '',
        title: video.title || '',
        quality: video.quality || '',
        isFullVideo: video.isFullVideo || false
      }
    }).catch(() => {});
  }
  
  // Extract YouTube video info from page
  function extractYouTubeVideos() {
    console.log('[Video Downloader] Extracting YouTube videos...');
    
    try {
      // Method 1: Try to get ytInitialPlayerResponse
      let playerResponse = null;
      
      // Check if it's in a script tag
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        
        // Look for ytInitialPlayerResponse
        const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
        if (match) {
          try {
            playerResponse = JSON.parse(match[1]);
            break;
          } catch (e) {}
        }
        
        // Also try var ytInitialPlayerResponse
        const match2 = text.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
        if (match2) {
          try {
            playerResponse = JSON.parse(match2[1]);
            break;
          } catch (e) {}
        }
      }
      
      // Method 2: Try window object
      if (!playerResponse && window.ytInitialPlayerResponse) {
        playerResponse = window.ytInitialPlayerResponse;
      }
      
      if (playerResponse) {
        const videoDetails = playerResponse.videoDetails || {};
        
        const title = videoDetails.title || 'YouTube Video';
        const videoId = videoDetails.videoId || '';
        const thumbnail = videoDetails.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
        
        console.log('[Video Downloader] Found YouTube video:', title);
        
        // Only add the YouTube watch URL - companion app handles quality selection
        // Direct format URLs often fail due to signature encryption
        if (videoId) {
          reportVideo({
            src: `https://www.youtube.com/watch?v=${videoId}`,
            type: 'youtube/protected',
            poster: thumbnail,
            title: title,
            quality: 'All Qualities',
            isYouTube: true,
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
  
  // Scan a video element
  function scanVideoElement(video) {
    // Skip YouTube player videos (handled separately)
    if (isYouTube && video.closest('#movie_player, .html5-video-player')) {
      return;
    }
    
    // Check main src
    if (video.src && !video.src.startsWith('blob:')) {
      reportVideo({
        src: video.src,
        type: video.type || '',
        poster: video.poster || ''
      });
    }
    
    // Check currentSrc (actual playing source)
    if (video.currentSrc && video.currentSrc !== video.src && !video.currentSrc.startsWith('blob:')) {
      reportVideo({
        src: video.currentSrc,
        type: '',
        poster: video.poster || ''
      });
    }
    
    // Check source children
    const sources = video.querySelectorAll('source');
    sources.forEach(source => {
      if (source.src && !source.src.startsWith('blob:')) {
        reportVideo({
          src: source.src,
          type: source.type || '',
          poster: video.poster || ''
        });
      }
    });
  }
  
  // Scan iframe for videos
  function scanIframe(iframe) {
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
    const videoUrlPattern = /(https?:\/\/[^\s"'<>]+\.(mp4|webm|m4v|mov|avi|mkv)[^\s"'<>]*)/gi;
    
    scripts.forEach(script => {
      if (script.textContent) {
        const matches = script.textContent.match(videoUrlPattern);
        if (matches) {
          matches.forEach(url => {
            // Clean up the URL
            let cleanUrl = url.replace(/[\\]/g, '').replace(/&amp;/g, '&');
            // Skip googlevideo URLs (YouTube chunks)
            if (!cleanUrl.includes('googlevideo.com')) {
              reportVideo(cleanUrl);
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
        reportVideo(content);
      }
    });
    
    // Check og:video tags
    const ogVideo = document.querySelector('meta[property="og:video"]');
    if (ogVideo) {
      reportVideo(ogVideo.getAttribute('content'));
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
        reportVideo(obj);
      }
      return;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach(item => findVideoInObject(item, depth + 1));
      return;
    }
    
    if (typeof obj === 'object') {
      // Check common video URL properties
      const videoProps = ['contentUrl', 'embedUrl', 'videoUrl', 'url', 'src', 'file', 'source', 'stream'];
      videoProps.forEach(prop => {
        if (obj[prop] && typeof obj[prop] === 'string') {
          if ((VIDEO_EXTENSIONS.test(obj[prop]) || obj['@type']?.includes('Video')) && !obj[prop].includes('googlevideo.com')) {
            reportVideo(obj[prop]);
          }
        }
      });
      
      Object.values(obj).forEach(value => findVideoInObject(value, depth + 1));
    }
  }
  
  // Full page scan
  function scanPage() {
    console.log('[Video Downloader] Scanning page for videos...');
    
    // Special handling for YouTube
    if (isYouTube) {
      extractYouTubeVideos();
    }
    
    // Scan video elements
    document.querySelectorAll('video').forEach(scanVideoElement);
    
    // Scan iframes
    document.querySelectorAll('iframe').forEach(scanIframe);
    
    // Scan for video URLs in page
    scanForVideoUrls();
    
    // Check for video players (common player patterns)
    scanVideoPlayers();
  }
  
  // Scan common video player implementations
  function scanVideoPlayers() {
    // Skip on YouTube
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
                reportVideo(item.file);
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
            reportVideo(player.currentSrc());
          }
        });
      } catch (e) {}
    }
    
    // HTML5 video with data attributes
    document.querySelectorAll('[data-video-src], [data-src], [data-url]').forEach(el => {
      const src = el.getAttribute('data-video-src') || el.getAttribute('data-src') || el.getAttribute('data-url');
      if (src && VIDEO_EXTENSIONS.test(src)) {
        reportVideo(src);
      }
    });
  }
  
  // Watch for dynamically added videos
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        
        // Check if the node is a video
        if (node.tagName === 'VIDEO') {
          scanVideoElement(node);
        }
        
        // Check for videos inside added node
        if (node.querySelectorAll) {
          node.querySelectorAll('video').forEach(scanVideoElement);
        }
        
        // Check for iframes
        if (node.tagName === 'IFRAME') {
          setTimeout(() => scanIframe(node), 1000);
        }
      });
    });
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Listen for YouTube navigation (SPA)
  if (isYouTube) {
    // YouTube uses SPA navigation, listen for URL changes
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('[Video Downloader] YouTube navigation detected:', location.href);
        
        // Clear local tracking
        detectedSources.clear();
        
        // Tell background to clear videos for this tab (important!)
        browser.runtime.sendMessage({ type: 'CLEAR_VIDEOS' }).catch(() => {});
        
        // Wait for new page to load, then extract
        setTimeout(() => {
          extractYouTubeVideos();
        }, 2000);
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });
  }
  
  // Listen for messages from background
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAN_PAGE') {
      detectedSources.clear();
      scanPage();
    }
    
    if (message.type === 'FORCE_DOWNLOAD') {
      // Alternative download method using anchor tag
      const a = document.createElement('a');
      a.href = message.video.url;
      a.download = message.video.filename || 'video.mp4';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    
    if (message.type === 'COPY_YTDLP_COMMAND') {
      // Copy yt-dlp command to clipboard
      const cmd = `yt-dlp "${message.url}"`;
      navigator.clipboard.writeText(cmd).then(() => {
        console.log('[Video Downloader] Copied yt-dlp command:', cmd);
      }).catch(err => {
        console.error('[Video Downloader] Failed to copy:', err);
        // Fallback: show prompt
        prompt('Copy this command:', cmd);
      });
    }
  });
  
  // Initial scan
  if (document.readyState === 'complete') {
    scanPage();
  } else {
    window.addEventListener('load', () => {
      setTimeout(scanPage, 500);
    });
  }
  
  // Rescan after a delay (for lazy-loaded content)
  setTimeout(scanPage, 2000);
  setTimeout(scanPage, 5000);
  
  console.log('[Video Downloader] Content script loaded');
})();
