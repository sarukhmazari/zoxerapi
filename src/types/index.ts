/**
 * Zoxer Media API - Core Type Definitions
 */

export type PlatformType = 'tiktok' | 'instagram' | 'youtube' | 'unknown';

export type MediaFormat = 'video' | 'audio' | 'image';

export type QualityPreference = 'best' | 'high' | 'medium' | 'low';

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  platform: PlatformType | null;
  data: T | null;
  error: ApiErrorDetail | null;
}

export interface MediaAuthor {
  name: string | null;
  username?: string | null;
  url?: string | null;
  avatar?: string | null;
}

export interface MediaInfo {
  type: MediaFormat;
  format: string;
  quality?: string | null;
  download_url: string | null;
  size_bytes?: number | null;
  mime_type?: string | null;
  requires_external_downloader?: boolean;
}

export interface PlatformCapabilities {
  metadata: boolean;
  direct_download: boolean;
  requires_official_token: boolean;
  terms_restriction_note?: string;
}

export interface MetadataResult {
  id: string | null;
  title: string;
  description: string | null;
  thumbnail: string | null;
  author: MediaAuthor | null;
  duration: number | null; // in seconds
  media?: MediaInfo | null;
  available_media?: MediaInfo[];
  canonical_url: string;
  capabilities: PlatformCapabilities;
}

export interface DetectionResult {
  platform: PlatformType;
  is_valid: boolean;
  is_supported: boolean;
  normalized_url: string;
  canonical_id?: string | null;
  media_type_hint?: 'video' | 'post' | 'short' | 'reel' | 'unknown';
}

export interface DownloadResult {
  title: string;
  thumbnail: string | null;
  author: MediaAuthor | null;
  duration: number | null;
  media: MediaInfo;
}

export interface Env {
  API_SECRET_KEY?: string;
  ENVIRONMENT?: string;
  RATE_LIMIT_MAX_REQUESTS?: string | number;
  RATE_LIMIT_WINDOW_SECONDS?: string | number;
  MAX_URL_LENGTH?: string | number;
  MAX_BODY_SIZE_BYTES?: string | number;
  REQUEST_TIMEOUT_MS?: string | number;
  YOUTUBE_API_KEY?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  MEDIA_BUCKET?: R2Bucket;
  MEDIA_QUEUE?: Queue;
}
