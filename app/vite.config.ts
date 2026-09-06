import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          globe: ['three', 'react-globe.gl'],
        },
      },
    },
    chunkSizeWarningLimit: 1600,
  },
});
