import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), 'utf8')

const edgeConsumers = [
  'supabase/functions/link-preview/index.ts',
  'supabase/functions/art-board-import-image/index.ts',
  'supabase/functions/shadow-pin-import-image/index.ts',
  'supabase/functions/shadow-pin-video/index.ts',
]

describe('SEC-001 safe-fetch integration contracts', () => {
  it('routes audited Edge Function user-URL fetch surfaces through the shared helper', () => {
    for (const filePath of edgeConsumers) {
      const source = read(filePath)
      expect(source).toContain("from '../_shared/safe-fetch.ts'")
      expect(source).toContain('safeFetch(')
      expect(source).toContain('normalizePublicHttpUrl')
      expect(source).toContain('assertPublicUrl')
      expect(source).not.toContain("redirect: 'follow'")
      expect(source).not.toContain('const isPrivateIpv4')
    }
  })

  it('routes Netlify ShadowPin media imports through the Node safe-fetch helper', () => {
    const source = read('netlify/functions/_shared/shadow-pin-media.mjs')
    expect(source).toContain("from './safe-fetch.mjs'")
    expect(source).toContain('safeFetch(')
    expect(source).toContain('normalizePublicHttpUrl')
    expect(source).toContain('assertPublicUrl')
    expect(source).toContain('readLimitedArrayBuffer')
    expect(source).not.toContain("redirect: 'follow'")
    expect(source).not.toContain('PRIVATE_IPV4_RANGES')
  })

  it('guards stored web push endpoints before delivery fetches', () => {
    const source = read('supabase/functions/send-push/index.ts')
    expect(source).toContain("from '../_shared/safe-fetch.ts'")
    expect(source).toContain('normalizePushEndpoint')
    expect(source).toContain('toPushRequestInit')
    expect(source).toContain('safeFetch(endpoint, toPushRequestInit(payload)')
    expect(source).toContain('Only https push endpoints are supported.')
    expect(source).not.toContain('fetch(subscription.endpoint')
  })

  it('stores Instagram link-preview images before returning them to chat clients', () => {
    const source = read('supabase/functions/link-preview/index.ts')
    expect(source).toContain("const LINK_PREVIEW_IMAGE_BUCKET = 'message-media'")
    expect(source).toContain('shouldStorePreviewImage')
    expect(source).toContain('isInstagramHost')
    expect(source).toContain('isInstagramPreviewImageHost')
    expect(source).toContain('storePreviewImage')
    expect(source).toContain('.upload(path, new Blob([bytes]')
  })
})
