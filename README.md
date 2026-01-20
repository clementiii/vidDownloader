# Video Detector & Downloader - Firefox Extension

A Firefox extension that detects and downloads videos from any webpage, including **YouTube, Twitter, Instagram, TikTok, Vimeo**, and more!

Works just like **Video DownloadHelper** with a companion app for full functionality.

## Features

- 🎬 **Download from YouTube** - Any quality up to 4K
- 📺 **Quality Selector** - Choose 1080p, 720p, 480p, etc.
- 🌐 **200+ Sites Supported** - Via yt-dlp integration
- 📥 **One-Click Download** - Simple and fast
- 🔍 **Automatic Detection** - Finds videos on any page
- 📊 **Progress Tracking** - See download progress in real-time
- 🎨 **Beautiful Dark UI** - Modern and clean interface

## Installation

### Step 1: Install the Companion App

The companion app is required for downloading from YouTube and other protected sites.

1. **Make sure Python is installed**
   - Download from [python.org](https://www.python.org/downloads/)
   - ✅ Check "Add Python to PATH" during installation

2. **Run the installer**
   ```
   Right-click on companion\install.bat → "Run as administrator"
   ```
   
   This will:
   - Install yt-dlp (the download engine)
   - Register the companion app with Firefox

### Step 2: Load the Extension

1. Open Firefox and go to `about:debugging`
2. Click **"This Firefox"** in the sidebar
3. Click **"Load Temporary Add-on..."**
4. Select the `manifest.json` file from this folder

### Step 3: Start Downloading!

1. Go to any video site (YouTube, Twitter, etc.)
2. Click the extension icon in the toolbar
3. Click the green download button
4. Select your quality
5. Video downloads to your Downloads folder!

## Supported Sites

The companion app uses **yt-dlp** which supports 1000+ sites including:

| Site | Works |
|------|-------|
| YouTube | ✅ All qualities |
| Twitter/X | ✅ |
| Instagram | ✅ |
| TikTok | ✅ |
| Facebook | ✅ |
| Vimeo | ✅ |
| Reddit | ✅ |
| Twitch | ✅ |
| Dailymotion | ✅ |
| And many more... | ✅ |

## Usage

### Popup Interface

- **Green status** = Companion app connected, ready to download
- **Red status** = Companion app not connected, run install.bat

### Quality Options

When downloading from YouTube/etc, you'll see:
- **Best Quality** - Highest available (up to 4K)
- **1080p HD** - Full HD
- **720p HD** - HD
- **480p** - Standard
- **360p** - Low quality

## Troubleshooting

### "Companion app not connected"

1. Make sure you ran `install.bat` as Administrator
2. Make sure Python is installed and in PATH
3. Restart Firefox after installation

### Downloads fail

1. Check if yt-dlp is installed: `pip show yt-dlp`
2. Update yt-dlp: `pip install --upgrade yt-dlp`
3. Some videos may be geo-restricted or private

### Testing the companion app

Open Command Prompt and run:
```bash
python C:\viddownloader\viddownloader_companion.py
```

## File Structure

```
vidDownloader/
├── manifest.json           # Extension configuration
├── background/
│   └── background.js       # Background script + native messaging
├── content/
│   └── content.js          # Video detection on pages
├── popup/
│   ├── popup.html          # Popup UI
│   ├── popup.css           # Styling
│   └── popup.js            # Popup logic
├── icons/
│   └── *.svg               # Extension icons
├── companion/
│   ├── install.bat         # Installer (run as admin)
│   ├── viddownloader_companion.py    # Python companion app
│   ├── viddownloader_companion.bat   # Launcher script
│   └── viddownloader.json           # Native messaging manifest
└── README.md
```

## How It Works

1. **Extension** detects videos on the page
2. **Companion App** (Python + yt-dlp) handles the actual download
3. **Native Messaging** connects Firefox to the companion app
4. **yt-dlp** does the heavy lifting (decryption, merging, etc.)

## Requirements

- Firefox 57+
- Python 3.7+
- Windows 10/11 (macOS/Linux support coming soon)
- ~50MB disk space for yt-dlp

## Privacy

- ❌ No data collection
- ❌ No external servers
- ✅ Everything runs locally
- ✅ Open source

## Credits

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - The download engine
- Inspired by Video DownloadHelper

## License

MIT License - Free to use and modify.

---

**Having issues?** Make sure you:
1. ✅ Installed Python with "Add to PATH" checked
2. ✅ Ran install.bat as Administrator
3. ✅ Restarted Firefox after installation
