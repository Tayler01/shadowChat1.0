import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPrivateMediaRepairPlan } from '../scripts/prepare-private-media-repair.mjs'

const origin = 'https://fixture.supabase.co'
const author = '10000000-0000-0000-0000-000000000001'
const rowId = '20000000-0000-0000-0000-000000000002'
const other = '30000000-0000-0000-0000-000000000003'
const url = `${origin}/storage/v1/object/public/shadow-pin/${other}/picture.jpg`
const inventory = overrides => ({ version: 1, projectUrl: origin, observedAt: '2026-10-23T00:00:00Z', messageReferences: [], categoryCovers: [], ...overrides })

test('a historical Pin share copies once per source and compare-and-swaps both exact unchanged fields', () => {
  const plan = buildPrivateMediaRepairPlan(inventory({ messageReferences: ['file_url','thumbnail_url'].map(field => ({ source: 'messages', row_id: rowId, author_id: author, field, url })) }))
  assert.equal(plan.copyRequests.length, 1)
  assert.equal(plan.updates.length, 1)
  assert.equal(plan.updates[0].fields.length, 2)
  assert.equal(plan.copyRequests[0].destinationBucket, 'chat-uploads')
  assert.ok(plan.copyRequests[0].destinationKey.startsWith(`${author}/forwarded/${rowId}/`))
  assert.match(plan.updates[0].sql, /file_url is not distinct from/)
  assert.match(plan.updates[0].sql, /thumbnail_url is not distinct from/)
  assert.match(plan.updates[0].sql, /returning id;$/)
  assert.match(plan.authorizations[0].sql, /begin read only;[\s\S]*set local role authenticated;[\s\S]*rollback;/)
  assert.equal(plan.authorizations[0].expected.length, 1)
})

test('foreign-uploaded category covers become independent creator objects with exact path and URL guards', () => {
  const imagePath = `${other}/categories/${rowId}/cover/old.jpg`
  const imageUrl = `${origin}/storage/v1/object/public/shadow-pin/${imagePath}`
  const plan = buildPrivateMediaRepairPlan(inventory({ categoryCovers: [{ row_id: rowId, author_id: author, image_path: imagePath, image_url: imageUrl }] }))
  assert.equal(plan.copyRequests[0].sourceKey, imagePath)
  assert.ok(plan.copyRequests[0].destinationKey.startsWith(`${author}/categories/${rowId}/cover/repaired-`))
  assert.equal(plan.updates[0].table, 'shadow_pin_categories')
  assert.match(plan.updates[0].sql, /creator_id=/)
  assert.match(plan.updates[0].sql, /image_path is not distinct from/)
  assert.match(plan.updates[0].sql, /image_url is not distinct from/)
  assert.equal(plan.updates[0].fields[0].newValue, plan.copyRequests[0].destinationKey)
})

test('repair identities, field names, credentials and paths cannot become arbitrary SQL or Storage operations', () => {
  const base = { source: 'dm_messages', row_id: rowId, author_id: author, field: 'file_url', url }
  for (const invalid of [
    { source: 'users' }, { field: 'password' }, { author_id: 'attacker;drop table' },
    { url: url.replace('fixture.supabase.co', 'other.supabase.co') },
    { url: `${url}?token=bearer` },
    { url: url.replace('/picture.jpg', '/%2Fprivate.jpg') },
    { url: url.replace('/picture.jpg', '/%00private.jpg') },
  ]) assert.throws(() => buildPrivateMediaRepairPlan(inventory({ messageReferences: [{ ...base, ...invalid }] })))
})

test('repeated plan generation is deterministic and never includes delete instructions', () => {
  const input = inventory({ messageReferences: [{ source: 'messages', row_id: rowId, author_id: author, field: 'file_url', url }] })
  const first = buildPrivateMediaRepairPlan(input)
  assert.deepEqual(first, buildPrivateMediaRepairPlan(input))
  assert.equal(first.copyRequests[0].sourceKey, `${other}/picture.jpg`)
  assert.equal(first.updates.some(update => /\bdelete\b/i.test(update.sql)), false)
})
