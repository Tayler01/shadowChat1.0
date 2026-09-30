const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ignore = require('ignore');
// Node 24 loads the actual controller with built-in TypeScript stripping.
// No root Jest configuration, browser shim, or second implementation is used.
const { createNativeClipboardController, CLIPBOARD_CHUNK_BYTES } = require('../src/lib/nativeClipboardController.ts');
const ORIGIN = 'https://shadochat.online';
const ID = '11111111-1111-4111-8111-111111111111';
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const command = (type, values = {}) => JSON.stringify({ version: 1, type, requestId: ID, scope: 'composer', ...values });

test('movie transport uses the real mobile controller, exact origin and bounded pull chunks', async () => {
  const emitted = [];
  const reads = [];
  const released = [];
  let finishChunk;
  const clipboard = {
    begin: async () => [{ name: 'movie.mov', type: 'video/quicktime', size: CLIPBOARD_CHUNK_BYTES + 1 }],
    readChunk: (id, index, offset) => {
      reads.push({ id, index, offset });
      return new Promise(resolve => { finishChunk = resolve; });
    },
    release: async id => { released.push(id); },
  };
  const controller = createNativeClipboardController({ origin: ORIGIN, clipboard, publish: message => emitted.push(message) });
  try {
    assert.equal(controller.handle(command('clipboard_begin'), ORIGIN + '.untrusted.test'), false);
    assert.equal(emitted.length, 0);
    controller.handle(command('clipboard_begin'), ORIGIN);
    await flush();
    assert.equal(emitted[0].type, 'clipboard_manifest');
    controller.handle(command('clipboard_next', { index: 0, offset: 0 }), ORIGIN);
    controller.handle(command('clipboard_next', { index: 0, offset: 0 }), ORIGIN);
    assert.equal(reads.length, 1, 'a repeated pull cannot duplicate an in-flight chunk');
    finishChunk(Buffer.alloc(CLIPBOARD_CHUNK_BYTES, 120).toString('base64'));
    await flush();
    assert.equal(emitted[1].data.length, 256 * 1024);
    controller.handle(command('clipboard_next', { index: 0, offset: 0 }), ORIGIN);
    assert.equal(reads.length, 1, 'old offsets cannot restart a file');
    controller.handle(command('clipboard_next', { index: 0, offset: CLIPBOARD_CHUNK_BYTES }), ORIGIN);
    assert.equal(reads.length, 2);
    controller.reset();
    finishChunk(Buffer.from('x').toString('base64'));
    await flush();
    assert.equal(emitted.length, 2, 'cancelled native reads cannot publish late bytes');
    assert.deepEqual(released, [ID]);
  } finally { controller.reset(); }
});

test('movie provider cancellation cannot revive a transfer and oversize files release immediately', async () => {
  let finishBegin;
  const emitted = [];
  const released = [];
  const controller = createNativeClipboardController({
    origin: ORIGIN,
    clipboard: {
      begin: () => new Promise(resolve => { finishBegin = resolve; }),
      readChunk: async () => { throw new Error('should not request bytes'); },
      release: async id => { released.push(id); },
    },
    publish: message => emitted.push(message),
  });
  try {
    controller.handle(command('clipboard_begin'), ORIGIN);
    controller.handle(command('clipboard_cancel'), ORIGIN);
    finishBegin([{ name: 'movie.mov', type: 'video/quicktime', size: 5 }]);
    await flush();
    assert.equal(emitted.length, 0);
    assert.ok(released.includes(ID));
    controller.handle(command('clipboard_begin', { requestId: '22222222-2222-4222-8222-222222222222' }), ORIGIN);
    finishBegin([{ name: 'movie.mov', type: 'video/quicktime', size: 64 * 1024 * 1024 + 1 }]);
    await flush();
    assert.equal(emitted[0].type, 'clipboard_error');
    assert.match(emitted[0].error, /oversized/);
    assert.ok(released.includes('22222222-2222-4222-8222-222222222222'));
  } finally { controller.reset(); }
});

test('both EAS ignore files retain local module source while excluding generated native trees', () => {
  const mobileRoot = path.resolve(__dirname, '..');
  const repositoryRoot = path.resolve(mobileRoot, '../..');
  const mobileRules = ignore().add(fs.readFileSync(path.join(mobileRoot, '.easignore'), 'utf8'));
  const rootRules = ignore().add(fs.readFileSync(path.join(repositoryRoot, '.easignore'), 'utf8'));
  for (const relative of ['modules/shadowchat-clipboard/ios/ShadowChatClipboardModule.swift', 'modules/shadowchat-clipboard/ios/ShadowChatClipboard.podspec']) {
    assert.equal(mobileRules.ignores(relative), false, relative);
    assert.equal(rootRules.ignores('apps/mobile/' + relative), false, relative);
  }
  for (const relative of ['ios/Generated.swift', 'android/app/build.gradle']) {
    assert.equal(mobileRules.ignores(relative), true, relative);
    assert.equal(rootRules.ignores('apps/mobile/' + relative), true, relative);
    assert.equal(rootRules.ignores(relative), true, relative);
  }
});
