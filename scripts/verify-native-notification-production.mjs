import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'

// A brand-new owned database in the existing LOCAL Supabase Postgres container.
// No source database rows, provider requests, credentials or cron workers copied.
const container = process.env.NATIVE_QA_POSTGRES_CONTAINER || 'supabase_db_chat2-0'
if (!/^supabase_db_[a-zA-Z0-9_-]+$/.test(container)) throw new Error('Expected an existing local Supabase DB container')
const database = `sc_native_prod_${randomUUID().replaceAll('-', '').slice(0, 12)}`
const artifactDir = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ||
  'output/release-evidence/native-notification-repair-20261030/production-rollout-20261102')
fs.mkdirSync(artifactDir, { recursive: true })
const psql = (db, sql) => spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', db,
  '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8', maxBuffer: 8_000_000 })
const must = (result, label) => {
  if (result.error || result.status !== 0) throw new Error(`${label}: ${(result.stderr || result.error?.message || '').slice(-2_000)}`)
  return result.stdout
}
const receipt = { database, container, startedAt: new Date().toISOString(), schemaOnly: true,
  sourceRowsCopied: 0, providerRequests: 0, productionWrites: 0, cleanupVerified: false }
let created = false
try {
  execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', container], { stdio: 'pipe' })
  must(psql('postgres', `create database ${database};`), 'Create isolated native QA database')
  created = true
  const base = fs.readFileSync('tests/fixtures/native-notification-production-base.sql', 'utf8')
  const migration = fs.readFileSync('supabase/migrations/20261102010152_bounded_native_production_audience.sql', 'utf8')
  const setup = psql(database, `${base}\n${migration}`)
  fs.writeFileSync(path.join(artifactDir, 'production-sql-setup.log'), setup.stdout + setup.stderr)
  must(setup, 'Native fixture/migration setup')
  const tests = psql(database, fs.readFileSync('tests/sql/native-notification-production.sql', 'utf8'))
  fs.writeFileSync(path.join(artifactDir, 'production-sql-tests.log'), tests.stdout + tests.stderr)
  const output = must(tests, 'Native twenty-recipient SQL tests')
  receipt.metrics = output.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line))
  receipt.passed = output.includes('PASS production20 fanout;2x5-call bursts/10s recovery;receipt fairness;eligibility;revocation;no-replay/idle')
  if (!receipt.passed) throw new Error('Expected native production acceptance marker missing')
} catch (error) {
  receipt.passed = false
  receipt.error = error.message
  process.exitCode = 1
} finally {
  if (created) {
    if (!/^sc_native_prod_[a-f0-9]{12}$/.test(database) || database === 'postgres') throw new Error('Unsafe isolated DB cleanup target')
    const active = must(psql('postgres', `select count(*) from pg_stat_activity where datname='${database}';`), 'Isolated DB connection check').trim()
    if (active === '0') {
      must(psql('postgres', `drop database ${database};`), 'Drop exact owned native QA database')
      receipt.cleanupVerified = must(psql('postgres', `select count(*) from pg_database where datname='${database}';`), 'Verify DB cleanup').trim() === '0'
    } else {
      receipt.cleanupError = 'Owned DB still has connections; did not terminate another session'
      process.exitCode = 1
    }
  }
  receipt.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(artifactDir, 'production-sql-receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify(receipt))
}
