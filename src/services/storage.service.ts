import { Env } from '../types';
import { SafeLogger } from '../utils/logger';

export class StorageService {
  /**
   * Checks if R2 bucket binding is configured
   */
  isConfigured(env: Env): boolean {
    return Boolean(env.MEDIA_BUCKET);
  }

  /**
   * Stores a temporary media stream/buffer in R2 if binding is present
   */
  async putMedia(
    key: string,
    stream: ReadableStream | ArrayBuffer,
    contentType: string,
    env: Env
  ): Promise<boolean> {
    if (!env.MEDIA_BUCKET) {
      SafeLogger.info('R2 storage is not configured; skipping object persistence.');
      return false;
    }

    try {
      await env.MEDIA_BUCKET.put(key, stream, {
        httpMetadata: {
          contentType,
        },
      });
      return true;
    } catch (err) {
      SafeLogger.error('Failed to store media object in R2', err);
      return false;
    }
  }

  /**
   * Retrieves media object from R2
   */
  async getMedia(key: string, env: Env): Promise<R2ObjectBody | null> {
    if (!env.MEDIA_BUCKET) {
      return null;
    }

    try {
      return await env.MEDIA_BUCKET.get(key);
    } catch (err) {
      SafeLogger.error('Failed to retrieve media object from R2', err);
      return null;
    }
  }

  /**
   * Removes expired or processed media object from R2
   */
  async deleteMedia(key: string, env: Env): Promise<boolean> {
    if (!env.MEDIA_BUCKET) {
      return false;
    }

    try {
      await env.MEDIA_BUCKET.delete(key);
      return true;
    } catch (err) {
      SafeLogger.error('Failed to delete media object from R2', err);
      return false;
    }
  }
}

export const storageService = new StorageService();
