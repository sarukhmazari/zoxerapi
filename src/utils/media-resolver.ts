import { SafeLogger } from './logger';

export interface ResolvedMedia {
  title?: string;
  author?: string;
  thumbnail?: string;
  download_url?: string;
  type: 'video' | 'audio' | 'image';
  format: string;
}

const snaptikTokenKey = (() => {
  const prefix = [115, 110, 52, 112].map((x) => String.fromCharCode(x)).join('');
  return prefix + 't1k_v3r1fy2026';
})();

function solveSnaptikChallenge(t: any): number {
  switch (t.t) {
    case 'b':
      return ((t.a ^ t.b) >> t.s) & 255;
    case 'r':
      return t.n.reduce((h: number, f: number) => h + f, 0) * 2 + 1;
    case 'c':
      return t.w.charCodeAt(t.i) * t.m;
    case 'm':
      return (((t.a + t.b) % 100) * t.c);
    case 'n':
      return t.a * t.b + t.b * t.c + t.c * t.a - t.a;
    default:
      throw new Error('Unknown snaptik challenge');
  }
}

async function decryptSnaptikPayload(id: string, payloadBase64: string): Promise<any> {
  const binaryStr = atob(payloadBase64);
  const data = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    data[i] = binaryStr.charCodeAt(i);
  }

  const iv = data.subarray(0, 16);
  const encrypted = data.subarray(16);

  const keyBytes = new TextEncoder().encode(`${snaptikTokenKey}:${id}`);
  const keyDigest = await crypto.subtle.digest('SHA-256', keyBytes);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyDigest,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );

  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    encrypted
  );

  const text = new TextDecoder().decode(decryptedBuf);
  return JSON.parse(text);
}

/**
 * Resolve direct YouTube download link (MP4 video or MP3 audio)
 */
export async function resolveYouTubeDownload(
  url: string,
  preferredFormat: string = 'video',
  timeoutMs: number = 15000
): Promise<ResolvedMedia | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`https://backend1.tioo.eu.org/youtube?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'btch/6.4.0',
      },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        status?: boolean;
        title?: string;
        author?: string;
        thumbnail?: string;
        mp4?: string;
        mp3?: string;
      };

      const isAudio = preferredFormat === 'audio' || preferredFormat === 'mp3';
      const downloadUrl = isAudio ? (data.mp3 || data.mp4) : (data.mp4 || data.mp3);

      if (downloadUrl) {
        return {
          title: data.title,
          author: data.author,
          thumbnail: data.thumbnail,
          download_url: downloadUrl,
          type: isAudio ? 'audio' : 'video',
          format: isAudio ? 'mp3' : 'mp4',
        };
      }
    }
  } catch (err) {
    SafeLogger.warn('YouTube direct stream resolution error', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }

  return null;
}

/**
 * Resolve direct TikTok download link (MP4 without watermark)
 */
export async function resolveTikTokDownload(
  url: string,
  timeoutMs: number = 15000
): Promise<ResolvedMedia | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const tokenRes = await fetch('https://snaptik.app/api/token', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (tokenRes.ok) {
      const tokenData = (await tokenRes.json()) as { id?: string; p?: string };
      if (tokenData.id && tokenData.p) {
        const challenge = await decryptSnaptikPayload(tokenData.id, tokenData.p);
        const solved = solveSnaptikChallenge(challenge);
        const verifyHeader = `${tokenData.id}:${solved}:${challenge._e}:${challenge._h}`;

        const extractRes = await fetch(
          `https://snaptik.app/api/extract?url=${encodeURIComponent(url)}`,
          {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'x-requested-with': 'XMLHttpRequest',
              'x-verify': verifyHeader,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          }
        );

        if (extractRes.ok) {
          const extractData = (await extractRes.json()) as {
            data?: {
              title?: string;
              thumbnail?: string;
              downloadUrl?: string;
            };
          };

          if (extractData.data?.downloadUrl) {
            return {
              title: extractData.data.title,
              thumbnail: extractData.data.thumbnail,
              download_url: extractData.data.downloadUrl,
              type: 'video',
              format: 'mp4',
            };
          }
        }
      }
    }
  } catch (err) {
    SafeLogger.warn('Snaptik TikTok resolution error, attempting fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }

  // Fallback to secondary endpoint
  try {
    const fallbackRes = await fetch(
      `https://backend1.tioo.eu.org/ttdl?url=${encodeURIComponent(url)}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'btch/6.4.0',
        },
      }
    );

    if (fallbackRes.ok) {
      const fbData = (await fallbackRes.json()) as {
        status?: boolean;
        title?: string;
        thumbnail?: string;
        video?: string[];
      };

      const videoLink = fbData.video?.[0];
      if (videoLink) {
        return {
          title: fbData.title,
          thumbnail: fbData.thumbnail,
          download_url: videoLink,
          type: 'video',
          format: 'mp4',
        };
      }
    }
  } catch (e) {
    SafeLogger.warn('Secondary TikTok resolver error', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return null;
}

/**
 * Resolve direct Instagram download link or media asset
 */
export async function resolveInstagramDownload(
  url: string,
  timeoutMs: number = 15000
): Promise<ResolvedMedia | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const uvRes = await fetch('https://saveinsta.to/api/userverify', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://saveinsta.to',
        'Referer': 'https://saveinsta.to/en',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: new URLSearchParams({ url }),
    });

    if (uvRes.ok) {
      const uvData = (await uvRes.json()) as { success?: boolean; token?: string };
      if (uvData.token) {
        const searchRes = await fetch('https://saveinsta.to/api/ajaxSearch', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Origin': 'https://saveinsta.to',
            'Referer': 'https://saveinsta.to/en',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: new URLSearchParams({
            q: url,
            t: 'media',
            lang: 'en',
            cftoken: uvData.token,
          }),
        });

        if (searchRes.ok) {
          const searchData = (await searchRes.json()) as {
            status?: string;
            data?: string;
          };

          if (searchData.data) {
            const html = searchData.data;
            const regex = /href="([^"]+)"/gi;
            let m;
            let directUrl: string | null = null;
            while ((m = regex.exec(html)) !== null) {
              const href = m[1];
              if (!href.includes('play.google.com') && !href.includes('apple.com') && !href.includes('saveinsta.to') && href.startsWith('http')) {
                directUrl = href;
                break;
              }
            }
            const thumbMatch = html.match(/<img[^>]+src="([^"]+)"/i);
            const isVideo = html.includes('icon-dlvideo') || html.includes('Download Video') || /\.mp4(\?|$)/i.test(directUrl || '');

            if (directUrl) {
              return {
                download_url: directUrl,
                thumbnail: thumbMatch?.[1] || undefined,
                type: isVideo ? 'video' : 'image',
                format: isVideo ? 'mp4' : 'jpeg',
              };
            }
          }
        }
      }
    }
  } catch (err) {
    SafeLogger.warn('SaveInsta Instagram resolver error', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timer);
  }

  return null;
}
