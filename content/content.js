// Content script - Detects videos in the DOM

(function() {
  'use strict';
  
  const detectedSources = new Set();
  
  // Video source patterns
  const VIDEO_EXTENSIONS = /\.(mp4|webm|mkv|avi|mov|flv|wmv|m4v|3gp|ogv|m3u8|mpd)/i;
  
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
    'pornhub.com': { name: 'Pornhub', needsCompanion: true },
    'xvideos.com': { name: 'XVideos', needsCompanion: true },
    'xhamster.com': { name: 'xHamster', needsCompanion: true },
  };
  
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
        siteName: video.siteName || ''
      }
    }).catch(() => {});
  }
  
  // Report the current page URL for supported sites
  function reportPageUrl() {
    if (!currentSite) return;
    
    const pageUrl = window.location.href;
    
    // Don't report home pages or non-video pages
    if (isYouTube && !pageUrl.includes('/watch')) return;
    if (currentSite.domain === 'twitter.com' || currentSite.domain === 'x.com') {
      if (!pageUrl.includes('/status/')) return;
    }
    if (currentSite.domain === 'instagram.com') {
      if (!pageUrl.includes('/p/') && !pageUrl.includes('/reel/') && !pageUrl.includes('/tv/')) return;
    }
    if (currentSite.domain === 'tiktok.com') {
      if (!pageUrl.includes('/video/') && !pageUrl.includes('/@')) return;
    }
    if (currentSite.domain === 'reddit.com') {
      if (!pageUrl.includes('/comments/')) return;
    }
    
    // Get thumbnail if available
    let thumbnail = '';
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      thumbnail = ogImage.getAttribute('content');
    }
    
    // Get title
    let title = document.title;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      title = ogTitle.getAttribute('content');
    }
    
    console.log('[Video Downloader] Detected supported site:', currentSite.name, pageUrl);
    
    reportVideo({
      src: pageUrl,
      type: `${currentSite.name.toLowerCase()}/page`,
      poster: thumbnail,
      title: `${title} (${currentSite.name})`,
      quality: 'Best Available',
      needsCompanion: true,
      siteName: currentSite.name,
      isFullVideo: true
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
  
  // Scan a video element
  function scanVideoElement(video) {
    // Skip YouTube player videos (handled separately)
    if (isYouTube && video.closest('#movie_player, .html5-video-player')) {
      return;
    }
    
    // Get poster/thumbnail
    const poster = video.poster || video.getAttribute('data-poster') || '';
    
    // If video has blob URL, report the PAGE URL instead (yt-dlp can handle it)
    if (video.src && video.src.startsWith('blob:')) {
      console.log('[Video Downloader] Found blob video, using page URL');
      const pageUrl = window.location.href;
      
      // Don't report if already reported this page
      if (!detectedSources.has(pageUrl)) {
        detectedSources.add(pageUrl);
        
        reportVideo({
          src: pageUrl,
          type: 'video/page',
          poster: poster,
          title: document.title || 'Video',
          quality: 'Best Available',
          needsCompanion: true,
          siteName: window.location.hostname,
          isFullVideo: true
        });
      }
      return;
    }
    
    // Check main src (direct video URL)
    if (video.src && !video.src.startsWith('data:')) {
      reportVideo({
        src: video.src,
        type: video.type || '',
        poster: poster,
        title: document.title
      });
    }
    
    // Check currentSrc
    if (video.currentSrc && video.currentSrc !== video.src && !video.currentSrc.startsWith('blob:') && !video.currentSrc.startsWith('data:')) {
      reportVideo({
        src: video.currentSrc,
        type: '',
        poster: poster,
        title: document.title
      });
    }
    
    // Check source children
    const sources = video.querySelectorAll('source');
    sources.forEach(source => {
      if (source.src && !source.src.startsWith('blob:') && !source.src.startsWith('data:')) {
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
    
    // For supported sites, report the page URL
    if (currentSite) {
      if (isYouTube) {
        extractYouTubeVideos();
      } else {
        reportPageUrl();
      }
    }
    
    // Scan video elements
    document.querySelectorAll('video').forEach(scanVideoElement);
    
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
      scanPage();
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
    scanPage();
  } else {
    window.addEventListener('load', () => {
      setTimeout(scanPage, 500);
    });
  }
  
  // Rescan after delays for lazy-loaded content
  setTimeout(scanPage, 2000);
  setTimeout(scanPage, 5000);
  
  console.log('[Video Downloader] Content script loaded on:', window.location.hostname);
})();
