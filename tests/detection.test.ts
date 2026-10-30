import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import { platformDetector } from '../src/platforms/platform-detector';
import { Env } from '../src/types';

describe('Platform Detection', () => {
  const mockEnv: Env = {
    API_SECRET_KEY: 'test-secret',
    ENVIRONMENT: 'development',
  };

  const app = createApp();
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-secret',
  };

  describe('Direct PlatformDetector Unit Tests', () => {
    it('detects standard YouTube watch URLs', () => {
      const res = platformDetector.detect('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.is_supported).toBe(true);
      expect(res.platform).toBe('youtube');
      expect(res.canonical_id).toBe('dQw4w9WgXcQ');
      expect(res.media_type_hint).toBe('video');
    });

    it('detects youtu.be short URLs', () => {
      const res = platformDetector.detect('https://youtu.be/dQw4w9WgXcQ');
      expect(res.is_supported).toBe(true);
      expect(res.platform).toBe('youtube');
      expect(res.canonical_id).toBe('dQw4w9WgXcQ');
    });

    it('detects YouTube Shorts URLs', () => {
      const res = platformDetector.detect('https://www.youtube.com/shorts/dQw4w9WgXcQ');
      expect(res.is_supported).toBe(true);
      expect(res.platform).toBe('youtube');
      expect(res.canonical_id).toBe('dQw4w9WgXcQ');
      expect(res.media_type_hint).toBe('short');
    });

    it('detects standard TikTok video URLs', () => {
      const res = platformDetector.detect('https://www.tiktok.com/@scout2015/video/7098418290333289774');
      expect(res.is_supported).toBe(true);
      expect(res.platform).toBe('tiktok');
      expect(res.canonical_id).toBe('7098418290333289774');
    });

    it('detects TikTok vm shortlink URLs', () => {
      const res = platformDetector.detect('https://vm.tiktok.com/ZM8ABCDEF/');
      expect(res.is_supported).toBe(true);
      expect(res.platform).toBe('tiktok');
    });

    it('detects Instagram post URLs', () => {
      const res = platformDetector.detect('https://www.instagram.com/p/C0XYZ123abc/');
      expect(res.is_supported).toBe(true);
      expect(res.platform).toBe('instagram');
      expect(res.canonical_id).toBe('C0XYZ123abc');
      expect(res.media_type_hint).toBe('post');
    });

    it('detects Instagram Reel URLs', () => {
      const res = platformDetector.detect('https://www.instagram.com/reel/C0XYZ123abc/');
      expect(res.is_supported).toBe(true);
      expect(res.platform).toBe('instagram');
      expect(res.canonical_id).toBe('C0XYZ123abc');
      expect(res.media_type_hint).toBe('reel');
    });

    it('marks unsupported domains as valid URL but unsupported platform', () => {
      const res = platformDetector.detect('https://vimeo.com/12345678');
      expect(res.is_valid).toBe(true);
      expect(res.is_supported).toBe(false);
      expect(res.platform).toBe('unknown');
    });

    it('rejects invalid or non-HTTP protocols', () => {
      const res = platformDetector.detect('ftp://example.com/video.mp4');
      expect(res.is_valid).toBe(false);
      expect(res.is_supported).toBe(false);
      expect(res.platform).toBe('unknown');
    });
  });

  describe('POST /api/v1/detect HTTP Endpoint', () => {
    it('returns 200 with platform data for YouTube URL', async () => {
      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.platform).toBe('youtube');
      expect(data.data.is_supported).toBe(true);
      expect(data.data.canonical_id).toBe('dQw4w9WgXcQ');
    });

    it('returns 200 with is_supported=false for unsupported platforms', async () => {
      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: 'https://twitter.com/user/status/123456789' }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.platform).toBeNull();
      expect(data.data.is_supported).toBe(false);
      expect(data.data.detected_platform).toBe('unknown');
    });

    it('returns 400 when url is not provided or malformed', async () => {
      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ invalid_field: 'https://youtube.com' }),
      }, mockEnv);

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });
  });
});
