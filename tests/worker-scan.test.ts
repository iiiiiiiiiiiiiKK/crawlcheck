import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, runScan, type ScanDeps, type ScanLimits } from '../worker/src/scan';

interface Route {
  body?: string;
  status?: number;
  headers?: Record<string, string>;
  /** Never resolves 鈥?used to exercise the timeout. */
  hang?: boolean;
}

function harness(
  routes: Record<string, Route>,
  options: { limits?: Partial<ScanLimits>; resolve?: (host: string) => Promise<string[]> } = {},
) {
  const calls: string[] = [];
  const deps: ScanDeps = {
    fetch: (input) => {
      calls.push(input);
      const route = routes[input];
      if (!route) return Promise.resolve(new Response('not found', { status: 404 }));
      if (route.hang) return new Promise<Response>(() => undefined);
      return Promise.resolve(new Response(route.body ?? '', { status: route.status ?? 200, headers: route.headers }));
    },
    resolve: options.resolve ?? (async () => ['93.184.216.34']),
    limits: { timeoutMs: 500, ...(options.limits ?? {}) },
  };
  return { calls, deps };
}

const ORIGIN = 'http://site.example.com';
const HOME = `${ORIGIN}/`;

describe('runScan 鈥?SSRF protection', () => {
  it.each([
    'http://localhost/',
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://192.168.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://metadata.google.internal/',
    'http://site.internal/',
  ])('refuses to fetch %s', async (url) => {
    const { calls, deps } = harness({});
    const result = await runScan(url, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ssrf');
    expect(calls).toHaveLength(0);
  });

  it('refuses a host that resolves to a private address (rebinding defence)', async () => {
    const { calls, deps } = harness({ [HOME]: { body: '<html></html>' } }, { resolve: async () => ['10.0.0.7'] });
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ssrf');
    expect(calls).toHaveLength(0);
  });

  it('refuses when one of several DNS answers is private', async () => {
    const { calls, deps } = harness({ [HOME]: { body: '<html></html>' } }, { resolve: async () => ['93.184.216.34', '127.0.0.1'] });
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('re-checks redirect targets and refuses internal destinations', async () => {
    const { calls, deps } = harness({
      [HOME]: { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } },
    });
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ssrf');
    expect(calls).toEqual([HOME]);
  });

  it('re-checks redirect targets against DNS', async () => {
    const { calls, deps } = harness(
      {
        [HOME]: { status: 301, headers: { location: 'http://internal.example.com/' } },
      },
      {
        resolve: async (host) => (host === 'internal.example.com' ? ['10.0.0.9'] : ['93.184.216.34']),
      },
    );
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(false);
    expect(calls).toEqual([HOME]);
  });

  it('rejects non-http protocols and nonsense input', async () => {
    const { deps } = harness({});
    for (const input of ['file:///etc/passwd', 'ftp://site.example.com/', 'not a url', '']) {
      const result = await runScan(input, deps);
      expect(result.ok).toBe(false);
    }
  });

  it('stops after the configured number of redirects', async () => {
    const { deps } = harness(
      {
        [HOME]: { status: 302, headers: { location: '/a' } },
        [`${ORIGIN}/a`]: { status: 302, headers: { location: '/b' } },
        [`${ORIGIN}/b`]: { status: 200, body: 'ok' },
      },
      { limits: { maxRedirects: 1 } },
    );
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.home.meta.state).toBe('error');
      expect(result.home.meta.message).toBe('too-many-redirects');
    }
  });
});

describe('runScan 鈥?resource limits', () => {
  it('caps the response size', async () => {
    const big = 'a'.repeat(5_000);
    const { deps } = harness({ [HOME]: { body: big } }, { limits: { maxBytes: 128 } });
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.home.meta.bytes).toBe(128);
      expect(result.home.meta.truncated).toBe(true);
      expect((result.home.body ?? '').length).toBe(128);
    }
  });

  it('times out a hanging request', async () => {
    const { deps } = harness({ [HOME]: { hang: true } }, { limits: { timeoutMs: 30 } });
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.home.meta.state).toBe('timeout');
      expect(result.home.body).toBeUndefined();
    }
  });

  it('enforces the per-scan request budget', async () => {
    const { calls, deps } = harness(
      {
        [HOME]: { body: '<html></html>' },
        [`${ORIGIN}/robots.txt`]: { body: 'User-agent: *\nSitemap: http://site.example.com/sitemap.xml\n' },
        [`${ORIGIN}/sitemap.xml`]: { body: '<urlset><url><loc>http://site.example.com/</loc></url></urlset>' },
      },
      { limits: { maxRequests: 2 } },
    );
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    if (result.ok) {
      expect(result.sitemaps[0].meta.state).toBe('error');
      expect(result.sitemaps[0].meta.message).toBe('budget');
    }
  });
});

describe('runScan 鈥?discovery surface', () => {
  it('only requests well-known paths', async () => {
    const { calls, deps } = harness({
      [HOME]: { body: '<html><title>x</title></html>' },
      [`${ORIGIN}/robots.txt`]: { body: 'User-agent: *\nDisallow: /admin\n' },
      [`${ORIGIN}/sitemap.xml`]: { body: '<urlset><url><loc>http://site.example.com/</loc></url></urlset>' },
    });
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([HOME, `${ORIGIN}/robots.txt`, `${ORIGIN}/sitemap.xml`]);
    if (result.ok) {
      expect(result.home.meta.state).toBe('ok');
      expect(result.robots.meta.state).toBe('ok');
      expect(result.sitemaps).toHaveLength(1);
      expect(result.service.name).toBe('crawlcheck-scan');
      expect(result.service.limits.maxRequests).toBe(DEFAULT_LIMITS.maxRequests);
    }
  });

  it('expands one level of a sitemap index and skips foreign hosts', async () => {
    const index = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>http://site.example.com/posts.xml</loc></sitemap>
      <sitemap><loc>https://other.example.com/posts.xml</loc></sitemap>
      <sitemap><loc>/relative.xml</loc></sitemap>
    </sitemapindex>`;
    const { calls, deps } = harness({
      [HOME]: { body: '<html></html>' },
      [`${ORIGIN}/robots.txt`]: { body: 'User-agent: *\n' },
      [`${ORIGIN}/sitemap.xml`]: { body: index },
      [`${ORIGIN}/posts.xml`]: { body: '<urlset><url><loc>http://site.example.com/a</loc></url></urlset>' },
    });
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(true);
    expect(calls).not.toContain('https://other.example.com/posts.xml');
    if (result.ok) {
      expect(result.sitemaps).toHaveLength(2);
      expect(result.sitemaps[1]).toMatchObject({ source: `${ORIGIN}/posts.xml`, isChild: true });
      expect(result.sitemaps[1].meta.state).toBe('ok');
    }
  });

  it('reports a missing robots.txt as "missing" rather than an error', async () => {
    const { deps } = harness({ [HOME]: { body: '<html></html>' } });
    const result = await runScan(HOME, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.robots.meta.state).toBe('missing');
      expect(result.robots.meta.status).toBe(404);
    }
  });
});
