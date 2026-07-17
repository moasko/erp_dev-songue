import { defineConfig } from 'vitest/config'

// Config dediee : sans elle, Vitest chargerait vite.config.ts et ses plugins
// (nitro, tanstack start) qui n'ont rien a faire dans des tests unitaires et
// empechent le processus de se terminer proprement.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
