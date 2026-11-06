# 🎵 Ghost Media Engine (FFmpeg & Python API)

A production-grade, high-performance media download and processing API specifically designed for WhatsApp bot commands like `.song`, `.video`, `.play`, and `.ytmp4`.

Powered by **Python 3**, **FFmpeg (v8.1)**, and **yt-dlp**, with integrated disk caching, automatic 1-hour cache purges, and byte-range streaming.

---

## 🚀 Quick Start

### 1. Launch the Server
- **Option A (1-Click on Windows):** Double click [`start.bat`](file:///d:/dataa/Bots/Ghost/api/start.bat)
- **Option B (Terminal):**
  ```bash
  python app.py
  ```
The server will start on: **`http://127.0.0.1:5050`**

### 2. Live Web Dashboard & Tester
Open your browser to:
👉 **[http://127.0.0.1:5050](http://127.0.0.1:5050)**
- Check real-time FFmpeg & yt-dlp health status
- Test `.song` (MP3) and `.video` (MP4) downloads directly from your browser!

---

## 🔌 API Endpoints

### 1. Download Song (`.song`)
* **Endpoint:** `GET /api/song?q=<song_name_or_url>` (or `POST /api/song`)
* **Example:** `http://127.0.0.1:5050/api/song?q=faded%20alan%20walker`
* **Response:**
```json
{
  "success": true,
  "type": "audio",
  "format": "mp3",
  "title": "Alan Walker - Faded",
  "author": "Alan Walker",
  "duration": 213,
  "thumbnail": "https://i.ytimg.com/vi/60ItHLz5WEA/hqdefault.jpg",
  "filesize": 5106206,
  "cached": false,
  "download_url": "http://127.0.0.1:5050/api/download/60ItHLz5WEA_Alan%20Walker%20-%20Faded.mp3"
}
```

---

### 2. Download Video (`.video`)
* **Endpoint:** `GET /api/video?q=<video_name_or_url>` (or `POST /api/video`)
* **Example:** `http://127.0.0.1:5050/api/video?q=believer%20imagine%20dragons`
* **Response:**
```json
{
  "success": true,
  "type": "video",
  "format": "mp4",
  "title": "Imagine Dragons - Believer",
  "author": "Imagine Dragons",
  "duration": 217,
  "thumbnail": "https://...",
  "filesize": 14201940,
  "cached": false,
  "download_url": "http://127.0.0.1:5050/api/download/..."
}
```

---

### 3. Download Spotify Track (`.spotify`)
* **Endpoint:** `GET /api/spotify?q=<spotify_url_or_song_title>` (or `POST /api/spotify`)
* **Examples:**
  - `http://127.0.0.1:5050/api/spotify?q=https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT`
  - `http://127.0.0.1:5050/api/spotify?q=faded%20alan%20walker`
* **Features:** Official Spotify artist & album metadata, high-resolution Spotify album art (640x640), 320kbps MP3 audio, and local disk caching.
* **Response:**
```json
{
  "success": true,
  "type": "audio",
  "format": "mp3",
  "platform": "spotify",
  "title": "Never Gonna Give You Up",
  "author": "Rick Astley",
  "album": "Whenever You Need Somebody",
  "thumbnail": "https://i.scdn.co/image/ab67616d0000b273baf89eb11ec7c657805d2da0",
  "spotify_url": "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
  "filename": "spotify_4cOdK2wGLETKBW3PvgPWqT_Never_Gonna_Give_You_Up.mp3",
  "filesize": 7820124,
  "cached": false,
  "download_url": "http://127.0.0.1:5050/api/download/spotify_4cOdK2wGLETKBW3PvgPWqT_Never_Gonna_Give_You_Up.mp3"
}
```

---

### 4. Download Slowed + Reverb (`.slowed`)
* **Endpoint:** `GET /api/slowed?q=<song_name_or_url>` (or `POST /api/slowed`)
* **Example:** `http://127.0.0.1:5050/api/slowed?q=starboy%20the%20weeknd`
* **Features:** Pitch-shifted tempo slowing (`asetrate=44100*0.88`) with dreamy atmospheric reverb (`aecho=0.8:0.88:60:0.4`) via FFmpeg.
* **Response:**
```json
{
  "success": true,
  "type": "audio",
  "format": "mp3",
  "style": "slowed_reverb",
  "title": "Starboy (Slowed + Reverb)",
  "author": "The Weeknd",
  "duration": 260,
  "thumbnail": "https://...",
  "filename": "slowed_starboy_The_Weeknd.mp3",
  "filesize": 6214300,
  "cached": false,
  "download_url": "http://127.0.0.1:5050/api/download/slowed_starboy_The_Weeknd.mp3"
}
```

---

### 5. Drop-in Bot Route (`POST /api/v1/download`)
100% compatible with existing `fetchMediaFromApi(url, format)`:
* **Headers:** `Content-Type: application/json`
* **Body Formats:**
  - Standard audio: `{"url": "...", "format": "audio"}`
  - Spotify audio: `{"url": "...", "format": "spotify"}`
  - Slowed + Reverb: `{"url": "...", "format": "slowed"}`
  - Video MP4: `{"url": "...", "format": "video"}`
* **Body:**
```json
{
  "url": "Believer Imagine Dragons",
  "format": "audio" 
}
```
*(Accepts both search queries and direct links: YouTube, Shorts, TikTok, Instagram, etc.)*

* **Response:**
```json
{
  "success": true,
  "platform": "youtube",
  "data": {
    "title": "Imagine Dragons - Believer",
    "thumbnail": "https://...",
    "author": { "name": "Imagine Dragons" },
    "duration": 205,
    "media": {
      "download_url": "http://127.0.0.1:5050/api/download/...",
      "type": "audio",
      "format": "mp3",
      "quality": "best"
    }
  }
}
```

---

### 4. Direct Streaming / File Endpoint
* **Endpoint:** `GET /api/download/<filename>`
* Supports **HTTP 206 Partial Content (Range requests)** so WhatsApp bots (Baileys) and mobile devices can stream or buffer directly without download timeout.

---

### 5. Health Check
* **Endpoint:** `GET /health`
```json
{
  "status": "healthy",
  "service": "Ghost Media Engine",
  "engine": "FFmpeg + yt-dlp",
  "ffmpeg": true,
  "ytdlp_version": "2026.10.26",
  "free_disk_gb": 61.03,
  "uptime_seconds": 120
}
```

---

## 🤖 WhatsApp Bot Integration

To connect your bot (`Zoxer Md` or `Ghost Md`) to this API:

1. Open [`d:/dataa/Bots/Ghost/Zoxer Md/.env`](file:///d:/dataa/Bots/Ghost/Zoxer%20Md/.env)
2. Set:
```env
ZOXER_MEDIA_API_URL="http://127.0.0.1:5050"
```
*(If the bot is running on the same machine/VPS, `http://127.0.0.1:5050` connects locally with zero latency).*

Now, whenever a user types:
- `.song <song name or link>`
- `.video <video name or link>`

The bot will instantly fetch the downloaded MP3/MP4 from your local FFmpeg engine!
