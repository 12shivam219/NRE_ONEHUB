import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      // Clean alias pointing to src only
      '@': path.resolve(__dirname, './src'), 
    },
  },
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ],
  build: {
    sourcemap: true,
    minify: false,
    // Removed custom manualChunks to prevent bundler-created circular
    // chunk relationships (e.g. vendor <-> supabase) that can cause
    // TDZ/initialization errors in the browser. Let Rollup/Vite decide
    // chunking automatically for now.
    rollupOptions: {
      output: {},
    },
  },
  optimizeDeps: {
    // Vite 7 auto-discovers dependencies very well. 
    // Only add packages here if you see specific "Pre-bundling" errors in the console.
    include: [], 
  },
  server: {
    port: 5173,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
    },
  },
});