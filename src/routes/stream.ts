import { Hono } from 'hono';
import { Env } from '../types';

export const streamRoute = new Hono<{ Bindings: Env }>();

streamRoute.get('/', async (c) => {
  const u = c.req.query('u');
  if (!u) {
    return c.text('Missing target url query parameter "u"', 400);
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(u);
  } catch {
    targetUrl = u;
  }

  try {
    const rangeHeader = c.req.header('range');
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
    };

    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const res = await fetch(targetUrl, { headers });

    if (!res.ok && res.status !== 206) {
      return c.text(`Upstream returned status ${res.status}`, res.status as any);
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', res.headers.get('content-type') || 'audio/mpeg');
    if (res.headers.has('content-length')) {
      responseHeaders.set('Content-Length', res.headers.get('content-length')!);
    }
    if (res.headers.has('content-range')) {
      responseHeaders.set('Content-Range', res.headers.get('content-range')!);
    }
    if (res.headers.has('accept-ranges')) {
      responseHeaders.set('Accept-Ranges', res.headers.get('accept-ranges')!);
    }
    responseHeaders.set('Cache-Control', 'public, max-age=86400');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return c.text(`Stream proxy failed: ${err.message}`, 500);
  }
});
