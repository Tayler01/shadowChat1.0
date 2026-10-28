const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { verifyOrApply } = require('./apply-tooling-security.cjs');

const patch = verifyOrApply();
const regression = spawnSync(process.execPath, ['--test', 'tests/tooling-security.test.cjs', 'tests/deepmerge-security.test.cjs'], { cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8' });
assert.equal(regression.status, 0, regression.stdout + regression.stderr);
const npmCli = process.env.npm_execpath || path.resolve(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
assert.ok(require('node:fs').existsSync(npmCli), 'Run this verifier through npm run audit:release.');
const audit = spawnSync(process.execPath, [npmCli, 'audit', '--omit=dev', '--json'], {
  cwd: path.resolve(__dirname, '..'), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
assert.ifError(audit.error);
assert.ok(audit.status === 0 || audit.status === 1, 'npm audit failed to produce a vulnerability result.');
const report = JSON.parse(audit.stdout);
assert.ok(!report.error && report.metadata?.vulnerabilities, 'npm audit returned an error.');
const vulnerabilities = report.vulnerabilities || {};
const expectedUrl = 'https://github.com/advisories/GHSA-86w9-cpqp-85rv';
function accountedFor(name, visited = new Set()) {
  assert.ok(!visited.has(name), 'Unexpected cyclic audit chain.');
  const issue = vulnerabilities[name];
  assert.ok(issue && issue.via.length > 0, `Unclassified audit issue: ${name}`);
  for (const cause of issue.via) {
    if (typeof cause === 'string') accountedFor(cause, new Set([...visited, name]));
    else {
      assert.equal(cause.name, 'node-forge', `Unreviewed advisory in ${name}`);
      assert.equal(cause.url, expectedUrl, `Unreviewed advisory in ${name}`);
      assert.equal(cause.range, '<=1.4.0', 'The forge advisory changed; review required.');
      assert.deepEqual(issue.nodes, ['node_modules/node-forge'], 'An additional forge installation needs its own verified patch.');
    }
  }
}
for (const name of Object.keys(vulnerabilities)) accountedFor(name);
console.log(JSON.stringify({ status: 'passed', rawAudit: report.metadata.vulnerabilities,
  mitigated: Object.keys(vulnerabilities).length ? [patch] : [], regressionTestsPassed: true }, null, 2));
