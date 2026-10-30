/**
 * Zoxer Media API - Safe URL Validator & SSRF Protection
 */

export interface UrlValidationResult {
  isValid: boolean;
  isSafe: boolean;
  parsedUrl?: URL;
  normalizedUrl?: string;
  error?: string;
}

// Allowed protocols
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// Blocked hostnames (exact or suffix)
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'broadcasthost',
  'local',
  'internal',
  'corp',
  'lan',
  'home',
  'invalid',
  'test',
  'metadata',
  'instance-data',
  '169.254.169.254', // AWS/GCP/Cloud metadata service
  'metadata.google.internal',
  'metadata.google',
]);

// Helper to check IPv4 private/reserved ranges
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => {
    // Check for leading zero octal or hex or invalid numeric
    if (!/^\d+$/.test(p)) return -1;
    const num = parseInt(p, 10);
    return num >= 0 && num <= 255 ? num : -1;
  });

  if (parts.length !== 4 || parts.some((p) => p === -1)) {
    return false;
  }

  const [a, b] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (Multicast)
  if (a >= 224) return true;

  return false;
}

// Helper to check IPv6 private/loopback/link-local ranges
function isPrivateIPv6(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  // ::1 / :: (Loopback / Unspecified)
  if (clean === '::1' || clean === '::' || clean === '0:0:0:0:0:0:0:1') return true;

  // fe80::/10 (Link-local)
  if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) {
    return true;
  }

  // fc00::/7 (Unique local address)
  if (clean.startsWith('fc') || clean.startsWith('fd')) {
    return true;
  }

  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (clean.startsWith('::ffff:')) {
    const ipv4 = clean.slice(7);
    return isPrivateIPv4(ipv4);
  }

  return false;
}

// Decimal or hex IP representations (e.g. 2130706433 or 0x7f000001)
function isNumericOrHexIP(host: string): boolean {
  // Pure integer string
  if (/^\d+$/.test(host)) return true;
  // Hex string
  if (/^0x[0-9a-fA-F]+$/i.test(host)) return true;
  // Dotted hex/octal e.g. 0177.0.0.1 or 0x7f.0.0.1
  if (/^0[0-7]+(\.|$)/.test(host) || /^0x[0-9a-fA-F]+(\.|$)/i.test(host)) return true;
  return false;
}

export function validateSafeUrl(rawUrl: string, maxUrlLength: number = 2048): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, isSafe: false, error: 'URL must be a non-empty string.' };
  }

  const trimmed = rawUrl.trim();

  if (trimmed.length > maxUrlLength) {
    return { isValid: false, isSafe: false, error: `URL exceeds maximum length of ${maxUrlLength} characters.` };
  }

  // Check for suspicious control characters or newlines
  if (/[\r\n\t\0]/.test(trimmed)) {
    return { isValid: false, isSafe: false, error: 'URL contains illegal control characters.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, isSafe: false, error: 'Malformed URL format.' };
  }

  // Enforce protocol (must be http: or https:)
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      isValid: false,
      isSafe: false,
      error: `Disallowed protocol '${parsed.protocol}'. Only http: and https: are permitted.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!hostname || hostname.length === 0) {
    return { isValid: false, isSafe: false, error: 'URL does not contain a valid hostname.' };
  }

  // SSRF Protection: Check blocked names
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { isValid: true, isSafe: false, error: 'Access to loopback, internal, or metadata hostnames is forbidden.' };
  }

  // Check numeric / hex obfuscated IPs
  if (isNumericOrHexIP(hostname)) {
    return { isValid: true, isSafe: false, error: 'Access via obfuscated numeric or hex IP hostnames is forbidden.' };
  }

  // Check IPv4 private ranges
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      return { isValid: true, isSafe: false, error: 'Access to private, link-local, or loopback IPv4 addresses is forbidden.' };
    }
  }

  // Check IPv6 addresses
  if (hostname.includes(':')) {
    if (isPrivateIPv6(hostname)) {
      return { isValid: true, isSafe: false, error: 'Access to private or loopback IPv6 addresses is forbidden.' };
    }
  }

  // Strip credentials if present (user:pass@host)
  parsed.username = '';
  parsed.password = '';

  return {
    isValid: true,
    isSafe: true,
    parsedUrl: parsed,
    normalizedUrl: parsed.toString(),
  };
}
