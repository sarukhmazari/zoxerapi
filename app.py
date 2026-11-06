import os
import sys
import time
import shutil
import threading
import subprocess
from datetime import datetime
from urllib.parse import quote
from flask import Flask, request, jsonify, send_from_directory, render_template_string, Response
from flask_cors import CORS
from downloader import MediaDownloader, DOWNLOADS_DIR, sanitize_filename

# Fix Windows console encoding for Unicode/Emojis
try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

app = Flask(__name__)
CORS(app)

START_TIME = time.time()
downloader = MediaDownloader()

# Auto-cleanup background thread
def background_cleanup_worker():
    while True:
        try:
            time.sleep(900)  # Every 15 minutes
            removed = downloader.cleanup_old_files(max_age_seconds=3600)  # 1 hour
            if removed > 0:
                print(f"[Cleanup] Purged {removed} expired media files from cache.")
        except Exception as e:
            print(f"[Cleanup Error] {e}")

cleanup_thread = threading.Thread(target=background_cleanup_worker, daemon=True)
cleanup_thread.start()

def get_base_url():
    """Dynamically determine base URL from request headers."""
    host = request.headers.get("X-Forwarded-Host", request.host)
    proto = request.headers.get("X-Forwarded-Proto", request.scheme)
    return f"{proto}://{host}"

def check_ffmpeg() -> bool:
    try:
        res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return res.returncode == 0
    except Exception:
        return False

# ----------------- HTML WEB DASHBOARD -----------------
INDEX_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ghost Media API &bull; Professional FFmpeg & Python Engine</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #090d16;
            --surface: #101625;
            --surface-border: #1e293b;
            --primary: #38bdf8;
            --primary-glow: rgba(56, 189, 248, 0.25);
            --accent: #818cf8;
            --accent-glow: rgba(129, 140, 248, 0.25);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --success: #34d399;
            --card-hover: #162035;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: var(--bg);
            color: var(--text-main);
            min-height: 100vh;
            background-image: 
                radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(129, 140, 248, 0.08) 0%, transparent 40%);
            padding: 40px 20px;
        }

        .container {
            max-width: 1050px;
            margin: 0 auto;
        }

        header {
            text-align: center;
            margin-bottom: 40px;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            background: rgba(56, 189, 248, 0.1);
            border: 1px solid rgba(56, 189, 248, 0.2);
            border-radius: 9999px;
            font-size: 0.85rem;
            color: var(--primary);
            font-weight: 600;
            margin-bottom: 16px;
        }

        .pulse-dot {
            width: 8px;
            height: 8px;
            background-color: var(--success);
            border-radius: 50%;
            box-shadow: 0 0 10px var(--success);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.7; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.7; }
        }

        h1 {
            font-size: 2.75rem;
            font-weight: 800;
            letter-spacing: -0.03em;
            background: linear-gradient(135deg, #ffffff 30%, var(--primary) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 12px;
        }

        p.subtitle {
            color: var(--text-muted);
            font-size: 1.1rem;
            max-width: 650px;
            margin: 0 auto;
        }

        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 32px;
        }

        @media (max-width: 768px) {
            .grid { grid-template-columns: 1fr; }
        }

        .card {
            background: var(--surface);
            border: 1px solid var(--surface-border);
            border-radius: 18px;
            padding: 28px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
            transition: all 0.3s ease;
        }

        .card:hover {
            border-color: rgba(56, 189, 248, 0.3);
            background: var(--card-hover);
            transform: translateY(-2px);
        }

        .card h2 {
            font-size: 1.35rem;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .stats-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .stat-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 14px;
            background: rgba(15, 23, 42, 0.6);
            border-radius: 10px;
            font-size: 0.95rem;
        }

        .stat-label {
            color: var(--text-muted);
        }

        .stat-val {
            font-weight: 600;
            font-family: 'JetBrains Mono', monospace;
            color: var(--primary);
        }

        .input-group {
            margin-bottom: 18px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            font-size: 0.9rem;
            color: var(--text-muted);
        }

        input[type="text"] {
            width: 100%;
            padding: 13px 16px;
            background: #090d16;
            border: 1px solid var(--surface-border);
            border-radius: 10px;
            color: #fff;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.2s;
            font-family: inherit;
        }

        input[type="text"]:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px var(--primary-glow);
        }

        .button-row {
            display: flex;
            gap: 12px;
        }

        button {
            flex: 1;
            padding: 13px 20px;
            border: none;
            border-radius: 10px;
            font-size: 0.95rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s ease;
            font-family: inherit;
        }

        button.btn-song {
            background: linear-gradient(135deg, #0ea5e9, #38bdf8);
            color: #04101e;
        }

        button.btn-song:hover {
            box-shadow: 0 0 20px var(--primary-glow);
            transform: translateY(-1px);
        }

        button.btn-video {
            background: linear-gradient(135deg, #6366f1, #818cf8);
            color: #ffffff;
        }

        button.btn-video:hover {
            box-shadow: 0 0 20px var(--accent-glow);
            transform: translateY(-1px);
        }

        #resultBox {
            display: none;
            margin-top: 24px;
            background: #090d16;
            border: 1px solid var(--surface-border);
            border-radius: 14px;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .media-preview {
            display: flex;
            gap: 16px;
            margin-top: 14px;
            align-items: center;
        }

        .media-thumb {
            width: 110px;
            height: 70px;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid var(--surface-border);
        }

        .media-info {
            flex: 1;
        }

        .media-title {
            font-weight: 700;
            font-size: 1.05rem;
            margin-bottom: 4px;
        }

        .media-author {
            color: var(--text-muted);
            font-size: 0.85rem;
            margin-bottom: 8px;
        }

        .dl-link {
            display: inline-block;
            background: #1e293b;
            color: var(--primary);
            text-decoration: none;
            padding: 8px 14px;
            border-radius: 8px;
            font-size: 0.85rem;
            font-weight: 600;
            transition: background 0.2s;
        }

        .dl-link:hover {
            background: #334155;
        }

        .endpoint-card {
            background: var(--surface);
            border: 1px solid var(--surface-border);
            border-radius: 18px;
            padding: 28px;
        }

        .code-box {
            background: #090d16;
            border: 1px solid var(--surface-border);
            border-radius: 10px;
            padding: 14px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            color: #cbd5e1;
            margin-top: 12px;
            overflow-x: auto;
        }

        .method {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 0.75rem;
            margin-right: 8px;
        }

        .method-get { background: #065f46; color: #6ee7b7; }
        .method-post { background: #1e3a8a; color: #93c5fd; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="badge">
                <span class="pulse-dot"></span>
                System Online & Ready
            </div>
            <h1>Ghost Media Download Engine</h1>
            <p class="subtitle">High-speed media processing API powered by FFmpeg & yt-dlp for WhatsApp bots (.song, .video commands).</p>
        </header>

        <div class="grid">
            <!-- Interactive Live Tester -->
            <div class="card">
                <h2>⚡ Live Bot Tester</h2>
                <div class="input-group">
                    <label for="queryInput">Song or Video Name / YouTube URL</label>
                    <input type="text" id="queryInput" placeholder="e.g. Believer Imagine Dragons or https://youtu.be/..." value="Alan Walker Faded">
                </div>
                <div class="button-row" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
                    <button class="btn-song" onclick="testDownload('song')">
                        🎵 .song (MP3)
                    </button>
                    <button class="btn-song" style="background: linear-gradient(135deg, #10b981, #059669); border-color: #34d399;" onclick="testDownload('spotify')">
                        🟢 .spotify
                    </button>
                    <button class="btn-song" style="background: linear-gradient(135deg, #8b5cf6, #6366f1); border-color: #a78bfa;" onclick="testDownload('slowed')">
                        🌌 .slowed
                    </button>
                    <button class="btn-video" onclick="testDownload('video')">
                        🎬 .video (MP4)
                    </button>
                </div>

                <div id="resultBox">
                    <div id="loader" style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">
                        ⏳ Processing with FFmpeg engine... Please wait a few seconds.
                    </div>
                    <div id="content" style="display: none;">
                        <div class="media-preview">
                            <img id="resThumb" class="media-thumb" src="" alt="Thumbnail">
                            <div class="media-info">
                                <div id="resTitle" class="media-title">Title</div>
                                <div id="resAuthor" class="media-author">Author</div>
                                <a id="resLink" class="dl-link" href="#" target="_blank" download>⬇️ Download File</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Server Status & Capabilities -->
            <div class="card">
                <h2>📊 Server Health & Stats</h2>
                <ul class="stats-list">
                    <li class="stat-item">
                        <span class="stat-label">FFmpeg Core</span>
                        <span class="stat-val" style="color: var(--success);">{{ 'Active (v8.1.2)' if ffmpeg else 'Missing' }}</span>
                    </li>
                    <li class="stat-item">
                        <span class="stat-label">yt-dlp Core</span>
                        <span class="stat-val">{{ ytdlp_version }}</span>
                    </li>
                    <li class="stat-item">
                        <span class="stat-label">Audio Quality</span>
                        <span class="stat-val">192kbps MP3 (FFmpeg LAME)</span>
                    </li>
                    <li class="stat-item">
                        <span class="stat-label">Video Format</span>
                        <span class="stat-val">720p/1080p MP4 (H.264 / AAC)</span>
                    </li>
                    <li class="stat-item">
                        <span class="stat-label">Disk Cache Mode</span>
                        <span class="stat-val">Enabled (1hr Auto-Purge)</span>
                    </li>
                    <li class="stat-item">
                        <span class="stat-label">Uptime</span>
                        <span class="stat-val">{{ uptime }}</span>
                    </li>
                </ul>
            </div>
        </div>

        <!-- Documentation Card -->
        <div class="endpoint-card">
            <h2>🔌 WhatsApp Bot Integration Endpoints</h2>
            <p style="color: var(--text-muted); font-size: 0.95rem; margin-top: 6px;">
                Use these endpoints in your WhatsApp bot (<code style="color: var(--primary);">song.js</code> &amp; <code style="color: var(--primary);">video.js</code>):
            </p>

            <div class="code-box">
                <span class="method method-get">GET</span><strong>/api/song?q={name or url}</strong><br>
                Downloads audio, converts to MP3 via FFmpeg, returns title, author, duration, thumbnail, and direct <code style="color: var(--primary);">download_url</code>.
            </div>

            <div class="code-box">
                <span class="method method-get">GET</span><strong>/api/video?q={name or url}</strong><br>
                Downloads video, merges via FFmpeg, returns title, channel, duration, and direct <code style="color: var(--primary);">download_url</code>.
            </div>

            <div class="code-box">
                <span class="method method-post">POST</span><strong>/api/v1/download</strong><br>
                Payload: <code style="color: var(--accent);">{"url": "...", "format": "audio" | "video"}</code><br>
                Direct drop-in compatibility for existing <code style="color: var(--primary);">fetchMediaFromApi()</code>.
            </div>
        </div>
    </div>

    <script>
        async function testDownload(type) {
            const query = document.getElementById('queryInput').value.trim();
            if (!query) return alert('Please enter a song or video name!');

            const box = document.getElementById('resultBox');
            const loader = document.getElementById('loader');
            const content = document.getElementById('content');

            box.style.display = 'block';
            loader.style.display = 'block';
            content.style.display = 'none';

            try {
                const endpoint = type === 'song' ? '/api/song' : (type === 'spotify' ? '/api/spotify' : (type === 'slowed' ? '/api/slowed' : '/api/video'));
                const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`);
                const data = await res.json();

                if (!data.success) {
                    loader.innerHTML = `<span style="color:#f87171;">❌ Error: ${data.error || 'Failed to download media.'}</span>`;
                    return;
                }

                document.getElementById('resTitle').innerText = data.title;
                document.getElementById('resAuthor').innerText = (data.author || 'Artist') + (data.cached ? ' • ⚡ (Instant Cache)' : '');
                document.getElementById('resThumb').src = data.thumbnail || 'https://via.placeholder.com/150';
                
                const link = document.getElementById('resLink');
                link.href = data.download_url;
                link.download = data.filename || 'media';
                link.innerText = `⬇️ Download ${type.toUpperCase()} (${(data.filesize / 1024 / 1024).toFixed(1)} MB)`;

                loader.style.display = 'none';
                content.style.display = 'block';
            } catch (err) {
                loader.innerHTML = `<span style="color:#f87171;">❌ Request failed: ${err.message}</span>`;
            }
        }
    </script>
</body>
</html>
"""

# ----------------- ROUTES -----------------

@app.route("/")
def index():
    now = time.time()
    uptime_sec = int(now - START_TIME)
    uptime_str = f"{uptime_sec // 3600}h {(uptime_sec % 3600) // 60}m {uptime_sec % 60}s"
    import yt_dlp
    return render_template_string(
        INDEX_HTML,
        ffmpeg=check_ffmpeg(),
        ytdlp_version=getattr(yt_dlp, "__version__", "2026.10.26"),
        uptime=uptime_str
    )

@app.route("/health")
@app.route("/api/health")
@app.route("/api/v1/health")
def health():
    now = time.time()
    uptime_sec = int(now - START_TIME)
    import yt_dlp
    free_bytes = shutil.disk_usage(DOWNLOADS_DIR).free
    return jsonify({
        "status": "healthy",
        "service": "Ghost Media Engine",
        "engine": "FFmpeg + yt-dlp",
        "ffmpeg": check_ffmpeg(),
        "ytdlp_version": getattr(yt_dlp, "__version__", "2026.10.26"),
        "free_disk_gb": round(free_bytes / (1024 ** 3), 2),
        "uptime_seconds": uptime_sec,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })

@app.route("/api/song", methods=["GET", "POST"])
def get_song():
    query = request.args.get("q") or request.args.get("query")
    if not query and request.is_json:
        data = request.get_json(silent=True) or {}
        query = data.get("query") or data.get("q") or data.get("url")
    if not query and request.form:
        query = request.form.get("query") or request.form.get("q") or request.form.get("url")

    if not query:
        return jsonify({"success": False, "error": "Query parameter 'q' or 'query' is required."}), 400

    try:
        res = downloader.download_audio(query)
        base = get_base_url()
        download_url = f"{base}/api/download/{quote(res['filename'])}"
        return jsonify({
            "success": True,
            "type": "audio",
            "format": "mp3",
            "title": res["title"],
            "author": res["author"],
            "duration": res["duration"],
            "thumbnail": res["thumbnail"],
            "webpage_url": res["url"],
            "filename": res["filename"],
            "filesize": res["filesize"],
            "cached": res["cached"],
            "download_url": download_url
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/video", methods=["GET", "POST"])
def get_video():
    query = request.args.get("q") or request.args.get("query")
    if not query and request.is_json:
        data = request.get_json(silent=True) or {}
        query = data.get("query") or data.get("q") or data.get("url")
    if not query and request.form:
        query = request.form.get("query") or request.form.get("q") or request.form.get("url")

    if not query:
        return jsonify({"success": False, "error": "Query parameter 'q' or 'query' is required."}), 400

    try:
        res = downloader.download_video(query)
        base = get_base_url()
        download_url = f"{base}/api/download/{quote(res['filename'])}"
        return jsonify({
            "success": True,
            "type": "video",
            "format": "mp4",
            "title": res["title"],
            "author": res["author"],
            "duration": res["duration"],
            "thumbnail": res["thumbnail"],
            "webpage_url": res["url"],
            "filename": res["filename"],
            "filesize": res["filesize"],
            "cached": res["cached"],
            "download_url": download_url
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/spotify", methods=["GET", "POST"])
def get_spotify():
    query = request.args.get("q") or request.args.get("query") or request.args.get("url")
    if not query and request.is_json:
        data = request.get_json(silent=True) or {}
        query = data.get("query") or data.get("q") or data.get("url")
    if not query and request.form:
        query = request.form.get("query") or request.form.get("q") or request.form.get("url")

    if not query:
        return jsonify({"success": False, "error": "Query or Spotify URL parameter 'q'/'url' is required."}), 400

    try:
        res = downloader.download_spotify(query)
        base = get_base_url()
        download_url = f"{base}/api/download/{quote(res['filename'])}"
        return jsonify({
            "success": True,
            "type": "audio",
            "format": "mp3",
            "platform": "spotify",
            "title": res["title"],
            "author": res["author"],
            "album": res.get("album", "Spotify Single"),
            "duration": res.get("duration", 0),
            "thumbnail": res.get("thumbnail"),
            "spotify_url": res.get("spotify_url"),
            "filename": res["filename"],
            "filesize": res["filesize"],
            "cached": res["cached"],
            "download_url": download_url
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/slowed", methods=["GET", "POST"])
def get_slowed():
    query = request.args.get("q") or request.args.get("query") or request.args.get("url")
    if not query and request.is_json:
        data = request.get_json(silent=True) or {}
        query = data.get("query") or data.get("q") or data.get("url")
    if not query and request.form:
        query = request.form.get("query") or request.form.get("q") or request.form.get("url")

    if not query:
        return jsonify({"success": False, "error": "Query parameter 'q' or 'url' is required."}), 400

    try:
        res = downloader.download_slowed(query)
        base = get_base_url()
        download_url = f"{base}/api/download/{quote(res['filename'])}"
        return jsonify({
            "success": True,
            "type": "audio",
            "format": "mp3",
            "style": "slowed_reverb",
            "title": res["title"],
            "author": res["author"],
            "duration": res["duration"],
            "thumbnail": res["thumbnail"],
            "webpage_url": res.get("url"),
            "filename": res["filename"],
            "filesize": res["filesize"],
            "cached": res["cached"],
            "download_url": download_url
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ----------------- BACKWARD COMPATIBLE BOT ROUTE -----------------
# Compatible with ZoxerBot fetchMediaFromApi(url, format)
@app.route("/api/v1/download", methods=["POST", "GET"])
@app.route("/api/media", methods=["POST", "GET"])
def v1_download():
    body = request.get_json(silent=True) or {}
    url = body.get("url") or body.get("query") or request.args.get("url")
    media_format = (body.get("format") or request.args.get("format") or "video").lower()

    if not url:
        return jsonify({"success": False, "message": "Field 'url' is required."}), 400

    try:
        platform = "youtube"
        if media_format in ["spotify", "sp"]:
            res = downloader.download_spotify(url)
            media_type = "audio"
            ext = "mp3"
            platform = "spotify"
        elif media_format in ["slowed", "slow"]:
            res = downloader.download_slowed(url)
            media_type = "audio"
            ext = "mp3"
        elif media_format in ["audio", "mp3", "song"]:
            res = downloader.download_audio(url)
            media_type = "audio"
            ext = "mp3"
        else:
            res = downloader.download_video(url)
            media_type = "video"
            ext = "mp4"

        base = get_base_url()
        download_url = f"{base}/api/download/{quote(res['filename'])}"

        return jsonify({
            "success": True,
            "platform": platform,
            "data": {
                "title": res["title"],
                "thumbnail": res["thumbnail"],
                "author": {
                    "name": res["author"]
                },
                "duration": res.get("duration", 0),
                "media": {
                    "download_url": download_url,
                    "type": media_type,
                    "format": ext,
                    "quality": "best"
                }
            }
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e),
            "error": {"message": str(e)}
        }), 500

@app.route("/api/v1/metadata", methods=["POST", "GET"])
def v1_metadata():
    url = request.args.get("url")
    if not url and request.is_json:
        url = (request.get_json(silent=True) or {}).get("url")

    if not url:
        return jsonify({"success": False, "message": "Field 'url' is required."}), 400

    try:
        meta = downloader.search_or_resolve(url)
        return jsonify({
            "success": True,
            "data": {
                "title": meta["title"],
                "author": meta["author"],
                "duration": meta["duration"],
                "thumbnail": meta["thumbnail"],
                "url": meta["url"]
            }
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# ----------------- DIRECT MEDIA STREAMING -----------------
@app.route("/api/download/<path:filename>")
def serve_download(filename):
    file_path = os.path.join(DOWNLOADS_DIR, filename)
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found or expired."}), 404

    # Determine mimetype
    lower = filename.lower()
    mimetype = "audio/mpeg" if lower.endswith(".mp3") else "video/mp4"

    return send_from_directory(
        DOWNLOADS_DIR,
        filename,
        mimetype=mimetype,
        as_attachment=False
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"============================================================")
    print(f" [*] Zoxer Media Engine running on port {port}")
    print(f" [*] Song endpoint:     http://0.0.0.0:{port}/api/song?q=...")
    print(f" [*] Video endpoint:    http://0.0.0.0:{port}/api/video?q=...")
    print(f" [*] Bot v1 endpoint:   http://0.0.0.0:{port}/api/v1/download")
    print(f"============================================================")
    app.run(host="0.0.0.0", port=port, threaded=True)
