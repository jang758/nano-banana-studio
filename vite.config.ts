import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 3000,
    host: '127.0.0.1',
    strictPort: true,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        standard: fileURLToPath(new URL('./index.html', import.meta.url)),
        harness: fileURLToPath(new URL('./harness.html', import.meta.url)),
        compare: fileURLToPath(new URL('./compare.html', import.meta.url)),
      },
    },
  },
});
