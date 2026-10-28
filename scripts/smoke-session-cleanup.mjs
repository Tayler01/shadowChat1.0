import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import path from 'node:path'

function isInside(parent, child) {
  const relative = path.relative(parent, child)
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

// Each invocation owns a new profile; never reuse an earlier run's credentials.
export async function createOwnedSmokeProfile(workspace, artifactDir) {
  const root = await realpath(workspace)
  const resolvedArtifactDir = await realpath(artifactDir)
  if (!isInside(root, resolvedArtifactDir)) throw new Error('Smoke artifact directory is outside the workspace')
  const profiles = path.join(resolvedArtifactDir, 'profiles')
  await mkdir(profiles, { recursive: true })
  const resolvedProfiles = await realpath(profiles)
  if (!isInside(root, resolvedProfiles)) throw new Error('Smoke profile root is outside the workspace')
  const directory = await mkdtemp(path.join(resolvedProfiles, 'run-'))
  const info = await lstat(directory)
  return { root, profiles: resolvedProfiles, directory, dev: info.dev, ino: info.ino }
}

export async function removeOwnedSmokeProfile(profile) {
  const info = await lstat(profile.directory)
  const resolved = await realpath(profile.directory)
  if (!info.isDirectory() || info.isSymbolicLink() || info.dev !== profile.dev || info.ino !== profile.ino ||
      resolved !== profile.directory || !isInside(profile.root, resolved) ||
      path.dirname(resolved) !== profile.profiles) {
    throw new Error('Smoke profile ownership or workspace containment changed')
  }
  await rm(profile.directory, { recursive: true })
}

// Keep credentials in memory and revoke only sessions created by this run.
export function redactSmokeAccounts(accounts) {
  const keys = ['id', 'label', 'strategy', 'email', 'username', 'displayName']
  return accounts.map(account => Object.fromEntries(
    keys.filter(key => account[key] !== undefined).map(key => [key, account[key]]),
  ))
}

function claims(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function createSmokeSessionCleanup({ supabaseUrl, fetchImpl = fetch }) {
  const origin = new URL(supabaseUrl).origin
  const owned = new Map()
  let pending = Promise.resolve()
  let captureErrors = 0

  function trackContext(context, account) {
    context.on('response', response => {
      // Process in arrival order so refreshes cannot outrun their initial grant.
      pending = pending.then(async () => {
        const url = new URL(response.url())
        if (url.origin !== origin || response.status() < 200 || response.status() >= 300) return
        const password = url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password'
        const signup = url.pathname === '/auth/v1/signup'
        const refresh = url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token'
        if (!password && !signup && !refresh) return

        const body = await response.json()
        const data = body.session || body
        const token = data.access_token
        const user = body.user || data.user
        if (!token || !user || user.email?.toLowerCase() !== account.email?.toLowerCase() ||
            (account.id && user.id !== account.id)) return
        const decoded = claims(token)
        if (!decoded?.session_id || decoded.sub !== user.id || decoded.role !== 'authenticated') return
        if (refresh && !owned.has(decoded.session_id)) return

        const apikey = (await response.request().allHeaders()).apikey
        if (!apikey || !(apikey.startsWith('sb_publishable_') || claims(apikey)?.role === 'anon')) {
          throw new Error('Unsafe auth key')
        }
        const previous = owned.get(decoded.session_id)
        if (previous && previous.userId !== user.id) throw new Error('Session owner mismatch')
        owned.set(decoded.session_id, { userId: user.id, accessToken: token, apikey })
      }).catch(() => { captureErrors += 1 })
    })
  }

  async function cleanup() {
    await pending
    const report = { capturedSessions: owned.size, revokedSessions: 0, captureErrors, failures: 0, scope: 'local' }
    for (const session of owned.values()) {
      try {
        const headers = { apikey: session.apikey, Authorization: `Bearer ${session.accessToken}` }
        const response = await fetchImpl(`${origin}/auth/v1/user`, { headers, signal: AbortSignal.timeout(15000) })
        if (!response.ok || (await response.json()).id !== session.userId) throw new Error('Cannot verify session owner')
        const logout = await fetchImpl(`${origin}/auth/v1/logout?scope=local`, {
          method: 'POST', headers, signal: AbortSignal.timeout(15000),
        })
        if (!logout.ok) throw new Error('Local signout failed')
        report.revokedSessions += 1
      } catch {
        report.failures += 1
      }
    }
    owned.clear()
    report.verified = report.failures === 0 && captureErrors === 0
    return report
  }

  return { trackContext, cleanup, drain: () => pending }
}
