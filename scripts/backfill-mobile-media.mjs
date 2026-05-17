import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const repoRoot = process.cwd()
const apply = process.argv.includes('--apply')
const includeChatHistory = process.argv.includes('--include-chat-history')
const limitArg = process.argv.find(arg => arg.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : Number.POSITIVE_INFINITY

const OBJECT_PUBLIC_MARKER = '/storage/v1/object/public/'
const RENDER_PUBLIC_MARKER = '/storage/v1/render/image/public/'
const UNSAFE_TRANSFORM_EXTENSIONS = /\.(gif|svg)(?:$|[?#])/i

const TARGETS = {
  avatar: { width: 240, height: 240, resize: 'cover', quality: 82 },
  banner: { width: 960, height: 540, resize: 'cover', quality: 78 },
  chat: { width: 720, height: 720, resize: 'contain', quality: 76 },
  art: { width: 720, height: 720, resize: 'cover', quality: 76 },
}

const stats = {
  scanned: 0,
  candidates: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
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

function transformedImageUrl(publicUrl, target) {
  if (!publicUrl) return null

  try {
    const url = new URL(publicUrl)
    const marker = url.pathname.includes(RENDER_PUBLIC_MARKER)
      ? RENDER_PUBLIC_MARKER
      : OBJECT_PUBLIC_MARKER

    if (!url.pathname.includes(marker) || UNSAFE_TRANSFORM_EXTENSIONS.test(url.pathname)) {
      return null
    }

    url.pathname = url.pathname.replace(marker, RENDER_PUBLIC_MARKER)
    url.search = ''
    const params = new URLSearchParams()
    params.set('width', String(target.width))
    params.set('height', String(target.height))
    params.set('resize', target.resize)
    params.set('quality', String(target.quality))
    url.search = params.toString()
    return url.toString()
  } catch {
    return null
  }
}

async function updateCandidate(admin, item) {
  stats.scanned += 1
  if (stats.candidates >= limit) return 'limit'
  if (!item.url || item.thumbnailUrl) {
    stats.skipped += 1
    return 'skipped'
  }

  const thumbnailUrl = transformedImageUrl(item.url, TARGETS[item.kind])
  if (!thumbnailUrl) {
    stats.skipped += 1
    return 'skipped'
  }

  stats.candidates += 1
  if (!apply) {
    console.log(`dry-run ${item.kind} ${item.table} ${item.id}`)
    return 'updated'
  }

  const { error } = await admin
    .from(item.table)
    .update({
      [item.thumbnailColumn]: thumbnailUrl,
      [item.thumbnailPathColumn]: null,
      ...(item.processedAtColumn ? { [item.processedAtColumn]: new Date().toISOString() } : {}),
    })
    .eq('id', item.id)

  if (error) throw error
  console.log(`updated ${item.kind} ${item.table} ${item.id}`)
  return 'updated'
}

async function loadItems(admin) {
  const items = []

  const { data: users, error: usersError } = await admin
    .from('users')
    .select('id, avatar_url, avatar_thumbnail_url, banner_url, banner_thumbnail_url')
  if (usersError) throw usersError

  for (const user of users || []) {
    items.push({
      kind: 'avatar',
      table: 'users',
      id: user.id,
      url: user.avatar_url,
      thumbnailUrl: user.avatar_thumbnail_url,
      thumbnailColumn: 'avatar_thumbnail_url',
      thumbnailPathColumn: 'avatar_thumbnail_path',
    })
    items.push({
      kind: 'banner',
      table: 'users',
      id: user.id,
      url: user.banner_url,
      thumbnailUrl: user.banner_thumbnail_url,
      thumbnailColumn: 'banner_thumbnail_url',
      thumbnailPathColumn: 'banner_thumbnail_path',
    })
  }

  const { data: artItems, error: artError } = await admin
    .from('art_board_items')
    .select('id, image_url, thumbnail_url, item_type, deleted_at')
    .eq('item_type', 'image')
    .is('deleted_at', null)
  if (artError) throw artError

  for (const art of artItems || []) {
    items.push({
      kind: 'art',
      table: 'art_board_items',
      id: art.id,
      url: art.image_url,
      thumbnailUrl: art.thumbnail_url,
      thumbnailColumn: 'thumbnail_url',
      thumbnailPathColumn: 'thumbnail_path',
      processedAtColumn: 'media_processed_at',
    })
  }

  if (!includeChatHistory) return items

  const { data: messages, error: messageError } = await admin
    .from('messages')
    .select('id, file_url, thumbnail_url, message_type')
    .eq('message_type', 'image')
    .not('file_url', 'is', null)
  if (messageError) throw messageError

  for (const message of messages || []) {
    items.push({
      kind: 'chat',
      table: 'messages',
      id: message.id,
      url: message.file_url,
      thumbnailUrl: message.thumbnail_url,
      thumbnailColumn: 'thumbnail_url',
      thumbnailPathColumn: 'thumbnail_path',
      processedAtColumn: 'media_processed_at',
    })
  }

  const { data: dmMessages, error: dmError } = await admin
    .from('dm_messages')
    .select('id, file_url, thumbnail_url, message_type')
    .eq('message_type', 'image')
    .not('file_url', 'is', null)
  if (dmError) throw dmError

  for (const message of dmMessages || []) {
    items.push({
      kind: 'chat',
      table: 'dm_messages',
      id: message.id,
      url: message.file_url,
      thumbnailUrl: message.thumbnail_url,
      thumbnailColumn: 'thumbnail_url',
      thumbnailPathColumn: 'thumbnail_path',
      processedAtColumn: 'media_processed_at',
    })
  }

  return items
}

async function main() {
  const admin = createAdminClient()
  const items = await loadItems(admin)
  console.log(`${apply ? 'apply' : 'dry-run'} mobile media thumbnail backfill scanning ${items.length} row-backed URL(s).`)
  if (!includeChatHistory) {
    console.log('chat history skipped by default; pass --include-chat-history to backfill old group/DM messages.')
  }

  for (const item of items) {
    try {
      const result = await updateCandidate(admin, item)
      if (result === 'limit') break
      if (result === 'updated') stats.updated += 1
    } catch (error) {
      stats.failed += 1
      console.error(`failed ${item.kind} ${item.table} ${item.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  console.log(`mobile media thumbnail backfill complete: ${JSON.stringify(stats)}`)
  if (stats.failed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
