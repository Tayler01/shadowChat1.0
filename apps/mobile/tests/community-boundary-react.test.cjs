const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');

function load(file, imports) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module, exports: module.exports, URL, atob,
    require: name => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; },
  });
  return module.exports;
}
const core = load('src/community/communityRuntime.ts', {});
const { createCommunityStartup } = load('src/community/communityStartup.ts', { './communityRuntime': core });
const definition = (id, host) => ({ origin: `https://${host}.example.com`, projectRef: id,
  supabaseUrl: `https://${id}.supabase.co`, publicKey: 'sb_publishable_synthetic_unit_test_key_000',
});
const registry = core.resolveCommunityRegistry({ member: definition('abcdefghijklmnopqrst', 'member'),
  demoEnabled: true, demo: definition('tsrqponmlkjihgfedcba', 'demo') });

test('real React StrictMode mounts, retries startup and remounts a selected community without reselection or lost branding', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://native-test.example.com' });
  const previousWindow = global.window, previousDocument = global.document;
  const previousAct = global.IS_REACT_ACT_ENVIRONMENT;
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  try {
    const controller = core.createCommunityRuntime(registry), initializeCommunity = createCommunityStartup();
    const store = new Map(), listeners = new Set();
    let revision = 0, legacyFailures = 1, legacyRevokes = 0, memberPreparations = 0;
    store.set('shadowchat-native-notification-installation-credential-v2', 'synthetic-existing-credential');
    const primitive = tag => ({ children, onPress }) => React.createElement(tag, { onClick: onPress }, children);
    const bindings = {
      baseAppRuntime: { streamlined: true }, communityRegistry: registry, communityController: controller,
      activeCommunity: () => controller.capture(), isCurrentCommunity: selected => controller.isCurrent(selected),
      communityRevision: () => revision, communityHelperRevision: () => 0,
      announceCommunityChange: () => { revision++; for (const listener of listeners) listener(); },
      subscribeCommunity: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      initializeCommunity, drainCommunity: async () => {},
    };
    const boundary = load('src/community/NativeCommunityBoundary.tsx', {
      react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
      '@notifee/react-native': { __esModule: true, default: { cancelAllNotifications: async () => {}, setBadgeCount: async () => {} } },
      'expo-notifications': { dismissAllNotificationsAsync: async () => {}, cancelAllScheduledNotificationsAsync: async () => {}, setBadgeCountAsync: async () => {} },
      'expo-secure-store': { getItemAsync: async key => store.get(key) ?? null, setItemAsync: async (key, value) => store.set(key, value) },
      'react-native': { View: primitive('div'), Text: primitive('span'), Image: () => React.createElement('img', { alt: 'Shado brand mark' }),
        ActivityIndicator: primitive('i'), Pressable: primitive('button'), StyleSheet: { create: value => value } },
      'react-native-safe-area-context': { SafeAreaView: primitive('div') },
      './CommunityChoice': { CommunityChoice: ({ onSelect, error }) => React.createElement('div', null,
        React.createElement('button', { onClick: () => onSelect('demo') }, 'Demo community'), error) },
      '../lib/nativeLaunch': load('src/lib/nativeLaunch.ts', {}),
      '../components/NativeLaunchLoader': load('src/components/NativeLaunchLoader.tsx',{
        'react/jsx-runtime':require('react/jsx-runtime'),
        'react-native':{View:primitive('div'),Text:primitive('span'),Image:()=>React.createElement('img',{alt:'Shado brand mark'}),StyleSheet:{create:value=>value},useWindowDimensions:()=>({height:844,fontScale:1})},
        '../../assets/images/shado-round-mark.png':'bundled-mark',
      }),
      './communityBindings': bindings,
      '../lib/notifications/registration': { createScopedRegistration: () => ({
        getNativeNotificationInstallationCredential: async () => ({ valid: true }),
        adoptLegacyMemberInstallationKey: async () => { assert.equal(store.has('shadowchat-native-notification-installation-credential-v2'), false); memberPreparations++; },
        revokeNativeNotificationInstallation: async () => { legacyRevokes++; if (legacyFailures-- > 0) throw Error('uncertain revoke'); store.delete('shadowchat-native-notification-installation-credential-v2'); },
      }) },
      '../lib/supabase': { disposeCommunityClient: async () => {}, abortCommunityRequests: () => {} },
      '../../assets/images/shado-round-mark.png': 'bundled-mark',
    });
    let currentBinding;
    function Consumer() {
      const binding = boundary.useCommunityBinding();
      currentBinding = binding;
      return React.createElement('output', null, binding.context.community.id);
    }
    const render = key => root.render(React.createElement(React.StrictMode, null,
      React.createElement(boundary.NativeCommunityBoundary, { key }, React.createElement(Consumer))));
    await React.act(async () => { render('first'); });
    assert.equal(controller.capture(), null); assert.equal(legacyRevokes, 1);
    assert.ok(document.querySelector('img')); assert.match(document.body.textContent, /ShadoChat/);
    assert.ok(store.has('shadowchat-native-notification-installation-credential-v2'));
    const retry = [...document.querySelectorAll('button')].find(button => button.textContent === 'Retry opening community');
    assert.ok(retry);
    await React.act(async () => { retry.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
    assert.equal(legacyRevokes, 2); assert.equal(memberPreparations, 1); assert.equal(controller.capture(), null);
    const demo = [...document.querySelectorAll('button')].find(button => button.textContent === 'Demo community');
    await React.act(async () => {
      demo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      demo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    const selected = controller.capture(); assert.equal(selected.community.id, 'demo');
    assert.equal(document.querySelector('output').textContent, 'demo');
    const persistentMark = document.querySelector('img');
    assert.ok(persistentMark, 'selection alone must not clear the startup cover');
    await React.act(async () => { currentBinding.reportLaunch(.4, 'Loading community page'); });
    await React.act(async () => { currentBinding.reportLaunch(.8, 'Restoring your community'); });
    await React.act(async () => { currentBinding.reportLaunch(.2, 'Loading community page'); });
    assert.equal(document.querySelector('img'), persistentMark, 'progress uses the same mounted loader');
    assert.match(document.body.textContent, /Restoring your community/);
    await React.act(async () => { currentBinding.reportLaunch(1, 'Ready'); });
    assert.equal(document.querySelector('img'), null);
    await React.act(async () => { currentBinding.reportLaunch(.8, 'Restoring your community'); });
    assert.equal(document.querySelector('img'), null, 'late load signals cannot bring the cover back');
    await React.act(async () => { currentBinding.restartLaunch(); });
    assert.ok(document.querySelector('img'), 'explicit retry starts a new cover');
    await React.act(async () => { currentBinding.reportLaunch(1, 'Connection interrupted'); });
    assert.equal(document.querySelector('img'), null, 'load errors reveal the actionable error underneath');
    await React.act(async () => { currentBinding.restartLaunch(); });
    assert.ok(document.querySelector('img'));
    await React.act(async () => { render('remounted'); });
    assert.equal(controller.capture(), selected); assert.equal(document.querySelector('output').textContent, 'demo');
    assert.equal(legacyRevokes, 2);
    assert.ok(document.querySelector('img'), 'a real boundary remount waits for page readiness');
    await React.act(async () => { currentBinding.reportLaunch(1, 'Ready'); });
    assert.equal(document.querySelector('img'), null);
  } finally {
    await React.act(async () => { root.unmount(); });
    global.window = previousWindow; global.document = previousDocument;
    global.IS_REACT_ACT_ENVIRONMENT = previousAct; dom.window.close();
  }
});
