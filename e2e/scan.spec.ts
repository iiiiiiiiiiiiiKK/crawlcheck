import { expect, test } from '@playwright/test';
import { HTML_SAMPLE, ONLINE_HTML, ONLINE_ROBOTS, ONLINE_SITEMAP, ROBOTS_SAMPLE, SITEMAP_SAMPLE } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('landing page shows the product, the mode tabs and the author X link', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /know how crawlers see your website/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Online' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Local files' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Demo' })).toBeVisible();
  await expect(page.locator('#site-url')).toBeVisible();

  const author = page.getByRole('link', { name: /author on x/i }).first();
  await expect(author).toHaveAttribute('href', 'https://x.com/0xkillcoin');
  await expect(author).toHaveAttribute('target', '_blank');
  await expect(author).toHaveAttribute('rel', /noopener/);
});

test('rejects an empty and an invalid URL with a clear message', async ({ page }) => {
  await page.getByRole('button', { name: /run check/i }).click();
  await expect(page.getByText(/please enter a url/i)).toBeVisible();

  await page.locator('#site-url').fill('localhost');
  await page.getByRole('button', { name: /run check/i }).click();
  await expect(page.getByText(/cannot be scanned for safety reasons/i)).toBeVisible();
});

test('demo report renders a full result set with score, sections and advice', async ({ page }) => {
  await page.getByRole('tab', { name: 'Demo' }).click();
  await page.getByRole('button', { name: /open demo report/i }).click();

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Demo report', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('demo.crawlcheck.dev').first()).toBeVisible();

  // Score + counts are visible, and problems come with "why / how to fix".
  await expect(page.getByText(/overall health/i)).toBeVisible();
  await expect(page.getByText(/why it matters/i).first()).toBeVisible();
  await expect(page.getByText(/how to fix/i).first()).toBeVisible();

  // robots.txt section renders parsed groups (the nav item also shows counts).
  await page.getByRole('button', { name: /^robots\.txt/ }).first().click();
  await expect(page.getByText(/grouped by user-agent/i)).toBeVisible();
  await expect(page.locator('[data-code="robots.conflict"]').first()).toBeVisible();

  // Sitemap section renders the index and the child sitemap.
  await page.getByRole('button', { name: /^sitemap/i }).first().click();
  await expect(page.getByText(/sitemap index/i).first()).toBeVisible();
});

test('local file mode parses pasted robots.txt, sitemap and HTML', async ({ page }) => {
  await page.getByRole('tab', { name: 'Local files' }).click();
  await page.locator('#robots-file').fill(ROBOTS_SAMPLE);
  await page.locator('#sitemap-file').fill(SITEMAP_SAMPLE);
  await page.locator('#html-file').fill(HTML_SAMPLE);
  await page.locator('#local-base-url').fill('https://example.com');
  await page.getByRole('button', { name: /parse and check/i }).click();

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Local file check').first()).toBeVisible();
  // The whole-site Disallow must be reported as a failure.
  await expect(page.locator('[data-code="robots.block-all"]').first()).toBeVisible();
  await expect(page.locator('[data-code="seo.title"]').first()).toBeVisible();
});

test('local file mode accepts an uploaded HTML file', async ({ page }) => {
  await page.getByRole('tab', { name: 'Local files' }).click();
  await page.setInputFiles('input[type="file"][aria-label="HTML source"]', {
    name: 'index.html',
    mimeType: 'text/html',
    buffer: Buffer.from(HTML_SAMPLE, 'utf-8'),
  });
  await expect(page.locator('#html-file')).toHaveValue(/Local fixture page/);
  await page.getByRole('button', { name: /parse and check/i }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('local mode refuses to run without any input', async ({ page }) => {
  await page.getByRole('tab', { name: 'Local files' }).click();
  await page.getByRole('button', { name: /parse and check/i }).click();
  await expect(page.getByText(/upload or paste at least one file/i)).toBeVisible();
});

test('online scan works end to end against a CORS enabled target', async ({ page }) => {
  await page.route('https://example.com/**', async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'text/html; charset=utf-8' };
    if (url.pathname === '/robots.txt') {
      return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'text/plain' }, body: ONLINE_ROBOTS });
    }
    if (url.pathname === '/sitemap.xml') {
      return route.fulfill({ status: 200, headers: { ...headers, 'content-type': 'application/xml' }, body: ONLINE_SITEMAP });
    }
    return route.fulfill({ status: 200, headers, body: ONLINE_HTML });
  });

  await page.locator('#site-url').fill('example.com');
  await page.getByRole('button', { name: /run check/i }).click();

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.locator('[data-code="url.reachable"]').first()).toBeVisible();
  await expect(page.locator('[data-code="seo.title"]').first()).toBeVisible();
  await expect(page.locator('[data-code="robots.found"]').first()).toBeVisible();
});

test('a CORS blocked target is reported as unverified, never as a site error', async ({ page }) => {
  // No route mock: the request to example.com is blocked by the browser (CORS).
  await page.route('https://example.com/**', (route) => route.abort('failed'));

  await page.locator('#site-url').fill('example.com');
  await page.getByRole('button', { name: /run check/i }).click();

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.locator('[data-code="url.unverified"]').first()).toBeVisible();
  await expect(page.locator('[data-code="seo.not-checked"]').first()).toBeVisible();
  // Nothing in the SEO section may be reported as a pass.
  await expect(page.locator('[data-status="pass"][data-code^="seo."]')).toHaveCount(0);
  await expect(page.locator('[data-limitation="limitation.cors"]')).toBeVisible();
});

test('report export produces JSON and Markdown downloads', async ({ page, browserName }) => {
  // Blob downloads are exercised in Chromium; WebKit in this harness does not emit
  // download events for programmatic anchor clicks. Export itself is engine agnostic.
  test.skip(browserName !== 'chromium', 'download events asserted in Chromium only');
  await page.getByRole('tab', { name: 'Demo' }).click();
  await page.getByRole('button', { name: /open demo report/i }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'JSON' }).click()]);
  expect(json.suggestedFilename()).toMatch(/^crawlcheck-demo\.crawlcheck\.dev-.*\.json$/);
  const jsonPath = await json.path();
  const jsonText = await (await import('node:fs/promises')).readFile(jsonPath!, 'utf-8');
  const parsed = JSON.parse(jsonText);
  expect(parsed.tool).toBe('CrawlCheck');
  expect(parsed.findings.length).toBeGreaterThan(5);
  expect(parsed.score.grade).toBeTruthy();

  const [markdown] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /markdown/i }).click(),
  ]);
  expect(markdown.suggestedFilename()).toMatch(/\.md$/);
  const mdPath = await markdown.path();
  const mdText = await (await import('node:fs/promises')).readFile(mdPath!, 'utf-8');
  expect(mdText).toContain('# CrawlCheck report');
  expect(mdText).toContain('Scoring rule');
});

test('history stores local checks, reopens them and deletes them — but never demo reports', async ({ page }) => {
  // A demo visit must not create a history entry.
  await page.getByRole('tab', { name: 'Demo' }).click();
  await page.getByRole('button', { name: /open demo report/i }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // A real local check does.
  await page.getByRole('button', { name: /back to scan/i }).click();
  await page.getByRole('tab', { name: 'Local files' }).click();
  await page.locator('#robots-file').fill(ROBOTS_SAMPLE);
  await page.getByRole('button', { name: /parse and check/i }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.getByRole('button', { name: 'History', exact: true }).first().click();
  const rows = page.locator('main ul > li');
  await expect(rows).toHaveCount(1);
  await expect(page.getByText(/no checks yet/i)).toHaveCount(0);

  // Reopen the stored report.
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  // Delete it again.
  await page.getByRole('button', { name: 'History', exact: true }).first().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/no checks yet/i)).toBeVisible();
});

test('theme and language switches work and persist', async ({ page }) => {
  const html = page.locator('html');
  const initialDark = (await html.getAttribute('class'))?.includes('dark') ?? false;

  await page.getByRole('button', { name: /toggle theme/i }).click();
  const afterFirst = (await html.getAttribute('class'))?.includes('dark') ?? false;
  expect(afterFirst).not.toBe(initialDark);

  // Cycle back to a deterministic value, then reload and check persistence.
  await page.getByRole('button', { name: /toggle theme/i }).click();
  const afterSecond = (await html.getAttribute('class'))?.includes('dark') ?? false;

  await page.getByRole('button', { name: /switch language/i }).click();
  await expect(page.getByRole('button', { name: /开始检查/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /开始检查/ })).toBeVisible();
  const afterReload = (await html.getAttribute('class'))?.includes('dark') ?? false;
  expect(afterReload).toBe(afterSecond);
});

test('scan settings can store a scan-service endpoint', async ({ page }) => {
  await page.getByRole('button', { name: /^settings$/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const field = dialog.locator('input[type="text"]');
  await field.fill('not-a-url');
  await dialog.getByRole('button', { name: /save/i }).click();
  await expect(dialog.getByText(/must be a full http\(s\) url/i)).toBeVisible();

  await field.fill('https://scan.example.workers.dev');
  await dialog.getByRole('button', { name: /save/i }).click();
  await expect(dialog.getByText('https://scan.example.workers.dev')).toBeVisible();
  await dialog.getByRole('button', { name: /close/i }).click();
  await expect(dialog).toHaveCount(0);
});
