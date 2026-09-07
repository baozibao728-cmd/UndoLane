import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: 'tests', testMatch: 'web.spec.ts', workers: 1, timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'chrome', headless: true,
    viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/dev.ts', url: 'http://127.0.0.1:5174/api/workspace',
    env: { PORT: '5174', UNDOLANE_WEB_DATA: resolve('test-results/web-workspace'),
      UNDOLANE_API_KEY: '', UNDOLANE_MODEL: '', UNDOLANE_BASE_URL: '' },
    timeout: 30_000, reuseExistingServer: false,
  },
});
