import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'

// Generate a short-lived test CA locally; never disable TLS verification.
const temporaryRoot = resolve(tmpdir())
const temporary = mkdtempSync(join(temporaryRoot, 'shadowchat-safe-fetch-'))
const cert = join(temporary, 'fixture-cert.pem')
const key = join(temporary, 'fixture-key.pem')
const windowsOpenSsl = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe'
const openssl = process.platform === 'win32' && existsSync(windowsOpenSsl) ? windowsOpenSsl : 'openssl'
try {
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2',
    '-subj', '/CN=fixture.example', '-addext', 'subjectAltName=DNS:fixture.example',
    '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'extendedKeyUsage=serverAuth',
    '-keyout', key, '-out', cert], { stdio: 'pipe' })
  const result = spawnSync('deno', ['test', '--no-config', '--no-lock', `--cert=${cert}`, '--allow-net',
    `--allow-read=${temporary}`, '--allow-env=SAFE_FETCH_TEST_CERT,SAFE_FETCH_TEST_KEY,SAFE_FETCH_PUBLIC_TESTS',
    'tests/safeFetchTransport.deno.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, SAFE_FETCH_TEST_CERT: cert, SAFE_FETCH_TEST_KEY: key, SAFE_FETCH_PUBLIC_TESTS: process.argv.includes('--public') ? 'true' : 'false' },
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  const target = resolve(temporary)
  if (!target.startsWith(`${temporaryRoot}${sep}`) || !basename(target).startsWith('shadowchat-safe-fetch-')) throw new Error('Unsafe test cleanup path.')
  rmSync(target, { recursive: true, force: true })
}
