import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const functionsRoot = path.join(root, 'supabase/functions')
const sharedSource = readFileSync(
  path.join(functionsRoot, '_shared/bridge.ts'),
  'utf8',
)

const bridgeFunctionNames = readdirSync(functionsRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && entry.name.startsWith('bridge-'))
  .map(entry => entry.name)
  .sort()

const compact = (source: string) => source.replace(/\s+/g, ' ').toLowerCase()

describe('ESP Bridge server-side feature pause', () => {
  it('defaults to a stable 503 response unless BRIDGE_API_ENABLED is literal true', () => {
    const source = compact(sharedSource)

    expect(source).toContain("deno.env.get('bridge_api_enabled') === 'true'")
    expect(source).toContain("error: 'esp bridge is temporarily paused'")
    expect(source).toContain("code: 'feature_paused'")
    expect(source).toContain('}, 503)')
  })

  it('discovers the preserved bridge endpoint set', () => {
    expect(bridgeFunctionNames).toEqual([
      'bridge-dm-poll',
      'bridge-dm-send',
      'bridge-group-poll',
      'bridge-group-send',
      'bridge-heartbeat',
      'bridge-pairing-approve',
      'bridge-pairing-begin',
      'bridge-pairing-revoke',
      'bridge-pairing-status',
      'bridge-register',
      'bridge-session-exchange',
      'bridge-session-refresh',
      'bridge-update-check',
      'bridge-user-profile',
      'bridge-user-search',
    ])
  })

  it.each(bridgeFunctionNames)(
    '%s checks the pause before auth, database, parsing, or other side effects',
    functionName => {
      const source = compact(readFileSync(
        path.join(functionsRoot, functionName, 'index.ts'),
        'utf8',
      ))
      const handlerStart = source.indexOf('serve(async req => {')
      const handler = source.slice(handlerStart)
      const optionsIndex = handler.indexOf("if (req.method === 'options')")
      const gateIndex = handler.indexOf('const featurepauseresponse = requirebridgeapienabled()')
      const methodIndex = handler.indexOf("if (req.method !== 'post')")
      const sideEffectIndexes = [
        'await readjson',
        'authenticaterequest(',
        'authenticatebridgeaccesstoken(',
        'getsupabaseadmin(',
        'await fetch(',
        ".from('",
        '.rpc(',
      ]
        .map(marker => handler.indexOf(marker))
        .filter(index => index >= 0)

      expect(handlerStart).toBeGreaterThanOrEqual(0)
      expect(source).toContain('requirebridgeapienabled,')
      expect(optionsIndex).toBeGreaterThanOrEqual(0)
      expect(gateIndex).toBeGreaterThan(optionsIndex)
      expect(methodIndex).toBeGreaterThan(gateIndex)
      expect(sideEffectIndexes.length).toBeGreaterThan(0)
      expect(gateIndex).toBeLessThan(Math.min(...sideEffectIndexes))
    },
  )
})
