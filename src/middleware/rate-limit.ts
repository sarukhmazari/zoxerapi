import { MiddlewareHandler } from 'hono';
import { Env } from '../types';
import { createErrorResponse, ErrorCodes } from '../utils/response';

interface RateLimitRecord {
  timestamps: number[];
}

// In-isolate memory store for rate limiting
const ipRateLimits = new Map<string, RateLimitRecord>();

// Periodic cleanup to avoid memory leak in long-lived isolates
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRateLimits.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < 120_000);
    if (record.timestamps.length === 0) {
      ipRateLimits.delete(ip);
    }
  }
}, 60_000);

export function rateLimitMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const maxRequests = Number(c.env.RATE_LIMIT_MAX_REQUESTS) || 60;
    const windowSeconds = Number(c.env.RATE_LIMIT_WINDOW_SECONDS) || 60;
    const windowMs = windowSeconds * 1000;

    // Get client identifier: prefer Cloudflare connecting IP, fallback to X-Forwarded-For or remote address
    const clientIp =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      'anonymous-client';

    const now = Date.now();
    let record = ipRateLimits.get(clientIp);

    if (!record) {
      record = { timestamps: [] };
      ipRateLimits.set(clientIp, record);
    }

    // Filter out timestamps outside the active window
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

    if (record.timestamps.length >= maxRequests) {
      const oldestTs = record.timestamps[0];
      const resetInSeconds = Math.max(1, Math.ceil((oldestTs + windowMs - now) / 1000));

      c.header('Retry-After', resetInSeconds.toString());
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', resetInSeconds.toString());

      return c.json(
        createErrorResponse(
          ErrorCodes.RATE_LIMIT_EXCEEDED,
          `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowSeconds} seconds.`
        ),
        429
      );
    }

    record.timestamps.push(now);

    c.header('X-RateLimit-Limit', maxRequests.toString());
    c.header(
      'X-RateLimit-Remaining',
      Math.max(0, maxRequests - record.timestamps.length).toString()
    );

    await next();
  };
}
