export function parseSupabaseQueryRows(raw) {
  const parsed = JSON.parse(raw)

  if (Array.isArray(parsed)) {
    return parsed
  }

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.rows)) {
    return parsed.rows
  }

  throw new Error('Supabase query JSON did not contain a row array')
}
