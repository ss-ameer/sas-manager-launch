import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.replace(/\\/g, '/');
            if (!normalized.includes('/node_modules/')) {
              return undefined;
            }
            if (
              normalized.includes('/node_modules/react/') ||
              normalized.includes('/node_modules/react-dom/') ||
              normalized.includes('/node_modules/scheduler/')
            ) {
              return 'react-vendor';
            }
            if (
              normalized.includes('/node_modules/firebase/') ||
              normalized.includes('/node_modules/@firebase/')
            ) {
              return 'firebase-vendor';
            }
            if (
              normalized.includes('/node_modules/recharts/') ||
              normalized.includes('/node_modules/d3-')
            ) {
              return 'charts-vendor';
            }
            if (normalized.includes('/node_modules/lucide-react/')) {
              return 'icons-vendor';
            }
            if (
              normalized.includes('/node_modules/mammoth/') ||
              normalized.includes('/node_modules/jspdf/')
            ) {
              return 'doc-vendor';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
