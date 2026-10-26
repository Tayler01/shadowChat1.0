const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const configure = require('../app.config.js');
const { expo } = require('../app.json');
const origin = 'https://shadowchat-streamlined.netlify.app';

function withEnv(env, run) {
  const original = { ...process.env };
  for (const key of ['SHADOWCHAT_APP_EDITION', 'SHADOWCHAT_STREAMLINED_WEB_ORIGIN', 'SHADOWCHAT_IOS_BUILD_NUMBER']) delete process.env[key];
  Object.assign(process.env, env);
  try { return run(); } finally { process.env = original; }
}

function loadTs(file, imports = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, URL, require: name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`);
    return imports[name];
  } });
  return module.exports;
}

test('default native profile preserves the complete existing app configuration', () => {
  withEnv({}, () => assert.deepEqual(configure({ config: {} }), expo));
});

test('streamlined build uses an isolated HTTPS origin and advances only its build number', () => {
  withEnv({ SHADOWCHAT_APP_EDITION: 'streamlined', SHADOWCHAT_STREAMLINED_WEB_ORIGIN: origin }, () => {
    const config = configure({ config: {} });
    assert.equal(config.extra.webAppUrl, origin);
    assert.equal(config.extra.appEdition, 'streamlined');
    assert.equal(config.ios.buildNumber, '18');
    assert.equal(config.ios.bundleIdentifier, expo.ios.bundleIdentifier);
    assert.deepEqual(config.plugins, expo.plugins);
    assert.deepEqual(config.android, expo.android);
    assert.equal(config.orientation, expo.orientation);
    assert.equal(config.extra.eas.projectId, expo.extra.eas.projectId);
  });
});

test('streamlined build fails closed for missing or unsafe origin and reused build numbers', () => {
  for (const value of ['', 'http://example.com', 'https://shadochat.online', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com?token=x', 'https://example.com:444', 'https://localhost', 'https://127.0.0.1']) {
    withEnv({ SHADOWCHAT_APP_EDITION: 'streamlined', SHADOWCHAT_STREAMLINED_WEB_ORIGIN: value }, () => assert.throws(() => configure({ config: {} })));
  }
  withEnv({ SHADOWCHAT_APP_EDITION: 'streamlined', SHADOWCHAT_STREAMLINED_WEB_ORIGIN: origin, SHADOWCHAT_IOS_BUILD_NUMBER: '17' }, () => assert.throws(() => configure({ config: {} })));
});

test('native routes preserve exact chat/DM/Pin destinations and reject cross-origin navigation', () => {
  const { resolveAppConfiguration } = loadTs('src/lib/appConfiguration.ts');
  for (const streamlined of [false, true]) {
    const appRuntime = resolveAppConfiguration(streamlined ? { appEdition: 'streamlined', webAppUrl: origin } : expo.extra);
    const routes = loadTs('src/lib/notifications/routes.ts', { '../appRuntime': { appRuntime } });
    for (const route of ['/?view=dms&conversation=abc&message=123', '/?view=pins&pin=abc&comment=123', '/?view=chat&thread=abc']) {
      assert.equal(routes.getNotificationWebUrl(route), appRuntime.origin + route);
    }
    for (const route of ['//evil.example', '/\\evil.example', 'https://evil.example', null]) {
      assert.equal(routes.normalizeNotificationRoute(route), appRuntime.fallbackRoute);
    }
    assert.equal(routes.normalizeNotificationRoute('/?view=catchup'), streamlined ? '/?view=chat' : '/?view=catchup');
  }
});

test('only the streamlined build selects the media-free iOS extension', () => {
  const plugin = fs.readFileSync(path.resolve(__dirname, '../plugins/with-shadowchat-notification-service-extension.js'), 'utf8');
  assert.match(plugin, /dangerousConfig\.extra\?\.appEdition === 'streamlined'/);
  const streamlined = fs.readFileSync(path.resolve(__dirname, '../plugins/NotificationService.streamlined.swift'), 'utf8');
  assert.doesNotMatch(streamlined, /URLSession|download\(|UNNotificationAttachment\(/);
  const full = fs.readFileSync(path.resolve(__dirname, '../plugins/notification-service-extension/NotificationService.swift'), 'utf8');
  assert.match(full, /URLSession/);
});
