import assert from 'node:assert/strict'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

assert(process.argv.slice(2).every(argument => argument === '--local-preview'), 'Unknown streamlined verification option')
const localFeaturePreview = process.argv.includes('--local-preview')
const root = path.resolve('apps/streamlined', localFeaturePreview ? 'dist-local-preview' : 'dist')
const buildMode = JSON.parse(await readFile(path.join(root, '.vite/streamlined-build-mode.json'), 'utf8'))
assert.equal(buildMode.edition, 'streamlined', 'Wrong edition marker')
assert.equal(buildMode.localFeaturePreview, localFeaturePreview, 'Local preview marker does not match the artifact being verified')
assert.equal(buildMode.releaseEligible, !localFeaturePreview, 'Local feature preview must never be release eligible')
const html = await readFile(path.join(root, 'index.html'), 'utf8')
const htmlMarker = `name="shadowchat-local-feature-preview" content="${localFeaturePreview ? 'enabled' : 'disabled'}"`
assert(html.includes(htmlMarker), 'Local preview HTML marker is missing or incorrect')
const manifest = JSON.parse(await readFile(path.join(root, '.vite/manifest.json'), 'utf8'))
const rawModules = JSON.parse(await readFile(path.join(root, '.vite/streamlined-modules.json'), 'utf8'))
const overrideMap = JSON.parse(await readFile('apps/streamlined/shared-overrides.json', 'utf8'))
const originalByOverride = new Map(Object.entries(overrideMap).map(([original, override]) => [override, original]))
const modules = rawModules.map(source => originalByOverride.get(source) ?? source)
assert.equal(new Set(modules.map(id => id.toLowerCase())).size, modules.length, 'Duplicate module identities can split shared React providers')
const forbidden = [
  'src/App.tsx', 'src/components/settings/SettingsView.tsx',
  'src/components/layout/Sidebar.tsx', 'src/components/layout/MobileNav.tsx',
  'src/components/chat/WeatherWidget.tsx', 'src/hooks/useWeatherForecast.tsx',
  'src/features/weather/WeatherView.tsx', 'src/features/games/GamesHome.tsx',
  'src/features/games/shadow-checkers/hooks/useShadowCheckersInvitations.tsx',
  'src/components/easter-egg/GoldenEggDiscovery.tsx',
]
for (const source of forbidden) assert(!modules.includes(source), `Excluded feature entered streamlined build: ${source}`)
for (const required of ['src/components/chat/MessageInput.tsx', 'src/components/chat/ChatImageRadialHeart.tsx', 'src/components/dms/DirectMessagesView.tsx', 'src/features/shadow-pin/ShadowPin.tsx', 'src/features/moderation/ModerationReportProvider.tsx']) {
  assert(modules.includes(required), `Required shared feature missing: ${required}`)
}
const chunks = Object.values(manifest).map(entry => entry.file)
assert(!chunks.some(file => /vendor-(phaser|babylon|livekit)|GamesHome|WeatherView/.test(file)), 'Unrelated runtime was bundled')
const visited = new Set()
function visit(key) {
  if (visited.has(key)) return
  visited.add(key)
  for (const dependency of manifest[key]?.imports ?? []) visit(dependency)
}
visit('index.html')
const initial = await Promise.all([...visited].map(async key => {
  const file = manifest[key].file
  const bytes = await readFile(path.join(root, file))
  return { file, raw: bytes.length, gzip: gzipSync(bytes).length }
}))
const raw = initial.reduce((sum, file) => sum + file.raw, 0)
const gzip = initial.reduce((sum, file) => sum + file.gzip, 0)
assert(raw < 1_000_000, `Initial JS exceeds 1 MB: ${raw}`)
assert(gzip < 300_000, `Initial JS exceeds 300 kB gzip: ${gzip}`)
let hasLocalRuntimeGuard = false
for (const file of chunks.filter(file => file.endsWith('.js'))) {
  assert((await stat(path.join(root, file))).size < 525_000, `Oversized chunk: ${file}`)
  const code = await readFile(path.join(root, file), 'utf8')
  if (code.includes('shadowchat-local-feature-preview')) hasLocalRuntimeGuard = true
}
assert.equal(hasLocalRuntimeGuard, localFeaturePreview, localFeaturePreview ? 'Local feature preview runtime guard is missing' : 'A local feature preview runtime entered the release artifact')
const directories = await readdir(root)
assert(!directories.some(name => ['themes', 'games', 'tutorials', 'easter-egg', 'unity'].includes(name)), 'Excluded public assets were copied')
const evidence = { edition: 'streamlined', localFeaturePreview, releaseEligible: !localFeaturePreview, initialJsRawBytes: raw, initialJsGzipBytes: gzip, initialAssets: initial, sourceModuleCount: modules.length, requiredCoreFeaturesPresent: true, excludedFeaturesAbsent: true }
await writeFile(path.join(root, '.vite/streamlined-budget.json'), `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`Streamlined ${localFeaturePreview ? 'LOCAL FEATURE PREVIEW (not a release artifact)' : 'release'} build verified: ${Math.round(raw / 1000)} kB initial JS (${Math.round(gzip / 1000)} kB gzip); core chat/radial/DM/ShadowPin/reporting retained; unrelated app runtimes excluded.`)
