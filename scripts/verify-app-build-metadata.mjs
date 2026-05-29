import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve(process.cwd(), 'dist')
const indexPath = path.join(distDir, 'index.html')

const requiredValues = [
  ['VITE_APP_BUILD_ID', process.env.VITE_APP_BUILD_ID],
  ['VITE_APP_DEPLOY_CONTEXT', process.env.VITE_APP_DEPLOY_CONTEXT],
]
  .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : ''])
  .filter(([, value]) => value)

if (requiredValues.length === 0) {
  throw new Error('No VITE_APP_* build metadata values were provided for verification.')
}

if (!fs.existsSync(indexPath)) {
  throw new Error(`Build output was not found at ${indexPath}. Run the build first.`)
}

const indexHtml = fs.readFileSync(indexPath, 'utf8')
const assetPaths = [...indexHtml.matchAll(/<script[^>]+src="([^"]+\.js)"/g)]
  .map(match => match[1])
  .map(src => path.join(distDir, src.replace(/^\//, '')))

if (assetPaths.length === 0) {
  throw new Error('No JavaScript entry assets were found in dist/index.html.')
}

const bundleText = assetPaths
  .filter(assetPath => fs.existsSync(assetPath))
  .map(assetPath => fs.readFileSync(assetPath, 'utf8'))
  .join('\n')

const missing = requiredValues.filter(([, value]) => !bundleText.includes(value))

if (missing.length > 0) {
  const keys = missing.map(([key]) => key).join(', ')
  throw new Error(`Build metadata did not compile into the app bundle: ${keys}.`)
}

console.log(`Verified app build metadata: ${requiredValues.map(([key]) => key).join(', ')}`)
