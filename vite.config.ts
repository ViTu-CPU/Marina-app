import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the static build works from any sub-directory (DECISIONS D8).
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    // Engine tests run in plain Node on purpose: the engine must not need a DOM.
    // UI tests opt in per file with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
