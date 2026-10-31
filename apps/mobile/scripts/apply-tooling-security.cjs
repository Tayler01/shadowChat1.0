const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');

// Upstream 1.4.2 includes the security fixes and restores PEM Buffer support.
// Keep the install hook as a verification gate; do not modify upstream source.
const upstreamSha256 = '6632e195295ce76f6bb9131ee770dcd6cc1ee4ffac7906302208b00faf95a87f';
function verifyOrApply() {
  const metadata = require('node-forge/package.json');
  assert.equal(metadata.version, '1.4.2', 'Review the forge verification gate when the package changes.');
  const source = fs.readFileSync(require.resolve('node-forge/lib/rsa'), 'utf8').replace(/\r\n/g, '\n');
  const digest = crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(digest, upstreamSha256, 'Installed forge source differs from the reviewed upstream release.');
  return { version: metadata.version, upstreamSha256: digest, advisory: 'GHSA-86w9-cpqp-85rv', upstreamFixed: true };
}
module.exports = { verifyOrApply };
if (require.main === module) console.log(JSON.stringify(verifyOrApply()));
