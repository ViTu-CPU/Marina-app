import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the static build works from any sub-directory (DECISIONS D8).
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // U23: libraries in their own files, so a new version of the app does not make the
        // browser download them again. The total size does not change.
        codeSplitting: {
          groups: [
            { name: 'jsts', test: /node_modules[\\/]jsts[\\/]/ },
            { name: 'konva', test: /node_modules[\\/](konva|react-konva)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  worker: { format: 'es' },
  test: {
    // Engine tests run in plain Node on purpose: the engine must not need a DOM.
    // UI tests opt in per file with `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
