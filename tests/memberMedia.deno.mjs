import assert from 'node:assert/strict'
import { parseMemberMediaUrl, downloadMemberMedia, assertRasterImageBytes } from '../supabase/functions/_shared/member-media.ts'

const origin = 'https://fixture.supabase.co'
const url = `${origin}/storage/v1/object/public/chat-uploads/owner/photo.jpg`
Deno.test('member import resolves legacy/signed URLs with actor Storage authority, never the URL token', async () => {
  const calls = []
  const blob = new Blob([new Uint8Array([0xff,0xd8,0xff])], { type: 'image/jpeg' })
  const actor = { storage: { from: bucket => ({ download: async path => { calls.push([bucket,path]); return { data: blob, error: null } } }) } }
  assert.equal(await downloadMemberMedia(url.replace('/public/','/sign/') + '?token=secret',origin,actor),blob)
  assert.deepEqual(calls,[['chat-uploads','owner/photo.jpg']])
})
Deno.test('denied member import never falls back to public HTTP', async () => {
  const actor = { storage: { from: () => ({ download: async () => ({ data: null, error: new Error('denied') }) }) } }
  await assert.rejects(downloadMemberMedia(url,origin,actor),/no longer have access/)
})
Deno.test('another host remains external and cannot use this project authorization', () => {
  assert.equal(parseMemberMediaUrl(url.replace('fixture.supabase.co','other.supabase.co'),origin),null)
})
Deno.test('encoded separators and URL credentials cannot redirect an authorized download', () => {
  for(const invalid of [url.replace('owner/photo.jpg','owner/%2fsecret.jpg'),url.replace('owner/photo.jpg','owner/%00.jpg'),url.replace('https://','https://u:p@')]) {
    assert.throws(() => parseMemberMediaUrl(invalid,origin))
  }
})
Deno.test('raster signatures reject disguised SVG/HTML before publishing an imported file', () => {
  for(const source of ['<svg/>','<html/>']) assert.throws(() => assertRasterImageBytes(new TextEncoder().encode(source).buffer),/image bytes/)
  assertRasterImageBytes(new Uint8Array([0xff,0xd8,0xff]).buffer)
})
