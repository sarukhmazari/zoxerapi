/**
 * ==============================================================================
 * Zoxer Media API - WhatsApp Bot Integration Client
 * ==============================================================================
 * 
 * Target Environment: AWS Lightsail (Node.js + Baileys WhatsApp bot)
 * Consumes: Zoxer Media API hosted on Cloudflare Workers
 * 
 * Required Environment Variables in your Lightsail .env:
 *   ZOXER_API_URL="https://zoxer-media-api.<your-subdomain>.workers.dev"
 *   ZOXER_API_KEY="your_production_api_secret_key"
 * 
 * DO NOT hardcode your API key or endpoint URLs here.
 * ==============================================================================
 */

/**
 * Zoxer Media API Client Class
 */
export class ZoxerApiClient {
  /**
   * @param {string} [apiUrl] - Base URL of your Cloudflare Worker API
   * @param {string} [apiKey] - Secret Bearer token
   * @param {number} [timeoutMs] - Request timeout in milliseconds (default 12000)
   */
  constructor(apiUrl, apiKey, timeoutMs = 12000) {
    this.apiUrl = (apiUrl || process.env.ZOXER_API_URL || '').replace(/\/+$/, '');
    this.apiKey = apiKey || process.env.ZOXER_API_KEY || '';
    this.timeoutMs = timeoutMs;

    if (!this.apiUrl) {
      throw new Error('[ZoxerApiClient] ZOXER_API_URL environment variable is missing.');
    }
    if (!this.apiKey) {
      throw new Error('[ZoxerApiClient] ZOXER_API_KEY environment variable is missing.');
    }
  }

  /**
   * Generic internal fetch with authentication, timeouts, and standard error handling
   * @private
   */
  async _request(endpoint, payload) {
    const targetUrl = `${this.apiUrl}${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Lightsail-WhatsApp-Bot/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorDetail = data?.error || {
          code: `HTTP_${response.status}`,
          message: response.statusText || 'Unexpected server error.',
        };
        const error = new Error(errorDetail.message);
        error.code = errorDetail.code;
        error.status = response.status;
        error.details = errorDetail;
        throw error;
      }

      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        const timeoutError = new Error('Zoxer Media API request timed out.');
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Detects platform and validates URL support
   * @param {string} url - Target media link
   * @returns {Promise<Object>} Detection response
   */
  async detect(url) {
    return this._request('/api/v1/detect', { url });
  }

  /**
   * Retrieves official metadata for a supported social media URL
   * @param {string} url - Target media link
   * @returns {Promise<Object>} Metadata response
   */
  async getMetadata(url) {
    return this._request('/api/v1/metadata', { url });
  }

  /**
   * Requests a media download reference
   * @param {string} url - Target media link
   * @param {'video'|'audio'|'image'} [format='video']
   * @param {'best'|'high'|'medium'|'low'} [quality='best']
   * @returns {Promise<Object>} Download reference response
   */
  async download(url, format = 'video', quality = 'best') {
    return this._request('/api/v1/download', { url, format, quality });
  }
}

/**
 * Baileys Handler Example: Call this from your WhatsApp bot's message listener
 * 
 * @param {import('@whiskeysockets/baileys').WASocket} sock - Active Baileys socket
 * @param {import('@whiskeysockets/baileys').proto.IWebMessageInfo} msg - Inbound WhatsApp message
 * @param {string} extractedUrl - Social media URL extracted from message text
 */
export async function handleSocialMediaMessage(sock, msg, extractedUrl) {
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid) return;

  const client = new ZoxerApiClient();

  try {
    // Step 1: Detect platform
    const detection = await client.detect(extractedUrl);

    if (!detection.data?.is_supported) {
      await sock.sendMessage(
        remoteJid,
        { text: '⚠️ Unsupported platform or link. We currently support TikTok, Instagram, and YouTube.' },
        { quoted: msg }
      );
      return;
    }

    const platform = detection.platform;

    // Send a subtle reaction or status message
    await sock.sendMessage(
      remoteJid,
      { text: `🔍 *Detected ${platform.toUpperCase()} URL*\nFetching metadata...` },
      { quoted: msg }
    );

    // Step 2: Fetch metadata
    const metaResponse = await client.getMetadata(extractedUrl);
    const meta = metaResponse.data;

    const caption = [
      `🎬 *${meta.title || 'Social Media Media'}*`,
      meta.author?.name ? `👤 *Author:* ${meta.author.name} ${meta.author.username ? `(@${meta.author.username})` : ''}` : null,
      meta.duration ? `⏱️ *Duration:* ${meta.duration}s` : null,
      `🔗 *Canonical Link:* ${meta.canonical_url}`,
    ].filter(Boolean).join('\n');

    // Step 3: Handle media download / thumbnail delivery
    try {
      const downloadResponse = await client.download(extractedUrl, 'video', 'best');
      const media = downloadResponse.data.media;

      if (media.download_url) {
        // Send downloadable media directly via Baileys streaming URL
        if (media.type === 'video') {
          await sock.sendMessage(
            remoteJid,
            {
              video: { url: media.download_url },
              caption,
              mimetype: media.mime_type || 'video/mp4',
            },
            { quoted: msg }
          );
          return;
        }

        if (media.type === 'image') {
          await sock.sendMessage(
            remoteJid,
            {
              image: { url: media.download_url },
              caption,
            },
            { quoted: msg }
          );
          return;
        }
      }
    } catch (downloadErr) {
      // If direct binary extraction is restricted by platform terms/DRM:
      // Deliver the official thumbnail and metadata gracefully instead of failing
      if (meta.thumbnail) {
        await sock.sendMessage(
          remoteJid,
          {
            image: { url: meta.thumbnail },
            caption: `${caption}\n\nℹ️ _Note: Direct video extraction is restricted by ${platform} terms of service. Displaying authorized preview and metadata._`,
          },
          { quoted: msg }
        );
        return;
      }
    }

    // Fallback: Send text metadata summary if no visual media is accessible
    await sock.sendMessage(
      remoteJid,
      { text: caption },
      { quoted: msg }
    );

  } catch (err) {
    console.error('[WhatsApp Bot] Zoxer API Error:', err.message);

    let userMessage = '❌ Failed to process the requested URL.';

    if (err.code === 'UNSUPPORTED_URL') {
      userMessage = '⚠️ This URL is not supported by Zoxer Media API.';
    } else if (err.code === 'PROVIDER_NOT_FOUND') {
      userMessage = '⚠️ Media not found. The post may be private or removed.';
    } else if (err.code === 'TIMEOUT') {
      userMessage = '⏳ The media provider took too long to respond. Please try again later.';
    } else if (err.code === 'RATE_LIMIT_EXCEEDED') {
      userMessage = '🛑 Rate limit reached. Please wait a moment before sending more links.';
    } else if (err.code === 'SSRF_ATTEMPT_DETECTED') {
      userMessage = '⛔ Invalid or restricted link.';
    }

    await sock.sendMessage(
      remoteJid,
      { text: userMessage },
      { quoted: msg }
    );
  }
}
