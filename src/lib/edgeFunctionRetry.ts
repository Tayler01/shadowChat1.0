type EdgeFunctionClient = {
  functions: {
    invoke: (
      functionName: string,
      options: { body: Record<string, unknown> }
    ) => Promise<{ data: unknown; error: unknown }>
  }
}

const RETRY_DELAYS_MS = [250, 1000]

const getInvokeStatus = (error: unknown) => {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { status?: unknown; context?: { status?: unknown } }
  const value = candidate.context?.status ?? candidate.status
  const status = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(status) ? status : null
}

const shouldRetryInvoke = (error: unknown) => {
  const status = getInvokeStatus(error)
  return status === null || status === 409 || status >= 500
}

export const invokeEdgeFunctionWithRetry = async (
  client: EdgeFunctionClient,
  functionName: string,
  body: Record<string, unknown>
) => {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const { data, error } = await client.functions.invoke(functionName, { body })
    if (!error) return data
    if (!shouldRetryInvoke(error) || attempt === RETRY_DELAYS_MS.length) throw error
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
  }

  return null
}
