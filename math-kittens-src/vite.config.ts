import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const SERVER_PORT = Number(process.env.SERVER_PORT || 8787);

// `vite build --mode cybermath` builds the copy served at cyber-math.com/math-kittens/
// straight into the site's ../math-kittens folder (server address: .env.cybermath).
export default defineConfig(({ mode }) => {
  const cybermath = mode === 'cybermath';
  return {
    base: cybermath ? '/math-kittens/' : '/',
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: Number(process.env.PORT) || 5173,
      proxy: {
        '/ws': { target: `ws://localhost:${SERVER_PORT}`, ws: true },
        '/api': { target: `http://localhost:${SERVER_PORT}` },
      },
    },
    build: {
      outDir: cybermath ? '../math-kittens' : 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: { manualChunks: { react: ['react', 'react-dom'], motion: ['framer-motion'] } },
      },
    },
    test: {
      include: ['shared/**/*.test.ts', 'server/**/*.test.ts'],
      environment: 'node',
    },
  } as any;
});
