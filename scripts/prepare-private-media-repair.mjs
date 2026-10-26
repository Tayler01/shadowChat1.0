/** Generates a bounded operator review plan. It never connects to a backend or writes
 * objects/rows. Usage: node scripts/prepare-private-media-repair.mjs inventory.json plan.json
 * Run only after the staged Storage policies are installed. Each plan's read-only
 * authorization query must be re-run immediately before its exact copy requests.
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const quote = value => `'${String(value).replaceAll("'", "''")}'`
const protectedBuckets = new Set(['chat-uploads', 'message-media', 'shadow-pin'])
const durableUrl = (origin, bucket, objectPath) => `${origin}/storage/v1/object/public/${bucket}/${objectPath.split('/').map(encodeURIComponent).join('/')}`
const safePath = value => {
  if (typeof value !== 'string' || !value || value.split('/').some(part => !part || part === '.' || part === '..' || /[\\\u0000-\u001f\u007f]/.test(part))) throw new Error('Invalid object path')
  return value
}

export function buildPrivateMediaRepairPlan(inventory) {
  const origin = new URL(inventory.projectUrl)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Use the exact HTTPS project origin')
  if (inventory.version !== 1 || !Number.isFinite(Date.parse(inventory.observedAt))) throw new Error('Invalid inventory version or timestamp')
  const references = inventory.messageReferences || []
  const covers = inventory.categoryCovers || []
  if (references.length + covers.length > 1024) throw new Error('Review a bounded inventory of at most 1024 references')
  const rows = new Map()
  const copies = new Map()
  const authorization = new Map()
  const add = ({ table, id, author, bucket, sourcePath, changes }) => {
    if (!uuid.test(id) || !uuid.test(author) || !protectedBuckets.has(bucket)) throw new Error('Invalid repair identity')
    safePath(sourcePath)
    const rowKey = `${table}:${id}`
    const hash = createHash('sha256').update(`${bucket}/${sourcePath}`).digest('hex')
    const extension = sourcePath.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1] || 'bin'
    const destinationBucket = table === 'shadow_pin_categories' ? 'shadow-pin' : 'chat-uploads'
    const destinationPath = table === 'shadow_pin_categories'
      ? `${author}/categories/${id}/cover/repaired-${hash}.${extension}`
      : `${author}/forwarded/${id}/${hash}.${extension}`
    const copyKey = `${rowKey}:${bucket}/${sourcePath}`
    copies.set(copyKey, { authorId: author, bucketId: bucket, sourceKey: sourcePath, destinationBucket, destinationKey: destinationPath })
    const targets = authorization.get(author) || new Map()
    targets.set(`${bucket}/${sourcePath}`, { bucket, path: sourcePath })
    authorization.set(author, targets)
    const row = rows.get(rowKey) || { table, id, authorId: author, fields: new Map() }
    if (row.authorId !== author) throw new Error('Conflicting row ownership in inventory')
    for (const { field, oldValue, kind } of changes) {
      const newValue = kind === 'path' ? destinationPath : durableUrl(origin.origin, destinationBucket, destinationPath)
      if (row.fields.has(field)) throw new Error('Duplicate field in inventory')
      row.fields.set(field, { field, oldValue, newValue })
    }
    rows.set(rowKey, row)
  }
  for (const ref of references) {
    if (!['messages','dm_messages'].includes(ref.source) || !['file_url','audio_url','thumbnail_url','content'].includes(ref.field)) throw new Error('Invalid message table or field')
    const url = new URL(ref.url)
    if (url.origin !== origin.origin || url.username || url.password || url.searchParams.has('token')) throw new Error('Unexpected or signed source URL')
    const match = url.pathname.match(/^\/storage\/v1\/(?:object|render\/image)\/(?:public|authenticated)\/(chat-uploads|message-media|shadow-pin)\/(.+)$/)
    if (!match) throw new Error('Invalid member-media URL')
    const sourcePath = match[2].split('/').map(part => {
      const value = decodeURIComponent(part)
      if (value.includes('/')) throw new Error('Encoded path separator')
      return value
    }).join('/')
    add({ table: ref.source, id: ref.row_id, author: ref.author_id, bucket: match[1], sourcePath,
      changes: [{ field: ref.field, oldValue: ref.url, kind: 'url' }] })
  }
  for (const cover of covers) {
    add({ table: 'shadow_pin_categories', id: cover.row_id, author: cover.author_id,
      bucket: 'shadow-pin', sourcePath: cover.image_path,
      changes: [{ field: 'image_path', oldValue: cover.image_path, kind: 'path' },
        { field: 'image_url', oldValue: cover.image_url, kind: 'url' }] })
  }
  return {
    version: 1, projectUrl: origin.origin, observedAt: inventory.observedAt,
    instructions: 'Read-only author-context SELECT must return every expected object immediately before copying. Stop for any missing result. Copy exactly these independent objects, verify bytes/size, then run each compare-and-swap once and require one returned row. Preserve originals. Re-inventory before cutover. This file executes nothing.',
    authorizations: [...authorization].map(([authorId, targets]) => {
      const expected = [...targets.values()]
      const jwt = JSON.stringify({ sub: authorId, role: 'authenticated', iss: `${origin.origin}/auth/v1` })
      const pairs = expected.map(target => `(${quote(target.bucket)},${quote(target.path)})`).join(',')
      return { authorId, expected, sql: `begin read only;\nselect set_config('request.jwt.claims', ${quote(jwt)}, true);\nset local role authenticated;\nselect bucket_id,name from storage.objects where (bucket_id,name) in (${pairs}) order by bucket_id,name;\nrollback;` }
    }),
    copyRequests: [...copies.values()],
    updates: [...rows.values()].map(row => {
      const fields = [...row.fields.values()]
      const authorColumn = row.table === 'messages' ? 'user_id' : row.table === 'dm_messages' ? 'sender_id' : 'creator_id'
      const set = fields.map(field => `${field.field}=${quote(field.newValue)}`).join(',')
      const guard = fields.map(field => `${field.field} is not distinct from ${field.oldValue == null ? 'null' : quote(field.oldValue)}`).join(' and ')
      return { table: row.table, rowId: row.id, authorId: row.authorId, fields,
        sql: `update public.${row.table} set ${set} where id=${quote(row.id)} and ${authorColumn}=${quote(row.authorId)} and ${guard} returning id;` }
    }),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2)
  if (!input || !output) throw new Error('Usage: node scripts/prepare-private-media-repair.mjs inventory.json plan.json')
  const plan = buildPrivateMediaRepairPlan(JSON.parse(await readFile(input, 'utf8')))
  await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' })
  console.log(`Prepared ${plan.copyRequests.length} exact copies and ${plan.updates.length} guarded row updates; no backend access or mutation.`)
}
