import { Hono } from 'hono';
import { Env } from '../types';
import { platformDetector } from '../platforms/platform-detector';
import { createSuccessResponse } from '../utils/response';

export const healthRoute = new Hono<{ Bindings: Env }>();

/**
 * Root endpoint: Basic API discovery & status
 * GET /
 */
healthRoute.get('/', (c) => {
  const supported = platformDetector.getSupportedPlatforms();

  return c.json(
    createSuccessResponse({
      name: 'Zoxer Media API',
      version: '1.0.0',
      status: 'operational',
      environment: c.env.ENVIRONMENT || 'development',
      supported_platforms: supported,
      documentation: {
        endpoints: [
          { method: 'GET', path: '/', description: 'API information and status' },
          { method: 'GET', path: '/health', description: 'System health check' },
          { method: 'POST', path: '/api/v1/detect', description: 'Detect media platform from URL' },
          { method: 'POST', path: '/api/v1/metadata', description: 'Fetch authorized media metadata' },
          { method: 'POST', path: '/api/v1/download', description: 'Request authorized media download reference' },
          { method: 'GET', path: '/api/v1/status/:jobId', description: 'Check asynchronous job status' },
        ],
      },
    })
  );
});

/**
 * Health check endpoint: Runtime info and liveness
 * GET /health
 */
healthRoute.get('/health', (c) => {
  return c.json(
    createSuccessResponse({
      status: 'healthy',
      runtime: 'Cloudflare Workers (V8 Isolate)',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(performance.now() / 1000),
      features: {
        r2_storage: Boolean(c.env.MEDIA_BUCKET),
        queues: Boolean(c.env.MEDIA_QUEUE),
        youtube_api: Boolean(c.env.YOUTUBE_API_KEY),
        instagram_api: Boolean(c.env.INSTAGRAM_ACCESS_TOKEN),
      },
    })
  );
});
