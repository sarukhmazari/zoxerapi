import { PlatformAdapter, DownloadOptions } from './platform.interface';
import { Env, MetadataResult, MediaInfo, DownloadResult, PlatformCapabilities, PlatformType } from '../types';

export class InstagramAdapter implements PlatformAdapter {
  readonly platform: PlatformType = 'instagram';

  detect(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    const isInstagramHost =
      host === 'instagram.com' ||
      host === 'www.instagram.com' ||
      host === 'instagr.am';

    if (!isInstagramHost) return false;

    // Matches /p/:id, /reel/:id, /reels/:id, /tv/:id
    return /\/(?:p|reel|reels|tv)\/[a-zA-Z0-9_-]+/i.test(url.pathname);
  }

  extractShortcode(url: URL): string | null {
    const match = url.pathname.match(/\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : null;
  }

  getCapabilities(): PlatformCapabilities {
    return {
      metadata: true,
      direct_download: false,
      requires_official_token: true,
      terms_restriction_note:
        'Meta/Instagram restricts public scraping. Legitimate metadata retrieval requires an authorized Meta Graph API access token (INSTAGRAM_ACCESS_TOKEN). Direct video extraction violates Meta Platform Terms.',
    };
  }

  async getMetadata(rawUrl: string, env: Env): Promise<MetadataResult> {
    const parsed = new URL(rawUrl);
    const shortcode = this.extractShortcode(parsed);
    const canonicalUrl = shortcode
      ? `https://www.instagram.com/p/${shortcode}/`
      : rawUrl;

    const timeoutMs = Number(env.REQUEST_TIMEOUT_MS) || 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const accessToken = env.INSTAGRAM_ACCESS_TOKEN;

      if (!accessToken) {
        // Return structured detected metadata with clear indication that Meta token is needed for full content
        return {
          id: shortcode,
          title: shortcode ? `Instagram Post (${shortcode})` : 'Instagram Media',
          description:
            'Full Instagram metadata retrieval requires an official Meta App Access Token configured in INSTAGRAM_ACCESS_TOKEN.',
          thumbnail: null,
          author: null,
          duration: null,
          canonical_url: canonicalUrl,
          capabilities: this.getCapabilities(),
          available_media: await this.getAvailableMedia(canonicalUrl, env),
        };
      }

      // Query official Meta oEmbed endpoint
      const oembedUrl = `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(canonicalUrl)}&access_token=${accessToken}`;
      const res = await fetch(oembedUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Instagram post not found, removed, or account is private.');
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error('Meta Graph API token is invalid or lacks oEmbed permissions.');
        }
        throw new Error(`Instagram oEmbed provider error: HTTP ${res.status}`);
      }

      const oembed = (await res.json()) as {
        title?: string;
        author_name?: string;
        author_url?: string;
        thumbnail_url?: string;
      };

      return {
        id: shortcode,
        title: oembed.title || `Instagram Post (${shortcode})`,
        description: oembed.title || null,
        thumbnail: oembed.thumbnail_url || null,
        author: {
          name: oembed.author_name || null,
          url: oembed.author_url || null,
        },
        duration: null,
        canonical_url: canonicalUrl,
        capabilities: this.getCapabilities(),
        available_media: await this.getAvailableMedia(canonicalUrl, env),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getAvailableMedia(rawUrl: string, _env: Env): Promise<MediaInfo[]> {
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
        format: 'jpeg',
        quality: 'high',
        download_url: null,
        requires_external_downloader: false,
      },
    ];
  }

  async download(url: string, _options: DownloadOptions, env: Env): Promise<DownloadResult> {
    const meta = await this.getMetadata(url, env);

    throw new Error(
      'Instagram media binary extraction is prohibited by Meta Platform Terms and access controls. Direct unauthorized video extraction is not supported. Use official Meta Graph API integrations.'
    );
  }
}
