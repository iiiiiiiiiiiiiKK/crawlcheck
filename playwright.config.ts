import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE = process.env.PW_BASE ?? `http://127.0.0.1:${PORT}/crawlcheck/`;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
    locale: 'en-US',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1360, height: 900 },
        launchOptions: {
          // Headless machines without a usable GPU need software rendering.
          // These are Chromium flags and must not be passed to WebKit.
          args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage'],
        },
      },
    },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    url: BASE,
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
