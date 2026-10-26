import { execFileSync } from 'node:child_process'
import { defineConfig, normalizePath, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve, relative, sep, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, readdirSync, statSync } from 'node:fs'

const appRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(appRoot, '../..')
const publicRoot = resolve(repoRoot, 'public')
const assetRoots = ['icons', 'medals', 'notification-sounds', 'hype', 'apple-touch-icon.png', 'comfort-bootstrap.js', 'sw.js']

// This resolver is installed ONLY by this edition's config. The full app's
// imports, entry point, build, and deployment remain untouched.
const sharedOverrides = JSON.parse(readFileSync(resolve(appRoot, 'shared-overrides.json'), 'utf8')) as Record<string, string>
const replacements = new Map([
  ...Object.entries(sharedOverrides).map(([source, target]) => [source.replace(/\.tsx?$/, ''), target]),
  ['src/config/brand', 'src/streamlined/brand.ts'],
  ['src/components/layout/MobileNav', 'src/streamlined/components/StreamlinedMobileNav.tsx'],
  ['src/components/layout/MobileAppHeader', 'src/streamlined/components/StreamlinedMobileAppHeader.tsx'],
  ['src/components/chat/GeneralChatRoomTools', 'src/streamlined/components/StreamlinedGeneralChatRoomTools.tsx'],
  ['src/hooks/useTheme', 'src/streamlined/StreamlinedTheme.tsx'],
].map(([source, target]) => [resolve(repoRoot, source).toLowerCase(), normalizePath(resolve(repoRoot, target))]))

function editionModules(): Plugin {
  return {
    name: 'streamlined-edition-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null
      const resolved = resolve(dirname(importer.split('?')[0]), source).replace(/\.(tsx?|jsx?)$/, '').toLowerCase()
      return replacements.get(resolved) ?? null
    },
    transform(code, id) {
      if (id.split('?')[0].replace(/\\/g, '/') !== resolve(repoRoot, 'src/index.css').replace(/\\/g, '/')) return null
      // Keep the shared layout/comfort rules, but remove unused backdrop URLs.
      return code.replace(/url\((?:["'])?\/themes\/[^)]*\)/g, 'none')
    },
    generateBundle() {
      const modules = [...this.getModuleIds()].map(id => relative(repoRoot, id).replace(/\\/g, '/'))
        .filter(id => id.startsWith('src/') || id.startsWith('apps/streamlined/src-overrides/')).sort()
      this.emitFile({ type: 'asset', fileName: '.vite/streamlined-modules.json', source: JSON.stringify(modules, null, 2) })
    },
  }
}

function sharedAssets(): Plugin {
  const allowed = (name: string) => assetRoots.some(root => name === root || name.startsWith(`${root}/`))
  const emitDirectory = (name: string, emit: (name: string) => void) => {
    const fullPath = resolve(publicRoot, name)
    if (statSync(fullPath).isDirectory()) {
      for (const child of readdirSync(fullPath)) emitDirectory(`${name}/${child}`, emit)
    } else emit(name)
  }
  return {
    name: 'streamlined-shared-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = (request.url ?? '').split('?')[0].replace(/^\//, '')
        if (!allowed(name)) return next()
        const fullPath = resolve(publicRoot, name)
        const relativePath = relative(publicRoot, fullPath)
        if (relativePath.startsWith(`..${sep}`) || relativePath === '..') return next()
        try {
          const mime: Record<string, string> = { '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav' }
          response.setHeader('Content-Type', mime[extname(fullPath)] ?? 'application/octet-stream')
          response.end(readFileSync(fullPath))
        } catch { next() }
      })
    },
    generateBundle() {
      for (const name of assetRoots) emitDirectory(name, fileName => {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(resolve(publicRoot, fileName)) })
      })
    },
  }
}

function buildIdentity(localFeaturePreview: boolean): Plugin {
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const sourceDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: repoRoot, encoding: 'utf8' }).trim().length > 0
  return {
    name: 'streamlined-build-identity',
    transformIndexHtml(html) {
      return {
        html: localFeaturePreview ? html.replace('<title>ShadowChat · Streamlined</title>', '<title>ShadowChat · Local feature preview</title>') : html,
        tags: [{ tag: 'meta', attrs: { name: 'shadowchat-local-feature-preview', content: localFeaturePreview ? 'enabled' : 'disabled' }, injectTo: 'head' }],
      }
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '.vite/streamlined-build-mode.json', source: JSON.stringify({ edition: 'streamlined', localFeaturePreview, releaseEligible: !localFeaturePreview, sourceCommit, sourceDirty }, null, 2) })
    },
  }
}

export default defineConfig(({ mode }) => {
  const localFeaturePreview = mode === 'local-preview'
  return {
  root: appRoot,
  envDir: repoRoot,
  plugins: [editionModules(), react(), sharedAssets(), buildIdentity(localFeaturePreview)],
  css: { postcss: appRoot },
  define: {
    __SHADOWCHAT_STREAMLINED_EDITION__: 'true',
    __SHADOWCHAT_LOCAL_FEATURE_PREVIEW__: JSON.stringify(localFeaturePreview),
    __SHADOWCHAT_BOARDS_ENABLED__: 'false',
    __SHADOWCHAT_ESP_ADMIN_ENABLED__: 'false',
    __SHADOWCHAT_ACTIVITY_ENABLED__: 'false',
    __SHADOWCHAT_MEMBER_REPORTING_ENABLED__: 'true',
    __SHADOWCHAT_SHADO_LIVE_PROTOTYPE_ENABLED__: 'false',
    __SHADOWCHAT_SHADO_LIVE_REAL_ENABLED__: 'false',
    __SHADOWCHAT_CATCH_UP_ENABLED__: 'false',
    __SHADOWCHAT_SHADOW_CIRCUIT_ENABLED__: 'false',
  },
  server: { host: '127.0.0.1', port: 4175, strictPort: true, fs: { allow: [repoRoot] } },
  preview: { host: '127.0.0.1', port: 4175, strictPort: true },
  build: {
    outDir: resolve(appRoot, localFeaturePreview ? 'dist-local-preview' : 'dist'),
    emptyOutDir: true,
    manifest: true,
    chunkSizeWarningLimit: 525,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/@supabase/')) return 'vendor-supabase'
          if (/\/(react|react-dom|react-is|scheduler)\//.test(id)) return 'vendor-react'
          if (id.includes('/framer-motion/')) return 'vendor-motion'
          if (id.includes('/emoji-picker-react/')) return 'emoji-picker-react'
          return undefined
        },
      },
    },
  },
  }
})
