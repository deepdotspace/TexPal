/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generouted from '@generouted/react-router/plugin'
import { cloudflare } from '@cloudflare/vite-plugin'
import { deepspaceBuild } from 'deepspace/build'

export default defineConfig({
  // The Cloudflare plugin's worker environment rejects vitest's injected
  // `resolve.external`, so leave it out when running under vitest.
  //
  // deepspaceBuild() carries the SDK-owned build wiring: the app-id define, the
  // client dedupe list, and removal of the preview `.dev.vars` the Cloudflare
  // plugin drops beside the built worker.
  plugins: [
    react(),
    generouted(),
    ...(process.env.VITEST ? [] : [cloudflare()]),
    deepspaceBuild({ appDir: fileURLToPath(new URL('.', import.meta.url)) }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'better-auth'],
  },
  test: {
    // Unit tests only — tests/*.spec.ts are Playwright suites run by `deepspace test`.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Component tests render into a DOM and read localStorage.
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
