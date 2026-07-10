export const upsertOperationsHealthSnapshot = async ({
  fetchImpl = fetch,
  serviceRoleKey,
  snapshot,
  supabaseUrl,
}) => {
  const endpoint = new URL('/rest/v1/operations_health_snapshot', supabaseUrl)
  endpoint.searchParams.set('on_conflict', 'environment')
  const headers = {
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  }
  // Legacy service-role JWTs are valid bearer tokens. New sb_secret_ keys are
  // API keys and deliberately stay out of the Authorization header.
  if (serviceRoleKey.startsWith('eyJ')) {
    headers.Authorization = `Bearer ${serviceRoleKey}`
  }

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(snapshot),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Operations health write failed (${response.status}): ${body || response.statusText}`
    )
  }
}
