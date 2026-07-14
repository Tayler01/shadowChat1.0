import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isEnabled = (name: string) => (process.env[name] ?? env[name] ?? '').trim().toLowerCase() === 'true'

  return {
    define: {
      __SHADOWCHAT_BOARDS_ENABLED__: JSON.stringify(isEnabled('VITE_FEATURE_BOARDS')),
      __SHADOWCHAT_ESP_ADMIN_ENABLED__: JSON.stringify(isEnabled('VITE_FEATURE_ESP_ADMIN')),
      __SHADOWCHAT_ACTIVITY_ENABLED__: JSON.stringify(isEnabled('VITE_FEATURE_ACTIVITY')),
      __SHADOWCHAT_MEMBER_REPORTING_ENABLED__: JSON.stringify(isEnabled('VITE_FEATURE_MEMBER_REPORTING')),
      __SHADOWCHAT_SHADO_LIVE_PROTOTYPE_ENABLED__: JSON.stringify(isEnabled('VITE_FEATURE_SHADO_LIVE_PROTOTYPE')),
      __SHADOWCHAT_CATCH_UP_ENABLED__: JSON.stringify(isEnabled('VITE_FEATURE_CATCH_UP')),
    },
    plugins: [react()],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    build: {
      manifest: true,
      // Phaser is loaded only after the user enters Shadow Runner. The build
      // budget verifier below applies a tighter, explicit lazy-chunk exception
      // while keeping the initial route and every other chunk below 525 kB.
      chunkSizeWarningLimit: 1550,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            const packageName = getPackageName(id)

            if (packageName === 'emoji-picker-react') {
              return 'emoji-picker-react'
            }

            if (['react', 'react-dom', 'react-is', 'scheduler'].includes(packageName)) {
              return 'vendor-react'
            }

            if (packageName.startsWith('@supabase/')) {
              return 'vendor-supabase'
            }

            if (packageName === 'framer-motion') {
              return 'vendor-motion'
            }

            if (packageName === 'phaser') {
              return 'vendor-phaser'
            }

            return undefined
          },
        },
      },
    },
  }
});

function getPackageName(id: string) {
  const normalized = id.replace(/\\/g, '/')
  const parts = normalized.split('/node_modules/')
  const packagePath = parts[parts.length - 1] || ''
  const [scopeOrName, scopedName] = packagePath.split('/')

  if (scopeOrName?.startsWith('@') && scopedName) {
    return `${scopeOrName}/${scopedName}`
  }

  return scopeOrName || ''
}
