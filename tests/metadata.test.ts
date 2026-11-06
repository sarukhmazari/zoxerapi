import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app';
import { Env } from '../src/types';

describe('Metadata & Download Service Endpoints', () => {
  const mockEnv: Env = {
    API_SECRET_KEY: 'test-secret',
    ENVIRONMENT: 'development',
    REQUEST_TIMEOUT_MS: 5000,
  };

  const app = createApp();
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-secret',
  };

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/metadata', () => {
    it('successfully retrieves YouTube metadata via oEmbed mock', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Never Gonna Give You Up',
          author_name: 'Rick Astley',
          author_url: 'https://www.youtube.com/@RickAstleyYT',
          thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        }),
      } as unknown as Response);

      const res = await app.request('/api/v1/metadata', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.platform).toBe('youtube');
      expect(data.data.title).toBe('Never Gonna Give You Up');
      expect(data.data.author.name).toBe('Rick Astley');
      expect(data.data.capabilities.metadata).toBe(true);
      expect(data.data.capabilities.direct_download).toBe(true);
    });

    it('successfully retrieves TikTok metadata via oEmbed mock', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Cute dancing dog video #viral',
          author_name: 'DogLover',
          author_unique_id: 'doglover123',
          author_url: 'https://www.tiktok.com/@doglover123',
          thumbnail_url: 'https://p16.tiktokcdn.com/obj/test-thumb.jpeg',
        }),
      } as unknown as Response);

      const res = await app.request('/api/v1/metadata', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: 'https://www.tiktok.com/@doglover123/video/7123456789' }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.platform).toBe('tiktok');
      expect(data.data.title).toBe('Cute dancing dog video #viral');
      expect(data.data.author.username).toBe('doglover123');
    });

    it('returns 404 PROVIDER_NOT_FOUND when external provider returns 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      const res = await app.request('/api/v1/metadata', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      }, mockEnv);

      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_NOT_FOUND');
    });

    it('returns 504 PROVIDER_TIMEOUT when external provider request is aborted', async () => {
      globalThis.fetch = vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      const res = await app.request('/api/v1/metadata', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      }, mockEnv);

      expect(res.status).toBe(504);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PROVIDER_TIMEOUT');
    });

    it('returns 422 UNSUPPORTED_URL for an unsupported domain', async () => {
      const res = await app.request('/api/v1/metadata', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: 'https://unsupportedplatform.org/media/123' }),
      }, mockEnv);

      expect(res.status).toBe(422);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNSUPPORTED_URL');
    });
  });

  describe('POST /api/v1/download', () => {
    it('successfully processes direct YouTube media download', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const urlStr = typeof input === 'string' ? input : input.toString();
        if (urlStr.includes('youtube?url=')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: true,
              title: 'Never Gonna Give You Up',
              author: 'Rick Astley',
              thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
              mp4: 'https://vidsnap.proxy.test/video.mp4',
              mp3: 'https://vidsnap.proxy.test/audio.mp3',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            title: 'Never Gonna Give You Up',
            author_name: 'Rick Astley',
            thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          }),
        };
      });

      const res = await app.request('/api/v1/download', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          format: 'video',
          quality: 'best',
        }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.media.download_url).toBe('https://vidsnap.proxy.test/video.mp4');
      expect(data.data.media.type).toBe('video');
    });

    it('returns authorized thumbnail image for TikTok when format is image', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          title: 'Viral dance',
          author_name: 'Creator',
          thumbnail_url: 'https://p16.tiktokcdn.com/test-thumb.jpg',
        }),
      } as unknown as Response);

      const res = await app.request('/api/v1/download', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          url: 'https://www.tiktok.com/@creator/video/7123456789',
          format: 'image',
        }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.media.type).toBe('image');
      expect(data.data.media.download_url).toBe('https://p16.tiktokcdn.com/test-thumb.jpg');
    });
  });

  describe('GET /api/v1/status/:jobId', () => {
    it('returns synchronous job status information', async () => {
      const res = await app.request('/api/v1/status/job-12345', {
        method: 'GET',
        headers: authHeaders,
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.job_id).toBe('job-12345');
      expect(data.data.status).toBe('completed');
    });

    it('rejects invalid job IDs', async () => {
      const res = await app.request('/api/v1/status/invalid@job$id!', {
        method: 'GET',
        headers: authHeaders,
      }, mockEnv);

      expect(res.status).toBe(400);
    });
  });
});
