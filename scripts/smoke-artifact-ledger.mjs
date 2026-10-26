// Only requests made by this smoke run's browser contexts can enter this ledger.
// Account identity and wall-clock windows alone never authorize deletion.
export function createSmokeArtifactLedger(supabaseUrl) {
  const storageUrl = new URL(supabaseUrl)
  storageUrl.hostname = storageUrl.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co')
  return {
    origin: new URL(supabaseUrl).origin,
    storageOrigin: storageUrl.origin,
    messages: new Set(),
    dm_messages: new Set(),
    storage: new Map([['chat-uploads', new Set()], ['message-media', new Set()]]),
    untrackedInserts: 0,
  }
}

export function recordSmokeArtifactRequest(ledger, { url, method, body, headers = {} }) {
  const target = new URL(url)
  if (![ledger.origin, ledger.storageOrigin].includes(target.origin) || method !== 'POST') return
  const table = target.pathname.match(/^\/rest\/v1\/(messages|dm_messages)$/)?.[1]
  if (table && target.origin === ledger.origin) {
    let rows
    try { rows = JSON.parse(body) } catch { ledger.untrackedInserts++; return }
    for (const row of Array.isArray(rows) ? rows : [rows]) {
      if (/^[0-9a-f-]{36}$/i.test(row?.client_message_id ?? '')) ledger[table].add(row.client_message_id)
      else ledger.untrackedInserts++
    }
    return
  }
  const direct = target.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)
  if (direct) {
    const bucket = decodeURIComponent(direct[1])
    if (ledger.storage.has(bucket)) ledger.storage.get(bucket).add(decodeURIComponent(direct[2]))
    return
  }
  if (target.pathname === '/storage/v1/upload/resumable') {
    const metadata = Object.fromEntries((headers['upload-metadata'] ?? '').split(',').map(part => {
      const [key, value] = part.trim().split(' ')
      return [key, Buffer.from(value ?? '', 'base64').toString('utf8')]
    }))
    if (ledger.storage.has(metadata.bucketName) && metadata.objectName) ledger.storage.get(metadata.bucketName).add(metadata.objectName)
  }
}

export function ownedSmokeStoragePaths(ledger, accountIds) {
  return new Map([...ledger.storage].map(([bucket, paths]) => [bucket, new Set([...paths].filter(path => {
    const owner = path.split('/')[0]
    if (!accountIds.includes(owner) || path.split('/').includes('..')) throw new Error('Smoke upload path is outside the controlled account folders')
    return true
  }))]))
}
