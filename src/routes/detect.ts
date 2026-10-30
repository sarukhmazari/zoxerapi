import { Hono } from 'hono';
import { Env } from '../types';
import { detectRequestSchema } from '../schemas/request.schema';
import { platformDetector } from '../platforms/platform-detector';
import { validateSafeUrl } from '../utils/url-validator';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response';

export const detectRoute = new Hono<{ Bindings: Env }>();

/**
 * Platform Detection Endpoint
 * POST /api/v1/detect
 */
detectRoute.post('/detect', async (c) => {
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

  const parseResult = detectRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const msg = parseResult.error.issues[0]?.message || 'Invalid request body.';
    return c.json(
      createErrorResponse(ErrorCodes.INVALID_REQUEST, msg),
      400
    );
  }

  const { url } = parseResult.data;
  const maxUrlLength = Number(c.env.MAX_URL_LENGTH) || 2048;

  // SSRF & Protocol Safety Check
  const validation = validateSafeUrl(url, maxUrlLength);
  if (!validation.isValid) {
    return c.json(
      createErrorResponse(
        ErrorCodes.INVALID_URL,
        validation.error || 'Invalid URL provided.'
      ),
      400
    );
  }

  if (!validation.isSafe) {
    return c.json(
      createErrorResponse(
        ErrorCodes.SSRF_ATTEMPT_DETECTED,
        validation.error || 'Security check failed. Access to private or loopback hosts is restricted.'
      ),
      400
    );
  }

  const detection = platformDetector.detect(url, maxUrlLength);

  return c.json(
    createSuccessResponse(
      {
        detected_platform: detection.platform,
        is_valid: detection.is_valid,
        is_supported: detection.is_supported,
        normalized_url: detection.normalized_url,
        canonical_id: detection.canonical_id,
        media_type_hint: detection.media_type_hint,
      },
      detection.platform === 'unknown' ? null : detection.platform
    )
  );
});
