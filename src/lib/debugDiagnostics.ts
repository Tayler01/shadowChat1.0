import {
  getWorkingClient,
  getStoredRefreshToken,
  localStorageKey,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  recreateSupabaseClient,
  forceSessionRestore
} from './supabase'

export const appendSupabaseInfo = (append: (msg: string) => void) => {
  append('📋 Supabase Configuration:')
  append(`URL: ${SUPABASE_URL}`)
  append(`Anon Key: ${SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 20)}...` : 'Not set'}`)
  append(`Local Storage Key: ${localStorageKey}`)
  append('---')
}

export const runAuthDiagnostics = async (append: (msg: string) => void) => {
  appendSupabaseInfo(append)

  append('🔍 Testing Supabase client responsiveness...')
  try {
    const workingClient = await getWorkingClient()
    const testPromise = workingClient.from('users').select('id').limit(1)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Client responsiveness timeout')), 3000)
    )
    await Promise.race([testPromise, timeoutPromise])
    append('✅ Main client is responsive')

    append('🔍 Testing simple database query...')
    try {
      const queryPromise = workingClient.from('users').select('id').limit(1)
      const queryTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), 5000)
      )
      const { error } = (await Promise.race([queryPromise, queryTimeout])) as any
      if (error) {
        append(`❌ Database query failed: ${error.message}`)
      } else {
        append('✅ Database query succeeded')
      }
    } catch (queryError) {
      append(`❌ Database query timeout: ${(queryError as Error).message}`)
    }
  } catch {
    append('❌ Main client is unresponsive')
    append('🔄 Testing client reset...')
    try {
      const freshClient = await recreateSupabaseClient()
      const resetTestPromise = freshClient.from('users').select('id').limit(1)
      const resetTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Reset client timeout')), 5000)
      )
      await Promise.race([resetTestPromise, resetTimeoutPromise])
      append('✅ Client responsive after reset!')
      const { error } = await freshClient.from('users').select('id').limit(1)
      if (error) {
        append(`❌ Reset client query failed: ${error.message}`)
      } else {
        append('✅ Reset client query succeeded')
      }
    } catch (resetError) {
      append(`❌ Client reset error: ${(resetError as Error).message}`)
    }
  }

  append('🌐 Testing network connectivity...')
  try {
    const networkTest = fetch('https://httpbin.org/status/200', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000)
    })
    const networkResult = await networkTest
    append(`✅ Network test: SUCCESS (${networkResult.status})`)
  } catch (err) {
    append(`❌ Network test failed: ${(err as Error).message}`)
    append('🔄 Trying alternative network test...')
    try {
      const altTest = fetch('https://jsonplaceholder.typicode.com/posts/1', {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000)
      })
      const altResult = await altTest
      append(`✅ Alternative network test: SUCCESS (${altResult.status})`)
    } catch (altErr) {
      append(`❌ Alternative network test also failed: ${(altErr as Error).message}`)
    }
  }

  append('🔧 Environment diagnostics...')
  try {
    append(`User agent: ${navigator.userAgent}`)
    append(`Online status: ${navigator.onLine}`)
    append(`Connection type: ${(navigator as any).connection?.effectiveType || 'unknown'}`)
    append(`WebContainer URL: ${window.location.href}`)
  } catch (err) {
    append(`Environment test failed: ${(err as Error).message}`)
  }

  append('🔗 Testing direct Supabase API access...')
  try {
    const supabaseUrlTest = fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      signal: AbortSignal.timeout(5000)
    })
    const supabaseResult = await supabaseUrlTest
    append(`✅ Supabase REST API: SUCCESS (${supabaseResult.status})`)
    if (!supabaseResult.ok) {
      const errorText = await supabaseResult.text()
      append(`Supabase URL error: ${errorText}`)
    }
  } catch (err) {
    append(`Supabase URL test failed: ${(err as Error).message}`)
  }

  append('🔐 Testing Supabase auth endpoint...')
  try {
    const authTest = fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      signal: AbortSignal.timeout(5000)
    })
    const authResult = await authTest
    append(`✅ Auth endpoint: SUCCESS (${authResult.status})`)
    if (!authResult.ok) {
      const errorText = await authResult.text()
      append(`Auth endpoint error: ${errorText}`)
    }
  } catch (err) {
    append(`Auth endpoint test failed: ${(err as Error).message}`)
  }

  append('📊 Testing direct database access...')
  try {
    const directDbTest = fetch(`${SUPABASE_URL}/rest/v1/users?select=id&limit=1`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    })
    const dbResult = await directDbTest
    if (dbResult.ok) {
      const data = await dbResult.text()
      append(`✅ Direct DB access: SUCCESS - ${data}`)
    } else {
      append(`❌ Direct DB access failed: ${dbResult.status}`)
    }
  } catch (err) {
    append(`❌ Direct DB test failed: ${(err as Error).message}`)
  }

  append('🧪 Final comprehensive test...')
  try {
    append('Using main client for final test')
    try {
      const workingClient = await getWorkingClient()
      const sessionPromise = workingClient.auth.getSession()
      const sessionTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Session timeout')), 5000)
      )
      const { data: sessionData, error: sessionError } = await Promise.race([
        sessionPromise,
        sessionTimeout
      ]) as any
      if (sessionError) {
        append(`❌ Session check failed: ${sessionError.message}`)
      } else {
        append(
          `✅ Session check: ${sessionData.session ? 'Authenticated' : 'Not authenticated'}`
        )
      }
    } catch (sessionErr) {
      append(`❌ Session check timeout: ${(sessionErr as Error).message}`)
    }

    try {
      const workingClient = await getWorkingClient()
      const dbPromise = workingClient.from('users').select('id').limit(1)
      const dbTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database timeout')), 5000)
      )
      const { error: dbError } = await Promise.race([
        dbPromise,
        dbTimeout
      ]) as any
      if (dbError) {
        append(`❌ Database query failed: ${dbError.message}`)
      } else {
        append('✅ Database query succeeded')
      }
    } catch (dbErr) {
      append(`❌ Database query timeout: ${(dbErr as Error).message}`)
    }
  } catch (err) {
    append(`❌ Final test failed: ${(err as Error).message}`)
  }

  append('🏁 Diagnostics complete!')
}

export const runConsoleAuthDiagnostics = async (append: (msg: string) => void) => {
  appendSupabaseInfo(append)
  append('Running authentication checks...')
  const workingClient = await getWorkingClient()
  const { data: before, error } = await workingClient.auth.getSession()

  if (error) {
    append(`Failed to get session: ${error.message}`)
    return
  }

  let after: { session: any } | null = null

  if (!before.session) {
    append('No active session found')
    append('🔄 Attempting to restore session from localStorage...')
    const restored = await forceSessionRestore()

    if (restored) {
      append('✅ Session successfully restored!')
      const res = await workingClient.auth.getSession()
      after = res.data
      if (!res.error && after.session) {
        const session = after.session
        append(`✅ Restored session expires at: ${session.expires_at}`)
        const now = Math.floor(Date.now() / 1000)
        append(now < (session.expires_at ?? 0) ? 'Restored access token is valid ✅' : 'Restored access token is expired ❌')
        append(`Restored refresh token: ${session.refresh_token ? 'present' : 'null'}`)
      } else {
        append('❌ Session restoration appeared to succeed but no session found')
      }
    } else {
      append('❌ Session restoration failed')
      append('💡 This could mean:')
      append('  - No valid refresh token in localStorage')
      append('  - Refresh token has expired')
      append('  - Network connectivity issues')
      append('  - User needs to sign in again')
    }
  } else {
    const session = before.session
    append(`Current session expires at: ${session.expires_at}`)
    const now = Math.floor(Date.now() / 1000)
    append(now < (session.expires_at ?? 0) ? 'Access token valid ✅' : 'Access token expired ❌')
    append(`Memory refresh token: ${session.refresh_token ?? 'null'}`)

    const storedToken = getStoredRefreshToken()
    append(`Stored refresh token (${localStorageKey}): ${storedToken ?? 'null'}`)

    if (session.refresh_token) {
      append(
        storedToken === session.refresh_token
          ? 'Stored and memory refresh tokens match ✅'
          : 'Stored and memory refresh tokens differ ❌'
      )
    }
  }

  append('📝 Testing message posting capability...')
  try {
    const currentSession = before.session || after?.session
    const testMessage = {
      user_id: currentSession?.user?.id,
      content: `🔧 AUTH TEST MESSAGE - This is a test message from the authentication diagnostics. It will be automatically deleted in 3 seconds. Time: ${new Date().toLocaleTimeString()}`,
      message_type: 'text'
    }

    if (!testMessage.user_id) {
      append('❌ Cannot test message posting: No authenticated user ID')
    } else {
      const postPromise = workingClient
        .from('messages')
        .insert(testMessage)
        .select('id, created_at')
        .single()

      const postTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Message post timeout')), 5000)
      )

      const { data: messageData, error: messageError } = await Promise.race([
        postPromise,
        postTimeout
      ]) as any

      if (messageError) {
        append(`❌ Message post failed: ${messageError.message}`)
        if (messageError.code) {
          append(`   Error code: ${messageError.code}`)
        }
        if (messageError.details) {
          append(`   Details: ${messageError.details}`)
        }
      } else if (messageData) {
        append(`✅ Message posted successfully!`)
        append(`   Message ID: ${messageData.id}`)
        append(`   Created at: ${messageData.created_at}`)
        append(`⏱️ Message will be visible for 3 seconds...`)
        setTimeout(async () => {
          append('🧹 Cleaning up test message...')
          try {
            const deletePromise = workingClient
              .from('messages')
              .delete()
              .eq('id', messageData.id)

            const deleteTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Delete timeout')), 3000)
            )

            const { error: deleteError } = await Promise.race([
              deletePromise,
              deleteTimeout
            ]) as any

            if (deleteError) {
              append(`⚠️ Failed to clean up test message: ${deleteError.message}`)
            } else {
              append('✅ Test message cleaned up successfully')
            }
          } catch (deleteErr) {
            append(`⚠️ Delete operation failed: ${(deleteErr as Error).message}`)
          }
        }, 3000)
      } else {
        append('❌ Message post returned no data')
      }
    }
  } catch (postErr) {
    append(`❌ Message post test failed: ${(postErr as Error).message}`)
  }
}

