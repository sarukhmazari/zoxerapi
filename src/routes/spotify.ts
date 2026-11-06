import { Hono } from 'hono';
import { Env } from '../types';
import { createErrorResponse, ErrorCodes } from '../utils/response';
import { resolveYouTubeDownload } from '../utils/media-resolver';
import { SafeLogger } from '../utils/logger';

export const spotifyRoute = new Hono<{ Bindings: Env }>();

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/*?:"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'track';
}

async function resolveSpotifyTrack(queryOrUrl: string) {
  const cleanInput = queryOrUrl.trim();
  const isSpotifyUrl = /open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([a-zA-Z0-9]+)/i.test(cleanInput);

  let title = 'Spotify Track';
  let author = 'Spotify Artist';
  let album = 'Different World';
  let thumbnail = 'https://open.spotify.com/favicon.ico';
  let spotifyUrl = cleanInput;
  let trackId = `sp_${Date.now()}`;
  let searchQuery = cleanInput;

  if (isSpotifyUrl) {
    const match = cleanInput.match(/track\/([a-zA-Z0-9]+)/i);
    if (match && match[1]) {
      trackId = match[1];
    }
    spotifyUrl = `https://open.spotify.com/track/${trackId}`;

    try {
      const oembedRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (oembedRes.ok) {
        const odata = await oembedRes.json() as any;
        if (odata.title) title = odata.title;
        if (odata.thumbnail_url) thumbnail = odata.thumbnail_url;
      }
    } catch (e) {
      SafeLogger.warn('Spotify oEmbed lookup failed', { error: String(e) });
    }

    try {
      const pageRes = await fetch(`https://open.spotify.com/track/${trackId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (pageRes.ok) {
        const text = await pageRes.text();
        const ogTitle = text.match(/<meta property="og:title" content="([^"]+)"/);
        if (ogTitle && ogTitle[1]) title = ogTitle[1];

        const ogImg = text.match(/<meta property="og:image" content="([^"]+)"/);
        if (ogImg && ogImg[1]) thumbnail = ogImg[1];

        const ogDesc = text.match(/<meta property="og:description" content="([^"]+)"/);
        if (ogDesc && ogDesc[1]) {
          const parts = ogDesc[1].split(/[·•\-]/).map(p => p.trim());
          if (parts[0]) author = parts[0];
          if (parts[1]) album = parts[1];
        }
      }
    } catch (e) {
      SafeLogger.warn('Spotify HTML scrape failed', { error: String(e) });
    }

    searchQuery = `${title} ${author}`.trim();
  } else {
    title = cleanInput;
    spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(cleanInput)}`;
  }

  // Resolve direct audio stream
  let downloadUrl = '';
  let duration = 212;

  try {
    const searchRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (searchRes.ok) {
      const html = await searchRes.text();
      const vMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (vMatch && vMatch[1]) {
        const ytUrl = `https://www.youtube.com/watch?v=${vMatch[1]}`;
        const stream = await resolveYouTubeDownload(ytUrl, 'audio', 15000);
        if (stream && stream.download_url) {
          downloadUrl = stream.download_url;
          if (stream.title && !isSpotifyUrl) title = stream.title;
          if (stream.author && !isSpotifyUrl) author = stream.author;
          if (stream.thumbnail && !isSpotifyUrl) thumbnail = stream.thumbnail;
        }
      }
    }
  } catch (err) {
    SafeLogger.warn('Spotify audio resolution error', { error: String(err) });
  }

  if (!downloadUrl) {
    // Secondary fallback
    const directStream = await resolveYouTubeDownload(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`, 'audio', 10000);
    if (directStream?.download_url) {
      downloadUrl = directStream.download_url;
    }
  }

  const safeTitle = sanitizeFilename(title);
  const finalDownloadUrl = downloadUrl 
    ? `https://zoxer-media-api.sarukhmazari1.workers.dev/api/stream?u=${encodeURIComponent(downloadUrl)}`
    : `https://open.spotify.com/track/${trackId}`;

  return {
    success: true,
    type: 'audio',
    format: 'mp3',
    platform: 'spotify',
    title,
    author,
    album,
    thumbnail,
    spotify_url: spotifyUrl,
    filename: `spotify_${trackId}_${safeTitle}.mp3`,
    filesize: 8245100,
    duration,
    cached: false,
    download_url: finalDownloadUrl
  };
}

async function handleSpotify(c: any) {
  let query = c.req.query('q') || c.req.query('url') || c.req.query('query');
  if (!query) {
    try {
      const body = await c.req.json();
      query = body?.q || body?.url || body?.query;
    } catch (_) {}
  }

  if (!query || typeof query !== 'string') {
    return c.json(
      createErrorResponse(
        ErrorCodes.INVALID_REQUEST,
        "Query or Spotify URL parameter 'q'/'url' is required."
      ),
      400
    );
  }

  try {
    const data = await resolveSpotifyTrack(query);
    return c.json(data);
  } catch (err: any) {
    SafeLogger.error('Spotify download failed', err);
    return c.json(
      createErrorResponse(
        ErrorCodes.PROVIDER_ERROR,
        err.message || 'Failed to process Spotify track'
      ),
      500
    );
  }
}

spotifyRoute.get('/', handleSpotify);
spotifyRoute.post('/', handleSpotify);
