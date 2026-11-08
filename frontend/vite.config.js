import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = {
    '/api/v1/demo-ai': { target: env.DEMO_AI_PROXY_TARGET || 'http://127.0.0.1:8001' },
    '/api': { target: env.SIMULATOR_PROXY_TARGET || 'http://127.0.0.1:8000', ws: true },
  };
  return { plugins: [react()], server: { port: 5173, strictPort: true, proxy }, preview: { port: 5173, strictPort: true, proxy } };
});
