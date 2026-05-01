# Video Detector & Downloader

A Chromium-compatible browser extension that detects and downloads videos from webpages, including YouTube, X/Twitter, Instagram, TikTok, Vimeo, and more.

The extension uses a local Python companion app with yt-dlp for sites that cannot be downloaded directly by the browser.

## Supported Browsers

- Google Chrome
- Microsoft Edge
- Brave
- Chromium-based browsers that support Manifest V3 and native messaging

The bundled Chromium extension ID is:

```text
dhbokoaaoenlmmooohpoacfeaacbkoai
```

## Features

- Download from YouTube and other yt-dlp supported sites
- Choose quality where available
- Detect direct video files from pages and network responses
- Track download progress in the popup
- Use browser downloads for direct media URLs
- Use the companion app for protected and streaming sites

## Installation

### 1. Install the Companion App

The companion app is required for YouTube and many streaming/protected sites.

1. Make sure Python is installed from <https://www.python.org/downloads/>.
2. During Python install, enable "Add Python to PATH".
3. Right-click `companion\install.bat`.
4. Choose "Run as administrator".

The installer:

- Copies the companion app to `C:\viddownloader`
- Installs or updates `yt-dlp`
- Registers native messaging for Chrome, Edge, Brave, and Chromium

### 2. Load the Extension in Chromium

1. Open your browser extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
2. Enable "Developer mode".
3. Click "Load unpacked".
4. Select this `vidDownloader` folder.

### 3. Start Downloading

1. Open a page with a video.
2. Click the extension icon.
3. Choose a detected video and quality.
4. Start the download.

## Troubleshooting

### Companion app not connected

1. Run `companion\install.bat` as Administrator.
2. Confirm Python works from a terminal:

```bat
python --version
```

3. Confirm yt-dlp is installed:

```bat
pip show yt-dlp
```

4. Restart the browser after installing the companion app.

### Extension ID mismatch

The `manifest.json` includes a fixed Chromium key, so the unpacked extension ID should be:

```text
dhbokoaaoenlmmooohpoacfeaacbkoai
```

If your browser shows a different extension ID, reload the unpacked extension from this folder and rerun `companion\install.bat`.

### Downloads fail

Update yt-dlp:

```bat
pip install --upgrade yt-dlp
```

Some videos may still fail if they are private, geo-restricted, DRM-protected, or blocked by the source site.

## File Structure

```text
vidDownloader/
  manifest.json
  background/
    background.js
    service_worker.js
  content/
    content.js
  lib/
    browser-api.js
  popup/
    popup.html
    popup.css
    popup.js
  icons/
    *.svg
  companion/
    install.bat
    viddownloader_companion.py
    viddownloader_companion.bat
    viddownloader.json
    viddownloader.chromium.json
```

## Requirements

- Windows 10/11
- Python 3.7+
- Chromium-based browser with Manifest V3 support
- yt-dlp, installed by `companion\install.bat`
