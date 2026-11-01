/**
 * Captures the screenshots used in the README from the real production build.
 * Usage: node scripts/screenshots.mjs   (expects `node scripts/serve.mjs` running)
 */
import { chromium, devices, webkit } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const ROBOTS_SAMPLE = `# sample robots.txt
User-agent: *
Disallow: /admin
Disallow: /search?
Crawl-delay: 4
Sitemap: https://example.com/sitemap.xml
`;

const BASE = process.env.SHOT_BASE ?? 'http://127.0.0.1:4173/crawlcheck/';
const OUT = 'docs/screenshots';

await mkdir(OUT, { recursive: true });

const desktop = await chromium.launch({ args: ['--disable-gpu', '--disable-software-rasterizer'] });
const desktopCtx = await desktop.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: 'en-US',
  colorScheme: 'dark',
});
const page = await desktopCtx.newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/01-landing-dark.png` });

await page.getByRole('tab', { name: 'Demo' }).click();
await page.getByRole('button', { name: /open demo report/i }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/02-report-overview-dark.png`, fullPage: false });

await page.getByRole('button', { name: /^robots\.txt/ }).first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/03-robots-dark.png` });

await page.getByRole('button', { name: /^sitemap/i }).first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/04-sitemap-dark.png` });

// Light theme, landing page in Chinese.
await page.getByRole('button', { name: /toggle theme|切换主题/i }).click(); // dark -> light
await page.getByRole('button', { name: /switch language|切换语言/i }).click(); // en -> zh
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05-landing-light-zh.png` });

// Local file mode screenshot (English).
await page.getByRole('button', { name: /switch language|切换语言/i }).click();
await page.getByRole('tab', { name: /local files|本地文件/i }).click();
await page.locator('#robots-file').fill(ROBOTS_SAMPLE);
await page.locator('#sitemap-file').fill(
  '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url></urlset>',
);
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/06-local-mode.png` });

// History with one real entry.
await page.getByRole('button', { name: /parse and check/i }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'History', exact: true }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/07-history.png` });

await desktopCtx.close();
await desktop.close();

/* ------------------------------------------------------------- iPhone */

const iphone = await webkit.launch();
const phoneCtx = await iphone.newContext({ ...devices['iPhone 13'], locale: 'en-US', colorScheme: 'dark' });
const phone = await phoneCtx.newPage();
await phone.goto(BASE, { waitUntil: 'networkidle' });
await phone.waitForTimeout(400);
await phone.screenshot({ path: `${OUT}/08-iphone-landing.png` });

await phone.getByRole('tab', { name: 'Demo' }).click();
await phone.getByRole('button', { name: /open demo report/i }).click();
await phone.waitForTimeout(600);
await phone.screenshot({ path: `${OUT}/09-iphone-report.png` });

await phone.getByRole('button', { name: 'robots.txt', exact: true }).first().click();
await phone.waitForTimeout(300);
await phone.screenshot({ path: `${OUT}/10-iphone-robots.png` });

await phoneCtx.close();
await iphone.close();

console.log('screenshots written to', OUT);
