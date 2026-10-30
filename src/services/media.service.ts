import { Env, DownloadResult, PlatformType } from '../types';
import { platformDetector } from '../platforms/platform-detector';
import { validateSafeUrl } from '../utils/url-validator';
import { DownloadOptions } from '../platforms/platform.interface';

export class MediaService {
  async processDownload(
    rawUrl: string,
    options: DownloadOptions,
    env: Env
  ): Promise<{ result: DownloadResult; platform: PlatformType }> {
    const maxUrlLength = Number(env.MAX_URL_LENGTH) || 2048;
    const validation = validateSafeUrl(rawUrl, maxUrlLength);

    if (!validation.isValid) {
      throw new Error(`INVALID_URL: ${validation.error || 'Invalid URL'}`);
    }

    if (!validation.isSafe) {
      throw new Error(`SSRF_ATTEMPT_DETECTED: ${validation.error || 'Security check failed'}`);
    }

    const detection = platformDetector.detect(rawUrl, maxUrlLength);

    if (!detection.is_supported || detection.platform === 'unknown') {
      throw new Error('UNSUPPORTED_URL: Platform is not supported.');
    }

    const adapter = platformDetector.getAdapter(detection.platform);
    if (!adapter) {
      throw new Error('PROVIDER_NOT_FOUND: Adapter for platform not registered.');
    }

    const result = await adapter.download(detection.normalized_url, options, env);

    return {
      result,
      platform: detection.platform,
    };
  }
}

export const mediaService = new MediaService();
