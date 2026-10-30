import { ApiResponse, PlatformType, ApiErrorDetail } from '../types';

export function createSuccessResponse<T>(
  data: T,
  platform: PlatformType | null = null
): ApiResponse<T> {
  return {
    success: true,
    platform,
    data,
    error: null,
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  platform: PlatformType | null = null,
  details?: unknown
): ApiResponse<null> {
  const errorObj: ApiErrorDetail = {
    code,
    message,
  };

  if (details !== undefined) {
    errorObj.details = details;
  }

  return {
    success: false,
    platform,
    data: null,
    error: errorObj,
  };
}

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_REQUEST: 'INVALID_REQUEST',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_URL: 'INVALID_URL',
  UNSUPPORTED_URL: 'UNSUPPORTED_URL',
  SSRF_ATTEMPT_DETECTED: 'SSRF_ATTEMPT_DETECTED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  CAPABILITY_UNSUPPORTED: 'CAPABILITY_UNSUPPORTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
