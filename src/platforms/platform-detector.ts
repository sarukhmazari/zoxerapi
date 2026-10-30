import { PlatformAdapter } from './platform.interface';
import { TikTokAdapter } from './tiktok';
import { InstagramAdapter } from './instagram';
import { YouTubeAdapter } from './youtube';
import { DetectionResult, PlatformType } from '../types';
import { validateSafeUrl } from '../utils/url-validator';

export class PlatformDetector {
  private adapters: PlatformAdapter[];

  constructor() {
    this.adapters = [
      new TikTokAdapter(),
      new InstagramAdapter(),
      new YouTubeAdapter(),
    ];
  }

  getAdapter(platform: PlatformType): PlatformAdapter | null {
    return this.adapters.find((a) => a.platform === platform) || null;
  }

  getSupportedPlatforms(): PlatformType[] {
    return this.adapters.map((a) => a.platform);
  }

  detect(rawUrl: string, maxUrlLength: number = 2048): DetectionResult {
    const validation = validateSafeUrl(rawUrl, maxUrlLength);

    if (!validation.isValid || !validation.isSafe || !validation.parsedUrl) {
      return {
        platform: 'unknown',
        is_valid: false,
        is_supported: false,
        normalized_url: rawUrl,
        canonical_id: null,
      };
    }

    const parsed = validation.parsedUrl;

    for (const adapter of this.adapters) {
      if (adapter.detect(parsed)) {
        let canonicalId: string | null = null;
        let hint: 'video' | 'post' | 'short' | 'reel' | 'unknown' = 'video';

        if (adapter instanceof YouTubeAdapter) {
          canonicalId = adapter.extractVideoId(parsed);
          hint = parsed.pathname.includes('/shorts/') ? 'short' : 'video';
        } else if (adapter instanceof InstagramAdapter) {
          canonicalId = adapter.extractShortcode(parsed);
          hint = parsed.pathname.includes('/reel') ? 'reel' : 'post';
        } else if (adapter instanceof TikTokAdapter) {
          canonicalId = adapter.extractVideoId(parsed);
          hint = 'video';
        }

        return {
          platform: adapter.platform,
          is_valid: true,
          is_supported: true,
          normalized_url: validation.normalizedUrl || rawUrl,
          canonical_id: canonicalId,
          media_type_hint: hint,
        };
      }
    }

    return {
      platform: 'unknown',
      is_valid: true,
      is_supported: false,
      normalized_url: validation.normalizedUrl || rawUrl,
      canonical_id: null,
      media_type_hint: 'unknown',
    };
  }
}

export const platformDetector = new PlatformDetector();
