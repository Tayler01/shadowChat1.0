const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const now = Date.parse('2026-10-29T21:51:34.000Z');
class StrictIsoDate extends Date {
  static now() { return now; }
  static parse(value) { return /\.\d{4,}/.test(value) ? NaN : Date.parse(value); }
}
function load(file, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, URL, Date: StrictIsoDate, require: name => { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; } });
  return module.exports;
}
const parser = load('src/types/notification-envelope-v2.ts');
const route = '/?view=dms&conversation=b3b22b6b-193a-4913-8b50-594ee760d692&message=35e5e95f-437c-4854-b4c8-50dbc9c2f2fb';
const envelope = () => ({ schemaVersion: 2, eventId: 'event1', eventIds: ['event1'], type: 'dm_message', category: 'dm', entityId: 'message1', route, groupKey: 'dm:conversation1', priority: 'normal', privacy: 'private', actor: null,
  content: { eyebrow: 'Direct message', title: 'ShadowChat', body: null, privateTitle: 'ShadowChat', privateBody: 'Open ShadowChat to view it.' }, media: null, actions: ['open', 'mark_read'], soundId: 'shadow_whisper', androidChannelKey: 'messages_v1', badgeCategory: 'dm', autoRead: true,
  createdAt: '2026-10-29T21:50:27.029669+00:00', expiresAt: '2026-10-29T21:51:57.029669+00:00' });

test('actual PostgreSQL microsecond DM timestamps parse on a strict millisecond-only JS engine and retain exact DM target', () => {
  const value = envelope();
  assert.equal(StrictIsoDate.parse(value.expiresAt), NaN);
  assert.equal(parser.parseNotificationEnvelopeV2(value)?.route, route);
  assert.equal(value.expiresAt, '2026-10-29T21:51:57.029669+00:00');
  assert.equal(parser.notificationDateTimeMilliseconds(value.createdAt), Date.parse('2026-10-29T21:50:27.029+00:00'));
});

test('one through six fractional digits normalize; malformed timestamps and expired delivery remain rejected', () => {
  for (const fraction of ['1','12','123','1234','12345','123456']) assert.ok(Number.isFinite(parser.notificationDateTimeMilliseconds(`2026-10-29T21:50:27.${fraction}Z`)));
  for (const bad of ['tomorrow', '2026-10-29T21:50:27.1234567Z', null, '2026-10-29']) assert.ok(Number.isNaN(parser.notificationDateTimeMilliseconds(bad)));
  assert.equal(parser.parseNotificationEnvelopeV2({ ...envelope(), expiresAt: '2026-10-29T21:50:30.123456Z' }), null);
  assert.equal(parser.parseNotificationEnvelopeV2({ ...envelope(), route: '//foreign.example' }), null);
});

test('a cold-start notification waits for its community subscriber and cannot cross into another community', () => {
  const member = { community: { origin: 'https://member.example.com' } };
  const demo = { community: { origin: 'https://demo.example.com' } };
  let active = demo;
  const appRuntime = { streamlined: true, fallbackRoute: '/?view=chat', get origin() { return active.community.origin; } };
  const routes = load('src/lib/notifications/routes.ts', { '../appRuntime': { appRuntime } });
  const bridge = load('src/lib/nativeAppBridge.ts', {
    '../community/communityBindings': { requireCommunity: () => active }, './notifications/routes': routes,
    './nativeWebProtocol': { parseNativeWebMessage: () => null },
  });
  const received = [];
  bridge.publishNativeNotificationRoute(route);
  const unsubscribe = bridge.subscribeToNativeNotificationRoutes(url => received.push(url));
  assert.deepEqual(received, ['https://demo.example.com' + route]);
  unsubscribe();
  bridge.publishNativeNotificationRoute(route);
  active = member;
  bridge.subscribeToNativeNotificationRoutes(url => received.push(url));
  assert.equal(received.length, 1, 'old pending demo route must not be delivered to member subscriber');
});

test('an explicit late tap retains navigation while expired presentation stays suppressed and enrichment is discarded', () => {
  const value = { ...envelope(), expiresAt: '2026-10-29T21:50:30.123456Z', actor: { id: 'actor1', label: 'Synthetic member', avatarUrl: null } };
  assert.equal(parser.parseNotificationEnvelopeV2(value), null);
  const opened = parser.parseNotificationEnvelopeV2(value, { interaction: true });
  assert.equal(opened.route, route);
  assert.equal(opened.actor, null);
  assert.equal(opened.media, null);
  assert.equal(parser.parseNotificationEnvelopeV2({ ...value, createdAt: '2026-10-29T22:50:27.029669Z', expiresAt: '2026-10-29T23:50:27.029669Z' }, { interaction: true }), null);
  assert.equal(parser.parseNotificationEnvelopeV2({ ...value, expiresAt: value.createdAt }, { interaction: true }), null);
  assert.equal(parser.parseNotificationEnvelopeV2({ ...value, schemaVersion: 3 }, { interaction: true }), null);
});


test('repeated identical DM tap advances the native WebView key even after SPA navigation away', () => {
  const routes = load('src/lib/notifications/routes.ts', { '../appRuntime': { appRuntime: { origin: 'https://demo.example.com', streamlined: true } } });
  const url = 'https://demo.example.com' + route;
  const first = routes.nextNotificationNavigationTarget(null, url);
  const repeated = routes.nextNotificationNavigationTarget(first, url);
  assert.equal(first.url, repeated.url);
  assert.notEqual(first.revision, repeated.revision);
  assert.equal(routes.nextNotificationNavigationTarget(null, url).revision, 1);
});
