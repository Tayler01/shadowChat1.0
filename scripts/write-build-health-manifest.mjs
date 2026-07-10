import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(root, 'dist', '.well-known', 'shadowchat-health.json')

const readEnvFile = filePath => {
  if (!fs.existsSync(filePath)) return {}

  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const separator = line.indexOf('=')
        const key = line.slice(0, separator).trim()
        let value = line.slice(separator + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        return [key, value]
      })
  )
}

export const loadBuildEnvironment = () => {
  const fileEnvironment = [
    '.env',
    '.env.local',
    '.env.production',
    '.env.production.local',
  ].reduce((combined, fileName) => ({
    ...combined,
    ...readEnvFile(path.join(root, fileName)),
  }), {})

  return { ...fileEnvironment, ...process.env }
}

export const isConfiguredWebPushPublicKey = value => {
  const normalized = typeof value === 'string' ? value.trim().replace(/=+$/g, '') : ''
  return normalized.length >= 80
    && normalized.length <= 100
    && /^[A-Za-z0-9_-]+$/.test(normalized)
}

export const createBuildHealthManifest = environment => ({
  schemaVersion: 1,
  buildId: environment.VITE_APP_BUILD_ID?.trim() || null,
  commitSha: environment.VITE_APP_COMMIT_SHA?.trim() || null,
  deployContext: environment.VITE_APP_DEPLOY_CONTEXT?.trim() || null,
  pushPublicKeyConfigured: isConfiguredWebPushPublicKey(
    environment.VITE_WEB_PUSH_PUBLIC_KEY
  ),
})

export const writeBuildHealthManifest = () => {
  const manifest = createBuildHealthManifest(loadBuildEnvironment())
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(
    `Wrote sanitized build health manifest (${manifest.commitSha ? 'release metadata present' : 'local build'}).`
  )
  return manifest
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  writeBuildHealthManifest()
}
