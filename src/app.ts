import { Hono } from 'hono';
import { Env } from './types';
import { globalErrorHandler, notFoundHandler } from './middleware/error-handler';
import { authMiddleware } from './middleware/authentication';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { createErrorResponse, ErrorCodes } from './utils/response';
import { healthRoute } from './routes/health';
import { detectRoute } from './routes/detect';
import { metadataRoute } from './routes/metadata';
import { downloadRoute } from './routes/download';
import { spotifyRoute } from './routes/spotify';
import { slowedRoute } from './routes/slowed';
import { streamRoute } from './routes/stream';

export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  // Attach global error and 404 handlers
  app.onError(globalErrorHandler);
  app.notFound(notFoundHandler);

  // Security: Payload size limiter middleware
  app.use('*', async (c, next) => {
    const maxBytes = Number(c.env.MAX_BODY_SIZE_BYTES) || 1048576; // 1 MB default
    const contentLength = c.req.header('content-length');

    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      return c.json(
        createErrorResponse(
          ErrorCodes.PAYLOAD_TOO_LARGE,
          `Payload size exceeds maximum allowed limit of ${maxBytes} bytes.`
        ),
        413
      );
    }

    await next();
  });

  // Public discovery, health & audio stream routes
  app.route('/', healthRoute);
  app.route('/api/stream', streamRoute);

  // Protected API routes: Require Bearer token authentication and sliding-window rate limit
  app.use('/api/*', rateLimitMiddleware());
  app.use('/api/*', authMiddleware());

  // Mount specialized routes under /api
  app.route('/api/spotify', spotifyRoute);
  app.route('/api/slowed', slowedRoute);
  app.route('/api/media', downloadRoute);
  app.route('/api/v1/media', downloadRoute);

  // Mount versioned API routes under /api/v1
  app.route('/api/v1', detectRoute);
  app.route('/api/v1', metadataRoute);
  app.route('/api/v1', downloadRoute);

  return app;
}
