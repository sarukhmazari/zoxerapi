import { Env, MetadataResult } from '../types';
import { platformDetector } from '../platforms/platform-detector';
import { validateSafeUrl } from '../utils/url-validator';
import { SafeLogger } from '../utils/logger';

export class MetadataService {
  async getMetadata(rawUrl: string, env: Env): Promise<{ metadata: MetadataResult; platform: string }> {
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

    SafeLogger.info('Retrieving metadata for platform', {
      platform: detection.platform,
      canonicalId: detection.canonical_id,
    });

    const metadata = await adapter.getMetadata(detection.normalized_url, env);

    return {
      metadata,
      platform: detection.platform,
    };
  }
}

export const metadataService = new MetadataService();
