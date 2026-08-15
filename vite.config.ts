import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { saveAnalysisResultToDisk, type AnalysisResultSavePayload } from './server/resultStorage.ts';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

async function readJson(request: IncomingMessage): Promise<AnalysisResultSavePayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as AnalysisResultSavePayload;
}

function resultStorageMiddleware() {
  return async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    if (request.method !== 'POST') {
      next();
      return;
    }
    try {
      const result = await saveAnalysisResultToDisk(projectRoot, await readJson(request));
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(result));
    } catch (error) {
      response.statusCode = 400;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : '자동 결과 저장에 실패했습니다.' }));
    }
  };
}

function resultStoragePlugin(): Plugin {
  return {
    name: 'nano-banana-result-storage',
    configureServer(server) {
      server.middlewares.use('/api/save-analysis-result', resultStorageMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/save-analysis-result', resultStorageMiddleware());
    },
  };
}

export default defineConfig({
  server: {
    port: 3000,
    host: '127.0.0.1',
    strictPort: true,
  },
  plugins: [resultStoragePlugin(), react(), tailwindcss()],
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
