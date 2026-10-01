import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
  server: { host: true },
});
