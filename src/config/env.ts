import { Env } from '../types';

export interface AppConfig {
  apiKey: string;
  environment: 'development' | 'staging' | 'production';
  rateLimitMaxRequests: number;
  rateLimitWindowSeconds: number;
  maxUrlLength: number;
  maxBodySizeBytes: number;
  requestTimeoutMs: number;
  youtubeApiKey?: string;
  instagramAccessToken?: string;
}

export function parseConfig(env: Env): AppConfig {
  return {
    apiKey: env.API_SECRET_KEY || '',
    environment: (env.ENVIRONMENT as 'development' | 'staging' | 'production') || 'development',
    rateLimitMaxRequests: Number(env.RATE_LIMIT_MAX_REQUESTS) || 60,
    rateLimitWindowSeconds: Number(env.RATE_LIMIT_WINDOW_SECONDS) || 60,
    maxUrlLength: Number(env.MAX_URL_LENGTH) || 2048,
    maxBodySizeBytes: Number(env.MAX_BODY_SIZE_BYTES) || 1048576, // 1MB
    requestTimeoutMs: Number(env.REQUEST_TIMEOUT_MS) || 10000,
    youtubeApiKey: env.YOUTUBE_API_KEY,
    instagramAccessToken: env.INSTAGRAM_ACCESS_TOKEN,
  };
}
