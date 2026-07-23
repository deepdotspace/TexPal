/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import generouted from '@generouted/react-router/plugin'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  // The Cloudflare plugin's worker environment rejects vitest's injected
  // `resolve.external`, so leave it out when running under vitest.
  plugins: [react(), generouted(), ...(process.env.VITEST ? [] : [cloudflare()])],
  resolve: {
    dedupe: ['react', 'react-dom', 'better-auth'],
  },
  test: {
    // Unit tests only — tests/*.spec.ts are Playwright suites run by `deepspace test`.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
