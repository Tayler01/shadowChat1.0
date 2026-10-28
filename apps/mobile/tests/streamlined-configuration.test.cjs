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
    assert.equal(config.ios.buildNumber, '22');
    assert.equal(config.ios.bundleIdentifier, expo.ios.bundleIdentifier);
    const isSplash = plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen';
    assert.deepEqual(config.plugins.slice(0, -1).filter(plugin => !isSplash(plugin)), expo.plugins.filter(plugin => !isSplash(plugin)));
    assert.deepEqual(config.plugins.find(isSplash), ['expo-splash-screen', {
      backgroundColor: '#0d0f10', image: './assets/images/shado-round-mark.png', imageWidth: 96, resizeMode: 'contain',
      ios: { backgroundColor: '#0d0f10', image: './assets/images/shado-round-mark.png', imageWidth: 96 },
      android: { backgroundColor: '#0d0f10', image: './assets/images/shado-round-mark.png', imageWidth: 96 },
    }]);
    assert.equal(config.plugins.at(-1), './plugins/with-streamlined-store-permissions');
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
  withEnv({ SHADOWCHAT_APP_EDITION: 'streamlined', SHADOWCHAT_STREAMLINED_WEB_ORIGIN: origin, SHADOWCHAT_IOS_BUILD_NUMBER: '18' }, () => assert.throws(() => configure({ config: {} })));
  withEnv({ SHADOWCHAT_APP_EDITION: 'streamlined', SHADOWCHAT_STREAMLINED_WEB_ORIGIN: origin, SHADOWCHAT_IOS_BUILD_NUMBER: '19' }, () => assert.throws(() => configure({ config: {} })));
});

test('the store build profile resolves the reviewed streamlined build and origin', () => {
  const { build } = require('../eas.json');
  assert.equal(build.streamlined.distribution, 'store');
  assert.equal(build.streamlined.environment, 'production');
  withEnv(build.streamlined.env, () => {
    const config = configure({ config: {} });
    assert.equal(config.ios.buildNumber, build.streamlined.env.SHADOWCHAT_IOS_BUILD_NUMBER);
    assert.equal(config.extra.appEdition, 'streamlined');
    assert.equal(config.extra.webAppUrl, origin);
    assert.equal(config.ios.bundleIdentifier, expo.ios.bundleIdentifier);
    assert.equal(config.extra.eas.projectId, expo.extra.eas.projectId);
  });
  withEnv({}, () => assert.deepEqual(configure({ config: {} }), expo));
});

test('store permission cleanup removes only unused declarations and leaves full config untouched', () => {
  const plugin = require('../plugins/with-streamlined-store-permissions');
  assert.equal(plugin(expo), expo);
  const original = {
    NSFaceIDUsageDescription: 'Expo default',
    NSLocalNetworkUsageDescription: 'Expo Dev Launcher',
    NSBonjourServices: ['_expo._tcp'],
    NSCameraUsageDescription: 'Capture a message photo',
    NSMicrophoneUsageDescription: 'Record a voice message',
    NSPhotoLibraryUsageDescription: 'Attach a message photo',
    NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true },
    UIBackgroundModes: ['fetch'],
  };
  const cleaned = plugin.stripUnusedStorePermissions(original);
  for (const key of ['NSFaceIDUsageDescription', 'NSLocalNetworkUsageDescription', 'NSBonjourServices']) assert.ok(!Object.hasOwn(cleaned, key));
  assert.deepEqual(cleaned.NSAppTransportSecurity, { NSAllowsArbitraryLoads: false });
  for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSPhotoLibraryUsageDescription', 'UIBackgroundModes']) assert.deepEqual(cleaned[key], original[key]);
  assert.equal(original.NSAppTransportSecurity.NSAllowsLocalNetworking, true);
});

test('store permissions are pruned after earlier Expo mods can insert defaults', async () => {
  const plugin = require('../plugins/with-streamlined-store-permissions');
  const config = plugin({
    extra: { appEdition: 'streamlined' },
    mods: { ios: { infoPlist: async mod => ({ ...mod, modResults: {
      NSFaceIDUsageDescription: 'Injected by SecureStore',
      NSLocalNetworkUsageDescription: 'Injected by Dev Launcher',
      NSBonjourServices: ['_expo._tcp'],
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: true, NSExceptionDomains: { localhost: { NSExceptionAllowsInsecureHTTPLoads: true } } },
      NSCameraUsageDescription: 'Capture a message photo',
    } }) } },
  });
  const completed = await config.mods.ios.infoPlist({ ...config, modResults: {}, modRequest: {} });
  assert.deepEqual(completed.modResults, {
    NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
    NSCameraUsageDescription: 'Capture a message photo',
  });
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
