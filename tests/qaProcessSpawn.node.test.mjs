import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

for (const script of ['mobile-pwa-visual-qa', 'shadow-runner-phone-smoke', 'shadow-war-visual-playtest']) {
  test(`${script} passes shell metacharacters as literal child arguments`, async () => {
    const source = await readFile(new URL(`../scripts/${script}.mjs`, import.meta.url), 'utf8')
    const parsed = ts.createSourceFile(`${script}.mjs`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'spawnCli')
    assert.ok(declaration, 'Exercise the actual QA process launcher')
    const launch = vm.runInNewContext(`(${declaration.getText(parsed)})`, { spawn })
    const literalArguments = ['C:\\QA & echo injected\\preview.js', '%PATH%', '$(echo injected)', '!PATH!', '^&|;']
    const child = launch(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', ...literalArguments], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Even a caller-supplied option must not turn this launcher into a shell.
      shell: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    assert.equal(code, 0, stderr)
    assert.deepEqual(JSON.parse(stdout), literalArguments)
  })
}
