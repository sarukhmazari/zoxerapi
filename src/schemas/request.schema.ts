import { z } from 'zod';

export const detectRequestSchema = z.object({
  url: z
    .string({
      required_error: 'Field "url" is required.',
      invalid_type_error: 'Field "url" must be a string.',
    })
    .min(1, 'URL cannot be empty.')
    .max(2048, 'URL exceeds maximum length of 2048 characters.'),
});

export type DetectRequest = z.infer<typeof detectRequestSchema>;

export const metadataRequestSchema = z.object({
  url: z
    .string({
      required_error: 'Field "url" is required.',
      invalid_type_error: 'Field "url" must be a string.',
    })
    .min(1, 'URL cannot be empty.')
    .max(2048, 'URL exceeds maximum length of 2048 characters.'),
});

export type MetadataRequest = z.infer<typeof metadataRequestSchema>;

export const downloadRequestSchema = z.object({
  url: z
    .string({
      required_error: 'Field "url" is required.',
      invalid_type_error: 'Field "url" must be a string.',
    })
    .min(1, 'URL cannot be empty.')
    .max(2048, 'URL exceeds maximum length of 2048 characters.'),
  format: z.enum(['video', 'audio', 'image', 'spotify', 'slowed', 'sp', 'slow']).default('video'),
  quality: z.enum(['best', 'high', 'medium', 'low']).default('best'),
});

export type DownloadRequest = z.infer<typeof downloadRequestSchema>;
