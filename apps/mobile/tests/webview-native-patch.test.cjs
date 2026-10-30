const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { verifyOrApply, patchedSource, patches, version } = require('../scripts/apply-webview-navigation.cjs');

test('installed Android WebView preserves real frame/gesture metadata in both request event paths', () => {
  assert.equal(verifyOrApply().frameMetadata, true);
  const source = fs.readFileSync(path.join(path.dirname(require.resolve('react-native-webview/package.json')), 'android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java'), 'utf8');
  assert.equal(source.split('addNavigationRequestMetadata(event, navigationRequest);').length, 3);
  assert.match(source, /event\.putBoolean\("isTopFrame", request\.isForMainFrame\(\)\)/);
  assert.match(source, /event\.putString\("navigationType", request\.isForMainFrame\(\) && request\.hasGesture\(\) \? "click" : "other"\)/);
  assert.match(source, /return this\.shouldOverrideUrlLoading\(view, url, request\)/);
});

test('native patch refuses dependency upgrades and changed upstream code instead of guessing', () => {
  const installed = fs.readFileSync(path.join(path.dirname(require.resolve('react-native-webview/package.json')), 'android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java'), 'utf8').replace(/\r\n/g, '\n');
  const original = [...patches].reverse().reduce((text, [before, after]) => text.replace(after, before), installed);
  assert.equal(patchedSource(original, version), installed);
  assert.throws(() => patchedSource(original, '13.16.2'), /dependency changes/);
  assert.throws(() => patchedSource(original + '\n', version), /unreviewed WebView native source/);
  assert.throws(() => patchedSource(installed, version), /unreviewed WebView native source/);
});

test('fresh native installs apply the guarded patch before an Android binary is built', () => {
  const pkg = require('../package.json');
  assert.match(pkg.scripts.postinstall, /node scripts\/apply-webview-navigation\.cjs/);
});
