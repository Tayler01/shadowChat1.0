import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import {
  createAdminClient,
  processShadowPinRow,
} from '../netlify/functions/_shared/shadow-pin-media.mjs'

const repoRoot = process.cwd()

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    const value = rawValue.replace(/^['"]|['"]$/g, '')
    process.env[key] = value
  }
}

for (const envFile of ['.env', '.env.local', '.env.production']) {
  loadEnvFile(path.join(repoRoot, envFile))
}

function ensureServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const ref = supabaseUrl?.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1]
  if (!ref) return

  const raw = execFileSync('supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const parsed = JSON.parse(raw)
  const keys = Array.isArray(parsed) ? parsed : parsed?.api_keys || []
  const serviceRole = keys.find(key => key.name === 'service_role' || key.type === 'service_role')
  if (serviceRole?.api_key) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRole.api_key
  }
}

ensureServiceRoleKey()

const force = process.argv.includes('--force')

async function loadRows(admin, table) {
  const { data, error } = await admin
    .from(table)
    .select('id,title,image_path,thumbnail_url,medium_url,processing_status,deleted_at,created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

function needsBackfill(row) {
  if (!row.image_path || row.image_path.startsWith('seed/')) return false
  return force || !row.thumbnail_url || !row.medium_url || row.processing_status !== 'ready'
}

async function backfillTarget(admin, targetType, table) {
  const rows = await loadRows(admin, table)
  const candidates = rows.filter(needsBackfill)
  let processed = 0
  let failed = 0

  console.log(`${targetType}: ${candidates.length} row(s) need derivative processing.`)
  for (const row of candidates) {
    try {
      await processShadowPinRow({
        admin,
        targetType,
        id: row.id,
        userId: null,
        requireOwnership: false,
      })
      processed += 1
      console.log(`  ok ${row.id} ${row.title || ''}`.trim())
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : 'failed'
      console.error(`  fail ${row.id}: ${message}`)
    }
  }

  return { processed, failed }
}

async function main() {
  const admin = createAdminClient()
  const categoryResult = await backfillTarget(admin, 'category', 'shadow_pin_categories')
  const imageResult = await backfillTarget(admin, 'image', 'shadow_pin_images')
  const processed = categoryResult.processed + imageResult.processed
  const failed = categoryResult.failed + imageResult.failed
  console.log(`ShadowPin media backfill complete: ${processed} processed, ${failed} failed.`)
  if (failed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
