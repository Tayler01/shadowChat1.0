const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/webViewNavigation.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: mod, exports: mod.exports, URL });
const { decideAppNavigation, NATIVE_MAIN_DOCUMENT_LINK_SCRIPT } = mod.exports;
const allowed = url => new URL(url).origin === 'https://member.example.com';

test('automatic HTTPS player subframes stay inline across all supported providers', () => {
  for (const url of [
    'https://www.youtube.com/embed/abc?autoplay=1',
    'https://player.mediadelivery.net/embed/666331/video?token=secret',
    'https://assets.pinterest.com/ext/embed.html?id=123',
    'https://www.instagram.com/p/123/embed/',
    'https://platform.twitter.com/embed/Tweet.html?id=123',
    'about:blank',
    'about:srcdoc',
  ]) {
    for (const navigationType of ['other', undefined]) {
      assert.equal(decideAppNavigation({ url, isTopFrame: false, navigationType }, allowed), 'allow', url);
    }
  }
});

test('explicit top-level source links leave the app while player-frame clicks cannot launch another app', () => {
  for (const url of ['https://www.youtube.com/watch?v=abc', 'mailto:help@example.com', 'tel:+15555550123', 'sms:+15555550123']) {
    assert.equal(decideAppNavigation({ url, isTopFrame: true, navigationType: 'click' }, allowed), 'external');
    assert.equal(decideAppNavigation({ url, isTopFrame: false, navigationType: 'click' }, allowed), 'block');
  }
});

test('off-origin automatic top navigation and unsafe frame schemes cannot launch another app', () => {
  for (const request of [
    { url: 'https://www.youtube.com/watch?v=abc', isTopFrame: true, navigationType: 'other' },
    { url: 'youtube://watch?v=abc', isTopFrame: false, navigationType: 'other' },
    { url: 'tel:+15555550123', isTopFrame: false, navigationType: 'other' },
    { url: 'javascript:alert(1)', isTopFrame: false, navigationType: 'click' },
    { url: 'file:///private/data', isTopFrame: false, navigationType: 'other' },
    { url: 'about:srcdoc', isTopFrame: true, navigationType: 'other' },
    { url: 'data:text/html,external', isTopFrame: false, navigationType: 'other' },
    { url: 'blob:https://www.youtube.com/video', isTopFrame: false, navigationType: 'other' },
    { url: 'not a url', isTopFrame: false },
  ]) assert.equal(decideAppNavigation(request, allowed), 'block');
});

test('same-community routes work while missing metadata fails closed instead of auto-opening an app', () => {
  assert.equal(decideAppNavigation({ url: 'https://member.example.com/?view=pins&pin=123', isTopFrame: true, navigationType: 'other' }, allowed), 'allow');
  assert.equal(decideAppNavigation({ url: 'https://www.youtube.com/watch?v=abc' }, allowed), 'block');
});

test('native trusted main-document anchors retain external linking without granting iframe or synthetic clicks', () => {
  let click;
  const document = { addEventListener: (type, listener, capture) => { assert.equal(type, 'click'); assert.equal(capture, true); click = listener; } };
  const window = { location: { href: 'https://member.example.com/', origin: 'https://member.example.com' } };
  window.self = window.top = window;
  vm.runInNewContext(NATIVE_MAIN_DOCUMENT_LINK_SCRIPT, { window, document, URL });
  const anchor = { href: 'https://www.youtube.com/watch?v=abc', target: '_blank', ownerDocument: document };
  const event = { isTrusted: true, defaultPrevented: false, target: { closest: () => anchor } };
  click({ ...event, isTrusted: false });
  assert.equal(anchor.target, '_blank');
  click({ ...event, defaultPrevented: true });
  assert.equal(anchor.target, '_blank');
  click(event);
  assert.equal(anchor.target, '_self');
  assert.equal(decideAppNavigation({ url: anchor.href, isTopFrame: true, navigationType: 'click' }, allowed), 'external');

  for (const href of ['mailto:help@example.com', 'tel:+15555550123', 'sms:+15555550123']) {
    anchor.href = href; anchor.target = '_blank';
    click(event);
    assert.equal(anchor.target, '_self');
    assert.equal(decideAppNavigation({ url: href, isTopFrame: true, navigationType: 'click' }, allowed), 'external');
  }

  anchor.target = '_blank'; anchor.ownerDocument = {};
  click(event);
  assert.equal(anchor.target, '_blank');
  assert.equal(decideAppNavigation({ url: anchor.href, isTopFrame: false, navigationType: 'click' }, allowed), 'block');
  const frameWindow = { ...window, top: {} };
  let frameListener = false;
  vm.runInNewContext(NATIVE_MAIN_DOCUMENT_LINK_SCRIPT, { window: frameWindow, document: { addEventListener: () => { frameListener = true; } }, URL });
  assert.equal(frameListener, false);
});

test('the actual WebView dispatcher sends custom schemes through our guard without auto-opening them', () => {
  const sharedFile = path.join(path.dirname(require.resolve('react-native-webview/package.json')), 'src/WebViewShared.tsx');
  const shared = { exports: {} };
  const opened = [];
  const native = { Linking: { canOpenURL: async () => true, openURL: url => opened.push(url) } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(sharedFile, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: shared, exports: shared.exports,
    require: name => name === 'react-native' ? native
      : name === './WebView.styles' ? {} : require(name),
  });
  const results = [];
  const callback = shared.exports.createOnShouldStartLoadWithRequest((allow, url) => results.push({ allow, url }), ['*'], request => decideAppNavigation(request, allowed) === 'allow');
  for (const url of ['youtube://watch?v=abc', 'intent://watch?v=abc', 'tel:+15555550123']) {
    callback({ nativeEvent: { url, isTopFrame: false, navigationType: 'other' } });
  }
  assert.equal(opened.length, 0);
  assert.deepEqual(results.map(result => result.allow), [false, false, false]);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/app/index.tsx'), 'utf8'), /originWhitelist=\{\['\*'\]\}/);
});
