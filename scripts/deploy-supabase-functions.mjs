import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'supabase', 'function-manifest.json')
const functionsRoot = path.join(root, 'supabase', 'functions')

export const loadFunctionManifest = () => JSON.parse(readFileSync(manifestPath, 'utf8'))

const names = entries => entries.map(entry => entry.name)

export const validateFunctionManifest = manifest => {
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported function manifest schema: ${manifest.schemaVersion}`)
  }

  const groups = ['active', 'pausedDeny', 'pausedRemove']
  const entries = groups.flatMap(group => {
    if (!Array.isArray(manifest[group])) throw new Error(`Manifest group ${group} must be an array`)
    return manifest[group]
  })
  const manifestNames = names(entries)
  const duplicateNames = manifestNames.filter((name, index) => manifestNames.indexOf(name) !== index)
  if (duplicateNames.length > 0) {
    throw new Error(`Duplicate function manifest entries: ${[...new Set(duplicateNames)].join(', ')}`)
  }

  for (const entry of entries) {
    if (!entry?.name || typeof entry.verifyJwt !== 'boolean') {
      throw new Error(`Invalid function manifest entry: ${JSON.stringify(entry)}`)
    }
    const entrypoint = path.join(functionsRoot, entry.name, 'index.ts')
    if (!existsSync(entrypoint)) throw new Error(`Missing Edge Function entrypoint: ${entry.name}`)
  }

  const localNames = readdirSync(functionsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== '_shared')
    .map(entry => entry.name)
    .sort()
  const expectedNames = [...manifestNames].sort()
  if (JSON.stringify(localNames) !== JSON.stringify(expectedNames)) {
    const missing = localNames.filter(name => !manifestNames.includes(name))
    const stale = manifestNames.filter(name => !localNames.includes(name))
    throw new Error(
      `Function manifest mismatch. Unclassified local: ${missing.join(', ') || 'none'}; missing local: ${stale.join(', ') || 'none'}`
    )
  }

  for (const name of names(manifest.pausedDeny)) {
    const source = readFileSync(path.join(functionsRoot, name, 'index.ts'), 'utf8')
    const gateIndex = source.indexOf('requireBridgeApiEnabled()')
    if (gateIndex < 0) throw new Error(`Paused bridge function lacks default-deny gate: ${name}`)

    const sideEffectIndices = [
      source.indexOf('authenticateRequest('),
      source.indexOf('getSupabaseAdmin('),
      source.indexOf('readJson<'),
      source.indexOf('await req.json('),
    ].filter(index => index >= 0)
    if (sideEffectIndices.some(index => gateIndex > index)) {
      throw new Error(`Paused bridge gate runs after request work: ${name}`)
    }
  }

  return manifest
}

const run = (args, options = {}) => execFileSync('supabase', args, {
  cwd: root,
  encoding: 'utf8',
  stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  env: process.env,
})

const parseJsonCommand = args => {
  const output = run(args, { capture: true })
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error(`Supabase command did not return JSON: supabase ${args.join(' ')}\n${error.message}`)
  }
}

export const verifyRemoteFunctionInventory = (manifest, remoteFunctions) => {
  const expected = [...names(manifest.active), ...names(manifest.pausedDeny)].sort()
  const remote = remoteFunctions
    .filter(entry => entry.status === 'ACTIVE')
    .map(entry => entry.name ?? entry.slug)
    .sort()

  if (JSON.stringify(remote) !== JSON.stringify(expected)) {
    const unexpected = remote.filter(name => !expected.includes(name))
    const missing = expected.filter(name => !remote.includes(name))
    throw new Error(
      `Remote function drift. Unexpected: ${unexpected.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}`
    )
  }

  const expectedJwt = new Map(
    [...manifest.active, ...manifest.pausedDeny].map(entry => [entry.name, entry.verifyJwt])
  )
  const jwtDrift = remoteFunctions
    .filter(entry => expectedJwt.has(entry.name ?? entry.slug))
    .filter(entry => entry.verify_jwt !== expectedJwt.get(entry.name ?? entry.slug))
    .map(entry => entry.name ?? entry.slug)
  if (jwtDrift.length > 0) {
    throw new Error(`Remote verify_jwt drift: ${jwtDrift.join(', ')}`)
  }
}

export const verifyBridgeAuthHoldQueryResult = result => {
  const activeSessions = Number(result?.rows?.[0]?.active_sessions)
  if (!Number.isInteger(activeSessions)) {
    throw new Error('Bridge Auth session verification returned an invalid result')
  }
  if (activeSessions !== 0) {
    throw new Error(`Bridge Auth hold incomplete: ${activeSessions} session(s) remain`)
  }
}

const deploy = manifest => {
  const projectRef = process.env.SUPABASE_PROJECT_ID?.trim()
  if (!projectRef) throw new Error('SUPABASE_PROJECT_ID is required')
  if (!process.env.SUPABASE_ACCESS_TOKEN?.trim()) throw new Error('SUPABASE_ACCESS_TOKEN is required')

  const secretEntries = parseJsonCommand([
    'secrets', 'list', '--project-ref', projectRef, '--output', 'json',
  ])
  if (secretEntries.some(entry => entry.name === 'BRIDGE_API_ENABLED')) {
    run(['secrets', 'unset', 'BRIDGE_API_ENABLED', '--project-ref', projectRef])
  }

  const deployGroup = entries => {
    if (entries.length === 0) return
    run([
      'functions', 'deploy',
      ...names(entries),
      '--project-ref', projectRef,
      '--use-api',
      '--jobs', '4',
    ])
  }

  deployGroup(manifest.active)
  deployGroup(manifest.pausedDeny)

  const beforeDelete = parseJsonCommand([
    'functions', 'list', '--project-ref', projectRef, '--output', 'json',
  ])
  const deployedNames = new Set(beforeDelete.map(entry => entry.name ?? entry.slug))
  for (const entry of manifest.pausedRemove) {
    if (deployedNames.has(entry.name)) {
      run(['functions', 'delete', entry.name, '--project-ref', projectRef])
    }
  }

  const remoteFunctions = parseJsonCommand([
    'functions', 'list', '--project-ref', projectRef, '--output', 'json',
  ])
  verifyRemoteFunctionInventory(manifest, remoteFunctions)
  console.log(
    `Supabase function release aligned: ${manifest.active.length} active, `
    + `${manifest.pausedDeny.length} deny-paused, ${manifest.pausedRemove.length} removed.`
  )
}

const verifyBridgeAuthHold = () => {
  const query = [
    'select count(*)::integer as active_sessions',
    'from auth.sessions sessions',
    'where sessions.user_id in (',
    'select devices.bridge_user_id from public.bridge_devices devices',
    'where devices.bridge_user_id is not null',
    ');',
  ].join(' ')
  const result = parseJsonCommand(['db', 'query', '--linked', query])
  verifyBridgeAuthHoldQueryResult(result)
  console.log('Bridge Auth hold verified: no dedicated bridge sessions remain.')
}

const manifest = validateFunctionManifest(loadFunctionManifest())
if (process.argv.includes('--deploy')) deploy(manifest)
else if (process.argv.includes('--verify-bridge-auth-hold')) verifyBridgeAuthHold()
else console.log(`Supabase function manifest valid: ${names([
  ...manifest.active,
  ...manifest.pausedDeny,
  ...manifest.pausedRemove,
]).length} classified functions.`)
