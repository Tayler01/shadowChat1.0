const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const version = '13.16.1';
const originalSha256 = 'e13c0e1d6cad297fc5cea7db1449af1415495285a3fc33585a1a04339ee667a2';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const patches = [
  [
    '    public boolean shouldOverrideUrlLoading(WebView view, String url) {\n        final RNCWebView rncWebView',
    '    public boolean shouldOverrideUrlLoading(WebView view, String url) {\n        return shouldOverrideUrlLoading(view, url, null);\n    }\n\n    private boolean shouldOverrideUrlLoading(WebView view, String url, @Nullable WebResourceRequest navigationRequest) {\n        final RNCWebView rncWebView',
  ],
  [
    '            final WritableMap event = createWebViewEvent(view, url);\n            event.putDouble("lockIdentifier", lockIdentifier);',
    '            final WritableMap event = createWebViewEvent(view, url);\n            addNavigationRequestMetadata(event, navigationRequest);\n            event.putDouble("lockIdentifier", lockIdentifier);',
  ],
  [
    '            int reactTag = RNCWebViewWrapper.getReactTagFromWebView(view);\n            UIManagerHelper.getEventDispatcherForReactTag((ReactContext) view.getContext(), reactTag).dispatchEvent(new TopShouldStartLoadWithRequestEvent(\n                    reactTag,\n                    createWebViewEvent(view, url)));',
    '            int reactTag = RNCWebViewWrapper.getReactTagFromWebView(view);\n            final WritableMap event = createWebViewEvent(view, url);\n            addNavigationRequestMetadata(event, navigationRequest);\n            UIManagerHelper.getEventDispatcherForReactTag((ReactContext) view.getContext(), reactTag).dispatchEvent(new TopShouldStartLoadWithRequestEvent(\n                    reactTag,\n                    event));',
  ],
  [
    '    @TargetApi(Build.VERSION_CODES.N)\n    @Override\n    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {\n        final String url = request.getUrl().toString();\n        return this.shouldOverrideUrlLoading(view, url);\n    }',
    '    private void addNavigationRequestMetadata(WritableMap event, @Nullable WebResourceRequest request) {\n        if (request == null) return;\n        event.putBoolean("isTopFrame", request.isForMainFrame());\n        event.putBoolean("hasGesture", request.hasGesture());\n        event.putString("navigationType", request.isForMainFrame() && request.hasGesture() ? "click" : "other");\n    }\n\n    @TargetApi(Build.VERSION_CODES.N)\n    @Override\n    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {\n        final String url = request.getUrl().toString();\n        return this.shouldOverrideUrlLoading(view, url, request);\n    }',
  ],
];

function patchedSource(source, installedVersion) {
  assert.equal(installedVersion, version, 'Review/remove the WebView navigation patch when the dependency changes.');
  assert.equal(hash(source), originalSha256, 'Refusing to patch unreviewed WebView native source.');
  return patches.reduce((text, [before, after]) => {
    assert.equal(text.split(before).length, 2, 'Unexpected WebView navigation patch location.');
    return text.replace(before, after);
  }, source);
}

function verifyOrApply({ apply = false } = {}) {
  const metadataFile = require.resolve('react-native-webview/package.json');
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  assert.equal(metadata.version, version, 'Review/remove the WebView navigation patch when the dependency changes.');
  const file = path.join(path.dirname(metadataFile), 'android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java');
  const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (source.includes('addNavigationRequestMetadata(event, navigationRequest);')) {
    const original = [...patches].reverse().reduce((text, [before, after]) => {
      assert.equal(text.split(after).length, 2, 'Unexpected installed WebView patch count.');
      return text.replace(after, before);
    }, source);
    assert.equal(source, patchedSource(original, metadata.version), 'Installed WebView patch differs from the reviewed source.');
    return { version, patchedSha256: hash(source), frameMetadata: true };
  }
  assert.ok(apply, 'The required WebView frame/gesture metadata patch is absent.');
  fs.writeFileSync(file, patchedSource(source, metadata.version));
  return verifyOrApply();
}

module.exports = { verifyOrApply, patchedSource, patches, originalSha256, version };
if (require.main === module) console.log(JSON.stringify(verifyOrApply({ apply: true })));
