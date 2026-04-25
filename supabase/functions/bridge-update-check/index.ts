import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateBridgeAccessToken,
  badRequest,
  corsHeaders,
  getSupabaseAdmin,
  json,
  normalizeText,
  readJson,
} from '../_shared/bridge.ts'

type UpdateTarget = 'firmware' | 'windows_bundle' | 'bootstrap'
type UpdateChannel = 'stable' | 'beta' | 'dev'

type BridgeUpdateCheckPayload = {
  deviceId?: string
  target?: string
  channel?: string
  hardwareModel?: string
  currentVersion?: string
}

type BridgeUpdateManifest = {
  id: string
  target: UpdateTarget
  channel: UpdateChannel
  hardware_model: string
  version: string
  min_current_version: string | null
  storage_provider: 'supabase' | 'github'
  artifact_url: string | null
  artifact_path: string | null
  artifact_sha256: string
  signature: string | null
  size_bytes: number | null
  release_notes: string | null
  published_at: string | null
}

const TARGETS = new Set(['firmware', 'windows_bundle', 'bootstrap'])
const CHANNELS = new Set(['stable', 'beta', 'dev'])

const parseVersionParts = (value: string) => {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) return null
  return match.slice(1).map(part => Number(part))
}

const compareVersions = (left: string, right: string) => {
  const leftParts = parseVersionParts(left)
  const rightParts = parseVersionParts(right)

  if (!leftParts || !rightParts) {
    return left === right ? 0 : null
  }

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1
    if (leftParts[index] < rightParts[index]) return -1
  }

  return 0
}

const isUpdateAvailable = (currentVersion: string, latestVersion: string) => {
  if (!currentVersion) return true

  const comparison = compareVersions(currentVersion, latestVersion)
  if (comparison === null) {
    return currentVersion !== latestVersion
  }

  return comparison < 0
}

const toManifestResponse = (manifest: BridgeUpdateManifest) => ({
  id: manifest.id,
  target: manifest.target,
  channel: manifest.channel,
  hardwareModel: manifest.hardware_model,
  version: manifest.version,
  minCurrentVersion: manifest.min_current_version,
  storageProvider: manifest.storage_provider,
  artifactUrl: manifest.artifact_url,
  artifactPath: manifest.artifact_path,
  artifactSha256: manifest.artifact_sha256,
  signature: manifest.signature,
  sizeBytes: manifest.size_bytes,
  releaseNotes: manifest.release_notes,
  publishedAt: manifest.published_at,
})

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<BridgeUpdateCheckPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const accessToken = normalizeText(req.headers.get('X-Bridge-Access-Token'))
    const target = normalizeText(body?.target || 'firmware') as UpdateTarget
    const channel = normalizeText(body?.channel || 'stable') as UpdateChannel
    const hardwareModel = normalizeText(body?.hardwareModel || 'any') || 'any'
    const currentVersion = normalizeText(body?.currentVersion)

    if (!TARGETS.has(target)) {
      return badRequest('target must be firmware, windows_bundle, or bootstrap')
    }

    if (!CHANNELS.has(channel)) {
      return badRequest('channel must be stable, beta, or dev')
    }

    let bridgeAuth:
      | Awaited<ReturnType<typeof authenticateBridgeAccessToken>>
      | null = null

    if (deviceId || accessToken) {
      bridgeAuth = await authenticateBridgeAccessToken(deviceId, accessToken)
      if ('error' in bridgeAuth) {
        return bridgeAuth.error
      }
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('bridge_update_manifests')
      .select(`
        id,
        target,
        channel,
        hardware_model,
        version,
        min_current_version,
        storage_provider,
        artifact_url,
        artifact_path,
        artifact_sha256,
        signature,
        size_bytes,
        release_notes,
        published_at
      `)
      .eq('target', target)
      .eq('channel', channel)
      .in('hardware_model', ['any', hardwareModel])
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)

    if (error) {
      throw error
    }

    const manifest = (data?.[0] ?? null) as BridgeUpdateManifest | null

    if (!manifest) {
      return json({
        ok: true,
        target,
        channel,
        hardwareModel,
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        manifest: null,
        message: 'No published update manifest is available for this target.',
      })
    }

    const updateAvailable = isUpdateAvailable(currentVersion, manifest.version)

    if (bridgeAuth && 'auth' in bridgeAuth) {
      await supabase
        .from('bridge_audit_events')
        .insert({
          device_id: bridgeAuth.auth.deviceId,
          user_id: bridgeAuth.auth.ownerUserId ?? bridgeAuth.auth.userId,
          event_type: 'bridge_update_check',
          event_payload: {
            target,
            channel,
            hardware_model: hardwareModel,
            current_version: currentVersion || null,
            latest_version: manifest.version,
            update_available: updateAvailable,
            manifest_id: manifest.id,
          },
        })
    }

    return json({
      ok: true,
      target,
      channel,
      hardwareModel,
      currentVersion,
      latestVersion: manifest.version,
      updateAvailable,
      manifest: toManifestResponse(manifest),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})

