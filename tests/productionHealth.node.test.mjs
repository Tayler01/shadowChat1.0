import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const runHealthCheck = async env => {
  const child = spawn(process.execPath, ['scripts/check-production-health.mjs'], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
  const [code] = await once(child, 'close')
  return { code, stdout, stderr }
}

test('production health keeps app uptime active while News monitoring is paused', async t => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())

  const address = server.address()
  const result = await runHealthCheck({
    PRODUCTION_APP_URL: `http://127.0.0.1:${address.port}`,
    NEWS_MONITOR_ENABLED: 'false',
    MONITOR_SUPABASE_URL: '',
    MONITOR_SUPABASE_SERVICE_ROLE_KEY: '',
  })

  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /"app":200/)
  assert.match(result.stdout, /"newsMonitoring":"paused"/)
})

test('production health fails closed when News monitoring is enabled without credentials', async t => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())

  const address = server.address()
  const result = await runHealthCheck({
    PRODUCTION_APP_URL: `http://127.0.0.1:${address.port}`,
    NEWS_MONITOR_ENABLED: 'true',
    MONITOR_SUPABASE_URL: '',
    MONITOR_SUPABASE_SERVICE_ROLE_KEY: '',
  })

  assert.equal(result.code, 1)
  assert.match(result.stderr, /required for News freshness coverage/)
})

test('production health records a sanitized monitor snapshot with deployed build evidence', async t => {
  let recordedSnapshot = null
  const server = createServer(async (request, response) => {
    if (request.url === '/.well-known/shadowchat-health.json') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        schemaVersion: 1,
        buildId: 'release-sha',
        commitSha: 'release-sha',
        deployContext: 'production',
        pushPublicKeyConfigured: true,
      }))
      return
    }

    if (request.url?.startsWith('/rest/v1/operations_health_snapshot')) {
      let body = ''
      for await (const chunk of request) body += chunk
      recordedSnapshot = JSON.parse(body)
      response.writeHead(204)
      response.end()
      return
    }

    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => server.close())

  const address = server.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  const result = await runHealthCheck({
    PRODUCTION_APP_URL: baseUrl,
    MONITOR_SUPABASE_URL: baseUrl,
    MONITOR_SUPABASE_SERVICE_ROLE_KEY: 'eyJ.test-service-role',
    NEWS_MONITOR_ENABLED: 'false',
    OPERATIONS_HEALTH_COMMIT_SHA: 'release-sha',
  })

  assert.equal(result.code, 0, result.stderr)
  assert.equal(recordedSnapshot.environment, 'production')
  assert.equal(recordedSnapshot.frontend_sha, 'release-sha')
  assert.equal(recordedSnapshot.frontend_build_id, 'release-sha')
  assert.equal(recordedSnapshot.smoke_status, 'passed')
  assert.equal(recordedSnapshot.app_http_status, 200)
  assert.equal(recordedSnapshot.news_state, 'paused')
  assert.equal(recordedSnapshot.bridge_state, 'paused')
  assert.equal('service_key' in recordedSnapshot, false)
})
