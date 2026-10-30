import { Env, MetadataResult, MediaInfo, DownloadResult, PlatformCapabilities, PlatformType } from '../types';

export interface DownloadOptions {
  format?: 'video' | 'audio' | 'image';
  quality?: 'best' | 'high' | 'medium' | 'low';
}

export interface PlatformAdapter {
  readonly platform: PlatformType;

  /**
   * Evaluates whether this adapter handles the provided URL
   */
  detect(url: URL): boolean;

  /**
   * Retrieves legitimate public metadata via official API or authorized oEmbed endpoint
   */
  getMetadata(url: string, env: Env): Promise<MetadataResult>;

  /**
   * Retrieves available media streams or authorized formats
   */
  getAvailableMedia(url: string, env: Env): Promise<MediaInfo[]>;

  /**
   * Obtains authorized downloadable media reference or explains technical/terms restrictions
   */
  download(url: string, options: DownloadOptions, env: Env): Promise<DownloadResult>;

  /**
   * Reports capabilities of the adapter
   */
  getCapabilities(): PlatformCapabilities;
}
