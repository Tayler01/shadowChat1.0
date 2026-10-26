const buckets = new Set(['chat-uploads', 'message-media', 'shadow-pin'])

/** Only our durable Storage identifiers; a query token never grants import access. */
export function parseMemberMediaUrl(value: string, projectUrl: string): { bucket: string; path: string } | null {
  const url = new URL(value)
  if (url.origin !== new URL(projectUrl).origin) return null
  const match = url.pathname.match(/^\/storage\/v1\/(?:object|render\/image)\/(?:public|authenticated|sign)\/([^/]+)\/(.+)$/)
  if (!match || !buckets.has(match[1])) return null
  if (url.username || url.password) throw new Error('Media URL credentials are not allowed.')
  const parts = match[2].split('/').map(part => decodeURIComponent(part))
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\/]/.test(part)
    || [...part].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) {
    throw new Error('Media object path is invalid.')
  }
  return { bucket: match[1], path: parts.join('/') }
}

type DownloadClient = {
  storage: { from(bucket: string): { download(path: string): Promise<{ data: Blob | null; error: unknown }> } }
}

export async function downloadMemberMedia(value: string, projectUrl: string, actor: DownloadClient): Promise<Blob | null> {
  const target = parseMemberMediaUrl(value, projectUrl)
  if (!target) return null
  const { data, error } = await actor.storage.from(target.bucket).download(target.path)
  if (error || !data) throw new Error('This attachment is unavailable or you no longer have access.')
  return data
}

export function assertRasterImageBytes(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length))
  if ((bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => bytes[i] === value))
    || (bytes.length >= 6 && ['GIF87a','GIF89a'].includes(ascii(0, 6)))
    || (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP')) return
  throw new Error('Only JPEG, PNG, WebP, or GIF image bytes are supported.')
}
