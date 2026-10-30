import { Hono } from 'hono';
import { Env, PlatformType } from '../types';
import { downloadRequestSchema } from '../schemas/request.schema';
import { mediaService } from '../services/media.service';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response';
import { SafeLogger } from '../utils/logger';

export const downloadRoute = new Hono<{ Bindings: Env }>();

/**
 * Media Download Reference Endpoint
 * POST /api/v1/download
 */
downloadRoute.post('/download', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      createErrorResponse(
        ErrorCodes.INVALID_REQUEST,
        'Malformed JSON request body.'
      ),
      400
    );
  }

  const parseResult = downloadRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const msg = parseResult.error.issues[0]?.message || 'Invalid request body.';
    return c.json(
      createErrorResponse(ErrorCodes.INVALID_REQUEST, msg),
      400
    );
  }

  const { url, format, quality } = parseResult.data;

  try {
    const { result, platform } = await mediaService.processDownload(
      url,
      { format, quality },
      c.env
    );

    return c.json(
      createSuccessResponse(
        {
          title: result.title,
          thumbnail: result.thumbnail,
          author: result.author,
          duration: result.duration,
          media: result.media,
        },
        platform as PlatformType
      )
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Media download error';

    SafeLogger.error('Media download processing failed', err);

    if (errorMessage.startsWith('INVALID_URL')) {
      return c.json(
        createErrorResponse(
          ErrorCodes.INVALID_URL,
          errorMessage.replace(/^INVALID_URL:\s*/, '')
        ),
        400
      );
    }

    if (errorMessage.startsWith('SSRF_ATTEMPT_DETECTED')) {
      return c.json(
        createErrorResponse(
          ErrorCodes.SSRF_ATTEMPT_DETECTED,
          errorMessage.replace(/^SSRF_ATTEMPT_DETECTED:\s*/, '')
        ),
        400
      );
    }

    if (errorMessage.startsWith('UNSUPPORTED_URL')) {
      return c.json(
        createErrorResponse(
          ErrorCodes.UNSUPPORTED_URL,
          'This URL is not supported.'
        ),
        422
      );
    }

    if (
      errorMessage.includes('restricted by') ||
      errorMessage.includes('prohibited') ||
      errorMessage.includes('Terms of Service')
    ) {
      return c.json(
        createErrorResponse(
          ErrorCodes.CAPABILITY_UNSUPPORTED,
          errorMessage
        ),
        403
      );
    }

    return c.json(
      createErrorResponse(
        ErrorCodes.PROVIDER_ERROR,
        errorMessage
      ),
      502
    );
  }
});

/**
 * Async Job Status Endpoint
 * GET /api/v1/status/:jobId
 */
downloadRoute.get('/status/:jobId', (c) => {
  const jobId = c.req.param('jobId');

  if (!jobId || !/^[a-zA-Z0-9_-]{1,64}$/.test(jobId)) {
    return c.json(
      createErrorResponse(
        ErrorCodes.INVALID_REQUEST,
        'Invalid or malformed job ID parameter.'
      ),
      400
    );
  }

  // Initial API is stateless; returns current state or indicates direct synchronous completion
  return c.json(
    createSuccessResponse({
      job_id: jobId,
      status: 'completed',
      processed_at: new Date().toISOString(),
      message: 'Initial API operates in synchronous mode. Asynchronous queue worker is idle.',
    })
  );
});
