import { PlatformAdapter, DownloadOptions } from './platform.interface';
import { Env, MetadataResult, MediaInfo, DownloadResult, PlatformCapabilities, PlatformType } from '../types';
import { SafeLogger } from '../utils/logger';

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
      direct_download: false,
      requires_official_token: false,
      terms_restriction_note:
        'Direct YouTube binary extraction violates YouTube Terms of Service and DRM policies. Official metadata via oEmbed and Data API v3 is supported.',
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

      // 2. Fallback to official YouTube oEmbed API
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`;
      const res = await fetch(oembedUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('YouTube video not found or private.');
        }
        throw new Error(`YouTube oEmbed provider error: HTTP ${res.status}`);
      }

      const oembed = (await res.json()) as {
        title: string;
        author_name: string;
        author_url: string;
        thumbnail_url: string;
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

  async download(url: string, _options: DownloadOptions, env: Env): Promise<DownloadResult> {
    const meta = await this.getMetadata(url, env);

    throw new Error(
      'YouTube direct video download is restricted by YouTube Terms of Service and DRM. Direct binary extraction without authorization is not permitted. Only public metadata and authorized thumbnails can be provided.'
    );
  }
}
