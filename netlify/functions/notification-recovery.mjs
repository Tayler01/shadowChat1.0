const getEnvironmentValue = (...names) => {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export default async () => {
  if (getEnvironmentValue('WEB_PUSH_RECOVERY_ENABLED').toLowerCase() !== 'true') {
    return Response.json({ ok: true, skipped: true, reason: 'Web Push recovery is paused.' })
  }

  const supabaseUrl = getEnvironmentValue('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const recoverySecret = getEnvironmentValue('WEB_PUSH_RECOVERY_SECRET')
  if (!supabaseUrl || recoverySecret.length < 32) {
    throw new Error('Web Push recovery environment is incomplete.')
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-shadowchat-recovery-secret': recoverySecret,
    },
    body: JSON.stringify({ type: 'notification_delivery_recovery' }),
    signal: AbortSignal.timeout(25_000),
  })

  if (!response.ok) {
    throw new Error(`Web Push recovery returned HTTP ${response.status}.`)
  }

  const result = await response.json()
  return Response.json({ ok: true, ...result })
}

export const config = {
  schedule: '* * * * *',
}
