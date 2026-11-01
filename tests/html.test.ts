import { describe, expect, it } from 'vitest';
import { collapse, extractHtml, isNofollow, isNoindex, viewportIssue } from '../src/lib/html';

const PAGE = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>CrawlCheck sample page for tests</title>
    <meta name="description" content="A description used by the test suite." />
    <meta name="robots" content="noindex, follow" />
    <link rel="canonical" href="https://example.com/canonical" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta property="og:title" content="OG title" />
    <meta property="og:description" content="OG description" />
    <meta property="og:image" content="https://example.com/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="alternate" hreflang="en" href="https://example.com/en" />
    <script type="application/ld+json">{"@type":"WebSite"}</script>
  </head>
  <body>
    <h1>Main heading</h1>
    <h1>Second heading</h1>
    <h2>Sub</h2>
    <img src="/a.png" alt="described" />
    <img src="/b.png" />
    <img src="/c.png" alt="" />
    <a href="/internal">internal</a>
    <a href="https://example.com/also-internal">internal absolute</a>
    <a href="https://other.test/external">external</a>
    <a href="#anchor">anchor</a>
    <a href="mailto:hi@example.com">mail</a>
  </body>
</html>`;

describe('extractHtml', () => {
  const doc = extractHtml(PAGE, { baseUrl: 'https://example.com/' });

  it('extracts title, description and canonical', () => {
    expect(doc.title).toBe('CrawlCheck sample page for tests');
    expect(doc.titleCount).toBe(1);
    expect(doc.description).toBe('A description used by the test suite.');
    expect(doc.canonical).toBe('https://example.com/canonical');
    expect(doc.canonicalCount).toBe(1);
  });

  it('extracts robots meta, language, viewport, charset and doctype', () => {
    expect(doc.robotsMeta).toEqual(['noindex', 'follow']);
    expect(isNoindex(doc.robotsMeta)).toBe(true);
    expect(isNofollow(doc.robotsMeta)).toBe(false);
    expect(doc.lang).toBe('zh-CN');
    expect(doc.viewport).toBe('width=device-width, initial-scale=1');
    expect(doc.charset).toBe('utf-8');
    expect(doc.doctype).toBe(true);
  });

  it('counts headings', () => {
    expect(doc.h1).toEqual(['Main heading', 'Second heading']);
    expect(doc.h2Count).toBe(1);
  });

  it('extracts social metadata', () => {
    expect(doc.og['og:title']).toBe('OG title');
    expect(doc.og['og:image']).toBe('https://example.com/og.png');
    expect(doc.twitter['twitter:card']).toBe('summary_large_image');
    expect(doc.hreflang).toBe(1);
    expect(doc.structuredData).toBe(1);
  });

  it('counts images without alt text', () => {
    expect(doc.images).toEqual({ total: 3, missingAlt: 1, emptyAlt: 1 });
  });

  it('classifies internal vs external links and skips non-http links', () => {
    expect(doc.links).toEqual({ internal: 2, external: 1, total: 3 });
  });

  it('returns an empty structure for empty input', () => {
    const empty = extractHtml('');
    expect(empty.title).toBeNull();
    expect(empty.links.total).toBe(0);
    expect(empty.images.total).toBe(0);
  });

  it('treats every absolute link as external when no base URL is known', () => {
    const noBase = extractHtml('<a href="https://other.test/x">x</a><a href="/y">y</a>');
    expect(noBase.links).toEqual({ internal: 1, external: 1, total: 2 });
  });
});

describe('viewportIssue', () => {
  it('detects missing, fixed width and zoom-blocking viewports', () => {
    expect(viewportIssue(null)).toBe('missing');
    expect(viewportIssue('width=1024')).toBe('fix-width');
    expect(viewportIssue('width=device-width, user-scalable=no')).toBe('no-zoom');
    expect(viewportIssue('width=device-width, maximum-scale=1.0')).toBe('no-zoom');
    expect(viewportIssue('width=device-width, initial-scale=1')).toBeNull();
  });
});

describe('collapse', () => {
  it('normalises whitespace', () => {
    expect(collapse('  a \n b  ')).toBe('a b');
    expect(collapse('   ')).toBeNull();
    expect(collapse(null)).toBeNull();
  });
});
