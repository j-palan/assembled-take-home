import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1100 },
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://127.0.0.1:3100/api/state',
    env: { PORT: '3100', DB_PATH: ':memory:' },
    reuseExistingServer: false,
    timeout: 30000,
  },
});
