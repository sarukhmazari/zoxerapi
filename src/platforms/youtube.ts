import { PlatformAdapter, DownloadOptions } from './platform.interface';
import { Env, MetadataResult, MediaInfo, DownloadResult, PlatformCapabilities, PlatformType } from '../types';
import { SafeLogger } from '../utils/logger';
import { resolveYouTubeDownload } from '../utils/media-resolver';

// ISO 8601 duration parser (e.g. PT4M13S -> 253 seconds)
function parseISO8601Duration(durationStr: string): number | null {
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

export class YouTubeAdapter implements PlatformAdapter {
  readonly platform: PlatformType = 'youtube';

  detect(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    const isYouTubeHost =
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtu.be';

    if (!isYouTubeHost) return false;

    // Check for video or short pattern
    if (host === 'youtu.be' && url.pathname.length > 1) return true;
    if (url.pathname.startsWith('/watch') && url.searchParams.has('v')) return true;
    if (url.pathname.startsWith('/shorts/') && url.pathname.length > 8) return true;
    if (url.pathname.startsWith('/embed/')) return true;

    return true;
  }

  extractVideoId(url: URL): string | null {
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/') || url.pathname.startsWith('/v/')) {
      const parts = url.pathname.split('/');
      const id = parts[2];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    const v = url.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
      return v;
    }

    return null;
  }

  getCapabilities(): PlatformCapabilities {
    return {
      metadata: true,
      direct_download: true,
      requires_official_token: false,
    };
  }

  async getMetadata(rawUrl: string, env: Env): Promise<MetadataResult> {
    const parsed = new URL(rawUrl);
    const videoId = this.extractVideoId(parsed);
    const canonicalUrl = videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : rawUrl;

    const timeoutMs = Number(env.REQUEST_TIMEOUT_MS) || 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // 1. If official YouTube Data API v3 key is configured, use it for rich metadata
      if (env.YOUTUBE_API_KEY && videoId) {
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${env.YOUTUBE_API_KEY}`;
        const apiRes = await fetch(apiUrl, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });

        if (apiRes.ok) {
          const apiData = (await apiRes.json()) as {
            items?: Array<{
              id: string;
              snippet: {
                title: string;
                description: string;
                channelTitle: string;
                channelId: string;
                thumbnails?: {
                  maxres?: { url: string };
                  high?: { url: string };
                  medium?: { url: string };
                  default?: { url: string };
                };
              };
              contentDetails: {
                duration: string;
              };
            }>;
          };

          if (apiData.items && apiData.items.length > 0) {
            const item = apiData.items[0];
            const thumb =
              item.snippet.thumbnails?.maxres?.url ||
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.medium?.url ||
              item.snippet.thumbnails?.default?.url ||
              (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);

            return {
              id: videoId,
              title: item.snippet.title,
              description: item.snippet.description || null,
              thumbnail: thumb,
              author: {
                name: item.snippet.channelTitle,
                url: `https://www.youtube.com/channel/${item.snippet.channelId}`,
              },
              duration: parseISO8601Duration(item.contentDetails.duration),
              canonical_url: canonicalUrl,
              capabilities: this.getCapabilities(),
              available_media: await this.getAvailableMedia(rawUrl, env),
            };
          }
        }
      }

      // 2. Fallback to oEmbed API (try YouTube first, then noembed)
      let oembedData: { title?: string; author_name?: string; author_url?: string; thumbnail_url?: string } | null = null;
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
        const res = await fetch(oembedUrl, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        });
        if (res.ok) {
          oembedData = await res.json();
        }
      } catch (_) {}

      if (!oembedData) {
        try {
          const noembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`;
          const nRes = await fetch(noembedUrl, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
          });
          if (nRes.ok) {
            oembedData = await nRes.json();
          }
        } catch (_) {}
      }

      const oembed = oembedData || {
        title: 'YouTube Video',
        author_name: 'YouTube Creator',
        author_url: canonicalUrl,
        thumbnail_url: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
      };

      return {
        id: videoId,
        title: oembed.title || 'YouTube Video',
        description: null,
        thumbnail: oembed.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null),
        author: {
          name: oembed.author_name || null,
          url: oembed.author_url || null,
        },
        duration: null,
        canonical_url: canonicalUrl,
        capabilities: this.getCapabilities(),
        available_media: await this.getAvailableMedia(rawUrl, env),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getAvailableMedia(rawUrl: string, _env: Env): Promise<MediaInfo[]> {
    const parsed = new URL(rawUrl);
    const videoId = this.extractVideoId(parsed);

    return [
      {
        type: 'video',
        format: 'mp4',
        quality: 'restricted_by_terms',
        download_url: null,
        requires_external_downloader: true,
      },
      {
        type: 'image',
        format: 'jpg',
        quality: 'high',
        download_url: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
        mime_type: 'image/jpeg',
        requires_external_downloader: false,
      },
    ];
  }

  async download(url: string, options: DownloadOptions, env: Env): Promise<DownloadResult> {
    const meta = await this.getMetadata(url, env);
    const timeoutMs = Number(env.REQUEST_TIMEOUT_MS) || 15000;

    const resolved = await resolveYouTubeDownload(url, options.format, timeoutMs);
    if (resolved && resolved.download_url) {
      return {
        title: resolved.title || meta.title,
        thumbnail: resolved.thumbnail || meta.thumbnail,
        author: resolved.author ? { name: resolved.author, url: null } : meta.author,
        duration: meta.duration,
        media: {
          type: resolved.type,
          format: resolved.format,
          quality: 'best',
          download_url: resolved.download_url,
          requires_external_downloader: false,
        },
      };
    }

    if (options.format === 'image' && meta.thumbnail) {
      return {
        title: meta.title,
        thumbnail: meta.thumbnail,
        author: meta.author,
        duration: meta.duration,
        media: {
          type: 'image',
          format: 'jpg',
          quality: 'high',
          download_url: meta.thumbnail,
          requires_external_downloader: false,
        },
      };
    }

    throw new Error('Unable to extract direct YouTube download stream at this moment. Please retry.');
  }
}
