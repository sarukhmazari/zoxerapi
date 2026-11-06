import os
import re
import glob
import time
import shutil
import logging
import subprocess
from urllib.parse import quote
from typing import Dict, Any, Optional
import requests
import yt_dlp

logger = logging.getLogger("MediaDownloader")

DOWNLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

def sanitize_filename(name: str) -> str:
    """Sanitize string to be safe for filenames across OS and WhatsApp."""
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:80] if clean else "media"

def find_cookies_path() -> Optional[str]:
    """Find cookies.txt if available for YouTube authentication."""
    candidates = [
        os.environ.get("YOUTUBE_COOKIES_PATH"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "cookies.txt"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cookies.txt"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Zoxer Md", "cookies.txt"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Ghost Md", "cookies.txt"),
    ]
    for c in candidates:
        if c and os.path.isfile(c) and os.path.getsize(c) > 20:
            return os.path.abspath(c)
    return None

class MediaDownloader:
    def __init__(self, download_dir: str = DOWNLOADS_DIR):
        self.download_dir = download_dir
        os.makedirs(self.download_dir, exist_ok=True)

    def _get_base_opts(self) -> Dict[str, Any]:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "geo_bypass": True,
            "cachedir": False,
            "retries": 3,
            "fragment_retries": 3,
            "extractor_args": {
                "youtube": {
                    "player_client": ["tv_samsung", "visionos", "web"]
                }
            }
        }
        cookies = find_cookies_path()
        if cookies:
            logger.info(f"Using cookies from: {cookies}")
            opts["cookiefile"] = cookies
        return opts

    def _safe_download(self, opts: Dict[str, Any], url: str) -> None:
        """Download with automatic fallback without cookies if session cookies fail."""
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
        except Exception as e:
            if "cookiefile" in opts:
                logger.warning(f"Download with cookies failed ({e}). Retrying without cookies...")
                retry_opts = dict(opts)
                retry_opts.pop("cookiefile", None)
                with yt_dlp.YoutubeDL(retry_opts) as ydl:
                    ydl.download([url])
            else:
                raise

    def search_or_resolve(self, query_or_url: str) -> Dict[str, Any]:
        """Resolve a direct URL or search query using yt-dlp."""
        is_url = bool(re.match(r"^https?://", query_or_url.strip(), re.IGNORECASE))
        target = query_or_url.strip() if is_url else f"ytsearch1:{query_or_url.strip()}"

        opts = self._get_base_opts()
        opts["extract_flat"] = "in_playlist"

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(target, download=False)
        except Exception as e:
            if "cookiefile" in opts:
                logger.warning(f"Resolve with cookies failed ({e}). Retrying without cookies...")
                retry_opts = dict(opts)
                retry_opts.pop("cookiefile", None)
                with yt_dlp.YoutubeDL(retry_opts) as ydl:
                    info = ydl.extract_info(target, download=False)
            else:
                raise

        if not info:
            raise ValueError("No media found for the given query.")

        if "entries" in info and info["entries"]:
            entry = info["entries"][0]
        else:
            entry = info

        video_id = entry.get("id")
        title = entry.get("title") or "Unknown Title"
        author = entry.get("uploader") or entry.get("channel") or "Unknown Artist"
        duration = entry.get("duration") or 0
        webpage_url = entry.get("webpage_url") or (f"https://www.youtube.com/watch?v={video_id}" if video_id else query_or_url)
        thumbnail = entry.get("thumbnail") or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else None

        return {
            "id": video_id,
            "title": title,
            "author": author,
            "duration": duration,
            "url": webpage_url,
            "thumbnail": thumbnail,
            "is_url": is_url
        }

    def download_audio(self, query_or_url: str) -> Dict[str, Any]:
        """Download and convert audio to high-quality MP3 using FFmpeg."""
        meta = self.search_or_resolve(query_or_url)
        video_id = meta["id"] or str(int(time.time()))
        safe_title = sanitize_filename(meta["title"])
        filename = f"{video_id}_{safe_title}.mp3"
        target_path = os.path.join(self.download_dir, filename)

        # Check if already cached on disk
        if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
            logger.info(f"Using cached audio: {filename}")
            return {
                **meta,
                "file_path": target_path,
                "filename": filename,
                "format": "mp3",
                "type": "audio",
                "filesize": os.path.getsize(target_path),
                "cached": True
            }

        outtmpl = os.path.join(self.download_dir, f"{video_id}_{safe_title}.%(ext)s")
        opts = self._get_base_opts()
        opts.update({
            "format": "ba/b",
            "outtmpl": outtmpl,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                },
                {
                    "key": "FFmpegMetadata",
                    "add_metadata": True,
                }
            ],
            # 80MB max audio limit
            "max_filesize": 80 * 1024 * 1024,
        })

        self._safe_download(opts, meta["url"])

        if not os.path.exists(target_path):
            # Fallback search for any mp3 matching the video_id
            matched = glob.glob(os.path.join(self.download_dir, f"{video_id}_*.mp3"))
            if matched:
                target_path = matched[0]
                filename = os.path.basename(target_path)
            else:
                raise FileNotFoundError(f"Audio file failed to generate: {filename}")

        return {
            **meta,
            "file_path": target_path,
            "filename": filename,
            "format": "mp3",
            "type": "audio",
            "filesize": os.path.getsize(target_path),
            "cached": False
        }

    def download_video(self, query_or_url: str, max_height: int = 720) -> Dict[str, Any]:
        """Download and merge best video + audio into MP4 using FFmpeg."""
        meta = self.search_or_resolve(query_or_url)
        video_id = meta["id"] or str(int(time.time()))
        safe_title = sanitize_filename(meta["title"])
        filename = f"{video_id}_{safe_title}.mp4"
        target_path = os.path.join(self.download_dir, filename)

        # Check if already cached on disk
        if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
            logger.info(f"Using cached video: {filename}")
            return {
                **meta,
                "file_path": target_path,
                "filename": filename,
                "format": "mp4",
                "type": "video",
                "filesize": os.path.getsize(target_path),
                "cached": True
            }

        outtmpl = os.path.join(self.download_dir, f"{video_id}_{safe_title}.%(ext)s")
        opts = self._get_base_opts()
        opts.update({
            "format": f"bestvideo[height<={max_height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={max_height}]+bestaudio/best[height<={max_height}]/best",
            "outtmpl": outtmpl,
            "merge_output_format": "mp4",
            # 100MB max video limit for WhatsApp compatibility
            "max_filesize": 100 * 1024 * 1024,
        })

        self._safe_download(opts, meta["url"])

        if not os.path.exists(target_path):
            matched = glob.glob(os.path.join(self.download_dir, f"{video_id}_*.mp4"))
            if matched:
                target_path = matched[0]
                filename = os.path.basename(target_path)
            else:
                raise FileNotFoundError(f"Video file failed to generate: {filename}")

        return {
            **meta,
            "file_path": target_path,
            "filename": filename,
            "format": "mp4",
            "type": "video",
            "filesize": os.path.getsize(target_path),
            "cached": False
        }

    def resolve_spotify_meta(self, query_or_url: str) -> Dict[str, Any]:
        """Extract track title, artist, and HD album art from Spotify or query."""
        clean_input = query_or_url.strip()
        is_spotify_url = bool(re.search(r"open\.spotify\.com/(intl-[a-z]+/)?track/([a-zA-Z0-9]+)", clean_input, re.IGNORECASE))

        if is_spotify_url:
            track_id_match = re.search(r"track/([a-zA-Z0-9]+)", clean_input)
            track_id = track_id_match.group(1) if track_id_match else f"sp_{int(time.time())}"
            title = None
            author = "Spotify Artist"
            album = "Spotify Single"
            thumbnail = None

            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            try:
                # 1. Spotify oEmbed
                oembed_url = f"https://open.spotify.com/oembed?url=https://open.spotify.com/track/{track_id}"
                resp = requests.get(oembed_url, headers=headers, timeout=8)
                if resp.status_code == 200:
                    data = resp.json()
                    title = data.get("title")
                    thumbnail = data.get("thumbnail_url")
            except Exception as e:
                logger.warning(f"Spotify oEmbed fetch failed: {e}")

            try:
                # 2. Spotify Open Graph meta tags for artist and HD cover
                track_url = f"https://open.spotify.com/track/{track_id}"
                page_resp = requests.get(track_url, headers=headers, timeout=8)
                if page_resp.status_code == 200:
                    text = page_resp.text
                    og_title = re.search(r'<meta property="og:title" content="([^"]+)"', text)
                    if og_title and not title:
                        title = og_title.group(1)
                    og_img = re.search(r'<meta property="og:image" content="([^"]+)"', text)
                    if og_img:
                        thumbnail = og_img.group(1)
                    og_desc = re.search(r'<meta property="og:description" content="([^"]+)"', text)
                    if og_desc:
                        parts = [p.strip() for p in re.split(r"[·•\-]", og_desc.group(1))]
                        if len(parts) >= 1 and parts[0]:
                            author = parts[0]
                        if len(parts) >= 2 and parts[1]:
                            album = parts[1]
            except Exception as e:
                logger.warning(f"Spotify page scrape fallback error: {e}")

            if not title:
                title = f"Spotify Track {track_id}"

            search_query = f"{title} {author}".strip()
            return {
                "id": track_id,
                "title": title,
                "author": author,
                "album": album,
                "thumbnail": thumbnail,
                "spotify_url": f"https://open.spotify.com/track/{track_id}",
                "search_query": search_query,
                "is_spotify_url": True
            }
        else:
            meta = self.search_or_resolve(clean_input)
            return {
                "id": meta["id"],
                "title": meta["title"],
                "author": meta["author"],
                "album": "Single",
                "thumbnail": meta["thumbnail"],
                "spotify_url": f"https://open.spotify.com/search/{quote(clean_input)}",
                "search_query": clean_input,
                "is_spotify_url": False
            }

    def download_spotify(self, query_or_url: str) -> Dict[str, Any]:
        """Download high quality MP3 with Spotify metadata and cover art."""
        sp_meta = self.resolve_spotify_meta(query_or_url)
        track_id = sp_meta["id"] or str(int(time.time()))
        safe_title = sanitize_filename(sp_meta["title"])
        filename = f"spotify_{track_id}_{safe_title}.mp3"
        target_path = os.path.join(self.download_dir, filename)

        if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
            logger.info(f"Using cached Spotify track: {filename}")
            return {
                **sp_meta,
                "file_path": target_path,
                "filename": filename,
                "format": "mp3",
                "type": "audio",
                "platform": "spotify",
                "filesize": os.path.getsize(target_path),
                "cached": True
            }

        audio_meta = self.search_or_resolve(sp_meta["search_query"])
        outtmpl = os.path.join(self.download_dir, f"spotify_{track_id}_{safe_title}.%(ext)s")
        opts = self._get_base_opts()
        opts.update({
            "format": "ba/b",
            "outtmpl": outtmpl,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                },
                {
                    "key": "FFmpegMetadata",
                    "add_metadata": True,
                }
            ],
            "max_filesize": 80 * 1024 * 1024,
        })

        self._safe_download(opts, audio_meta["url"])

        if not os.path.exists(target_path):
            matched = glob.glob(os.path.join(self.download_dir, f"spotify_{track_id}_*.mp3"))
            if matched:
                target_path = matched[0]
                filename = os.path.basename(target_path)
            else:
                raise FileNotFoundError(f"Spotify audio failed to generate: {filename}")

        return {
            **sp_meta,
            "duration": audio_meta.get("duration", 0),
            "file_path": target_path,
            "filename": filename,
            "format": "mp3",
            "type": "audio",
            "platform": "spotify",
            "filesize": os.path.getsize(target_path),
            "cached": False
        }

    def download_slowed(self, query_or_url: str) -> Dict[str, Any]:
        """Download audio and process with FFmpeg slowed + dreamy reverb filter."""
        clean_input = query_or_url.strip()
        is_spotify = bool(re.search(r"open\.spotify\.com/(intl-[a-z]+/)?track/([a-zA-Z0-9]+)", clean_input, re.IGNORECASE))
        
        if is_spotify:
            base_meta = self.resolve_spotify_meta(clean_input)
            meta = self.search_or_resolve(base_meta["search_query"])
            meta["title"] = base_meta["title"]
            meta["author"] = base_meta["author"]
            if base_meta.get("thumbnail"):
                meta["thumbnail"] = base_meta["thumbnail"]
        else:
            meta = self.search_or_resolve(clean_input)

        video_id = meta["id"] or str(int(time.time()))
        safe_title = sanitize_filename(meta["title"])
        filename = f"slowed_{video_id}_{safe_title}.mp3"
        slowed_path = os.path.join(self.download_dir, filename)

        if os.path.exists(slowed_path) and os.path.getsize(slowed_path) > 1024:
            logger.info(f"Using cached slowed audio: {filename}")
            return {
                **meta,
                "title": f"{meta['title']} (Slowed + Reverb)",
                "duration": round(meta.get("duration", 0) / 0.88) if meta.get("duration") else 0,
                "file_path": slowed_path,
                "filename": filename,
                "format": "mp3",
                "type": "audio",
                "style": "slowed_reverb",
                "filesize": os.path.getsize(slowed_path),
                "cached": True
            }

        # Obtain base MP3
        base_res = self.download_audio(meta["url"] if meta.get("url") else query_or_url)
        source_path = base_res["file_path"]

        # Run FFmpeg slowed + reverb filter
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-i", source_path,
            "-af", "asetrate=44100*0.88,aresample=44100,aecho=0.8:0.88:60:0.4",
            "-b:a", "192k",
            slowed_path
        ]
        proc = subprocess.run(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0 or not os.path.exists(slowed_path):
            error_msg = proc.stderr.decode('utf-8', errors='ignore') if proc.stderr else 'FFmpeg filter failed'
            raise RuntimeError(f"FFmpeg Slowed+Reverb processing failed: {error_msg}")

        slowed_duration = round(meta.get("duration", 0) / 0.88) if meta.get("duration") else 0
        return {
            **meta,
            "title": f"{meta['title']} (Slowed + Reverb)",
            "duration": slowed_duration,
            "file_path": slowed_path,
            "filename": filename,
            "format": "mp3",
            "type": "audio",
            "style": "slowed_reverb",
            "filesize": os.path.getsize(slowed_path),
            "cached": False
        }

    def cleanup_old_files(self, max_age_seconds: int = 3600) -> int:
        """Clean up downloads older than max_age_seconds (default 1 hour)."""
        now = time.time()
        removed = 0
        for fname in os.listdir(self.download_dir):
            fpath = os.path.join(self.download_dir, fname)
            if os.path.isfile(fpath):
                try:
                    if now - os.path.getmtime(fpath) > max_age_seconds:
                        os.remove(fpath)
                        removed += 1
                except Exception as e:
                    logger.warning(f"Failed to remove {fpath}: {e}")
        return removed
