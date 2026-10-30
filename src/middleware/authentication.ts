import { MiddlewareHandler } from 'hono';
import { Env } from '../types';
import { createErrorResponse, ErrorCodes } from '../utils/response';
import { SafeLogger } from '../utils/logger';

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  if (aBuf.byteLength !== bBuf.byteLength) {
    // Perform dummy XOR loop to mitigate timing leakage
    let dummy = 0;
    for (let i = 0; i < aBuf.byteLength; i++) {
      dummy |= aBuf[i] ^ aBuf[i];
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    result |= aBuf[i] ^ bBuf[i];
  }

  return result === 0;
}

export function authMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const configuredKey = c.env.API_SECRET_KEY;

    if (!configuredKey) {
      SafeLogger.error('API_SECRET_KEY is not configured in environment bindings.');
      return c.json(
        createErrorResponse(
          ErrorCodes.INTERNAL_ERROR,
          'Authentication service configuration error.'
        ),
        500
      );
    }

    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      return c.json(
        createErrorResponse(
          ErrorCodes.UNAUTHORIZED,
          'Authorization header with Bearer token is required.'
        ),
        401
      );
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return c.json(
        createErrorResponse(
          ErrorCodes.UNAUTHORIZED,
          'Invalid Authorization format. Expected format: Bearer <token>'
        ),
        401
      );
    }

    const clientToken = match[1].trim();

    if (!timingSafeEqual(clientToken, configuredKey.trim())) {
      SafeLogger.warn('Unauthorized API access attempt with invalid Bearer token.');
      return c.json(
        createErrorResponse(
          ErrorCodes.UNAUTHORIZED,
          'Invalid or unauthorized API key.'
        ),
        401
      );
    }

    await next();
  };
}
