import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { timingSafeEqual } from '../src/middleware/authentication';
import { Env } from '../src/types';

describe('Authentication & Rate Limiting Middleware', () => {
  const mockEnv: Env = {
    API_SECRET_KEY: 'test-secure-api-key-1234567890',
    ENVIRONMENT: 'development',
    RATE_LIMIT_MAX_REQUESTS: 5,
    RATE_LIMIT_WINDOW_SECONDS: 60,
  };

  const app = createApp();

  describe('timingSafeEqual', () => {
    it('returns true for matching strings', () => {
      expect(timingSafeEqual('supersecrettoken', 'supersecrettoken')).toBe(true);
    });

    it('returns false for mismatched strings of same length', () => {
      expect(timingSafeEqual('supersecrettoken1', 'supersecrettoken2')).toBe(false);
    });

    it('returns false for strings of different length', () => {
      expect(timingSafeEqual('short', 'longerstring')).toBe(false);
    });

    it('returns false for invalid inputs', () => {
      // @ts-expect-error testing invalid input types
      expect(timingSafeEqual(null, 'test')).toBe(false);
      // @ts-expect-error testing invalid input types
      expect(timingSafeEqual('test', undefined)).toBe(false);
    });
  });

  describe('Bearer Token Enforcement on /api/*', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      }, mockEnv);

      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toContain('Authorization header with Bearer token is required');
    });

    it('returns 401 for malformed Authorization format', async () => {
      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic dXNlcjpwYXNz',
        },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      }, mockEnv);

      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toContain('Expected format: Bearer <token>');
    });

    it('returns 401 for invalid Bearer token', async () => {
      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer wrong-secret-token',
        },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      }, mockEnv);

      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toBe('Invalid or unauthorized API key.');
    });

    it('returns 500 if server environment is missing API_SECRET_KEY', async () => {
      const unconfiguredEnv: Env = {
        ENVIRONMENT: 'development',
      };

      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer any-token',
        },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      }, unconfiguredEnv);

      expect(res.status).toBe(500);
      const data = await res.json() as any;
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });

    it('authenticates successfully with valid Bearer token', async () => {
      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockEnv.API_SECRET_KEY}`,
        },
        body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      }, mockEnv);

      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.platform).toBe('youtube');
    });
  });

  describe('Public Endpoints (Discovery and Health)', () => {
    it('allows GET / without authentication', async () => {
      const res = await app.request('/', { method: 'GET' }, mockEnv);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Zoxer Media API');
      expect(data.data.supported_platforms).toContain('youtube');
    });

    it('allows GET /health without authentication', async () => {
      const res = await app.request('/health', { method: 'GET' }, mockEnv);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('healthy');
    });
  });
});
