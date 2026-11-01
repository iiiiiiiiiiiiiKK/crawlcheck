/**
 * CrawlCheck scan service — Cloudflare Worker entry point.
 *
 * Endpoints
 *   GET  /health  → liveness probe
 *   POST /scan    → { url } → ScanResponse
 *
 * Hardening
 *   - CORS allow-list (default `*`, restrict with ALLOWED_ORIGINS),
 *   - per-IP rate limit (in-memory per isolate — documented limitation),
 *   - request body size cap,
 *   - SSRF checks, timeouts, byte caps and a fixed request budget in `scan.ts`.
 */

import { runScan } from './scan';
import { SCAN_SERVICE_NAME, SCAN_SERVICE_VERSION } from '../../src/lib/scanProtocol';

export interface Env {
  ALLOWED_ORIGINS?: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW_SEC?: string;
}

const MAX_BODY_BYTES = 4 * 1024;
const hits = new Map<string, { count: number; resetAt: number }>();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin') ?? '';
    const cors = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, service: SCAN_SERVICE_NAME, version: SCAN_SERVICE_VERSION }, 200, cors);
    }

    if (url.pathname !== '/scan') {
      return json({ ok: false, code: 'not-found', message: 'Unknown endpoint.' }, 404, cors);
    }

    if (request.method !== 'POST') {
      return json({ ok: false, code: 'bad-request', message: 'Use POST.' }, 405, cors);
    }

    if (origin && !originAllowed(env, origin)) {
      return json({ ok: false, code: 'forbidden-origin', message: 'Origin not allowed.' }, 403, cors);
    }

    const limit = rateLimit(env, clientKey(request));
    if (!limit.ok) {
      return json({ ok: false, code: 'rate-limited', message: 'Too many requests, slow down.' }, 429, {
        ...cors,
        'retry-after': String(limit.retryAfter),
      });
    }

    const body = await readJson<{ url?: string }>(request);
    if (!body || typeof body.url !== 'string') {
      return json({ ok: false, code: 'bad-request', message: 'Expected JSON body { "url": "https://…" }.' }, 400, cors);
    }

    const result = await runScan(body.url, {
      fetch: (input, init) => fetch(input, init),
      resolve: resolveDoH,
      limits: {
        maxBytes: 512 * 1024,
        timeoutMs: 8_000,
        maxRequests: 8,
      },
    });

    if (!result.ok) {
      const status = result.code === 'ssrf' ? 400 : result.code === 'bad-request' ? 400 : 502;
      return json(result, status, cors);
    }
    return json(result, 200, cors);
  },
};

/* ------------------------------------------------------------------- cors */

function corsHeaders(env: Env, origin: string): Record<string, string> {
  const allow = originAllowed(env, origin) && origin ? origin : allowedList(env)[0] ?? '*';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

function allowedList(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function originAllowed(env: Env, origin: string): boolean {
  const list = allowedList(env);
  if (list.includes('*')) return true;
  return list.includes(origin);
}

/* ------------------------------------------------------------- rate limit */

function clientKey(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'anonymous'
  );
}

function rateLimit(env: Env, key: string): { ok: true } | { ok: false; retryAfter: number } {
  const max = Number(env.RATE_LIMIT_MAX ?? 30);
  const windowMs = Number(env.RATE_LIMIT_WINDOW_SEC ?? 600) * 1000;
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 5_000) {
      for (const [candidate, value] of hits) {
        if (value.resetAt <= now) hits.delete(candidate);
      }
    }
    return { ok: true };
  }

  if (entry.count >= max) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true };
}

/* ------------------------------------------------------------------ utils */

async function readJson<T>(request: Request): Promise<T | null> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function json(payload: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8', ...headers },
  });
}

/**
 * DNS over HTTPS (Cloudflare) — the Worker has no direct resolver API, and using
 * DoH keeps the check deterministic and inspectable.
 */
async function resolveDoH(hostname: string): Promise<string[]> {
  const answers: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: 'application/dns-json' } },
    );
    if (!response.ok) continue;
    const payload = (await response.json()) as { Answer?: { type: number; data: string }[] };
    for (const answer of payload.Answer ?? []) {
      if (answer.type === 1 || answer.type === 28) answers.push(answer.data);
    }
  }
  return answers;
}
