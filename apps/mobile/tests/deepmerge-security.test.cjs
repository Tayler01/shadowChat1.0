'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const configRequire = createRequire(require.resolve('@expo/config/package.json'));
const merge = configRequire('deepmerge');
const vendor = path.join(root, 'vendor/deepmerge-safe-cjs');
const source = fs.readFileSync(path.join(vendor, 'index.cjs'), 'utf8').replace(/\r\n/g, '\n');
const hash = text => createHash('sha256').update(text).digest('hex');
const targetGuard = "\t\t\tif (key === '__proto__') return\n";
const sourceGuard = "if (key === '__proto__' || propertyIsUnsafe(target, key))";
const original = source.replace(targetGuard, '').replace(sourceGuard, 'if (propertyIsUnsafe(target, key))');
const originalModule = { exports: {} };
new Function('module', original)(originalModule);
const upstreamMerge = originalModule.exports;
const poison = () => JSON.parse('{"__proto__":{"unexpectedAdmin":true}}');

function assertSafe(object) {
  assert.equal(Object.getPrototypeOf(object), Object.prototype);
  assert.equal(Object.hasOwn(object, '__proto__'), false);
  assert.equal(object.unexpectedAdmin, undefined);
  assert.equal(({}).unexpectedAdmin, undefined);
}

test('Expo resolves only the integrity-pinned guarded CJS adaptation', () => {
  assert.equal(hash(source), 'f30c7f31ea7f1f2d13662769030826bf3bffc9116c403ee5ef3d2f9226b37bc2');
  assert.equal(hash(original), '2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d');
  assert.equal(hash(fs.readFileSync(path.join(vendor, 'LICENSE'), 'utf8').replace(/\r\n/g,'\n')), '6cfc4687cb2f2d86f4a77e6b526290d3878e5e512f3fec2f4cb36a9cb36f798b');
  assert.equal(fs.readFileSync(configRequire.resolve('deepmerge'), 'utf8').replace(/\r\n/g, '\n'), source);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const all = Object.entries(lock.packages).filter(([name]) => /(?:^|\/)node_modules\/deepmerge$/.test(name));
  assert.equal(all.length, 1);
  assert.equal(all[0][1].name, '@shadowchat/deepmerge-safe-cjs');
  assert.equal(all[0][1].version, '0.0.0');
  assert.match(all[0][1].integrity, /^sha512-/);
  assert.equal(all[0][1].link, undefined);
});

test('the advisory reproduction poisons the original version and is blocked by the installed fix', () => {
  assert.equal(upstreamMerge(Object.create(null), poison()).unexpectedAdmin, true);
  assertSafe(merge(Object.create(null), poison()));
  assert.equal(upstreamMerge({ session: null }, { session: poison() }).session.unexpectedAdmin, true);
  for (const placeholder of [null, undefined, 0, false, '']) {
    assertSafe(merge({ session: placeholder }, { session: poison() }).session);
  }
});

test('target copy and own enumerable prototype properties cannot bypass the guards', () => {
  assert.equal(upstreamMerge(poison(), {}).unexpectedAdmin, true);
  assertSafe(merge(poison(), {}));
  assertSafe(merge(poison(), poison()));
  assertSafe(merge({ nested: poison() }, { nested: poison() }).nested);
  assertSafe(merge.all([poison(), poison()]));
  assertSafe(merge({}, { list: [poison()] }).list[0]);
  const shadowed = Object.create(null);
  Object.defineProperty(shadowed, '__proto__', { value: { unexpectedAdmin: true }, enumerable: true });
  assertSafe(merge(shadowed, poison()));
});

test('ordinary Expo configuration merging preserves arrays, nested values, and symbol keys', () => {
  const symbol = Symbol('metadata');
  const left = { ios: { infoPlist: { UIBackgroundModes: ['remote-notification'] } }, extra: { first: true }, [symbol]: { a: 1 } };
  const right = { ios: { infoPlist: { UIBackgroundModes: ['audio'], NSCameraUsageDescription: 'Share photos' } }, extra: { second: true }, [symbol]: { b: 2 } };
  assert.deepEqual(merge(left, right), upstreamMerge(left, right));
  assert.deepEqual(merge(left, right).ios.infoPlist.UIBackgroundModes, ['remote-notification', 'audio']);
  assert.deepEqual(left.ios.infoPlist.UIBackgroundModes, ['remote-notification']);
});

test('custom merge, array merge, clone and special values retain upstream behavior', () => {
  const object = { x: 1 };
  assert.equal(merge({}, { object }, { clone: false }).object, object);
  const date = new Date('2026-10-28T00:00:00Z');
  assert.equal(merge({}, { date }).date, date);
  assert.deepEqual(merge({ values: [1] }, { values: [2] }, { arrayMerge: (_a,b) => b }), { values: [2] });
  const customMerge = key => key === 'name' ? (a,b) => `${a.first} ${b.last}` : undefined;
  assert.deepEqual(merge({ name: { first: 'First' } }, { name: { last: 'Last' } }, { customMerge }), { name: 'First Last' });
});
