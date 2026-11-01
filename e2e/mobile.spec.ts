import { expect, test } from '@playwright/test';
import { ROBOTS_SAMPLE } from './fixtures';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iOS viewport test');
  await page.goto('./');
});

async function horizontalOverflow(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test('landing page fits an iPhone viewport without horizontal scrolling', async ({ page }) => {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  await expect(page.getByRole('heading', { name: /know how crawlers see your website/i })).toBeVisible();
  await expect(page.locator('#site-url')).toBeVisible();

  // The primary action must stay a comfortable tap target.
  const submit = page.getByRole('button', { name: /run check/i });
  const box = await submit.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(88);

  // iOS must not zoom when focusing an input, i.e. >= 16px font size.
  const fontSize = await page.locator('#site-url').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
});

test('header keeps the author link and controls reachable on a phone', async ({ page }) => {
  const author = page.getByRole('link', { name: /author on x/i }).first();
  await expect(author).toBeVisible();
  await expect(author).toHaveAttribute('href', 'https://x.com/0xkillcoin');

  await expect(page.getByRole('button', { name: /toggle theme/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /switch language/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /settings/i }).first()).toBeVisible();
});

test('report layout is usable on a phone (tabs, no overflow, sections reachable)', async ({ page }) => {
  await page.getByRole('tab', { name: 'Demo' }).click();
  await page.getByRole('button', { name: /open demo report/i }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  // Section navigation becomes horizontal tabs on small screens.
  const robotsTab = page.getByRole('button', { name: 'robots.txt', exact: true }).first();
  await expect(robotsTab).toBeVisible();
  const tabBox = await robotsTab.boundingBox();
  expect(tabBox?.height ?? 0).toBeGreaterThanOrEqual(32);

  await robotsTab.click();
  await expect(page.getByText(/grouped by user-agent/i)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  // The info panel is collapsed into a disclosure on phones.
  await page.getByText('Check info').first().click();
  await expect(page.getByText(/checked at/i).first()).toBeVisible();
});

test('long content wraps instead of breaking the mobile layout', async ({ page }) => {
  await page.getByRole('tab', { name: 'Local files' }).click();
  await page.locator('#robots-file').fill(`${ROBOTS_SAMPLE}\nSitemap: https://example.com/${'very-long-segment-'.repeat(12)}sitemap.xml\n`);
  await page.getByRole('button', { name: /parse and check/i }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test('mobile history list keeps its actions tappable', async ({ page }) => {
  await page.getByRole('tab', { name: 'Local files' }).click();
  await page.locator('#robots-file').fill(ROBOTS_SAMPLE);
  await page.getByRole('button', { name: /parse and check/i }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.getByRole('button', { name: 'History', exact: true }).first().click();
  const open = page.getByRole('button', { name: 'Open', exact: true });
  await expect(open).toBeVisible();
  const box = await open.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(28);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});
