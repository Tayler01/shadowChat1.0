import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src', 'features', 'shadow-pin', 'api', 'shadowPinApi.ts'),
  'utf8'
)

const imageProjection = source.match(/export const SHADOW_PIN_IMAGE_SELECT = `([\s\S]*?)`/)?.[1] || ''

describe('ShadowPin Theater read contract', () => {
  test('normal Pin reads use an explicit projection with legacy playback compatibility but without storage paths', () => {
    expect(imageProjection).toContain('video_playback_url')
    expect(imageProjection).toContain('comment_count')
    expect(imageProjection).toContain('provider_payload')
    expect(imageProjection).not.toContain('processing_error')
    expect(imageProjection).not.toContain('image_path')
    expect(imageProjection).not.toContain('thumbnail_path')
    expect(imageProjection).not.toContain('medium_path')
    expect(imageProjection).toContain('provider_asset_id')
    expect(imageProjection).toContain('provider_playback_id')
  })

  test('cold exact targets fetch only one RLS-authorized neighbor per direction', () => {
    expect(source).toContain('fetchShadowPinImageNeighbors')
    expect(source).toMatch(/created_at\.gt\.\$\{cursorTime\}.*id\.gt\.\$\{image\.id\}/)
    expect(source).toMatch(/created_at\.lt\.\$\{cursorTime\}.*id\.lt\.\$\{image\.id\}/)
    expect(source.match(/\.limit\(1\)/g)?.length).toBeGreaterThanOrEqual(1)
  })

  test('category pages use deterministic created-at and id ordering', () => {
    expect(source).toMatch(/\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)\s*\.range/)
  })

  test('comments use bounded keyset pages and enrich exact targets with their parent', () => {
    expect(source).toContain('SHADOW_PIN_COMMENT_PAGE_SIZE = 40')
    expect(source).toContain('.limit(SHADOW_PIN_COMMENT_PAGE_SIZE + 1)')
    expect(source).toMatch(/created_at\.lt\.\$\{cursor\.createdAt\}.*id\.lt\.\$\{cursor\.id\}/)
    expect(source).toContain(".eq('id', targetCommentId)")
    expect(source).toContain(".in('id', missingParentIds)")
  })
})
