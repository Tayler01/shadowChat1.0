const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const forge = require('node-forge');
const { verifyOrApply } = require('../scripts/apply-tooling-security.cjs');
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliPath = path.dirname(expoRequire.resolve('@expo/cli/package.json'));
const cliRequire = createRequire(path.join(cliPath, 'package.json'));

test('the installed forge matches the exact reviewed upstream structural backport', () => {
  assert.equal(verifyOrApply().advisory, 'GHSA-86w9-cpqp-85rv');
});

test('RSA valid signatures work while nested algorithm garbage is rejected', () => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 3 });
  const digest = forge.md.sha256.create().update('Synthetic release-security verification');
  const bytes = digest.digest().getBytes();
  assert.equal(keys.publicKey.verify(bytes, keys.privateKey.sign(digest)), true);
  const asn1 = forge.asn1;
  const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  for (const withNull of [false, true]) {
    const algorithm = [node(asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes())];
    if (withNull) algorithm.push(node(asn1.Type.NULL, false, ''));
    algorithm.push(node(asn1.Type.OCTETSTRING, false, 'unconsumed garbage'));
    const info = node(asn1.Type.SEQUENCE, true, [node(asn1.Type.SEQUENCE, true, algorithm), node(asn1.Type.OCTETSTRING, false, bytes)]);
    const malformed = forge.pki.rsa.encrypt(asn1.toDer(info).getBytes(), keys.privateKey, 0x01);
    assert.throws(() => keys.publicKey.verify(bytes, malformed), /DigestInfo/);
  }
});

test('the patched Zod version executes both actual Expo CLI schema consumers', () => {
  assert.equal(cliRequire('zod/package.json').version, '4.6.7');
  const { PluginSchema, DevToolsPluginOutputSchema } = require(path.join(cliPath, 'build/src/start/server/DevToolsPlugin.schema.js'));
  const { createMCPDevToolsExtensionSchema } = require(path.join(cliPath, 'build/src/start/server/createMCPDevToolsExtensionSchema.js'));
  const plugin = PluginSchema.parse({ packageName: 'synthetic-plugin', packageRoot: '/synthetic', cliExtensions: {
    description: 'Release test', entryPoint: 'index.js', commands: [{ name: 'inspect', title: 'Inspect', environments: ['cli', 'mcp'], parameters: [{ name: 'count', type: 'number' }] }],
  } });
  const command = createMCPDevToolsExtensionSchema(plugin);
  assert.equal(command.parse({ command: 'inspect', count: 2 }).count, 2);
  assert.equal(command.safeParse({ command: 'unknown' }).success, false);
  assert.equal(command.safeParse({ command: 'inspect', unexpected: true }).success, false);
  assert.equal(PluginSchema.safeParse({ packageName: '' }).success, false);
  assert.equal(DevToolsPluginOutputSchema.parse([{ type: 'text', text: 'ok', level: 'info' }])[0].text, 'ok');
});

test('oversized constrained collections reject before collecting per-item issues', () => {
  const { z } = cliRequire('zod');
  const result = z.array(z.string()).max(2).safeParse(new Array(100000).fill(42));
  assert.equal(result.success, false);
  assert.ok(result.error.issues.length <= 2);
});
