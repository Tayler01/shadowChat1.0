import fs from 'node:fs'
import path from 'node:path'

const handlerPath = path.resolve(process.cwd(), 'netlify/functions/shadow-pin-media.mjs')
const sharedPath = path.resolve(process.cwd(), 'netlify/functions/_shared/shadow-pin-media.mjs')

const handlerSource = fs.readFileSync(handlerPath, 'utf8')
const sharedSource = fs.readFileSync(sharedPath, 'utf8')

describe('ShadowPin Creator Studio image media contract', () => {
  test('keeps generated draft media private until explicit publish preparation', () => {
    expect(sharedSource).toContain("state: 'ready', thumbnail_path: privateThumb, medium_path: privateMedium")
    expect(sharedSource).toContain('final_image_url: null, final_image_path: null')
    expect(sharedSource).toContain('export async function prepareShadowPinDraftImagePublish')
    expect(sharedSource).toContain("activateCreatorDraftAsset(admin, draftId, asset.id, 'preparing_publish')")
    expect(handlerSource).toContain("action === 'prepare-draft-image-publish'")
    expect(sharedSource).toContain('Date.parse(data.expires_at) <= Date.now()')
    expect(sharedSource).toContain("throw new Error('Creator draft has expired.')")
  })

  test('supports publish rollback without deleting canonical media', () => {
    expect(sharedSource).toContain('export async function rollbackShadowPinDraftImagePublish')
    expect(handlerSource).toContain("action === 'rollback-draft-image-publish'")
    expect(sharedSource).toContain(".eq('creator_draft_id', draftId)")
  })

  test('checks every canonical Pin before operator cleanup removes public media', () => {
    const cleanupStart = sharedSource.indexOf('export async function deleteShadowPinDraftImageAssets')
    const cleanupSource = sharedSource.slice(cleanupStart)
    const canonicalQueryStart = cleanupSource.indexOf("admin.from('shadow_pin_images')")
    const canonicalQueryEnd = cleanupSource.indexOf('if (canonicalError)', canonicalQueryStart)
    const canonicalQuery = cleanupSource.slice(canonicalQueryStart, canonicalQueryEnd)

    expect(cleanupSource).toContain("admin.from('shadow_pin_images')")
    expect(canonicalQuery).toContain(".select('image_path,thumbnail_path,medium_path')")
    expect(canonicalQuery).not.toContain(".eq('creator_id', userId)")
    expect(cleanupSource).toContain('retainedReferencedPublicPaths')
  })
})
