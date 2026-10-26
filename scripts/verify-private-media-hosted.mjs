/** Synthetic hosted acceptance, restricted to the temporary no-data test branch.
 * Never reads .env, linked-project state, production credentials or vendor assets.
 * Requires the bootstrap/migrations owner to confirm readiness before --execute.
 */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { loadHostedTestTarget } from './hosted-test-target.mjs'

const { project, url, branch, serviceKey, anonKey } = loadHostedTestTarget(process.argv.slice(2))
const runName = process.argv.find(value => value.startsWith('--run-name='))?.slice(11) || `media-${Date.now()}`
assert.match(runName, /^[a-z0-9-]{1,48}$/)
const output = path.resolve('output/privacy', runName)
await mkdir(output, { recursive: true })
const makeClient = key => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const admin = makeClient(serviceKey)
const anon = makeClient(anonKey)
const credentials = [serviceKey, anonKey]
const summary = {
  project, branch, runName, startedAt: new Date().toISOString(), checks: [],
  fixtures: { users: [], objects: [], messages: [], dm_messages: [], dm_conversations: [], shadow_pin_images: [], shadow_pin_categories: [] },
  cleanup: { verified: false, failures: [] },
  limitations: ['This is a synthetic no-data branch, not production enforcement or physical-device acceptance.', 'No Bunny provider configuration or real provider assets are exercised.'],
}
const safeError = error => {
  let value = error?.message || String(error)
  for (const secret of credentials) if (secret) value = value.split(secret).join('[redacted]')
  return value.replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[redacted-token]').slice(0, 1500)
}
const save = () => writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2))
const requireResult = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data }
const check = async (name, action) => {
  try { const detail = await action(); summary.checks.push({ name, passed: true, detail }); console.log(`PASS ${name}`) }
  catch (error) { summary.checks.push({ name, passed: false, error: safeError(error) }); throw error }
  finally { await save() }
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY4kAAAAASUVORK5CYII=', 'base64')
const publicUrl = (bucket, objectPath) => `${url}/storage/v1/object/public/${bucket}/${objectPath}`

async function createMember(label) {
  const password = randomBytes(32).toString('base64url') + 'Aa9!'
  credentials.push(password)
  const email = `qa.${runName}.${label}@example.invalid`
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { username: `qa_${label}_${randomBytes(4).toString('hex')}`, display_name: 'Synthetic media acceptance' } })
  const user = requireResult(result, 'Create synthetic Auth member').user
  assert(user?.id)
  summary.fixtures.users.push(user.id)
  await save()
  requireResult(await admin.from('users').upsert({ id: user.id, email, username: `qa_${randomBytes(6).toString('hex')}`,
    full_name: 'Synthetic fixture', display_name: 'Synthetic media acceptance' }), 'Create synthetic profile')
  const client = makeClient(anonKey)
  const login = requireResult(await client.auth.signInWithPassword({ email, password }), 'Authenticate synthetic member')
  assert.equal(login.user.id, user.id)
  credentials.push(login.session.access_token, login.session.refresh_token)
  return { id: user.id, client }
}
async function upload(member, bucket, name, privileged = false) {
  const entry = { bucket, path: name }
  summary.fixtures.objects.push(entry)
  await save()
  requireResult(await (privileged ? admin : member.client).storage.from(bucket).upload(name, png, {
    contentType: 'image/png', upsert: false, cacheControl: '0',
  }), 'Upload exact fixture')
  return { ...entry, url: publicUrl(bucket, name) }
}
async function insert(client, table, row) {
  summary.fixtures[table].push(row.id)
  await save()
  return requireResult(await client.from(table).insert(row).select('id').single(), `Insert ${table}`)
}
async function sign(member, object, ttl = 60) {
  return member.client.storage.from(object.bucket).createSignedUrl(object.path, ttl)
}
async function readable(member, object) {
  const signed = requireResult(await sign(member, object), 'Authorize media')
  assert(signed?.signedUrl)
  const response = await fetch(signed.signedUrl, { cache: 'no-store' })
  assert.equal(response.status, 200, 'Signed media GET succeeds')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png)
}
async function denied(member, object) {
  const result = await sign(member, object)
  assert(result.error && !result.data?.signedUrl, 'Unauthorized caller cannot obtain a signed URL')
  return { status: result.error.status ?? result.error.statusCode ?? null }
}

try {
  await check('three test media buckets are private', async () => {
    for (const bucket of ['chat-uploads', 'message-media', 'shadow-pin']) {
      const data = requireResult(await admin.storage.getBucket(bucket), 'Read test bucket')
      assert.equal(data.public, false, `${bucket} must be private before acceptance`)
    }
  })
  const owner = await createMember('owner')
  const recipient = await createMember('recipient')
  const outsider = await createMember('outsider')
  const departed = await createMember('departed')
  const group = await upload(owner, 'chat-uploads', `${owner.id}/${runName}/general.png`)
  const dm = await upload(owner, 'message-media', `${owner.id}/${runName}/dm.png`)
  const secret = await upload(owner, 'chat-uploads', `${owner.id}/${runName}/unreferenced.png`)
  const cover = await upload(owner, 'shadow-pin', `${owner.id}/${runName}/cover.png`)
  const pinMedia = await upload(owner, 'shadow-pin', `${owner.id}/${runName}/pin.png`)
  const departedMedia = await upload(departed, 'chat-uploads', `${departed.id}/${runName}/departed.png`)
  const groupId = randomUUID(), conversationId = randomUUID(), dmId = randomUUID(), categoryId = randomUUID(), pinId = randomUUID()
  await insert(owner.client, 'messages', { id: groupId, user_id: owner.id, content: runName, message_type: 'image', file_url: group.url })
  await insert(admin, 'dm_conversations', { id: conversationId, participants: [owner.id, recipient.id].sort() })
  await insert(owner.client, 'dm_messages', { id: dmId, conversation_id: conversationId, sender_id: owner.id, content: runName, message_type: 'image', file_url: dm.url })
  await insert(owner.client, 'shadow_pin_categories', { id: categoryId, creator_id: owner.id, title: 'Synthetic privacy category', image_url: cover.url, image_path: cover.path })
  const derivative = await upload(owner, 'shadow-pin', `derivatives/images/${pinId}/thumbnail.webp`, true)
  await insert(owner.client, 'shadow_pin_images', { id: pinId, category_id: categoryId, creator_id: owner.id, title: 'Synthetic privacy Pin',
    image_url: pinMedia.url, image_path: pinMedia.path, thumbnail_url: derivative.url, thumbnail_path: derivative.path })

  await check('profile identity columns are unavailable to another member', async () => {
    const unsafe = await recipient.client.from('users').select('id,email,full_name').eq('id', owner.id)
    assert(unsafe.error, 'Private identity column SELECT must fail')
    const safe = requireResult(await recipient.client.from('users').select('id,display_name,avatar_url').eq('id', owner.id), 'Read safe profile')
    assert.equal(safe.length, 1)
  })
  await check('owner signs and downloads owned General, DM and Pin media', async () => {
    for (const object of [group, dm, pinMedia]) await readable(owner, object)
  })
  await check('recipient signs canonical General, DM, Pin and legacy derivative media', async () => {
    for (const object of [group, dm, pinMedia, derivative]) await readable(recipient, object)
  })
  await check('anonymous legacy public URLs and signing are denied', async () => {
    const statuses = []
    for (const object of [group, dm, pinMedia]) {
      const response = await fetch(object.url, { cache: 'no-store' })
      statuses.push(response.status)
      assert(response.status >= 400)
      await response.body?.cancel()
      const result = await anon.storage.from(object.bucket).createSignedUrl(object.path, 60)
      assert(result.error && !result.data?.signedUrl)
    }
    return { statuses }
  })
  await check('unrelated member cannot sign DM or guessed unreferenced media', async () => {
    await denied(outsider, dm)
    await denied(outsider, secret)
  })
  await check('forged visible reference cannot grant access to another author media', async () => {
    await insert(outsider.client, 'messages', { id: randomUUID(), user_id: outsider.id, content: runName, message_type: 'image', file_url: dm.url })
    await denied(outsider, dm)
  })
  await check('recipient blocking prevents new General, DM, Pin and derivative signing', async () => {
    requireResult(await recipient.client.rpc('block_user', { target_user_id: owner.id }), 'Block synthetic owner')
    for (const object of [group, dm, pinMedia, derivative]) await denied(recipient, object)
    requireResult(await recipient.client.rpc('unblock_user', { target_user_id: owner.id }), 'Unblock synthetic owner')
    await readable(recipient, dm)
  })
  const copy = { bucket: 'chat-uploads', path: `${recipient.id}/${runName}/forwarded.png` }
  copy.url = publicUrl(copy.bucket, copy.path)
  await check('authorized cross-bucket forward creates recipient-owned independent bytes', async () => {
    summary.fixtures.objects.push({ bucket: copy.bucket, path: copy.path }); await save()
    requireResult(await recipient.client.storage.from(dm.bucket).copy(dm.path, copy.path, { destinationBucket: copy.bucket }), 'Authorized forward copy')
    await insert(recipient.client, 'messages', { id: randomUUID(), user_id: recipient.id, content: runName, message_type: 'image', file_url: copy.url })
    await readable(outsider, copy)
  })
  await check('source deletion denies original while independent authorized forward survives', async () => {
    requireResult(await owner.client.from('dm_messages').delete().eq('id', dmId), 'Delete synthetic source DM')
    await denied(recipient, dm)
    await readable(outsider, copy)
  })
  await check('deleted General and Pin rows revoke recipient access including derivatives', async () => {
    requireResult(await owner.client.from('messages').delete().eq('id', groupId), 'Delete synthetic General message')
    requireResult(await owner.client.rpc('delete_shadow_pin_image', { target_image_id: pinId }), 'Soft-delete synthetic Pin through canonical RPC')
    for (const object of [group, pinMedia, derivative]) await denied(recipient, object)
  })
  await check('signed URL expires at the server token boundary', async () => {
    const signed = requireResult(await sign(owner, secret, 2), 'Issue short-lived fixture URL')
    await delay(3500)
    const response = await fetch(signed.signedUrl, { cache: 'no-store' })
    await response.body?.cancel()
    assert(response.status >= 400, 'Expired bearer URL must be refused')
    return { requestedTtlSeconds: 2, waitedMs: 3500, status: response.status }
  })
  await check('issued JWT loses media access after its member profile is deleted', async () => {
    await readable(departed, departedMedia)
    requireResult(await admin.from('users').delete().eq('id', departed.id), 'Delete synthetic member profile')
    const user = requireResult(await departed.client.auth.getUser(), 'Check still-issued Auth token')
    assert.equal(user.user.id, departed.id, 'Test token remains an Auth-valid token')
    await denied(departed, departedMedia)
    const tableAccess = await departed.client.from('messages').select('id').limit(1)
    assert(tableAccess.error || tableAccess.data?.length === 0, 'Deleted member cannot read protected table rows')
  })
} catch (error) {
  summary.error = safeError(error)
  process.exitCode = 1
} finally {
  const cleanup = async (name, action) => {
    try { await action() } catch (error) { summary.cleanup.failures.push({ name, error: safeError(error) }); process.exitCode = 1 }
  }
  for (const table of ['dm_messages', 'messages', 'shadow_pin_images', 'shadow_pin_categories', 'dm_conversations']) {
    const ids = summary.fixtures[table]
    if (!ids.length) continue
    await cleanup(table, async () => {
      requireResult(await admin.from(table).delete().in('id', ids), `Clean ${table}`)
      const rows = requireResult(await admin.from(table).select('id').in('id', ids), `Verify ${table} cleanup`)
      assert.equal(rows.length, 0)
    })
  }
  for (const bucket of ['chat-uploads', 'message-media', 'shadow-pin']) {
    const names = summary.fixtures.objects.filter(object => object.bucket === bucket).map(object => object.path)
    if (!names.length) continue
    await cleanup(`Storage ${bucket}`, async () => {
      requireResult(await admin.storage.from(bucket).remove(names), 'Clean exact Storage objects')
      for (const name of names) {
        const prefix = name.slice(0, name.lastIndexOf('/'))
        const filename = name.slice(name.lastIndexOf('/') + 1)
        const rows = requireResult(await admin.storage.from(bucket).list(prefix, { search: filename, limit: 100 }), 'Verify exact Storage object cleanup')
        assert(!rows.some(row => row.name === filename))
      }
    })
  }
  for (const id of summary.fixtures.users) {
    await cleanup(`Auth user ${id}`, async () => {
      requireResult(await admin.auth.admin.deleteUser(id), 'Delete exact synthetic Auth user')
      const remaining = await admin.auth.admin.getUserById(id)
      assert(remaining.error && !remaining.data?.user)
    })
  }
  summary.cleanup.verified = summary.cleanup.failures.length === 0
  summary.finishedAt = new Date().toISOString()
  await save()
  console.log(JSON.stringify({ project, checksPassed: summary.checks.filter(check => check.passed).length,
    checksFailed: summary.checks.filter(check => !check.passed).length, cleanup: summary.cleanup, error: summary.error ?? null,
    evidence: path.join(output, 'summary.json') }))
}
