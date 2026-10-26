/** Synthetic browser fixture for an independently verified disposable hosted branch. */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

export function stagedBrowserPaths(args, repoRoot = process.cwd()) {
  const read = name => {
    const values = args.filter(value => value.startsWith(`--${name}=`))
    assert.equal(values.length, 1, `Staged QA requires exactly one --${name}=`)
    return values[0].slice(name.length + 3)
  }
  assert(!args.includes('--local-preview'), 'Staged acceptance must exercise the real membership gate')
  const url = new URL(read('base-url'))
  assert.equal(url.protocol, 'http:')
  assert.equal(url.hostname, '127.0.0.1', 'Staged browser QA is loopback-only')
  assert(Number(url.port) >= 1024 && url.port !== '4175', 'Use a separate loopback preview port, never the active4175 preview')
  assert(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/')
  const buildRoot = path.resolve(repoRoot, read('build-root'))
  const evidenceRoot = path.resolve(repoRoot, 'output/privacy') + path.sep
  assert(buildRoot.startsWith(evidenceRoot), 'Staged builds must be isolated under output/privacy/')
  return { baseUrl: url.origin, buildRoot }
}

export function createStagedFixture(target, { changed = async () => {}, secret = () => {}, clientFactory = createClient } = {}) {
  const makeClient = key => clientFactory(target.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const admin = makeClient(target.serviceKey)
  const accounts = []
  const token = `qa-${Date.now()}-${randomBytes(4).toString('hex')}`
  const state = { token, users: [], pendingAuthCreations: [], objects: [], messages: [], dm_messages: [], dm_conversations: [], shadow_pin_images: [], shadow_pin_categories: [], cleanup: { verified: false, failures: [] } }
  let conversationId
  const result = (response, label) => { if (response.error) throw new Error(`${label}: ${response.error.message}`); return response.data }
  const record = async (table, value) => { state[table].push(value); await changed(state) }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
  const insert = async (client, table, row) => {
    await record(table, row.id)
    result(await client.from(table).insert(row), `Insert synthetic ${table}`)
  }
  const upload = async (account, bucket, name) => {
    const object = { bucket, path: `${account.id}/${token}/${name}` }
    await record('objects', object)
    result(await account.client.storage.from(bucket).upload(object.path, png, { contentType: 'image/png', cacheControl: '0', upsert: false }), 'Upload synthetic image')
    return { ...object, url: `${target.url}/storage/v1/object/public/${bucket}/${object.path}` }
  }
  const prepare = async () => {
    for (const index of [1, 2]) {
      const email = `${token}.${index}@example.invalid`
      const password = `${randomBytes(32).toString('base64url')}Aa9!`
      secret(email); secret(password)
      const username = `qa_browser_${randomBytes(5).toString('hex')}`
      const creation = `member-${index}`
      await record('pendingAuthCreations', creation)
      const auth = result(await admin.auth.admin.createUser({ email, password, email_confirm: true,
        user_metadata: { username, display_name: `Staged member ${index}` } }), 'Create synthetic Auth member')
      assert(auth.user?.id)
      state.pendingAuthCreations = state.pendingAuthCreations.filter(value => value !== creation)
      await record('users', auth.user.id)
      result(await admin.from('users').upsert({ id: auth.user.id, email, username, display_name: `Staged member ${index}` }), 'Create synthetic public profile')
      const client = makeClient(target.anonKey)
      const session = result(await client.auth.signInWithPassword({ email, password }), 'Authenticate synthetic member')
      assert.equal(session.user.id, auth.user.id)
      secret(session.session.access_token); secret(session.session.refresh_token)
      accounts.push({ id: auth.user.id, email, password, client })
    }
    conversationId = randomUUID()
    await insert(admin, 'dm_conversations', { id: conversationId, participants: accounts.map(account => account.id).sort() })
    const image = await upload(accounts[0], 'chat-uploads', 'group.png')
    await insert(accounts[0].client, 'messages', { id: randomUUID(), user_id: accounts[0].id, content: `${token} group image`, message_type: 'image', file_url: image.url })
    await insert(accounts[1].client, 'messages', { id: randomUUID(), user_id: accounts[1].id, content: `${token} group text`, message_type: 'text' })
    for (const account of accounts) await insert(account.client, 'dm_messages', { id: randomUUID(), conversation_id: conversationId, sender_id: account.id, content: `${token} direct message`, message_type: 'text' })
    const pin = await upload(accounts[0], 'shadow-pin', 'pin.png')
    const categoryId = randomUUID()
    await insert(accounts[0].client, 'shadow_pin_categories', { id: categoryId, creator_id: accounts[0].id, title: `${token} Pins`, image_url: pin.url, image_path: pin.path })
    await insert(accounts[0].client, 'shadow_pin_images', { id: randomUUID(), category_id: categoryId, creator_id: accounts[0].id, title: 'Synthetic staged Pin', image_url: pin.url, image_path: pin.path })
  }
  const cleanup = async () => {
    const attempt = async (label, action) => {
      try { await action() } catch { state.cleanup.failures.push(label) }
    }
    for (const table of ['dm_messages', 'messages', 'shadow_pin_images', 'shadow_pin_categories', 'dm_conversations']) {
      const ids = state[table]
      if (!ids.length) continue
      await attempt(table, async () => {
        result(await admin.from(table).delete().in('id', ids), `Delete exact synthetic ${table}`)
        assert.equal(result(await admin.from(table).select('id').in('id', ids), `Verify ${table} cleanup`).length, 0)
      })
    }
    for (const object of state.objects) await attempt(`Storage ${object.bucket}/${object.path}`, async () => {
      result(await admin.storage.from(object.bucket).remove([object.path]), 'Remove exact synthetic object')
      const directory = object.path.slice(0, object.path.lastIndexOf('/'))
      const name = object.path.slice(object.path.lastIndexOf('/') + 1)
      assert(!result(await admin.storage.from(object.bucket).list(directory, { search: name }), 'Verify exact object removal').some(entry => entry.name === name))
    })
    for (const account of accounts) await account.client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    for (const id of state.users) await attempt(`Auth ${id}`, async () => {
      result(await admin.auth.admin.deleteUser(id), 'Remove exact synthetic member')
      const remaining = await admin.auth.admin.getUserById(id)
      assert(remaining.error && !remaining.data?.user)
    })
    if (state.pendingAuthCreations.length) state.cleanup.failures.push('Auth creation outcome was uncertain; disposable branch removal is required')
    state.cleanup.verified = state.cleanup.failures.length === 0
    await changed(state)
    return state.cleanup
  }
  return { admin, accounts, state, prepare, cleanup, get conversationId() { return conversationId } }
}
