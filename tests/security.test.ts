import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app';
import { validateSafeUrl } from '../src/utils/url-validator';
import { SafeLogger } from '../src/utils/logger';
import { Env } from '../src/types';

describe('Security & SSRF Protection', () => {
  const mockEnv: Env = {
    API_SECRET_KEY: 'test-secret-key-abcdef',
    ENVIRONMENT: 'development',
    MAX_URL_LENGTH: 2048,
    MAX_BODY_SIZE_BYTES: 1024, // 1KB for testing payload limit
  };

  const app = createApp();
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-secret-key-abcdef',
  };

  describe('SSRF & IP Range Blocking in validateSafeUrl', () => {
    it('blocks localhost', () => {
      const res = validateSafeUrl('http://localhost/status');
      expect(res.isSafe).toBe(false);
      expect(res.error).toContain('loopback, internal, or metadata');
    });

    it('blocks 127.0.0.1 loopback', () => {
      const res = validateSafeUrl('http://127.0.0.1:8080/metrics');
      expect(res.isSafe).toBe(false);
      expect(res.error).toContain('private, link-local, or loopback');
    });

    it('blocks cloud metadata endpoint 169.254.169.254', () => {
      const res = validateSafeUrl('http://169.254.169.254/latest/meta-data/');
      expect(res.isSafe).toBe(false);
    });

    it('blocks RFC1918 10.0.0.0/8 private network', () => {
      const res = validateSafeUrl('http://10.200.1.5/admin');
      expect(res.isSafe).toBe(false);
    });

    it('blocks RFC1918 172.16.0.0/12 private network', () => {
      const res = validateSafeUrl('http://172.20.0.1/');
      expect(res.isSafe).toBe(false);
    });

    it('blocks RFC1918 192.168.0.0/16 private network', () => {
      const res = validateSafeUrl('http://192.168.1.1/router');
      expect(res.isSafe).toBe(false);
    });

    it('blocks IPv6 loopback [::1]', () => {
      const res = validateSafeUrl('http://[::1]/internal');
      expect(res.isSafe).toBe(false);
    });

    it('blocks obfuscated integer IP representations (e.g. 2130706433 for 127.0.0.1)', () => {
      const res = validateSafeUrl('http://2130706433/');
      expect(res.isSafe).toBe(false);
      expect(res.error).toMatch(/(obfuscated numeric or hex|private, link-local, or loopback)/);
    });

    it('blocks non-HTTP protocols (file:, ftp:, gopher:)', () => {
      expect(validateSafeUrl('file:///etc/passwd').isValid).toBe(false);
      expect(validateSafeUrl('ftp://ftp.test.com/file').isValid).toBe(false);
      expect(validateSafeUrl('gopher://127.0.0.1:6379/').isValid).toBe(false);
      expect(validateSafeUrl('javascript:alert(1)').isValid).toBe(false);
    });

    it('blocks URLs with CRLF injection characters', () => {
      const res = validateSafeUrl('https://youtube.com/watch?v=123\r\nHost: evil.com');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('control characters');
    });

    it('allows valid public HTTPS URL', () => {
      const res = validateSafeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.isValid).toBe(true);
      expect(res.isSafe).toBe(true);
      expect(res.normalizedUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });
  });

  describe('SSRF Protection via HTTP Endpoints', () => {
    it('returns 400 SSRF_ATTEMPT_DETECTED when malicious internal IP is sent to /detect', async () => {
      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' }),
      }, mockEnv);

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SSRF_ATTEMPT_DETECTED');
    });

    it('returns 400 SSRF_ATTEMPT_DETECTED when localhost is sent to /metadata', async () => {
      const res = await app.request('/api/v1/metadata', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ url: 'http://localhost:3000/api' }),
      }, mockEnv);

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SSRF_ATTEMPT_DETECTED');
    });
  });

  describe('Payload Size & URL Length Limits', () => {
    it('returns 413 PAYLOAD_TOO_LARGE when request exceeds MAX_BODY_SIZE_BYTES', async () => {
      const largePayload = JSON.stringify({
        url: 'https://youtube.com',
        junk: 'x'.repeat(2048),
      });

      const res = await app.request('/api/v1/detect', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Length': largePayload.length.toString(),
        },
        body: largePayload,
      }, mockEnv);

      expect(res.status).toBe(413);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Safe Logger Sanitization', () => {
    it('redacts Bearer tokens and custom secrets in logs', () => {
      let loggedOutput = '';
      const originalLog = console.log;
      console.log = (msg: string) => { loggedOutput = msg; };

      try {
        const rawToken = 'secret-auth-token-999999';
        SafeLogger.info(`Incoming request with Bearer ${rawToken} and apiKey=supersecret`, {}, [rawToken]);

        expect(loggedOutput).not.toContain(rawToken);
        expect(loggedOutput).toContain('Bearer [REDACTED]');
        expect(loggedOutput).toContain('apiKey=[REDACTED]');
      } finally {
        console.log = originalLog;
      }
    });
  });
});
