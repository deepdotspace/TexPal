import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  globalSetup: './helpers/global-setup.ts',
  timeout: 30_000,
  // One retry absorbs first-contact dev-server transients (Vite re-optimizing
  // deps after an install, the worker's upstream proxies warming up) without
  // masking real failures — a genuine break fails both the attempt and retry.
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'npx vite',
    cwd: '..',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
