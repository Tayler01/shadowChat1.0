import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

const repoRoot = process.cwd()
const apply = process.argv.includes('--apply')
const force = process.argv.includes('--force')
const limitArg = process.argv.find(arg => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : Number.POSITIVE_INFINITY

const TARGETS = {
  avatar: { bucket: 'avatars', maxWidth: 512, maxHeight: 512, quality: 82, minBytes: 96 * 1024 },
  banner: { bucket: 'banners', maxWidth: 1600, maxHeight: 900, quality: 82, minBytes: 320 * 1024 },
  art: { bucket: 'art-board', maxWidth: 1600, maxHeight: 1600, quality: 82, minBytes: 320 * 1024 },
  chat: { bucket: 'chat-uploads', maxWidth: 1600, maxHeight: 1600, quality: 82, minBytes: 320 * 1024 },
}

const stats = {
  scanned: 0,
  candidates: 0,
  optimized: 0,
  skipped: 0,
  failed: 0,
  originalBytes: 0,
  optimizedBytes: 0,
}

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
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '')
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

function createAdminClient() {
  ensureServiceRoleKey()
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function publicStoragePath(bucket, publicUrl) {
  if (!publicUrl) return null
  let url
  try {
    url = new URL(publicUrl)
  } catch {
    return null
  }
  const marker = `/storage/v1/object/public/${bucket}/`
  const index = url.pathname.indexOf(marker)
  if (index === -1) return null
  return decodeURIComponent(url.pathname.slice(index + marker.length))
}

function buildOptimizedPath(originalPath, kind, id) {
  const directory = originalPath.includes('/') ? originalPath.slice(0, originalPath.lastIndexOf('/')) : ''
  const prefix = directory ? `${directory}/optimized` : 'optimized'
  const safeId = String(id).replace(/[^a-zA-Z0-9._-]+/g, '-')
  return `${prefix}/${kind}-${safeId}-${Date.now()}.webp`
}

async function blobToBuffer(blob) {
  return Buffer.from(await blob.arrayBuffer())
}

async function optimizeBuffer(buffer, target) {
  const image = sharp(buffer, { animated: false })
  const metadata = await image.metadata()
  if (!metadata.width || !metadata.height || (metadata.pages && metadata.pages > 1)) {
    return null
  }

  return sharp(buffer, { animated: false })
    .rotate()
    .resize({
      width: target.maxWidth,
      height: target.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: target.quality, effort: 4 })
    .toBuffer()
}

async function optimizePublicImage(admin, item) {
  stats.scanned += 1
  if (stats.candidates >= limit) return 'limit'

  const target = TARGETS[item.kind]
  const sourcePath = publicStoragePath(target.bucket, item.url)
  if (!sourcePath || sourcePath.includes('/optimized/')) {
    stats.skipped += 1
    return 'skipped'
  }

  const { data, error } = await admin.storage.from(target.bucket).download(sourcePath)
  if (error || !data) {
    throw new Error(error?.message || `Unable to download ${target.bucket}/${sourcePath}`)
  }

  const original = await blobToBuffer(data)
  if (!force && original.byteLength < target.minBytes) {
    stats.skipped += 1
    return 'skipped'
  }

  const optimized = await optimizeBuffer(original, target)
  if (!optimized) {
    stats.skipped += 1
    return 'skipped'
  }

  if (!force && optimized.byteLength >= original.byteLength * 0.95) {
    stats.skipped += 1
    return 'skipped'
  }

  stats.candidates += 1
  stats.originalBytes += original.byteLength
  stats.optimizedBytes += optimized.byteLength

  if (!apply) {
    console.log(`dry-run ${item.kind} ${item.id}: ${original.byteLength} -> ${optimized.byteLength}`)
    return 'optimized'
  }

  const optimizedPath = buildOptimizedPath(sourcePath, item.kind, item.id)
  const { error: uploadError } = await admin.storage.from(target.bucket).upload(optimizedPath, optimized, {
    upsert: true,
    contentType: 'image/webp',
    cacheControl: '31536000',
  })
  if (uploadError) throw uploadError

  const { data: publicUrlData } = admin.storage.from(target.bucket).getPublicUrl(optimizedPath)
  const { error: updateError } = await item.update(publicUrlData.publicUrl, optimizedPath)
  if (updateError) throw updateError
  console.log(`optimized ${item.kind} ${item.id}: ${original.byteLength} -> ${optimized.byteLength}`)
  return 'optimized'
}

async function loadItems(admin) {
  const items = []

  const { data: users, error: usersError } = await admin
    .from('users')
    .select('id, avatar_url, banner_url')
  if (usersError) throw usersError

  for (const user of users || []) {
    if (user.avatar_url) {
      items.push({
        kind: 'avatar',
        id: user.id,
        url: user.avatar_url,
        update: publicUrl => admin.from('users').update({ avatar_url: publicUrl }).eq('id', user.id),
      })
    }
    if (user.banner_url) {
      items.push({
        kind: 'banner',
        id: user.id,
        url: user.banner_url,
        update: publicUrl => admin.from('users').update({ banner_url: publicUrl }).eq('id', user.id),
      })
    }
  }

  const { data: artItems, error: artError } = await admin
    .from('art_board_items')
    .select('id, image_url, image_path, item_type, deleted_at')
    .eq('item_type', 'image')
    .is('deleted_at', null)
  if (artError) throw artError

  for (const art of artItems || []) {
    if (!art.image_url) continue
    items.push({
      kind: 'art',
      id: art.id,
      url: art.image_url,
      update: (publicUrl, optimizedPath) => admin
        .from('art_board_items')
        .update({ image_url: publicUrl, image_path: optimizedPath })
        .eq('id', art.id),
    })
  }

  const { data: messages, error: messageError } = await admin
    .from('messages')
    .select('id, file_url, message_type')
    .eq('message_type', 'image')
    .not('file_url', 'is', null)
  if (messageError) throw messageError

  for (const message of messages || []) {
    items.push({
      kind: 'chat',
      id: message.id,
      url: message.file_url,
      update: publicUrl => admin.from('messages').update({ file_url: publicUrl }).eq('id', message.id),
    })
  }

  const { data: dmMessages, error: dmError } = await admin
    .from('dm_messages')
    .select('id, file_url, message_type')
    .eq('message_type', 'image')
    .not('file_url', 'is', null)
  if (dmError) throw dmError

  for (const message of dmMessages || []) {
    items.push({
      kind: 'chat',
      id: message.id,
      url: message.file_url,
      update: publicUrl => admin.from('dm_messages').update({ file_url: publicUrl }).eq('id', message.id),
    })
  }

  return items
}

async function main() {
  const admin = createAdminClient()
  const items = await loadItems(admin)
  console.log(`${apply ? 'apply' : 'dry-run'} mobile media backfill scanning ${items.length} row-backed URL(s).`)

  for (const item of items) {
    try {
      const result = await optimizePublicImage(admin, item)
      if (result === 'limit') break
      if (result === 'optimized') stats.optimized += 1
    } catch (error) {
      stats.failed += 1
      console.error(`failed ${item.kind} ${item.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const saved = Math.max(0, stats.originalBytes - stats.optimizedBytes)
  console.log(`mobile media backfill complete: ${JSON.stringify({ ...stats, savedBytes: saved })}`)
  if (stats.failed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
