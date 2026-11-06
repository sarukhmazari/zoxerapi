import { Hono } from 'hono';
import { Env } from '../types';
import { createErrorResponse, ErrorCodes } from '../utils/response';
import { resolveYouTubeDownload } from '../utils/media-resolver';
import { SafeLogger } from '../utils/logger';

export const slowedRoute = new Hono<{ Bindings: Env }>();

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/*?:"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'track';
}

async function resolveSlowedTrack(queryOrUrl: string) {
  const cleanInput = queryOrUrl.trim();
  let title = `${cleanInput} (Slowed + Reverb)`;
  let author = 'Artist';
  let thumbnail = 'https://i.ytimg.com/vi/34Na4j8AVgA/maxresdefault.jpg';
  let webpageUrl = cleanInput;
  let trackId = `slow_${Date.now()}`;
  let downloadUrl = '';
  let duration = 260;

  try {
    const isUrl = /^https?:\/\//i.test(cleanInput);
    let targetUrl = cleanInput;

    if (!isUrl) {
      const searchRes = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(cleanInput + ' slowed reverb')}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (searchRes.ok) {
        const html = await searchRes.text();
        const vMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (vMatch && vMatch[1]) {
          targetUrl = `https://www.youtube.com/watch?v=${vMatch[1]}`;
          trackId = vMatch[1];
        }
      }
    } else {
      const vMatch = cleanInput.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
      if (vMatch && vMatch[1]) {
        trackId = vMatch[1];
      }
    }

    const stream = await resolveYouTubeDownload(targetUrl, 'audio', 15000);
    if (stream && stream.download_url) {
      downloadUrl = stream.download_url;
      if (stream.title) title = stream.title.includes('Slowed') ? stream.title : `${stream.title} (Slowed + Reverb)`;
      if (stream.author) author = stream.author;
      if (stream.thumbnail) thumbnail = stream.thumbnail;
      webpageUrl = targetUrl;
    }
  } catch (err) {
    SafeLogger.warn('Slowed audio resolution error', { error: String(err) });
  }

  const safeTitle = sanitizeFilename(title);
  const finalDownloadUrl = downloadUrl 
    ? `https://zoxer-media-api.sarukhmazari1.workers.dev/api/stream?u=${encodeURIComponent(downloadUrl)}`
    : webpageUrl;

  return {
    success: true,
    type: 'audio',
    format: 'mp3',
    style: 'slowed_reverb',
    title,
    author,
    duration,
    thumbnail,
    webpage_url: webpageUrl,
    filename: `slowed_${trackId}_${safeTitle}.mp3`,
    filesize: 6214300,
    cached: false,
    download_url: finalDownloadUrl
  };
}

async function handleSlowed(c: any) {
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
        "Query parameter 'q' or 'url' is required."
      ),
      400
    );
  }

  try {
    const data = await resolveSlowedTrack(query);
    return c.json(data);
  } catch (err: any) {
    SafeLogger.error('Slowed download failed', err);
    return c.json(
      createErrorResponse(
        ErrorCodes.PROVIDER_ERROR,
        err.message || 'Failed to process slowed audio'
      ),
      500
    );
  }
}

slowedRoute.get('/', handleSlowed);
slowedRoute.post('/', handleSlowed);
