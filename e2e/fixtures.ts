export const ROBOTS_SAMPLE = `# sample robots.txt
User-agent: *
Disallow: /admin
Disallow: /
Sitemap: https://example.com/sitemap.xml
`;

export const SITEMAP_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://example.com/blog</loc><lastmod>2026-01-02</lastmod></url>
  <url><loc>https://example.com/</loc></url>
</urlset>
`;

export const HTML_SAMPLE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Local fixture page for CrawlCheck end to end tests</title>
    <meta name="description" content="A page used by the Playwright suite to verify that local HTML parsing works end to end." />
    <link rel="canonical" href="https://example.com/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta property="og:title" content="Fixture" />
    <meta property="og:description" content="Fixture page" />
    <meta property="og:image" content="https://example.com/og.png" />
    <meta name="twitter:card" content="summary" />
  </head>
  <body>
    <h1>Fixture page</h1>
    <img src="/a.png" alt="described" />
    <img src="/b.png" />
    <a href="https://other.example.org/x">external</a>
    <a href="/internal">internal</a>
  </body>
</html>
`;

export const ONLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Mocked online page served by Playwright routes</title>
    <meta name="description" content="A mocked response with CORS headers, used to exercise the online scan path in browsers." />
    <link rel="canonical" href="https://example.com/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta property="og:title" content="Mocked" />
    <meta property="og:description" content="Mocked page" />
    <meta property="og:image" content="https://example.com/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>
    <h1>Mocked page</h1>
    <p>This HTML is fulfilled by Playwright with permissive CORS headers.</p>
    <img src="/a.png" alt="described" />
  </body>
</html>
`;

export const ONLINE_ROBOTS = `User-agent: *
Disallow: /private
Crawl-delay: 3
Sitemap: https://example.com/sitemap.xml
`;

export const ONLINE_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-02-01</lastmod></url>
  <url><loc>https://example.com/robots</loc><lastmod>2026-02-02</lastmod></url>
</urlset>
`;
