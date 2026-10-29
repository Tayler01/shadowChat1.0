const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const firstScope = { version: 1, projectRef: 'abcdefghijklmnopqrst', userId: '11111111-1111-4111-8111-111111111111', installationKey: '22222222-2222-4222-8222-222222222222' };
const otherScope = { ...firstScope, projectRef: 'tsrqponmlkjihgfedcba' };
const envelope = { schemaVersion: 2, eventId: 'synthetic-event', eventIds: ['synthetic-event'], groupKey: 'same-group',
  privacy: 'full', actor: { label: 'Synthetic member', avatarUrl: 'https://example.com/avatar.png' }, media: { thumbnailUrl: 'https://example.com/private.png' },
  content: { title: 'Sensitive title', body: 'Sensitive content' }, actions: [], category: 'dm', soundId: 'default',
};

function fixture(displayed = []) {
  const shown = [], cancelled = [], badges = [];
  const readTransportScope = data => {
    let value = data?.communityScope;
    try { if (typeof value === 'string') value = JSON.parse(value); } catch { return null; }
    return value && typeof value === 'object' ? value : null;
  };
  const transportModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/notifications/transportData.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { module: transportModule, exports: transportModule.exports });
  const imports = {
    './transportData': transportModule.exports,
    '@notifee/react-native': { __esModule:true, default: {
      getDisplayedNotifications: async () => displayed,
      displayNotification: async value => { shown.push(value); },
      cancelNotification: async id => { cancelled.push(id); },
      setBadgeCount: async count => { badges.push(count); },
    }, AndroidCategory: { MESSAGE: 'message' }, AndroidGroupAlertBehavior: { CHILDREN: 'children' }, AndroidStyle: {}, AndroidVisibility: { PRIVATE: 'private' } },
    './config': { getAndroidSoundChannelId: () => 'default' },
    '../appRuntime': { appRuntime: { streamlined: true } },
    '../../community/communityBindings': { currentTransportScope: () => null, readTransportScope },
    '@/types/notification-envelope-v2': { parseNotificationEnvelopeV2: value => value },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/notifications/androidPresenter.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => {
    assert.ok(Object.hasOwn(imports, name), name); return imports[name];
  } });
  return { ...module.exports, shown, cancelled, badges };
}

test('headless explicit scope survives local presentation even with no foreground community', async () => {
  const f = fixture(); await f.displayAndroidNotificationEnvelope(envelope, 3, firstScope);
  assert.equal(f.shown.length, 1);
  assert.deepEqual(JSON.parse(f.shown[0].data.communityScope), firstScope);
  assert.equal(f.shown[0].title, 'ShadoChat');
  assert.equal(f.shown[0].body, 'Open ShadoChat to view your update.');
  assert.equal(f.shown[0].android.style, undefined); assert.equal(f.shown[0].android.largeIcon, undefined);
  assert.equal(JSON.parse(f.shown[0].data.envelopeV2).media, null);
});

test('unscoped Android presentation fails closed before any notification or badge mutation', async () => {
  const f = fixture(); await f.displayAndroidNotificationEnvelope(envelope, 9);
  assert.equal(f.shown.length, 0); assert.equal(f.cancelled.length, 0); assert.equal(f.badges.length, 0);
});

test('identical event and group IDs from different backends have distinct OS identifiers', async () => {
  const f = fixture();
  await f.displayAndroidNotificationEnvelope(envelope, 1, firstScope);
  await f.displayAndroidNotificationEnvelope(envelope, 1, otherScope);
  assert.notEqual(f.shown[0].id, f.shown[1].id);
  assert.notEqual(f.shown[0].android.groupId, f.shown[1].android.groupId);
});

test('group summaries cannot combine or read other-community children with matching logical group keys', async () => {
  const child = (scope, id) => ({ notification: { id, data: {
    groupKey: envelope.groupKey, communityScope: JSON.stringify(scope), envelopeV2: JSON.stringify({ ...envelope, eventId: id, eventIds: [id] }),
  } } });
  const f = fixture([child(firstScope, 'own-event'), child(otherScope, 'other-event')]);
  await f.reconcileAndroidNotificationGroups([envelope.groupKey], firstScope);
  assert.equal(f.shown.length, 0); // One own child cannot create a two-child summary.
  assert.equal(f.cancelled.length, 1); assert.ok(f.cancelled[0].startsWith(firstScope.projectRef));
});
