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

# Set up logging to file for debugging
LOG_FILE = os.path.join(os.path.expanduser("~"), "viddownloader_debug.log")
logging.basicConfig(
    filename=LOG_FILE,
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Get the downloads folder
DOWNLOADS_FOLDER = os.path.join(os.path.expanduser("~"), "Downloads")

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
    """Send a message to the extension"""
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

def download_video(url, quality='best', output_folder=None):
    """Download video using yt-dlp"""
    logging.info(f"Starting download: {url} at {quality}")
    
    if output_folder is None:
        output_folder = DOWNLOADS_FOLDER
    
    output_template = os.path.join(output_folder, '%(title)s.%(ext)s')
    
    cmd = [
        'yt-dlp',
        '--no-playlist',
        '--newline',
        '--progress',
        '-o', output_template
    ]
    
    if quality == 'best':
        cmd.extend(['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'])
    elif quality == 'worst':
        cmd.extend(['-f', 'worstvideo+worstaudio/worst'])
    else:
        height = quality.replace('p', '')
        cmd.extend(['-f', f'bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/best[height<={height}][ext=mp4]/best'])
    
    cmd.append(url)
    
    logging.info(f"Running command: {' '.join(cmd)}")
    
    try:
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            creationflags=creationflags
        )
        
        filename = None
        
        for line in process.stdout:
            line = line.strip()
            logging.debug(f"yt-dlp output: {line}")
            
            if '[download]' in line:
                match = re.search(r'(\d+\.?\d*)%', line)
                if match:
                    progress = float(match.group(1))
                    send_message({
                        'type': 'progress',
                        'progress': progress,
                        'status': 'downloading'
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
        
        process.wait()
        
        logging.info(f"Download finished with return code: {process.returncode}")
        
        if process.returncode == 0:
            send_message({
                'type': 'complete',
                'success': True,
                'filename': filename or 'Download complete',
                'folder': output_folder
            })
        else:
            send_message({
                'type': 'complete',
                'success': False,
                'error': 'Download failed'
            })
            
    except Exception as e:
        logging.error(f"Download error: {e}")
        send_message({
            'type': 'complete',
            'success': False,
            'error': str(e)
        })

def main():
    """Main loop - handle messages from extension"""
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
            
            logging.info(f"Download request: {url} at {quality}")
            
            # Run download in thread to not block message receiving
            thread = threading.Thread(
                target=download_video,
                args=(url, quality, folder),
                daemon=True
            )
            thread.start()
            logging.info("Download thread started")
        
        elif action == 'cancel':
            logging.info("Cancel requested (not implemented)")
            pass

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        logging.error(f"Fatal error: {e}")
        raise
