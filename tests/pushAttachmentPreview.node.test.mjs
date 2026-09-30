import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the production preview helper without booting the Deno HTTP server.
const source = fs.readFileSync('supabase/functions/send-push/index.ts', 'utf8')
const helper = source.slice(source.indexOf('const truncate ='), source.indexOf('const getActor ='))
assert.ok(helper.includes('const getMessagePreview ='), 'Production preview helper must be found')
const context = { exports: {} }
const transpile = text => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
vm.runInNewContext(transpile(helper + '\nexports.preview = getMessagePreview;'), context)
const policy = { exports: {} }
vm.runInNewContext(transpile(fs.readFileSync('supabase/functions/_shared/web-push-policy.ts', 'utf8')), policy)

const captionMetadata = JSON.stringify({
  text: 'Private video caption',
  fileName: 'private-video.mp4',
  contentType: 'video/mp4',
})
const preview = content => context.exports.preview({ message_type: 'video', content })

test('video notification preview never exposes caption JSON, filenames, or raw legacy content', () => {
  for (const content of [captionMetadata, 'Legacy video caption', null, '']) {
    assert.equal(preview(content), 'Sent a video')
  }
  const full = policy.exports.resolveWebPushPayload({ title: 'Sender', body: preview(captionMetadata) }, {
    notification_preview_mode: 'full',
  })
  assert.equal(full.body, 'Sent a video')
  assert.equal(JSON.stringify(full).includes('Private video caption'), false)
  assert.equal(JSON.stringify(full).includes('private-video.mp4'), false)
})

test('video preview still obeys sender-only, private, and default lock-screen privacy', () => {
  for (const mode of ['sender_only', 'private', undefined]) {
    const payload = policy.exports.resolveWebPushPayload({
      title: 'Sender', body: preview(captionMetadata),
      data: { preview: preview(captionMetadata), sender_id: 'sender' },
    }, mode ? { notification_preview_mode: mode } : undefined)
    assert.equal(payload.body, 'Open ShadowChat to view it.')
    assert.equal('preview' in payload.data, false)
    assert.equal(payload.title, mode === 'sender_only' ? 'Sender' : 'New ShadowChat notification')
  }
})

test('existing attachment and text preview contracts remain intact', () => {
  for (const [message_type, expected] of [
    ['image', 'Sent an image'], ['file', 'Sent a file'], ['audio', 'Sent a voice message'],
  ]) {
    assert.equal(context.exports.preview({ message_type, content: captionMetadata }), expected)
  }
  assert.equal(context.exports.preview({ message_type: 'text', content: '  Hello  ' }), 'Hello')
  assert.equal(context.exports.preview({ message_type: 'text', content: 'a'.repeat(150) }).length, 120)
})
