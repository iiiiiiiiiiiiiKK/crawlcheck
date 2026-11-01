/**
 * Online scanning client.
 *
 * Two transports, never mixed up in the UI:
 *
 *  1. `direct` — a plain browser `fetch`. Works only for sites that send CORS
 *     headers. When the browser refuses, we report **unverified**, never "broken".
 *  2. `endpoint` — a CrawlCheck scan service (the Cloudflare Worker in
 *     `worker/`), which fetches server-side with full SSRF protection.
 *
 * The CORS reality is documented in the README and surfaced in the UI; we never
 * pretend a browser restriction is a site misconfiguration.
 */

import { analyze, type HttpMeta } from './analysis';
import { normalizeUrl } from './url';
import { assertSafeUrl } from './ssrf';
import { parseRobots } from './robots';
import { sitemapCandidates } from './sitemap';
import type { Report, ReportTarget, ResourceMeta } from './types';
import type { RemoteDoc, ScanResponse } from './scanProtocol';

export type ProgressStep = 'home' | 'robots' | 'sitemap' | 'children' | 'analyse';

export interface ScanOptions {
  /** Base URL of a CrawlCheck scan service, e.g. https://crawlcheck-scan.example.workers.dev */
  endpoint?: string | null;
  timeoutMs?: number;
  maxSitemaps?: number;
  maxChildSitemaps?: number;
  onProgress?: (step: ProgressStep) => void;
  signal?: AbortSignal;
}

export interface ScanFailure {
  ok: false;
  /** 'url.*' | 'ssrf.*' | 'service.*' | 'network' */
  code: string;
  detail?: string;
  reason?: string;
}
export interface ScanSuccess {
  ok: true;
  report: Report;
  transport: 'direct' | 'endpoint';
}
export type ScanOutcome = ScanSuccess | ScanFailure;

const DEFAULT_TIMEOUT = 15_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function runOnlineScan(input: string, options: ScanOptions = {}): Promise<ScanOutcome> {
  const normalized = normalizeUrl(input);
  if (!normalized.ok || !normalized.url) {
    return { ok: false, code: normalized.error ?? 'url.format', detail: input };
  }
  const url = normalized.url;

  const safe = assertSafeUrl(url.toString());
  if (!safe.ok) {
    return { ok: false, code: 'ssrf.blocked', reason: safe.reason, detail: safe.detail };
  }

  const target: ReportTarget = {
    input,
    url: url.toString(),
    origin: url.origin,
    host: url.hostname,
  };

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const maxSitemaps = options.maxSitemaps ?? 3;
  const maxChildSitemaps = options.maxChildSitemaps ?? 3;

  if (options.endpoint) {
    return scanViaEndpoint(target, options.endpoint, timeoutMs, options);
  }
  return scanDirect(target, { ...options, timeoutMs, maxSitemaps, maxChildSitemaps });
}

/* ------------------------------------------------------------- endpoint */

async function scanViaEndpoint(
  target: ReportTarget,
  endpoint: string,
  timeoutMs: number,
  options: ScanOptions,
): Promise<ScanOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 25_000));
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort);
  try {
    options.onProgress?.('home');
    const response = await fetch(endpoint.replace(/\/+$/, '') + '/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: target.url }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, code: 'service.http', detail: `HTTP ${response.status}` };
    }
    const payload = (await response.json()) as ScanResponse;
    if (!payload.ok) {
      return { ok: false, code: `service.${payload.code}`, detail: payload.message };
    }
    options.onProgress?.('analyse');
    const report = analyze({
      mode: 'online',
      target,
      http: homeToHttpMeta(payload.home),
      htmlText: payload.home.body ?? null,
      htmlMeta: toResourceMeta(payload.home),
      robotsText: payload.robots.body ?? null,
      robotsMeta: toResourceMeta(payload.robots),
      sitemapTexts: payload.sitemaps.map((sitemap) => ({
        text: sitemap.body ?? '',
        source: sitemap.source,
        isChild: sitemap.isChild,
      })),
      sitemapMeta: aggregateSitemapMeta(payload.sitemaps),
    });
    return { ok: true, report, transport: 'endpoint' };
  } catch (error) {
    if (isAbort(error)) return { ok: false, code: 'service.timeout' };
    return { ok: false, code: 'service.unreachable', detail: errorMessage(error) };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

function homeToHttpMeta(home: RemoteDoc): HttpMeta | null {
  const meta = home.meta;
  if (typeof meta.status !== 'number') return null;
  return {
    status: meta.status,
    finalUrl: meta.finalUrl ?? '',
    requestedUrl: '',
    redirected: (meta.redirects ?? 0) > 0,
    contentType: meta.contentType ?? null,
  };
}

function toResourceMeta(doc: RemoteDoc): ResourceMeta {
  return {
    state: doc.meta.state,
    httpStatus: doc.meta.status,
    url: doc.meta.finalUrl,
    bytes: doc.meta.bytes,
    message: doc.meta.message,
    redirects: doc.meta.redirects,
    contentType: doc.meta.contentType,
  };
}

function aggregateSitemapMeta(sitemaps: RemoteDoc[]): ResourceMeta {
  if (sitemaps.length === 0) return { state: 'missing', httpStatus: 404 };
  const first = sitemaps[0].meta;
  return {
    state: first.state,
    httpStatus: first.status,
    url: first.finalUrl,
    bytes: first.bytes,
    message: first.message,
  };
}

/* --------------------------------------------------------------- direct */

interface DirectOptions extends ScanOptions {
  timeoutMs: number;
  maxSitemaps: number;
  maxChildSitemaps: number;
}

async function scanDirect(target: ReportTarget, options: DirectOptions): Promise<ScanOutcome> {
  const origin = target.origin as string;
  const url = target.url as string;

  options.onProgress?.('home');
  const home = await directFetch(url, options);
  const http: HttpMeta | null =
    typeof home.status === 'number'
      ? {
          status: home.status,
          finalUrl: home.finalUrl ?? url,
          requestedUrl: url,
          redirected: !!home.finalUrl && home.finalUrl !== url,
          contentType: home.contentType ?? null,
        }
      : null;

  const htmlMeta = directMeta(home);
  const homeText = home.ok ? home.body ?? '' : null;

  options.onProgress?.('robots');
  const robotsUrl = origin + '/robots.txt';
  const robots = await directFetch(robotsUrl, options);
  const robotsText = robots.ok ? robots.body ?? '' : null;

  let declared: string[] = [];
  if (robotsText) {
    try {
      declared = parseRobots(robotsText).sitemaps;
    } catch {
      declared = [];
    }
  }

  options.onProgress?.('sitemap');
  const candidates = sitemapCandidates(declared, origin).slice(0, options.maxSitemaps);
  const sitemapTexts: { text: string; source: string; isChild?: boolean }[] = [];
  let sitemapMeta: ResourceMeta = { state: 'missing', httpStatus: 404 };

  for (const candidate of candidates) {
    if (!sameHost(candidate, url)) continue; // never fetch sitemaps from other hosts in direct mode
    const result = await directFetch(candidate, options);
    if (sitemapTexts.length === 0) sitemapMeta = directMeta(result);
    if (result.ok && result.body && result.body.trim()) {
      sitemapTexts.push({ text: result.body, source: candidate });
    }
    if (sitemapTexts.length >= 1) break; // one sitemap per scan in direct mode
  }

  options.onProgress?.('analyse');
  const report = analyze({
    mode: 'online',
    target,
    http,
    htmlText: homeText,
    htmlMeta,
    robotsText,
    robotsMeta: directMeta(robots),
    sitemapTexts,
    sitemapMeta: sitemapTexts.length > 0 ? sitemapMeta : sitemapMeta,
    limitationCodes: sitemapTexts.length === 0 && sitemapMeta.state !== 'missing' ? ['limitation.direct-partial'] : [],
  });

  if (!home.ok && home.reason === 'blocked') {
    report.limitationCodes = [...new Set([...report.limitationCodes, 'limitation.cors'])];
  }
  return { ok: true, report, transport: 'direct' };
}

interface DirectResult {
  ok: boolean;
  status?: number;
  finalUrl?: string;
  contentType?: string;
  body?: string;
  bytes?: number;
  /** 'cors' | 'network' | 'timeout' | 'empty' */
  reason?: string;
}

async function directFetch(url: string, options: DirectOptions): Promise<DirectResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5' },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? undefined;
    let body: string | undefined;
    try {
      body = await response.text();
    } catch {
      body = undefined;
    }
    const bytes = body ? new TextEncoder().encode(body).length : 0;
    if (bytes > MAX_BODY_BYTES) {
      return { ok: false, status: response.status, finalUrl: response.url, contentType, reason: 'too-large' };
    }
    return {
      ok: response.ok || response.status < 400,
      status: response.status,
      finalUrl: response.url || url,
      contentType,
      body,
      bytes,
    };
  } catch (error) {
    if (isAbort(error)) return { ok: false, reason: 'timeout' };
    // A browser CORS rejection and a network failure are indistinguishable here;
    // both mean "we could not verify", which is exactly what we report.
    return { ok: false, reason: 'blocked' };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

function directMeta(result: DirectResult): ResourceMeta {
  if (result.ok) {
    return {
      state: 'ok',
      httpStatus: result.status,
      url: result.finalUrl,
      bytes: result.bytes,
      contentType: result.contentType,
    };
  }
  if (result.reason === 'blocked') return { state: 'blocked', message: 'cors' };
  if (result.reason === 'timeout') return { state: 'timeout', message: 'timeout' };
  if (result.reason === 'too-large') return { state: 'error', message: 'too-large', httpStatus: result.status };
  if (result.status === 404 || result.status === 410) return { state: 'missing', httpStatus: result.status };
  if (result.status && result.status >= 400) {
    return { state: 'error', httpStatus: result.status, message: `http-${result.status}` };
  }
  return { state: 'error', message: 'network' };
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
