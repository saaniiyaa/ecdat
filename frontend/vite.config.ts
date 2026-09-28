import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server proxies `/api` to the backend rather than letting the browser
 * call an absolute URL. That is deliberate: a browser-facing bundle must never
 * hardcode a host, because whoever opens the console is not on this machine.
 *
 * The target is an env var so the same checkout works on a laptop, in the
 * preview sandbox, and behind a reverse proxy, without editing this file.
 *
 *   VITE_API_TARGET=http://127.0.0.1:8000   npm run dev   (default)
 */
const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:8000';

/**
 * Extra hostnames the dev server will answer to.
 *
 * Vite rejects unrecognised Host headers by default, which is DNS-rebinding
 * protection and should stay on. It also means the server cannot be reached
 * through a tunnel or a preview proxy, so the extra hosts are declared here
 * rather than by switching the protection off with `allowedHosts: true`.
 * A leading dot is a suffix match, which is what a preview host needs.
 *
 *   VITE_ALLOWED_HOSTS=.e2b.app,.example.dev npm run dev
 */
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT) || 3000,
    host: true,
    allowedHosts,
    // The preview is served from a different origin than the page, so the
    // proxy must accept the forwarded host rather than pinning to localhost.
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: Number(process.env.VITE_PORT) || 3000,
    host: true,
    allowedHosts,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
