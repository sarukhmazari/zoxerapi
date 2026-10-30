import { PlatformAdapter, DownloadOptions } from './platform.interface';
import { Env, MetadataResult, MediaInfo, DownloadResult, PlatformCapabilities, PlatformType } from '../types';
import { validateSafeUrl } from '../utils/url-validator';

export class TikTokAdapter implements PlatformAdapter {
  readonly platform: PlatformType = 'tiktok';

  detect(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    const isTikTokHost =
      host === 'tiktok.com' ||
      host === 'www.tiktok.com' ||
      host === 'vm.tiktok.com' ||
      host === 'vt.tiktok.com' ||
      host === 'm.tiktok.com';

    if (!isTikTokHost) return false;

    // Direct video link or shortlink
    if (host.includes('vm.tiktok.com') || host.includes('vt.tiktok.com')) {
      return url.pathname.length > 1;
    }

    if (url.pathname.includes('/video/') || url.pathname.includes('/v/')) {
      return true;
    }

    return url.pathname.length > 1;
  }

  extractVideoId(url: URL): string | null {
    const match = url.pathname.match(/\/video\/(\d+)/i) || url.pathname.match(/\/v\/(\d+)/i);
    return match ? match[1] : null;
  }

  getCapabilities(): PlatformCapabilities {
    return {
      metadata: true,
      direct_download: false,
      requires_official_token: false,
      terms_restriction_note:
        'Official TikTok metadata is supported via TikTok oEmbed API. Direct video binary extraction is restricted by TikTok terms and dynamic CDN access controls.',
    };
  }

  /**
   * Safely resolve shortlinks if needed (e.g. vm.tiktok.com)
   */
  private async resolveCanonicalUrl(rawUrl: string, timeoutMs: number): Promise<string> {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname.includes('vm.tiktok.com') && !parsed.hostname.includes('vt.tiktok.com')) {
      return rawUrl;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(rawUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });

      const finalUrl = res.url;
      // Validate resolved redirect for SSRF safety
      const safety = validateSafeUrl(finalUrl);
      if (safety.isValid && safety.isSafe) {
        return finalUrl;
      }
      return rawUrl;
    } catch {
      return rawUrl;
    } finally {
      clearTimeout(timer);
    }
  }

  async getMetadata(rawUrl: string, env: Env): Promise<MetadataResult> {
    const timeoutMs = Number(env.REQUEST_TIMEOUT_MS) || 10000;
    const canonicalUrl = await this.resolveCanonicalUrl(rawUrl, timeoutMs);
    const parsed = new URL(canonicalUrl);
    const videoId = this.extractVideoId(parsed);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const oembedEndpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
      const res = await fetch(oembedEndpoint, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ZoxerMediaBot/1.0',
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('TikTok media not found, removed, or account is private.');
        }
        throw new Error(`TikTok oEmbed provider error: HTTP ${res.status}`);
      }

      const oembed = (await res.json()) as {
        title?: string;
        author_name?: string;
        author_unique_id?: string;
        author_url?: string;
        thumbnail_url?: string;
        thumbnail_width?: number;
        thumbnail_height?: number;
      };

      return {
        id: videoId,
        title: oembed.title || 'TikTok Media',
        description: oembed.title || null,
        thumbnail: oembed.thumbnail_url || null,
        author: {
          name: oembed.author_name || null,
          username: oembed.author_unique_id || null,
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

  async download(url: string, options: DownloadOptions, env: Env): Promise<DownloadResult> {
    const meta = await this.getMetadata(url, env);

    if (options.format === 'image' && meta.thumbnail) {
      return {
        title: meta.title,
        thumbnail: meta.thumbnail,
        author: meta.author,
        duration: meta.duration,
        media: {
          type: 'image',
          format: 'jpeg',
          quality: 'best',
          download_url: meta.thumbnail,
          requires_external_downloader: false,
        },
      };
    }

    throw new Error(
      'TikTok video binary extraction is restricted by TikTok platform terms and anti-automation protections. Direct download of proprietary video binaries without authorization is prohibited. Metadata and authorized thumbnail image are accessible.'
    );
  }
}
