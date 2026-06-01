import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  badRequest,
  corsHeaders,
  forbidden,
  getSupabaseAdmin,
  json,
  unauthorized,
} from '../_shared/bridge.ts'

const USER_STORAGE_BUCKETS = [
  'avatars',
  'banners',
  'message-media',
  'chat-uploads',
  'art-board',
  'shadow-pin',
  'shado-tv',
  'feedback-attachments',
]

type StorageListItem = {
  id?: string | null
  name: string
}

const joinStoragePath = (prefix: string, name: string) =>
  prefix ? `${prefix}/${name}` : name

const chunk = <T>(items: T[], size: number) => {
  const groups: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size))
  }
  return groups
}

const removeStoragePrefix = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  bucket: string,
  prefix: string,
) => {
  const pendingFolders = [prefix]
  const pathsToRemove: string[] = []

  while (pendingFolders.length > 0) {
    const folder = pendingFolders.pop()!
    let offset = 0

    for (;;) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: 1000, offset })

      if (error) {
        throw new Error(`Could not list ${bucket}/${folder}: ${error.message}`)
      }

      const entries = (data ?? []) as StorageListItem[]
      for (const entry of entries) {
        const entryPath = joinStoragePath(folder, entry.name)
        if (entry.id === null) {
          pendingFolders.push(entryPath)
        } else {
          pathsToRemove.push(entryPath)
        }
      }

      if (entries.length < 1000) {
        break
      }

      offset += entries.length
    }
  }

  for (const batch of chunk(pathsToRemove, 100)) {
    const { error } = await supabase.storage.from(bucket).remove(batch)
    if (error) {
      throw new Error(`Could not remove ${bucket} objects: ${error.message}`)
    }
  }
}

const removeUserStorageObjects = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
) => {
  for (const bucket of USER_STORAGE_BUCKETS) {
    await removeStoragePrefix(supabase, bucket, userId)
  }
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const authorization = req.headers.get('Authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) {
      return unauthorized('Authentication required')
    }

    const body = await req.json().catch(() => ({})) as { confirm?: string }
    if (body.confirm !== 'DELETE') {
      return badRequest('Deletion confirmation is required')
    }

    const supabase = getSupabaseAdmin()
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await supabase.auth.getUser(token)

    if (authError || !authData.user?.id) {
      return unauthorized('Invalid or expired session')
    }

    const userId = authData.user.id
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('admin_role')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    if (profile?.admin_role === 'admin') {
      const { count, error: adminCountError } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('admin_role', 'admin')

      if (adminCountError) {
        throw adminCountError
      }

      if ((count ?? 0) <= 1) {
        return forbidden('Transfer full admin access before deleting the only full admin account.')
      }
    }

    await removeUserStorageObjects(supabase, userId)

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
    if (deleteError) {
      throw deleteError
    }

    return json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account deletion failed'
    return json({ error: message }, 500)
  }
})
