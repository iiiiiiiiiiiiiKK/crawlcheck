/**
 * CrawlCheck scan core — the server-side fetcher.
 *
 * This module runs inside a Cloudflare Worker (or any fetch-capable runtime) and
 * is the only place in the product that makes outbound requests on behalf of a
 * user. Everything a security reviewer cares about is here:
 *
 *  - the URL is validated with `assertSafeUrl` before the first request,
 *  - host names are resolved and **every** answer must be public (rebinding),
 *  - each redirect hop is re-validated, including DNS,
 *  - the response body is streamed with a hard byte cap,
 *  - the whole scan runs under a timeout and a fixed request budget,
 *  - only three well-known paths are ever requested: `/`, `/robots.txt`,
 *    `/sitemap.xml` (+ sitemaps declared in robots and sitemap indexes, same host).
 *
 * There is no way to ask this service for an arbitrary path, port or host.
 */

import { assertPublicAddresses, assertSafeUrl, parseIpv4, parseIpv6, resolveRedirect } from '../../src/lib/ssrf';
import { parseRobots } from '../../src/lib/robots';
import { parseSitemap } from '../../src/lib/sitemap';
import type { ScanResponseError, ScanResponseOk, RemoteFetchMeta, RemoteSitemap } from '../../src/lib/scanProtocol';
import { SCAN_SERVICE_NAME, SCAN_SERVICE_VERSION } from '../../src/lib/scanProtocol';

export interface ScanLimits {
  maxRedirects: number;
  maxBytes: number;
  timeoutMs: number;
  maxSitemaps: number;
  maxChildSitemaps: number;
  maxRequests: number;
}

export const DEFAULT_LIMITS: ScanLimits = {
  maxRedirects: 3,
  maxBytes: 512 * 1024,
  timeoutMs: 8_000,
  maxSitemaps: 3,
  maxChildSitemaps: 3,
  maxRequests: 8,
};

export interface ScanDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** Resolves a host name to its A/AAAA records (usually DNS over HTTPS). */
  resolve: (hostname: string) => Promise<string[]>;
  limits?: Partial<ScanLimits>;
}

export type ScanResult = ScanResponseOk | ScanResponseError;

class TimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'TimeoutError';
  }
}

export async function runScan(input: string, deps: ScanDeps): Promise<ScanResult> {
  const limits: ScanLimits = { ...DEFAULT_LIMITS, ...(deps.limits ?? {}) };
  const budget = { used: 0 };

  let target: URL;
  try {
    target = new URL(String(input ?? '').trim());
  } catch {
    return { ok: false, code: 'bad-request', message: 'A valid absolute URL is required.' };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { ok: false, code: 'ssrf', message: 'Only http and https URLs are supported.' };
  }

  const safe = assertSafeUrl(target.toString());
  if (!safe.ok) {
    return { ok: false, code: 'ssrf', message: `Refused: ${safe.reason} (${safe.detail}).` };
  }

  const origin = target.origin;

  const home = await safeFetch(target.toString(), deps, limits, budget);
  if (home.meta.message === 'ssrf' || home.meta.message === 'ssrf-dns') {
    return { ok: false, code: 'ssrf', message: 'The target resolves to a non-public address.' };
  }

  const robots = await safeFetch(`${origin}/robots.txt`, deps, limits, budget);

  const sitemaps: RemoteSitemap[] = [];
  const sitemapUrls = new Set<string>();

  if (robots.body) {
    try {
      const parsed = parseRobots(robots.body);
      for (const declared of parsed.sitemaps.slice(0, limits.maxSitemaps)) {
        const absolute = resolveRedirect(`${origin}/`, declared);
        if (absolute && sameHost(absolute, origin)) sitemapUrls.add(absolute);
      }
    } catch {
      /* robots.txt is broken: fall back to the default path below */
    }
  }
  sitemapUrls.add(`${origin}/sitemap.xml`);

  const queue = [...sitemapUrls].slice(0, limits.maxSitemaps);
  const fetchedChildren: string[] = [];

  for (const sitemapUrl of queue) {
    const doc = await safeFetch(sitemapUrl, deps, limits, budget);
    sitemaps.push({ source: sitemapUrl, isChild: false, meta: doc.meta, body: doc.body });
    if (!doc.body) continue;

    // One level of sitemap index expansion, capped by limits — never recursive.
    const parsed = parseSitemap(doc.body, sitemapUrl);
    if (parsed.kind !== 'index') continue;
    for (const child of parsed.childSitemaps) {
      if (fetchedChildren.length >= limits.maxChildSitemaps) break;
      if (!child.valid) continue;
      if (!sameHost(child.loc, origin)) continue;
      if (sitemapUrls.has(child.loc)) continue;
      fetchedChildren.push(child.loc);
      const childDoc = await safeFetch(child.loc, deps, limits, budget);
      sitemaps.push({ source: child.loc, isChild: true, meta: childDoc.meta, body: childDoc.body });
    }
  }

  return {
    ok: true,
    target: { input: String(input ?? ''), url: target.toString(), origin, host: target.hostname },
    home: { meta: home.meta, body: home.body },
    robots: { meta: robots.meta, body: robots.body },
    sitemaps,
    service: {
      name: SCAN_SERVICE_NAME,
      version: SCAN_SERVICE_VERSION,
      limits: {
        maxRedirects: limits.maxRedirects,
        maxBytes: limits.maxBytes,
        timeoutMs: limits.timeoutMs,
        maxSitemaps: limits.maxSitemaps,
        maxChildSitemaps: limits.maxChildSitemaps,
        maxRequests: limits.maxRequests,
      },
    },
  };
}

/* ---------------------------------------------------------------- fetching */

interface FetchedDoc {
  meta: RemoteFetchMeta;
  body?: string;
}

async function safeFetch(startUrl: string, deps: ScanDeps, limits: ScanLimits, budget: { used: number }): Promise<FetchedDoc> {
  let current = startUrl;
  let redirects = 0;

  while (true) {
    const check = assertSafeUrl(current);
    if (!check.ok) {
      return { meta: { state: 'error', message: 'ssrf', finalUrl: current } };
    }

    // DNS check on every hop: a single private answer aborts the request.
    if (!isIpLiteral(check.hostname)) {
      let addresses: string[];
      try {
        addresses = await deps.resolve(check.hostname);
      } catch {
        return { meta: { state: 'error', message: 'dns', finalUrl: current } };
      }
      const verdict = assertPublicAddresses(addresses);
      if (!verdict.ok) {
        return { meta: { state: 'error', message: 'ssrf-dns', finalUrl: current } };
      }
    }

    if (budget.used >= limits.maxRequests) {
      return { meta: { state: 'error', message: 'budget', finalUrl: current } };
    }
    budget.used += 1;

    let response: Response;
    try {
      response = await withTimeout(
        deps.fetch(current, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
            'user-agent': 'CrawlCheckBot/1.0 (+https://github.com/iiiiiiiiiiiiiKK/crawlcheck)',
          },
        }),
        limits.timeoutMs,
      );
    } catch (error) {
      const message = error instanceof TimeoutError ? 'timeout' : 'network';
      return { meta: { state: message === 'timeout' ? 'timeout' : 'error', message, finalUrl: current } };
    }

    if (isRedirect(response.status)) {
      const location = response.headers.get('location');
      if (!location) return { meta: { state: 'error', message: 'bad-redirect', finalUrl: current, status: response.status } };
      if (redirects >= limits.maxRedirects) {
        return { meta: { state: 'error', message: 'too-many-redirects', finalUrl: current, status: response.status, redirects } };
      }
      const next = resolveRedirect(current, location);
      if (!next) return { meta: { state: 'error', message: 'bad-redirect', finalUrl: current, status: response.status } };
      current = next;
      redirects += 1;
      continue;
    }

    const contentType = response.headers.get('content-type') ?? undefined;
    let body: string | undefined;
    let bytes = 0;
    let truncated = false;
    try {
      const read = await readLimited(response, limits.maxBytes);
      body = read.text;
      bytes = read.bytes;
      truncated = read.truncated;
    } catch {
      body = undefined;
    }

    const state: RemoteFetchMeta['state'] =
      response.status === 404 || response.status === 410
        ? 'missing'
        : response.ok
          ? 'ok'
          : 'error';

    return {
      meta: {
        state,
        status: response.status,
        finalUrl: current,
        contentType,
        bytes,
        redirects,
        truncated: truncated || undefined,
        message: state === 'ok' || state === 'missing' ? undefined : `http-${response.status}`,
      },
      body: state === 'error' ? undefined : body,
    };
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isIpLiteral(hostname: string): boolean {
  const host = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname;
  return !!parseIpv4(host) || !!parseIpv6(host);
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
  } catch {
    return false;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function readLimited(response: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const body = response.body as ReadableStream<Uint8Array> | null;
  if (!body || typeof body.getReader !== 'function') {
    const text = await response.text();
    const bytes = encoder.encode(text).byteLength;
    return { text: text.slice(0, maxBytes), bytes: Math.min(bytes, maxBytes), truncated: bytes > maxBytes };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.byteLength >= maxBytes) {
      chunks.push(value.subarray(0, Math.max(0, maxBytes - total)));
      total = maxBytes;
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* the body is already abandoned */
      }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: decoder.decode(merged), bytes: total, truncated };
}

const encoder = new TextEncoder();
