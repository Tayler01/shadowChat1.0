const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');

const originalSha256 = 'fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50';
const before = 'obj.value.length !== 2) {';
const after = "obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              (('parameters' in capture) ? 2 : 1)) {";
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function verifyOrApply({ apply = false } = {}) {
  const metadata = require('node-forge/package.json');
  assert.equal(metadata.version, '1.4.0', 'Review/remove the forge backport when the package changes.');
  const file = require.resolve('node-forge/lib/rsa');
  const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (source.includes(after)) {
    assert.equal(source.split(after).length, 2, 'Unexpected forge patch count.');
    assert.equal(hash(source.replace(after, before)), originalSha256, 'Installed forge source differs from the reviewed patch.');
    return { version: metadata.version, patchedSha256: hash(source), advisory: 'GHSA-86w9-cpqp-85rv' };
  }
  assert.ok(apply, 'The required node-forge security backport is absent.');
  assert.equal(hash(source), originalSha256, 'Refusing to patch unreviewed forge source.');
  assert.equal(source.split(before).length, 2, 'Unexpected forge patch location.');
  fs.writeFileSync(file, source.replace(before, after));
  return verifyOrApply();
}

module.exports = { verifyOrApply, before, after, originalSha256 };
if (require.main === module) console.log(JSON.stringify(verifyOrApply({ apply: true })));
