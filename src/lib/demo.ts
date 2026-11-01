/**
 * Built-in demo site.
 *
 * The demo runs through the *real* analyser — it is sample input, not a canned
 * report — and it is always labelled as demo data. Demo reports are never written
 * to the history store (see `history.saveReport`).
 */

import { analyze } from './analysis';
import type { Report } from './types';

export const DEMO_ORIGIN = 'https://demo.crawlcheck.dev';
export const DEMO_URL = `${DEMO_ORIGIN}/`;

export const DEMO_ROBOTS = `# robots.txt for demo.crawlcheck.dev (sample data)
User-agent: *
Disallow: /admin
Allow: /admin
Disallow: /search?
Crawl-delay: 4

User-agent: Googlebot
Disallow: /private
Allow: /private/public

User-agent: *
Disallow: /tmp

Host: demo.crawlcheck.dev
Sitemap: https://demo.crawlcheck.dev/sitemap_index.xml
Sitemap: /sitemap-news.xml
`;

export const DEMO_SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${DEMO_ORIGIN}/sitemap-posts.xml</loc>
    <lastmod>2026-09-01</lastmod>
  </sitemap>
  <sitemap>
    <loc>${DEMO_ORIGIN}/sitemap-pages.xml</loc>
    <lastmod>2026-08-20</lastmod>
  </sitemap>
  <sitemap>
    <loc>/sitemap-tags.xml</loc>
  </sitemap>
</sitemapindex>
`;

export const DEMO_SITEMAP_POSTS = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${DEMO_ORIGIN}/blog/crawl-budget</loc>
    <lastmod>2026-09-10</lastmod>
  </url>
  <url>
    <loc>${DEMO_ORIGIN}/blog/robots-txt-mistakes</loc>
    <lastmod>2026-09-02</lastmod>
  </url>
  <url>
    <loc>${DEMO_ORIGIN}/blog/crawl-budget</loc>
    <lastmod>2026-09-10</lastmod>
  </url>
  <url>
    <loc>demo.crawlcheck.dev/blog/missing-scheme</loc>
  </url>
</urlset>
`;

export const DEMO_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Demo site — a deliberately imperfect page for CrawlCheck: crawl budget, robots.txt and sitemap examples with a very long title</title>
    <meta name="description" content="This sample page exists so you can explore a full CrawlCheck report without entering a real website. It intentionally contains a description that is far too long to be shown in full inside a search result snippet, which is exactly the kind of thing this tool flags for you." />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Demo site — CrawlCheck sample" />
    <meta property="og:description" content="A sample page used by the CrawlCheck demo report." />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="alternate" hreflang="en" href="${DEMO_ORIGIN}/" />
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"WebSite","name":"Demo site","url":"${DEMO_ORIGIN}/"}
    </script>
  </head>
  <body>
    <header>
      <h1>Demo site</h1>
      <h1>Know how crawlers see your website</h1>
      <nav>
        <a href="/blog/">Blog</a>
        <a href="/about">About</a>
        <a href="https://example.org/reference">Reference</a>
        <a href="https://developers.google.com/search/docs">Google Search docs</a>
      </nav>
    </header>
    <main>
      <h2>Crawl budget basics</h2>
      <p>
        Crawl budget is the number of URLs a search engine is willing to fetch on your
        site in a given period. Blocking low-value URL patterns keeps that budget for
        pages that matter.
      </p>
      <img src="/images/crawl-budget.png" alt="Crawl budget over time" />
      <img src="/images/robots.png" />
      <img src="/images/sitemap.png" alt="" />
      <h2>Related reading</h2>
      <ul>
        <li><a href="/blog/robots-txt-mistakes">robots.txt mistakes</a></li>
        <li><a href="/blog/crawl-budget">crawl budget</a></li>
      </ul>
    </main>
  </body>
</html>
`;

export function buildDemoReport(): Report {
  return analyze({
    mode: 'demo',
    target: {
      input: DEMO_URL,
      url: DEMO_URL,
      origin: DEMO_ORIGIN,
      host: 'demo.crawlcheck.dev',
    },
    http: {
      status: 200,
      finalUrl: DEMO_URL,
      requestedUrl: DEMO_URL,
      redirected: false,
      contentType: 'text/html; charset=utf-8',
    },
    htmlText: DEMO_HTML,
    htmlMeta: { state: 'ok', httpStatus: 200, contentType: 'text/html', url: DEMO_URL },
    robotsText: DEMO_ROBOTS,
    robotsMeta: { state: 'ok', httpStatus: 200, contentType: 'text/plain', url: `${DEMO_ORIGIN}/robots.txt` },
    sitemapTexts: [
      { text: DEMO_SITEMAP_INDEX, source: `${DEMO_ORIGIN}/sitemap_index.xml` },
      { text: DEMO_SITEMAP_POSTS, source: `${DEMO_ORIGIN}/sitemap-posts.xml`, isChild: true },
    ],
    sitemapMeta: { state: 'ok', httpStatus: 200, url: `${DEMO_ORIGIN}/sitemap_index.xml` },
  });
}
