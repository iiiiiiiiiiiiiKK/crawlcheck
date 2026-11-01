import { describe, expect, it } from 'vitest';
import { analyze, type AnalyzeInput } from '../src/lib/analysis';
import { buildDemoReport } from '../src/lib/demo';
import { runLocalCheck } from '../src/lib/localScan';
import { parseRobots } from '../src/lib/robots';

const TARGET = { input: 'example.com', url: 'https://example.com/', origin: 'https://example.com', host: 'example.com' };

function onlineInput(patch: Partial<AnalyzeInput> = {}): AnalyzeInput {
  return {
    mode: 'online',
    target: TARGET,
    http: null,
    robotsMeta: { state: 'blocked', message: 'cors' },
    sitemapMeta: { state: 'blocked', message: 'cors' },
    htmlMeta: { state: 'blocked', message: 'cors' },
    ...patch,
  };
}

describe('unverifiable results are never reported as passing', () => {
  it('marks every page-level check as unverified when CORS blocked the page', () => {
    const report = analyze(onlineInput());
    const pageFindings = report.findings.filter((finding) => finding.category === 'seo' || finding.category === 'html');

    expect(pageFindings.length).toBeGreaterThan(0);
    expect(pageFindings.every((finding) => finding.status === 'unverified')).toBe(true);
    expect(pageFindings.some((finding) => finding.code === 'seo.not-checked')).toBe(true);
    expect(pageFindings.some((finding) => finding.code === 'html.not-checked')).toBe(true);
    expect(report.findings.some((finding) => finding.code === 'url.unverified')).toBe(true);
  });

  it('does not give a passing score when nothing could be checked', () => {
    const report = analyze(onlineInput());
    expect(report.score.grade).toBe('N/A');
    expect(report.score.excludedWeight).toBeGreaterThan(report.score.countedWeight);
  });

  it('records the CORS limitation instead of blaming the site', () => {
    const report = analyze(onlineInput());
    expect(report.limitationCodes).toContain('limitation.cors');
    expect(report.limitationCodes).toContain('limitation.no-js');
    expect(report.limitationCodes).toContain('limitation.single-page');
  });

  it('distinguishes a missing robots.txt from an unreadable one', () => {
    const missing = analyze(onlineInput({ robotsMeta: { state: 'missing', httpStatus: 404 } }));
    expect(missing.findings.some((finding) => finding.code === 'robots.missing' && finding.status === 'warn')).toBe(true);

    const blocked = analyze(onlineInput({ robotsMeta: { state: 'error', message: 'http-500' } }));
    expect(blocked.findings.some((finding) => finding.code === 'robots.unverified' && finding.status === 'unverified')).toBe(true);
  });

  it('keeps local mode honest: unprovided files are "not checked", not "pass"', () => {
    const report = runLocalCheck({ robotsText: 'User-agent: *\nDisallow: /admin\n' });
    expect(report.mode).toBe('local');
    const seo = report.findings.filter((finding) => finding.category === 'seo');
    expect(seo.every((finding) => finding.status === 'unverified')).toBe(true);
    expect(report.findings.some((finding) => finding.code === 'html.not-checked')).toBe(true);
    expect(report.limitationCodes).toContain('limitation.local');
  });
});

describe('online findings', () => {
  it('reports a 5xx home page as a failure', () => {
    const report = analyze(
      onlineInput({
        http: { status: 503, finalUrl: TARGET.url!, requestedUrl: TARGET.url!, redirected: false },
        htmlMeta: { state: 'error', message: 'http-503', httpStatus: 503 },
      }),
    );
    const finding = report.findings.find((item) => item.code === 'url.home-status');
    expect(finding?.status).toBe('fail');
    expect(finding?.params.status).toBe(503);
  });

  it('flags a redirecting entry URL', () => {
    const report = analyze(
      onlineInput({
        http: { status: 200, finalUrl: 'https://www.example.com/', requestedUrl: TARGET.url!, redirected: true },
      }),
    );
    const finding = report.findings.find((item) => item.code === 'url.redirected');
    expect(finding?.status).toBe('warn');
    expect(finding?.params.to).toBe('https://www.example.com/');
  });

  it('flags plain HTTP', () => {
    const report = analyze(onlineInput({ target: { ...TARGET, url: 'http://example.com/', origin: 'http://example.com' } }));
    expect(report.findings.some((item) => item.code === 'url.http' && item.status === 'warn')).toBe(true);
  });

  it('turns robots.txt problems into findings', () => {
    const robotsText = 'User-agent: *\nDisallow: /\nDisallow: /x\nAllow: /x\nHost: example.com\n';
    const report = analyze(
      onlineInput({
        robotsText,
        robotsMeta: { state: 'ok', httpStatus: 200 },
      }),
    );
    const codes = report.findings.map((item) => item.code);
    expect(codes).toContain('robots.block-all');
    expect(codes).toContain('robots.conflict');
    expect(codes).toContain('robots.unknown-directive');
    expect(codes).toContain('robots.security-note');
    // The parsed document is stored for the rules view.
    expect(report.robots?.groups[0].rules).toHaveLength(3);
  });

  it('passes sitemap checks for a healthy sitemap', () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc>https://example.com/b</loc><lastmod>2026-01-02</lastmod></url>
    </urlset>`;
    const report = analyze(
      onlineInput({
        sitemapTexts: [{ text: xml, source: 'https://example.com/sitemap.xml' }],
        sitemapMeta: { state: 'ok', httpStatus: 200 },
      }),
    );
    expect(report.findings.some((item) => item.code === 'sitemap.found' && item.status === 'pass')).toBe(true);
    expect(report.findings.some((item) => item.code === 'sitemap.duplicates')).toBe(false);
    expect(report.sitemaps[0].entries).toHaveLength(2);
  });

  it('flags an invalid child sitemap in an index', () => {
    const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/s1.xml</loc></sitemap>
      <sitemap><loc>/s2.xml</loc></sitemap>
    </sitemapindex>`;
    const report = analyze(
      onlineInput({
        sitemapTexts: [{ text: index, source: 'https://example.com/sitemap_index.xml' }],
        sitemapMeta: { state: 'ok', httpStatus: 200 },
      }),
    );
    const finding = report.findings.find((item) => item.code === 'sitemap.invalid-loc');
    expect(finding?.status).toBe('fail');
    expect(report.findings.some((item) => item.code === 'sitemap.index-detected' && item.status === 'pass')).toBe(true);
  });

  it('warns when the sitemap is not declared in robots.txt', () => {
    const report = analyze(
      onlineInput({
        robotsText: 'User-agent: *\nDisallow: /admin\n',
        robotsMeta: { state: 'ok', httpStatus: 200 },
        sitemapTexts: [{ text: '<urlset><url><loc>https://example.com/</loc></url></urlset>', source: 'https://example.com/sitemap.xml' }],
        sitemapMeta: { state: 'ok', httpStatus: 200 },
      }),
    );
    expect(report.findings.some((item) => item.code === 'sitemap.not-in-robots' && item.status === 'warn')).toBe(true);
  });
});

describe('seo findings', () => {
  const html = `<!doctype html><html lang="en"><head>
      <title>${'x'.repeat(90)}</title>
      <meta name="description" content="short" />
      <meta name="robots" content="noindex" />
      <meta name="viewport" content="width=1024" />
    </head><body><img src="a.png"><img src="b.png"><h2 id="x">no h1</h2></body></html>`;

  const report = analyze(
    onlineInput({
      http: { status: 200, finalUrl: TARGET.url!, requestedUrl: TARGET.url!, redirected: false },
      htmlText: html,
      htmlMeta: { state: 'ok', httpStatus: 200 },
    }),
  );
  const codes = report.findings.map((item) => `${item.code}:${item.status}`);

  it('detects missing title/description/canonical problems', () => {
    expect(codes).toContain('seo.title-length:warn');
    expect(codes).toContain('seo.description-length:warn');
    expect(codes).toContain('seo.canonical-missing:warn');
    expect(codes).toContain('seo.h1-missing:warn');
  });

  it('detects noindex, viewport and alt problems', () => {
    expect(codes).toContain('seo.robotsmeta-noindex:fail');
    expect(codes).toContain('seo.viewport-fixwidth:warn');
    expect(codes).toContain('html.img-alt:warn');
  });

  it('detects missing social metadata', () => {
    expect(codes).toContain('seo.og-missing:warn');
    expect(codes).toContain('seo.twitter-missing:warn');
    expect(codes).toContain('seo.lang:pass');
  });
});

describe('demo report', () => {
  const report = buildDemoReport();

  it('is labelled as demo and never mixes with real checks', () => {
    expect(report.mode).toBe('demo');
    expect(report.limitationCodes).toContain('limitation.demo');
  });

  it('contains a realistic mix of results', () => {
    expect(report.score.fail).toBeGreaterThan(0);
    expect(report.score.warn).toBeGreaterThan(0);
    expect(report.score.pass).toBeGreaterThan(0);
    expect(report.score.value).toBeGreaterThan(0);
    expect(report.score.value).toBeLessThan(100);
    expect(report.findings.length).toBe(report.score.pass + report.score.warn + report.score.fail + report.score.unverified + report.score.error);
  });

  it('exercises the real parsers (robots + sitemap index + child sitemap + html)', () => {
    expect(report.robots?.groups.length).toBeGreaterThan(0);
    expect(report.sitemaps).toHaveLength(2);
    expect(report.sitemaps[0].kind).toBe('index');
    expect(report.sitemaps[1].isChild).toBe(true);
    expect(report.html?.h1).toHaveLength(2);
    expect(report.findings.some((item) => item.code === 'sitemap.duplicates')).toBe(true);
  });

  it('parses the demo robots.txt deterministically', () => {
    const doc = parseRobots(report.robots?.raw ?? '');
    expect(doc.sitemaps.length).toBeGreaterThan(0);
  });
});
