#!/usr/bin/env python3
"""
Video Downloader Companion App
Handles video downloads using yt-dlp for the Firefox extension
"""

import sys
import json
import struct
import subprocess
import os
import threading
import re
import logging
import signal

# Set up logging to file for debugging
LOG_FILE = os.path.join(os.path.expanduser("~"), "viddownloader_debug.log")
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Get the downloads folder
DOWNLOADS_FOLDER = os.path.join(os.path.expanduser("~"), "Downloads")

# Thread lock for send_message to prevent message corruption
message_lock = threading.Lock()

# Track active download process for cancellation
active_download_process = None
download_cancelled = False

# Make stdin/stdout unbuffered
if sys.platform == 'win32':
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)

def get_message():
    """Read a message from the extension"""
    try:
        # Read the message length (4 bytes)
        raw_length = sys.stdin.buffer.read(4)
        if not raw_length or len(raw_length) < 4:
            logging.debug("No message length received")
            return None
        
        message_length = struct.unpack('=I', raw_length)[0]
        logging.debug(f"Reading message of length: {message_length}")
        
        # Read the message
        message = sys.stdin.buffer.read(message_length).decode('utf-8')
        logging.debug(f"Received message: {message[:100]}...")
        
        return json.loads(message)
    except Exception as e:
        logging.error(f"Error reading message: {e}")
        return None

def send_message(message):
    """Send a message to the extension (thread-safe)"""
    with message_lock:
        try:
            encoded = json.dumps(message).encode('utf-8')
            logging.debug(f"Sending message: {message.get('type', 'unknown')}")
            
            # Write length prefix
            sys.stdout.buffer.write(struct.pack('=I', len(encoded)))
            # Write message
            sys.stdout.buffer.write(encoded)
            # Flush immediately
            sys.stdout.buffer.flush()
            
            logging.debug("Message sent and flushed")
        except Exception as e:
            logging.error(f"Error sending message: {e}")

def sanitize_filename(filename):
    """Remove invalid characters from filename"""
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '')
    return filename[:200]

def check_ytdlp():
    """Check if yt-dlp is installed"""
    try:
        result = subprocess.run(
            ['yt-dlp', '--version'],
            capture_output=True,
            text=True,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False

def get_video_info(url):
    """Get video information without downloading"""
    try:
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        result = subprocess.run(
            ['yt-dlp', '--dump-json', '--no-download', url],
            capture_output=True,
            text=True,
            creationflags=creationflags,
            timeout=30
        )
        if result.returncode == 0:
            info = json.loads(result.stdout)
            return {
                'success': True,
                'title': info.get('title', 'video'),
                'duration': info.get('duration'),
                'thumbnail': info.get('thumbnail'),
                'formats': get_format_list(info.get('formats', []))
            }
    except Exception as e:
        logging.error(f"Error getting video info: {e}")
    return {'success': False, 'error': 'Could not get video info'}

def get_format_list(formats):
    """Extract useful format information"""
    result = []
    seen = set()
    
    for f in formats:
        if f.get('vcodec') == 'none':
            continue
            
        height = f.get('height')
        if not height:
            continue
            
        quality = f"{height}p"
        if quality in seen:
            continue
        seen.add(quality)
        
        result.append({
            'format_id': f.get('format_id'),
            'quality': quality,
            'ext': f.get('ext', 'mp4'),
            'filesize': f.get('filesize') or f.get('filesize_approx'),
            'has_audio': f.get('acodec') != 'none'
        })
    
    result.sort(key=lambda x: int(x['quality'].replace('p', '')), reverse=True)
    return result[:6]

def download_video(url, quality='best', output_folder=None, page_url=None):
    """Download video using yt-dlp"""
    global active_download_process, download_cancelled
    
    logging.info(f"Starting download: {url} at {quality}")
    download_cancelled = False
    
    if output_folder is None:
        output_folder = DOWNLOADS_FOLDER
    
    output_template = os.path.join(output_folder, '%(title)s.%(ext)s')
    
    # Check if this is an m3u8 URL (direct HLS stream)
    is_m3u8 = '.m3u8' in url.lower()
    
    # Determine if this is a site that needs special handling
    needs_special = any(site in url.lower() for site in ['missav', 'jable', 'javhd', 'spankbang'])
    
    cmd = [
        'yt-dlp',
        '--no-playlist',
        '--newline',
        '--progress',
        '--no-check-certificates',
        '--socket-timeout', '30',
        '-o', output_template
    ]
    
    # Add referer for all HLS streams and special sites
    referer = page_url or url
    if needs_special or is_m3u8:
        cmd.extend(['--referer', referer])
        # Also add origin and user-agent headers
        origin = '/'.join(referer.split('/')[:3])
        cmd.extend(['--add-header', f'Origin:{origin}'])
        cmd.extend(['--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'])
    
    # For m3u8 streams, use specific options
    if is_m3u8:
        cmd.extend([
            '--hls-prefer-native',  # Use native HLS downloader
        ])
    
    # Format selection
    if quality == 'best':
        cmd.extend(['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best'])
    elif quality == 'worst':
        cmd.extend(['-f', 'worstvideo+worstaudio/worst'])
    else:
        height = quality.replace('p', '')
        cmd.extend(['-f', f'bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={height}]+bestaudio/best[height<={height}][ext=mp4]/best[height<={height}]/best'])
    
    # Merge to mp4
    cmd.extend(['--merge-output-format', 'mp4'])
    
    cmd.append(url)
    
    logging.info(f"Running command: {' '.join(cmd)}")
    
    # Send immediate progress to show download started
    send_message({
        'type': 'progress',
        'progress': 0,
        'status': 'starting'
    })
    
    try:
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            creationflags=creationflags
        )
        
        # Track process for cancellation
        active_download_process = process
        
        filename = None
        last_progress = 0
        last_error = None
        
        for line in process.stdout:
            # Check if download was cancelled
            if download_cancelled:
                logging.info("Download cancelled by user")
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                send_message({
                    'type': 'complete',
                    'success': False,
                    'error': 'Download cancelled'
                })
                active_download_process = None
                return
            line = line.strip()
            logging.debug(f"yt-dlp output: {line}")
            
            # Extracting info (for HLS streams)
            if '[info]' in line or 'Extracting URL' in line:
                send_message({
                    'type': 'progress',
                    'progress': 1,
                    'status': 'extracting'
                })
            
            # HLS manifest extraction
            elif 'Downloading m3u8' in line or 'Downloading MPD' in line:
                send_message({
                    'type': 'progress',
                    'progress': 2,
                    'status': 'extracting playlist'
                })
            
            elif '[download]' in line:
                # Parse progress, size, speed, and ETA from yt-dlp output
                # Example: [download]  45.2% of 150.00MiB at 2.50MiB/s ETA 00:45
                match = re.search(r'(\d+\.?\d*)%', line)
                if match:
                    progress = float(match.group(1))
                    
                    # Extract total size (e.g., "150.00MiB" or "1.20GiB")
                    size_match = re.search(r'of\s+([\d.]+)([KMG]i?B)', line)
                    total_size = None
                    if size_match:
                        size_num = float(size_match.group(1))
                        size_unit = size_match.group(2)
                        total_size = f"{size_num:.1f} {size_unit}"
                    
                    # Extract download speed (e.g., "2.50MiB/s")
                    speed_match = re.search(r'at\s+([\d.]+)([KMG]i?B)/s', line)
                    speed = None
                    if speed_match:
                        speed_num = float(speed_match.group(1))
                        speed_unit = speed_match.group(2)
                        speed = f"{speed_num:.1f} {speed_unit}/s"
                    
                    # Extract ETA (e.g., "00:45" or "01:23:45")
                    eta_match = re.search(r'ETA\s+(\d+:\d+(?::\d+)?)', line)
                    eta = eta_match.group(1) if eta_match else None
                    
                    # Calculate downloaded and remaining size
                    downloaded = None
                    remaining = None
                    if size_match:
                        size_bytes = float(size_match.group(1))
                        unit = size_match.group(2)
                        downloaded_bytes = size_bytes * (progress / 100)
                        remaining_bytes = size_bytes - downloaded_bytes
                        downloaded = f"{downloaded_bytes:.1f} {unit}"
                        remaining = f"{remaining_bytes:.1f} {unit}"
                    
                    # Only send if progress changed significantly
                    if progress - last_progress >= 0.5 or progress >= 100:
                        last_progress = progress
                        send_message({
                            'type': 'progress',
                            'progress': progress,
                            'status': 'downloading',
                            'speed': speed,
                            'totalSize': total_size,
                            'downloaded': downloaded,
                            'remaining': remaining,
                            'eta': eta
                        })
                
                if 'Destination:' in line:
                    filename = line.split('Destination:')[-1].strip()
                elif 'has already been downloaded' in line:
                    filename = line.split('[download]')[-1].split('has already')[0].strip()
            
            elif '[Merger]' in line or 'Merging' in line:
                send_message({
                    'type': 'progress',
                    'progress': 99,
                    'status': 'merging'
                })
            
            elif '[hlsnative]' in line or 'Downloading fragment' in line:
                # HLS fragment download
                frag_match = re.search(r'fragment\s+(\d+)/(\d+)', line, re.IGNORECASE)
                if frag_match:
                    frag_num = int(frag_match.group(1))
                    frag_total = int(frag_match.group(2))
                    progress = (frag_num / frag_total) * 100
                    if progress - last_progress >= 2:
                        last_progress = progress
                        send_message({
                            'type': 'progress',
                            'progress': progress,
                            'status': 'downloading'
                        })
            
            elif 'ERROR:' in line:
                # Capture error message
                last_error = line.replace('ERROR:', '').strip()
                logging.error(f"yt-dlp error: {last_error}")
                send_message({
                    'type': 'progress',
                    'progress': 0,
                    'status': 'error',
                    'error': last_error
                })
        
        process.wait()
        
        # Clear active process
        active_download_process = None
        
        logging.info(f"Download finished with return code: {process.returncode}")
        
        # Don't send completion if cancelled
        if download_cancelled:
            return
        
        if process.returncode == 0:
            send_message({
                'type': 'complete',
                'success': True,
                'filename': filename or 'Download complete',
                'folder': output_folder
            })
        else:
            error_msg = last_error if last_error else 'Download failed - site may not be supported'
            send_message({
                'type': 'complete',
                'success': False,
                'error': error_msg
            })
            
    except Exception as e:
        active_download_process = None
        logging.error(f"Download error: {e}")
        send_message({
            'type': 'complete',
            'success': False,
            'error': str(e)
        })

def main():
    """Main loop - handle messages from extension"""
    global download_cancelled
    logging.info("Companion app started")
    
    # Check if yt-dlp is installed
    if not check_ytdlp():
        logging.error("yt-dlp not installed")
        send_message({
            'type': 'error',
            'error': 'yt-dlp not installed',
            'message': 'Please install yt-dlp: pip install yt-dlp'
        })
        return
    
    logging.info("yt-dlp found, sending ready message")
    send_message({
        'type': 'ready',
        'version': '1.0.0'
    })
    
    while True:
        logging.debug("Waiting for message...")
        message = get_message()
        
        if message is None:
            logging.info("No message received, exiting")
            break
        
        action = message.get('action')
        logging.info(f"Received action: {action}")
        
        if action == 'ping':
            logging.debug("Responding to ping")
            send_message({'type': 'pong', 'ytdlp': check_ytdlp()})
        
        elif action == 'info':
            url = message.get('url')
            logging.info(f"Getting info for: {url}")
            info = get_video_info(url)
            send_message({'type': 'info', **info})
        
        elif action == 'download':
            url = message.get('url')
            quality = message.get('quality', 'best')
            folder = message.get('folder', DOWNLOADS_FOLDER)
            page_url = message.get('pageUrl')  # Original page URL for referer
            
            logging.info(f"Download request: {url} at {quality}, page: {page_url}")
            
            # Run download in thread to not block message receiving
            thread = threading.Thread(
                target=download_video,
                args=(url, quality, folder, page_url),
                daemon=True
            )
            thread.start()
            logging.info("Download thread started")
        
        elif action == 'cancel':
            logging.info("Cancel requested")
            download_cancelled = True
            if active_download_process:
                try:
                    active_download_process.terminate()
                    logging.info("Sent terminate signal to download process")
                except Exception as e:
                    logging.error(f"Error terminating process: {e}")

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        logging.error(f"Fatal error: {e}")
        raise
