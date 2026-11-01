/**
 * URL validation and normalisation.
 *
 * Everything here is pure and dependency free so it can run in the browser,
 * in a Cloudflare Worker and inside Node (tests) unchanged.
 */

export interface NormalizedUrl {
  ok: boolean;
  /** Normalised URL without hash, with a trailing slash kept as the user wrote it. */
  url?: URL;
  input: string;
  hadScheme: boolean;
  /** Message code for the failure, e.g. 'url.scheme'. */
  error?: string;
}

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const UNSAFE_CHARS_RE = /[\s\u00a0\u200b-\u200d\ufeff]/;

/**
 * Accepts `example.com`, `example.com/path`, `https://example.com` and returns a
 * normalised `URL`. Rejects anything that is not http(s), has no host, or that
 * contains whitespace / invisible characters.
 */
export function normalizeUrl(raw: string): NormalizedUrl {
  const input = String(raw ?? '');
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, input, hadScheme: false, error: 'url.empty' };
  if (UNSAFE_CHARS_RE.test(trimmed)) {
    return { ok: false, input, hadScheme: false, error: 'url.whitespace' };
  }

  const hadScheme = SCHEME_RE.test(trimmed);
  let candidate = trimmed;
  if (!hadScheme) candidate = `https://${trimmed}`;

  // Disallow non-http(s) schemes explicitly ("javascript:", "file:", "data:", "ftp:").
  const scheme = (candidate.match(SCHEME_RE)?.[0] ?? '').toLowerCase().replace(':', '');
  if (scheme !== 'http' && scheme !== 'https') {
    return { ok: false, input, hadScheme, error: 'url.scheme' };
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, input, hadScheme, error: 'url.format' };
  }

  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, input, hadScheme, error: 'url.host' };
  const isIpv6Literal = host.startsWith('[');
  // "https://example" is not a usable host name for an online crawler check.
  if (!isIpv6Literal && !host.includes('.') && host !== 'localhost') {
    return { ok: false, input, hadScheme, error: 'url.host' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, input, hadScheme, error: 'url.scheme' };
  }
  if (url.username || url.password) {
    return { ok: false, input, hadScheme, error: 'url.credentials' };
  }
  if (url.port && !isCommonPort(url.port)) {
    // Ports other than 80/443 are rejected on purpose (see SSRF rules).
    return { ok: false, input, hadScheme, error: 'url.port' };
  }

  url.hash = '';
  return { ok: true, url, input, hadScheme };
}

export function isCommonPort(port: string): boolean {
  return port === '' || port === '80' || port === '443';
}

export function sameOrigin(a: string | URL, b: string | URL): boolean {
  try {
    const ua = typeof a === 'string' ? new URL(a) : a;
    const ub = typeof b === 'string' ? new URL(b) : b;
    return ua.protocol === ub.protocol && ua.hostname.toLowerCase() === ub.hostname.toLowerCase() && normalisePort(ua) === normalisePort(ub);
  } catch {
    return false;
  }
}

function normalisePort(u: URL): string {
  if (u.port) return u.port;
  return u.protocol === 'https:' ? '443' : '80';
}

/** Joins a path onto an origin, always producing an absolute URL. */
export function resolveAgainst(base: string, ref: string): string | null {
  try {
    return new URL(ref, base).toString();
  } catch {
    return null;
  }
}

/** The three well-known paths a crawler check is allowed to request. */
export const WELL_KNOWN_PATHS = {
  robots: '/robots.txt',
  sitemap: '/sitemap.xml',
} as const;

export function absolutePath(origin: string, path: string): string {
  return new URL(path, origin).toString();
}
