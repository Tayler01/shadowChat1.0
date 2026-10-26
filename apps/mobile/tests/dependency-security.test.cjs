'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const test = require('node:test');

const project = path.resolve(__dirname, '..');
const vendor = path.join(project, 'vendor/decode-uri-component-cjs');
const queryRequire = createRequire(require.resolve('query-string'));
const decode = queryRequire('decode-uri-component');
const hash = (text) => createHash('sha256').update(text).digest('hex');

test('the production query-string dependency resolves to the compatibility decoder', () => {
  const installedSource = fs.readFileSync(queryRequire.resolve('decode-uri-component'), 'utf8');
  assert.equal(installedSource.replace(/\r\n/g, '\n'),
    fs.readFileSync(path.join(vendor, 'index.cjs'), 'utf8').replace(/\r\n/g, '\n'));
  assert.equal(typeof decode, 'function');
  assert.equal(decode('hello%20world'), 'hello world');
  assert.throws(() => decode(null), TypeError);
  assert.throws(() => decode({}), TypeError);
});

test('the security algorithm is exactly upstream 0.5.0 with only the CJS export changed', () => {
  const source = fs.readFileSync(path.join(vendor, 'index.cjs'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(hash(source), '684ba79779327ba789733a3a563050370a928a57eb7dd33d19b346f43b32cbb7');
  const upstream = source.replace('module.exports = function decodeUriComponent(encodedURI) {',
    'export default function decodeUriComponent(encodedURI) {');
  assert.equal(hash(upstream), '9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa');
  assert.equal(hash(fs.readFileSync(path.join(vendor, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n')),
    'ed7a9a0f74e43951b2520efe1a4349cb9ed5f3dff0b0f268e2e51a4d38df7ea4');
});

test('ordinary and adversarial Expo deep links finish within a bounded process', () => {
  const child = spawnSync(process.execPath, ['-e',
    'require("./tests/fixtures/dependency-security-entry.cjs"); process.stdout.write(JSON.stringify(globalThis.__SHADOWCHAT_DEPENDENCY_SECURITY_RESULT__));'], {
    cwd: project,
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { passed: true, assertions: 15 });
});

test('the installed native build chain no longer contains vulnerable image-size or shell-quote', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(project, 'package-lock.json'), 'utf8'));
  const packages = Object.entries(lock.packages);
  const decoder = lock.packages['node_modules/decode-uri-component'];
  assert.equal(decoder.name, '@shadowchat/decode-uri-component-cjs');
  assert.equal(decoder.version, '0.0.0');
  assert.equal(decoder.link, undefined);
  assert.match(decoder.integrity, /^sha512-/);
  assert.equal(packages.some(([name]) => /(?:^|\/)node_modules\/image-size$/.test(name)), false);
  const shells = packages.filter(([name]) => /(?:^|\/)node_modules\/shell-quote$/.test(name));
  assert.ok(shells.length > 0);
  for (const [, dependency] of shells) {
    const [major, minor] = dependency.version.split('.').map(Number);
    assert.ok(major > 1 || (major === 1 && minor >= 12), dependency.version);
  }
});
