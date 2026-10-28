export const CONTENT_POLICY_MESSAGE = 'This text or link was not posted because it matches a safety rule. Edit it and try again, or contact support@shadochat.online for review.'

export function isContentPolicyRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; message?: unknown; contentPolicyRejected?: unknown }
  return value.code === 'PT422' && (value.message === 'CONTENT_POLICY_REJECTED' || value.contentPolicyRejected === true)
}

/** Keep unrelated errors intact; never interpret arbitrary member text as a rejection. */
export function normalizeContentPolicyError(error: unknown): unknown {
  if (!isContentPolicyRejection(error)) return error
  if (error instanceof Error && error.message === CONTENT_POLICY_MESSAGE) return error
  return Object.assign(new Error(CONTENT_POLICY_MESSAGE), {
    code: 'PT422',
    contentPolicyRejected: true,
  })
}

/** Edge Functions expose their structured failure through the response context. */
export async function normalizeContentPolicyFunctionError(error: unknown): Promise<unknown> {
  const context = (error as { context?: { status?: number; clone?: () => { json: () => Promise<unknown> } } } | null)?.context
  if (context?.status !== 422 || typeof context.clone !== 'function') return error
  try {
    const payload = await context.clone().json() as { code?: unknown; error?: unknown }
    const rejection = { code: payload.code, message: payload.error }
    return isContentPolicyRejection(rejection) ? normalizeContentPolicyError(rejection) : error
  } catch {
    return error
  }
}
