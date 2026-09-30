export function getResumableStorageEndpoint(baseUrl: string) {
  const url = new URL(baseUrl)
  if (url.hostname.endsWith('.supabase.co')) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co')
  }
  return `${url.origin}/storage/v1/upload/resumable`
}
