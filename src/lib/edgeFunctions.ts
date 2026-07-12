import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  ensureSession,
  getSessionWithTimeout,
  getWorkingClient,
} from './supabase'

type AuthenticatedEdgeFunctionOptions = {
  signal?: AbortSignal
}

const readAccessToken = async (forceRefresh = false) => {
  const sessionValid = await ensureSession(forceRefresh)
  if (!sessionValid) {
    throw new Error('Authentication required')
  }

  const workingClient = await getWorkingClient()
  const { data: { session } } = await getSessionWithTimeout(workingClient)
  const accessToken = session?.access_token
  if (!accessToken) {
    throw new Error('Authentication required')
  }

  return accessToken as string
}

const readErrorMessage = async (response: Response) => {
  const text = await response.text()
  if (!text) return `Edge Function failed with status ${response.status}`

  try {
    const payload = JSON.parse(text) as { error?: unknown; message?: unknown }
    const message = typeof payload.error === 'string'
      ? payload.error
      : typeof payload.message === 'string'
        ? payload.message
        : null
    return message || text
  } catch {
    return text
  }
}

export async function invokeAuthenticatedEdgeFunction<T>(
  functionName: string,
  body: unknown,
  options: AuthenticatedEdgeFunctionOptions = {}
): Promise<T> {
  const call = async (accessToken: string) => fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: options.signal,
  })

  let response = await call(await readAccessToken())

  if (response.status === 401) {
    response = await call(await readAccessToken(true))
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  return await response.json() as T
}
