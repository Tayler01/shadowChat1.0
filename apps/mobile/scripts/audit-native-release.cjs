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
assert.deepEqual(Object.keys(vulnerabilities), [], 'Production dependencies must have no audit advisories.');
console.log(JSON.stringify({ status: 'passed', rawAudit: report.metadata.vulnerabilities,
  upstreamFix: patch, mitigated: [], regressionTestsPassed: true }, null, 2));
