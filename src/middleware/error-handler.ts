import { ErrorHandler, NotFoundHandler } from 'hono';
import { Env } from '../types';
import { createErrorResponse, ErrorCodes } from '../utils/response';
import { SafeLogger } from '../utils/logger';
import { ZodError } from 'zod';

export const globalErrorHandler: ErrorHandler<{ Bindings: Env }> = (err, c) => {
  SafeLogger.error('Unhandled API exception caught:', err);

  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    const message = firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'Validation failed.';
    return c.json(
      createErrorResponse(
        ErrorCodes.INVALID_REQUEST,
        message,
        null,
        err.flatten()
      ),
      400
    );
  }

  // Body parser syntax error or payload issues
  if (err instanceof SyntaxError && 'status' in err) {
    return c.json(
      createErrorResponse(
        ErrorCodes.INVALID_REQUEST,
        'Malformed JSON payload in request body.'
      ),
      400
    );
  }

  // Generic sanitized fallback
  return c.json(
    createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      'An unexpected internal error occurred while processing the request.'
    ),
    500
  );
};

export const notFoundHandler: NotFoundHandler<{ Bindings: Env }> = (c) => {
  return c.json(
    createErrorResponse(
      'NOT_FOUND',
      `The requested endpoint '${c.req.path}' does not exist on this server.`
    ),
    404
  );
};
