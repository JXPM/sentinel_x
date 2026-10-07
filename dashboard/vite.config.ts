import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, Vite relaie :
//   /api et /ws  -> API FastAPI (uvicorn, :8000)
//   /video       -> service vision ai/vision/detect.py (:8081), flux MJPEG et /video/status
// En production, Caddy fait le même aiguillage (docs/02 - Architecture/Stack Docker Compose.md).
const API = process.env.SENTINEL_API ?? 'http://localhost:8000';
const VISION = process.env.SENTINEL_VISION ?? 'http://localhost:8081';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': API,
      '/video': VISION,
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
    },
  },
});
