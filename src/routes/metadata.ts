import { Hono } from 'hono';
import { Env, PlatformType } from '../types';
import { metadataRequestSchema } from '../schemas/request.schema';
import { metadataService } from '../services/metadata.service';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response';
import { SafeLogger } from '../utils/logger';

export const metadataRoute = new Hono<{ Bindings: Env }>();

/**
 * Metadata Extraction Endpoint
 * POST /api/v1/metadata
 */
metadataRoute.post('/metadata', async (c) => {
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

  const parseResult = metadataRequestSchema.safeParse(body);
  if (!parseResult.success) {
    const msg = parseResult.error.issues[0]?.message || 'Invalid request body.';
    return c.json(
      createErrorResponse(ErrorCodes.INVALID_REQUEST, msg),
      400
    );
  }

  const { url } = parseResult.data;

  try {
    const { metadata, platform } = await metadataService.getMetadata(url, c.env);

    // Primary media format summary
    const primaryMedia = metadata.available_media?.[0] || {
      type: 'video',
      format: 'mp4',
      quality: 'default',
      download_url: null,
    };

    return c.json(
      createSuccessResponse(
        {
          id: metadata.id,
          title: metadata.title,
          description: metadata.description,
          thumbnail: metadata.thumbnail,
          author: metadata.author,
          duration: metadata.duration,
          media: primaryMedia,
          available_media: metadata.available_media,
          canonical_url: metadata.canonical_url,
          capabilities: metadata.capabilities,
        },
        platform as PlatformType
      )
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown metadata error';

    SafeLogger.error('Metadata retrieval failed', err);

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

    if (errorMessage.includes('not found') || errorMessage.includes('private')) {
      return c.json(
        createErrorResponse(
          ErrorCodes.PROVIDER_NOT_FOUND,
          errorMessage
        ),
        404
      );
    }

    if (errorMessage.includes('aborted') || errorMessage.includes('timeout')) {
      return c.json(
        createErrorResponse(
          ErrorCodes.PROVIDER_TIMEOUT,
          'External provider request timed out.'
        ),
        504
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
