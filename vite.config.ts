import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Bundle analyzer (only in build mode)
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }) as any,
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        safari10: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React dependencies
          'react-vendor': ['react', 'react-dom'],
          // Supabase and auth
          'supabase-vendor': ['@supabase/supabase-js'],
          // Animation library (large)
          'animation-vendor': ['framer-motion'],
          // UI utilities
          'ui-vendor': ['lucide-react', 'clsx', 'tailwind-merge'],
          // Heavy components loaded lazily
          'emoji-picker': ['emoji-picker-react'],
          'sentiment-vendor': ['sentiment'],
          'toast-vendor': ['react-hot-toast'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
    sourcemap: false,
    reportCompressedSize: true,
  },
  server: {
    hmr: {
      overlay: false,
    },
  },
});
